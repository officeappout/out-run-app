'use client';

/**
 * usePresenceLayer — unified social presence hook.
 *
 * Merges the old useSafeCityMap (heartbeat + 30s polling) and
 * useSocialLiveMap (real-time onSnapshot + client-side filters)
 * into a single hook with:
 *   - One onSnapshot subscription (friends or discover)
 *   - One heartbeat (presence.service)
 *   - 5-minute staleness threshold
 *   - Client-side proximity + level filtering for discover mode
 *
 * Returns markers, heatmap, loading state, age group, and privacy mode.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { usePrivacyStore } from '../store/usePrivacyStore';
import {
  startHeartbeat,
  stopHeartbeat,
  clearPresence,
  type PresencePayload,
  type PresenceActivity,
} from '../services/presence.service';
import {
  getHeatmapData,
  type PresenceMarker,
  type HeatmapPoint,
} from '../services/segregation.service';
import type { PrivacyMode } from '../store/usePrivacyStore';

// ── Config ──────────────────────────────────────────────────────────────────

const STALE_MS = 5 * 60 * 1000; // 5 min (unified threshold)
const MAX_DISCOVERY_RADIUS_KM = 15;
const LEVEL_RANGE = 3;
const HEATMAP_POLL_MS = 60_000; // heatmap is not real-time, poll every 60s

const IS_DEV = process.env.NODE_ENV === 'development';

// ── Helpers ─────────────────────────────────────────────────────────────────

export type SocialMapMode = 'friends' | 'discover';

function parseBirthDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Timestamp) return raw.toDate();
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw && typeof (raw as any).toDate === 'function') {
    return (raw as any).toDate();
  }
  if (typeof raw === 'object' && raw !== null && 'seconds' in raw && typeof (raw as any).seconds === 'number') {
    const d = new Date((raw as any).seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    const dotMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (dotMatch) {
      const [, day, month, year] = dotMatch;
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function deriveAgeGroup(birthDate: unknown): 'minor' | 'adult' {
  const bd = parseBirthDate(birthDate);
  if (!bd) return 'minor';
  const ageYears = (Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18 ? 'minor' : 'adult';
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function docToMarker(data: Record<string, unknown>, id: string): PresenceMarker | null {
  const updatedAt =
    data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate()
      : data.updatedAt ? new Date(data.updatedAt as string) : new Date();

  if (Date.now() - updatedAt.getTime() > STALE_MS) return null;

  // Coords MUST be finite numbers. The `as number` cast is a TypeScript
  // assertion only — Firestore docs that landed mid-write (or were seeded
  // before the heartbeat got a GPS fix) can carry literal `null`/missing
  // lat/lng. Returning a marker with non-finite coords would propagate to
  // Mapbox's GeoJSON validator as `Expected value to be of type number,
  // but found null instead`. Drop the doc entirely instead.
  const rawLat = data.lat;
  const rawLng = data.lng;
  if (typeof rawLat !== 'number' || typeof rawLng !== 'number') return null;
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) return null;

  return {
    uid: id,
    name: (data.name as string) ?? '',
    ageGroup: (data.ageGroup as 'minor' | 'adult') ?? 'adult',
    isVerified: (data.isVerified as boolean) ?? false,
    schoolName: (data.schoolName as string) ?? null,
    lat: rawLat,
    lng: rawLng,
    updatedAt,
    activity: data.activity as PresenceActivity | undefined,
    lemurStage: data.lemurStage as number | undefined,
    level: data.level as number | undefined,
    programId: data.programId as string | undefined,
    personaId: data.personaId as string | undefined,
    photoURL: data.photoURL as string | undefined,
  };
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface PresenceLayerResult {
  markers: PresenceMarker[];
  heatmap: HeatmapPoint[];
  isLoading: boolean;
  myAgeGroup: 'minor' | 'adult';
  privacyMode: PrivacyMode;
  socialMode: SocialMapMode;
  setSocialMode: (m: SocialMapMode) => void;
  isBlocked: boolean;
}

export function usePresenceLayer(
  currentLocation: { lat: number; lng: number } | null,
  enabled: boolean = true,
): PresenceLayerResult {
  const { profile, _hasHydrated } = useUserStore();
  const { following, isLoaded: socialLoaded, loadConnections } = useSocialStore();
  const { mode: privacyMode } = usePrivacyStore();

  const [socialMode, setSocialMode] = useState<SocialMapMode>('friends');
  const [rawMarkers, setRawMarkers] = useState<PresenceMarker[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const userId = profile?.id;
  const rawBirthDate = profile?.core?.birthDate;
  const explicitAgeGroup = profile?.core?.ageGroup;
  const ageGroup = explicitAgeGroup ?? deriveAgeGroup(rawBirthDate);
  const myLevel = profile?.progression?.lemurStage ?? 1;
  const isAdmin = profile?.core?.isSuperAdmin === true;
  const profileLoaded = _hasHydrated && !!profile;

  const hasBypass = isAdmin || IS_DEV;
  const isBlocked = hasBypass
    ? false
    : (!profileLoaded || ageGroup === 'minor' || !userId || privacyMode === 'ghost');
  const isReady = hasBypass ? (!!userId && enabled) : (enabled && !isBlocked);

  const personaId = profile?.personaId ?? undefined;
  const lemurStage = profile?.progression?.lemurStage ?? undefined;
  const photoURL = profile?.core?.photoURL ?? undefined;
  const runningLevel = profile?.running?.level ?? undefined;

  const stateRef = useRef({ privacyMode, following, ageGroup, isVerified: profile?.core?.isVerified ?? false, userId, authorityId: profile?.core?.authorityId ?? null, schoolName: '' as string | null, personaId, lemurStage, photoURL, runningLevel });
  stateRef.current = {
    privacyMode,
    following,
    ageGroup,
    isVerified: profile?.core?.isVerified ?? false,
    userId,
    authorityId: profile?.core?.authorityId ?? null,
    schoolName: profile?.core?.affiliations?.find((a: any) => a.type === 'school' || a.type === 'company')?.name ?? null,
    personaId,
    lemurStage,
    photoURL,
    runningLevel,
  };

  // Load social connections
  useEffect(() => {
    if (userId && !socialLoaded) {
      loadConnections(userId);
    }
  }, [userId, socialLoaded, loadConnections]);

  // ── Heartbeat (single writer) ─────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !profile?.core?.name) {
      // [DIAG] Heartbeat guarded — explains why nothing ever lands in
      // /presence/{uid}. Common causes: profile still hydrating, user
      // not signed in, or `core.name` empty (which shouldn't happen for
      // a real account but does for malformed seed data).
      console.log('[PresenceHeartbeat] mount SKIPPED', {
        reason: !userId ? 'no userId' : 'no profile.core.name',
        userId: userId ?? null,
        hasProfile: !!profile,
        coreName: profile?.core?.name ?? null,
      });
      return;
    }

    console.log('[PresenceHeartbeat] mount OK — heartbeat will tick now and every 2 min', {
      userId,
      currentLocation,
      privacyMode: stateRef.current.privacyMode,
      ageGroup: stateRef.current.ageGroup,
    });

    let tickCount = 0;
    const getPayload = (): PresencePayload | null => {
      tickCount += 1;
      const s = stateRef.current;
      if (!currentLocation || !s.userId) {
        console.log('[PresenceHeartbeat] tick SKIPPED', {
          tickCount,
          reason: !currentLocation ? 'no currentLocation (GPS pending?)' : 'no userId in stateRef',
          currentLocation,
        });
        return null;
      }
      // Hard guard against non-finite coords. `currentLocation` flows from
      // upstream (effectivePos in MapShell) which can momentarily produce
      // an object with null lat/lng during mock-location toggles, GPS
      // permission flips, or simulated-mode swaps. Writing those raw
      // would either trigger Firebase's "Expected number" assertion or
      // pin the user to [0,0] in the Gulf of Guinea.
      const { lat, lng } = currentLocation;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.log('[PresenceHeartbeat] tick SKIPPED', {
          tickCount,
          reason: 'non-finite coords',
          lat,
          lng,
        });
        return null;
      }
      const payload: PresencePayload = {
        uid: s.userId,
        name: profile.core.name,
        ageGroup: s.ageGroup,
        isVerified: s.isVerified,
        schoolName: s.schoolName,
        mode: s.privacyMode,
        lat,
        lng,
        authorityId: s.authorityId,
        personaId: s.personaId,
        lemurStage: s.lemurStage,
        photoURL: s.photoURL,
        runningLevel: s.runningLevel,
      };
      // [DIAG] This is the line that proves the heartbeat is firing AND
      // shows the exact `mode` we're about to persist. If `mode` here is
      // 'verified_global' but the Firestore doc shows 'squad' (or vice
      // versa), the discrepancy is downstream in updatePresence /
      // Firestore caching. If you don't see this log at all, the
      // heartbeat never fired — check the SKIPPED reasons above.
      console.log('[PresenceHeartbeat] tick WRITING presence', {
        tickCount,
        uid: payload.uid,
        mode: payload.mode,
        ageGroup: payload.ageGroup,
        lat: payload.lat,
        lng: payload.lng,
        hasAuthorityId: !!payload.authorityId,
      });
      return payload;
    };

    startHeartbeat(getPayload);
    return () => {
      console.log('[PresenceHeartbeat] unmount — stopping heartbeat + clearing presence', { userId });
      stopHeartbeat();
      if (userId) clearPresence(userId).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentLocation?.lat, currentLocation?.lng]);

  // ── Real-time Firestore listener (single onSnapshot) ─────────────────────
  useEffect(() => {
    if (!isReady) {
      setRawMarkers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    if (socialMode === 'friends') {
      if (!socialLoaded || following.length === 0) {
        setRawMarkers([]);
        setIsLoading(false);
        return;
      }

      const batches: string[][] = [];
      for (let i = 0; i < following.length; i += 30) {
        batches.push(following.slice(i, i + 30));
      }

      const unsubscribers: (() => void)[] = [];
      const batchResults = new Map<number, PresenceMarker[]>();

      batches.forEach((batch, idx) => {
        try {
          const q = query(collection(db, 'presence'), where('uid', 'in', batch));
          const unsub = onSnapshot(q, (snap) => {
            const markers: PresenceMarker[] = [];
            snap.forEach((d) => {
              const m = docToMarker(d.data(), d.id);
              if (m && m.ageGroup === ageGroup && m.uid !== userId) markers.push(m);
            });
            batchResults.set(idx, markers);
            const merged: PresenceMarker[] = [];
            batchResults.forEach((v) => merged.push(...v));
            setRawMarkers(merged);
            setIsLoading(false);
          }, (err: any) => {
            const code = err?.code ?? '(no code)';
            if (code === 'permission-denied') {
              console.error(
                '[PresenceLayer] friends batch listener PERMISSION-DENIED. ' +
                  'Check App Check (NEXT_PUBLIC_RECAPTCHA_SITE_KEY) and Firestore rules ' +
                  'on the `presence` collection.',
                err,
              );
            } else {
              console.warn('[PresenceLayer] friends batch listener error:', code, err);
            }
            setIsLoading(false);
          });
          unsubscribers.push(unsub);
        } catch (err) {
          console.warn('[PresenceLayer] Failed to create friends listener:', err);
          setIsLoading(false);
        }
      });

      return () => unsubscribers.forEach((u) => u());
    }

    // Discover mode — city-scoped when authorityId is available
    const discoverConstraints: QueryConstraint[] = [
      where('mode', '==', 'verified_global'),
    ];
    if (stateRef.current.authorityId) {
      discoverConstraints.push(where('authorityId', '==', stateRef.current.authorityId));
    }
    const q = query(collection(db, 'presence'), ...discoverConstraints);
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(q, (snap) => {
        const markers: PresenceMarker[] = [];
        snap.forEach((d) => {
          const m = docToMarker(d.data(), d.id);
          if (!m || m.uid === userId) return;
          if (!IS_DEV) {
            const myAg = (ageGroup ?? '').toLowerCase().trim();
            const theirAg = (m.ageGroup ?? '').toLowerCase().trim();
            if (myAg && theirAg && myAg !== theirAg) return;
          }
          markers.push(m);
        });
        setRawMarkers(markers);
        setIsLoading(false);
      }, (err: any) => {
        const code = err?.code ?? '(no code)';
        if (code === 'permission-denied') {
          console.error(
            '[PresenceLayer] discover listener PERMISSION-DENIED. ' +
              'Check App Check (NEXT_PUBLIC_RECAPTCHA_SITE_KEY) and Firestore rules ' +
              'on the `presence` collection. Discover-mode partners will NOT render until fixed.',
            err,
          );
        } else {
          console.warn('[PresenceLayer] discover listener error:', code, err);
        }
        setIsLoading(false);
      });
    } catch (err) {
      console.warn('[PresenceLayer] Failed to create discover listener:', err);
      setIsLoading(false);
    }

    return () => unsub?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, socialMode, socialLoaded, following, ageGroup, userId]);

  // ── Heatmap polling (not real-time, less frequent) ────────────────────────
  const fetchHeatmap = useCallback(async () => {
    if (!userId) return;
    try {
      const heat = await getHeatmapData(ageGroup, stateRef.current.authorityId ?? undefined);
      setHeatmap(heat);
    } catch {
      // silently ignore
    }
  }, [userId, ageGroup]);

  useEffect(() => {
    if (!isReady) return;
    fetchHeatmap();
    const id = setInterval(fetchHeatmap, HEATMAP_POLL_MS);
    return () => clearInterval(id);
  }, [isReady, fetchHeatmap]);

  // ── Client-side filters ───────────────────────────────────────────────────
  const DEV_LEVEL_RANGE = IS_DEV ? 5 : LEVEL_RANGE;

  const filteredMarkers = useMemo(() => {
    if (isBlocked && !hasBypass) return [];
    if (socialMode === 'friends') return rawMarkers;

    return rawMarkers.filter((m) => {
      if (currentLocation) {
        const dist = haversineKm(currentLocation.lat, currentLocation.lng, m.lat, m.lng);
        if (dist > MAX_DISCOVERY_RADIUS_KM) return false;
      }
      if (m.level != null) {
        if (Math.abs(m.level - myLevel) > DEV_LEVEL_RANGE) return false;
      }
      return true;
    });
  }, [rawMarkers, socialMode, isBlocked, hasBypass, currentLocation, myLevel, DEV_LEVEL_RANGE]);

  return {
    markers: filteredMarkers,
    heatmap,
    isLoading,
    myAgeGroup: ageGroup,
    privacyMode,
    socialMode,
    setSocialMode,
    isBlocked,
  };
}

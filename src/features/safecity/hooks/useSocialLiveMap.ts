'use client';

/**
 * useSocialLiveMap — Real-time social layer for the map.
 *
 * Two modes:
 *   'friends'   — shows only users from the `following` list
 *   'discover'  — shows all `verified_global` users (non-student only)
 *
 * Student protection:
 *   If the user is a minor (ageGroup === 'minor') or has no profile,
 *   the hook returns an empty array and never opens any Firestore listener.
 *
 * Discovery filters (client-side):
 *   - Proximity:  within `MAX_DISCOVERY_RADIUS_KM`
 *   - Level:      ±1 of the current user's level
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { usePrivacyStore } from '../store/usePrivacyStore';
import type { PresenceMarker } from '../services/segregation.service';
import type { PresenceActivity } from '../services/presence.service';

// ── Config ──────────────────────────────────────────────────────────────────

const STALE_MS = 10 * 60 * 1000; // 10 min
const MAX_DISCOVERY_RADIUS_KM = 15;
const LEVEL_RANGE = 3;

// ── Types ───────────────────────────────────────────────────────────────────

export type SocialMapMode = 'friends' | 'discover';

export interface SocialLiveMapResult {
  markers: PresenceMarker[];
  mode: SocialMapMode;
  setMode: (m: SocialMapMode) => void;
  isBlocked: boolean; // true when user is a minor / student
  isLoading: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Parse a birthDate that may arrive as:
 *   - Date object
 *   - ISO string  '1999-11-11'  or  '1999-11-11T00:00:00.000Z'
 *   - Dot format  '11.11.1999'  (DD.MM.YYYY — common in IL/EU)
 *   - Slash format '11/11/1999' (DD/MM/YYYY)
 *   - Firestore Timestamp with .toDate()
 */
function parseBirthDate(raw: unknown): Date | null {
  if (!raw) return null;

  // Firebase Timestamp instance (live from Firestore — has .toDate())
  if (raw instanceof Timestamp) {
    return raw.toDate();
  }

  // Duck-typed Timestamp (e.g. from a different Firebase SDK instance)
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw && typeof (raw as any).toDate === 'function') {
    return (raw as any).toDate();
  }

  // Serialized Firestore Timestamp — { seconds: number, nanoseconds: number }
  // Happens when Zustand persist round-trips through JSON and loses .toDate()
  if (typeof raw === 'object' && raw !== null && 'seconds' in raw && typeof (raw as any).seconds === 'number') {
    const d = new Date((raw as any).seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }

  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : raw;
  }

  if (typeof raw === 'string') {
    const s = raw.trim();

    // DD.MM.YYYY or DD/MM/YYYY
    const dotMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (dotMatch) {
      const [, day, month, year] = dotMatch;
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      return isNaN(d.getTime()) ? null : d;
    }

    // ISO or any other standard format
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Numeric timestamp (ms since epoch)
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

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
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

  const ageMs = Date.now() - updatedAt.getTime();
  if (ageMs > STALE_MS) {
    console.log(`[docToMarker] ⏰ Stale doc skipped: ${id} (${Math.round(ageMs / 1000)}s old)`);
    return null;
  }

  console.log(`[docToMarker] ✅ ${id}: mode=${data.mode}, ageGroup=${data.ageGroup}, level=${data.level}, lat=${data.lat}`);

  return {
    uid: id,
    name: (data.name as string) ?? '',
    ageGroup: (data.ageGroup as 'minor' | 'adult') ?? 'adult',
    isVerified: (data.isVerified as boolean) ?? false,
    schoolName: (data.schoolName as string) ?? null,
    lat: data.lat as number,
    lng: data.lng as number,
    updatedAt,
    activity: data.activity as PresenceActivity | undefined,
    lemurStage: data.lemurStage as number | undefined,
    level: data.level as number | undefined,
    programId: data.programId as string | undefined,
  };
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useSocialLiveMap(
  currentLocation: { lat: number; lng: number } | null,
  /** When false, the hook defers all Firestore subscriptions (used by flyover entrance) */
  enabled: boolean = true,
): SocialLiveMapResult {
  const { profile, _hasHydrated } = useUserStore();
  const { following, isLoaded: socialLoaded, loadConnections } = useSocialStore();
  const { mode: privacyMode } = usePrivacyStore();

  const [mapMode, setMapMode] = useState<SocialMapMode>('friends');
  const [rawMarkers, setRawMarkers] = useState<PresenceMarker[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const userId = profile?.id;
  const rawBirthDate = profile?.core?.birthDate;
  const explicitAgeGroup = profile?.core?.ageGroup;
  const parsedBd = parseBirthDate(rawBirthDate);
  const derivedAge = deriveAgeGroup(rawBirthDate);
  const ageGroup = explicitAgeGroup ?? derivedAge;
  const myLevel = profile?.progression?.lemurStage ?? 1;
  const isAdmin = profile?.core?.isSuperAdmin === true;
  const profileLoaded = _hasHydrated && !!profile;

  // Admin / dev bypass: never block admins or dev environment
  const hasBypass = isAdmin || IS_DEV;

  // Student / minor gate — completely block social layer (unless bypass)
  const isBlocked = hasBypass
    ? false
    : (!profileLoaded || ageGroup === 'minor' || !userId || privacyMode === 'ghost');

  // Defer all subscriptions until enabled (flyover complete)
  const isReady = hasBypass
    ? (!!userId && enabled)
    : (enabled && !isBlocked);

  // ── DEBUG LOGGING ──
  useEffect(() => {
    console.log('[SocialLiveMap] 🔍 State dump:', {
      userId,
      profileLoaded,
      rawBirthDate: String(rawBirthDate ?? 'MISSING'),
      rawBirthDateType: rawBirthDate == null ? 'null' : typeof rawBirthDate,
      rawBirthDateKeys: typeof rawBirthDate === 'object' && rawBirthDate !== null ? Object.keys(rawBirthDate as object) : 'N/A',
      parsedBirthDate: parsedBd?.toISOString() ?? 'PARSE_FAILED',
      explicitAgeGroup: explicitAgeGroup ?? 'NOT_SET',
      derivedAgeGroup: derivedAge,
      finalAgeGroup: ageGroup,
      isAdmin,
      hasBypass,
      privacyMode,
      isBlocked,
      enabled,
      isReady,
      mapMode,
      followingCount: following.length,
      socialLoaded,
    });
  }, [userId, profileLoaded, rawBirthDate, parsedBd, explicitAgeGroup, derivedAge, ageGroup, isAdmin, hasBypass, privacyMode, isBlocked, enabled, isReady, mapMode, following.length, socialLoaded]);

  // Ensure connections are loaded
  useEffect(() => {
    if (userId && !socialLoaded) {
      loadConnections(userId);
    }
  }, [userId, socialLoaded, loadConnections]);

  // ── Firestore real-time listener ─────────────────────────────────────────
  useEffect(() => {
    if (!isReady) {
      console.log('[SocialLiveMap] ⛔ Not ready — skipping subscription.', { isBlocked, enabled });
      setRawMarkers([]);
      setIsLoading(false);
      return;
    }

    console.log('[SocialLiveMap] ✅ Subscribing to presence...', { mapMode, ageGroup });
    setIsLoading(true);

    if (mapMode === 'friends') {
      if (!socialLoaded || following.length === 0) {
        console.log('[SocialLiveMap] 👥 Friends mode — no following list or not loaded.', { socialLoaded, followingCount: following.length });
        setRawMarkers([]);
        setIsLoading(false);
        return;
      }

      // Firestore `in` supports max 30 values per query; batch if needed
      const batches: string[][] = [];
      for (let i = 0; i < following.length; i += 30) {
        batches.push(following.slice(i, i + 30));
      }

      const unsubscribers: (() => void)[] = [];
      const batchResults = new Map<number, PresenceMarker[]>();

      batches.forEach((batch, idx) => {
        const q = query(
          collection(db, 'presence'),
          where('uid', 'in', batch),
        );
        const unsub = onSnapshot(
          q,
          (snap) => {
            const markers: PresenceMarker[] = [];
            snap.forEach((d) => {
              const m = docToMarker(d.data(), d.id);
              if (m && m.ageGroup === ageGroup && m.uid !== userId) {
                markers.push(m);
              }
            });
            batchResults.set(idx, markers);

            const merged: PresenceMarker[] = [];
            batchResults.forEach((v) => merged.push(...v));
            console.log(`[SocialLiveMap] 👥 Friends batch ${idx}: ${snap.size} docs → ${markers.length} valid → ${merged.length} total`);
            setRawMarkers(merged);
            setIsLoading(false);
          },
          (error) => {
            console.error(`[SocialLiveMap] 🔥 Friends batch ${idx} ERROR:`, error.message);
            setIsLoading(false);
          },
        );
        unsubscribers.push(unsub);
      });

      return () => unsubscribers.forEach((u) => u());
    }

    // Discovery mode: all verified_global users (ageGroup filter removed
    // to avoid composite index requirement — client-side filter instead)
    const q = query(
      collection(db, 'presence'),
      where('mode', '==', 'verified_global'),
    );

    console.log('[SocialLiveMap] 🌍 Discover query: mode==verified_global (no ageGroup filter — client-side)');

    const unsub = onSnapshot(
      q,
      (snap) => {
        const markers: PresenceMarker[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const m = docToMarker(data, d.id);
          if (!m) {
            console.log(`[SocialLiveMap] 🌍 Skipped stale doc: ${d.id}`);
            return;
          }
          if (m.uid === userId) return;
          // Client-side age-group filter — bypassed entirely in dev
          if (!IS_DEV) {
            const myAg = (ageGroup ?? '').toLowerCase().trim();
            const theirAg = (m.ageGroup ?? '').toLowerCase().trim();
            if (myAg && theirAg && myAg !== theirAg) {
              console.log(`[SocialLiveMap] 🚫 Rejected ${m.name}: AgeMismatch (mine=${myAg}, theirs=${theirAg})`);
              return;
            }
          }
          markers.push(m);
        });
        console.log(`[SocialLiveMap] 🌍 Discover: ${snap.size} docs → ${markers.length} valid markers`);
        setRawMarkers(markers);
        setIsLoading(false);
      },
      (error) => {
        console.error('[SocialLiveMap] 🔥 onSnapshot ERROR:', error.message);
        if (error.message.includes('index')) {
          console.error('[SocialLiveMap] 🔗 Firestore needs a composite index. Check the link in the error above.');
        }
        setIsLoading(false);
      },
    );

    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, mapMode, socialLoaded, following, ageGroup, userId]);

  // ── Client-side filters for Discovery mode ───────────────────────────────
  const DEV_LEVEL_RANGE = IS_DEV ? 5 : LEVEL_RANGE;

  const filteredMarkers = useMemo(() => {
    if (isBlocked && !hasBypass) return [];
    if (mapMode === 'friends') return rawMarkers;

    return rawMarkers.filter((m) => {
      // Proximity filter
      if (currentLocation) {
        const dist = haversineKm(
          currentLocation.lat, currentLocation.lng,
          m.lat, m.lng,
        );
        if (dist > MAX_DISCOVERY_RADIUS_KM) {
          console.log(`[SocialLiveMap] 🚫 Rejected ${m.name}: DistanceMismatch (${dist.toFixed(1)}km > ${MAX_DISCOVERY_RADIUS_KM}km)`);
          return false;
        }
      }

      // Level filter: ±DEV_LEVEL_RANGE
      if (m.level != null) {
        const diff = Math.abs(m.level - myLevel);
        if (diff > DEV_LEVEL_RANGE) {
          console.log(`[SocialLiveMap] 🚫 Rejected ${m.name}: LevelMismatch (theirs=${m.level}, mine=${myLevel}, diff=${diff}, max=±${DEV_LEVEL_RANGE})`);
          return false;
        }
      }

      return true;
    });
  }, [rawMarkers, mapMode, isBlocked, hasBypass, currentLocation, myLevel, DEV_LEVEL_RANGE]);

  // ── DEBUG: final output ──
  useEffect(() => {
    console.log('[SocialLiveMap] 📤 Output:', {
      rawCount: rawMarkers.length,
      filteredCount: filteredMarkers.length,
      isBlocked,
      isLoading,
      mode: mapMode,
    });
    console.log(`[SocialLiveMap] 🗺️ Final Markers to Render: ${filteredMarkers.length}`);
  }, [rawMarkers.length, filteredMarkers.length, isBlocked, isLoading, mapMode]);

  return {
    markers: filteredMarkers,
    mode: mapMode,
    setMode: setMapMode,
    isBlocked,
    isLoading,
  };
}

'use client';

/**
 * useSafeCityMap — orchestrates presence heartbeat + segregated visibility
 * queries for the Map page.
 *
 * Returns:
 *   markers      — visible presence markers (age-segregated)
 *   heatmap      — anonymous heatmap points
 *   isLoading    — true during initial fetch
 *   myAgeGroup   — computed from profile.core.birthDate
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserStore } from '@/features/user';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { usePrivacyStore } from '../store/usePrivacyStore';
import {
  startHeartbeat,
  stopHeartbeat,
  clearPresence,
  type PresencePayload,
} from '../services/presence.service';
import {
  getVisiblePresence,
  getHeatmapData,
  type PresenceMarker,
  type HeatmapPoint,
} from '../services/segregation.service';

// ── Age group derivation ──────────────────────────────────────────────────

function deriveAgeGroup(birthDate?: Date | string | null): 'minor' | 'adult' {
  if (!birthDate) return 'minor'; // SAFETY: default to minor until birthDate is provided
  const bd = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(bd.getTime())) return 'minor'; // invalid date → treat as minor
  const ageDiff = Date.now() - bd.getTime();
  const ageYears = ageDiff / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18 ? 'minor' : 'adult';
}

// ── Poll interval for visibility queries ──────────────────────────────────

const POLL_INTERVAL_MS = 30_000; // 30 seconds

// ── Hook ──────────────────────────────────────────────────────────────────

export function useSafeCityMap(currentLocation: { lat: number; lng: number } | null) {
  const { profile } = useUserStore();
  const { following, isLoaded: socialLoaded, loadConnections } = useSocialStore();
  const { mode } = usePrivacyStore();

  const [markers, setMarkers] = useState<PresenceMarker[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const userId = profile?.id;
  const ageGroup = deriveAgeGroup(profile?.core?.birthDate);
  const isVerified = profile?.core?.isVerified ?? false;
  const authorityId = profile?.core?.authorityId ?? null;

  const schoolAff = profile?.core?.affiliations?.find(
    (a) => a.type === 'school' || a.type === 'company',
  );
  const schoolName = schoolAff?.name ?? null;

  const stateRef = useRef({ mode, following, ageGroup, isVerified, userId, authorityId, schoolName });
  stateRef.current = { mode, following, ageGroup, isVerified, userId, authorityId, schoolName };

  // Load social connections
  useEffect(() => {
    if (userId && !socialLoaded) {
      loadConnections(userId);
    }
  }, [userId, socialLoaded, loadConnections]);

  // ── Start heartbeat on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !profile?.core?.name) return;

    const getPayload = (): PresencePayload | null => {
      const s = stateRef.current;
      if (!currentLocation || !s.userId) return null;

      return {
        uid: s.userId,
        name: profile.core.name,
        ageGroup: s.ageGroup,
        isVerified: s.isVerified,
        schoolName: s.schoolName,
        mode: s.mode,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        authorityId: s.authorityId,
      };
    };

    startHeartbeat(getPayload);

    return () => {
      stopHeartbeat();
      if (userId) clearPresence(userId).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentLocation?.lat, currentLocation?.lng]);

  // ── Poll visible markers ────────────────────────────────────────────────
  const fetchMarkers = useCallback(async () => {
    const s = stateRef.current;
    if (!s.userId) return;

    try {
      const [visible, heat] = await Promise.all([
        getVisiblePresence({
          myUid: s.userId,
          myAgeGroup: s.ageGroup,
          myMode: s.mode,
          following: s.following,
        }),
        getHeatmapData(s.ageGroup, s.authorityId ?? undefined),
      ]);

      setMarkers(visible);
      setHeatmap(heat);
    } catch (err) {
      console.warn('[SafeCityMap] fetchMarkers failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkers();
    const id = setInterval(fetchMarkers, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMarkers, mode, following]);

  return {
    markers,
    heatmap,
    isLoading,
    myAgeGroup: ageGroup,
    privacyMode: mode,
  };
}

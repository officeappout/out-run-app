'use client';

/**
 * "לא לבד" data (enable_home_v2): ONE bounded read — public active walking groups
 * (equality filters only, limit 20, no listener) — then the pure pick. Position: the
 * GPS fix the app already has, else the profile's anchor; never prompts for GPS.
 * Fails quietly (no suggestion).
 */
import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isDemoDoc } from '@/lib/demo';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import type { CommunityGroup } from '@/types/community.types';
import { pickWalkingGroupSuggestion, type WalkingGroupSuggestion } from './nearbyWalkingGroup';

const MAX_GROUPS = 20;

async function fetchWalkingGroups(): Promise<CommunityGroup[]> {
  const q = query(
    collection(db, 'community_groups'),
    where('category', '==', 'walking'),
    where('isPublic', '==', true),
    where('isActive', '==', true),
    limit(MAX_GROUPS),
  );
  const snap = await getDocs(q);
  // Demo world guard — "לא לבד" never suggests a demo group (they are isPublic:false by design; belt and braces).
  return snap.docs
    .filter((d) => !isDemoDoc(d.data(), d.id))
    .map((d) => ({ id: d.id, ...(d.data() as Omit<CommunityGroup, 'id'>) }) as CommunityGroup);
}

export function useNearbyWalkingGroup(enabled: boolean): WalkingGroupSuggestion | null {
  const coords = useGPSStore((s) => s.coords);
  const core = useUserStore((s) => (s.profile?.core ?? null) as { anchorLat?: unknown; anchorLng?: unknown } | null);
  const [suggestion, setSuggestion] = useState<WalkingGroupSuggestion | null>(null);

  const pos =
    coords && typeof coords.lat === 'number' && typeof coords.lng === 'number'
      ? { lat: coords.lat, lng: coords.lng }
      : typeof core?.anchorLat === 'number' && typeof core?.anchorLng === 'number'
        ? { lat: core.anchorLat, lng: core.anchorLng }
        : null;
  const posKey = pos ? `${pos.lat.toFixed(2)},${pos.lng.toFixed(2)}` : '';

  useEffect(() => {
    if (!enabled || !pos) return;
    let alive = true;
    fetchWalkingGroups()
      .then((groups) => {
        if (alive) setSuggestion(pickWalkingGroupSuggestion(groups, pos, new Date()));
      })
      .catch((err) => console.warn('[useNearbyWalkingGroup] read failed', err));
    return () => {
      alive = false;
    };
    // Re-read only when the rounded position changes (≈1 km), not on every GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, posKey]);

  return enabled ? suggestion : null;
}

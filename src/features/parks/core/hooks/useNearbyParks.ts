'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchRealParks } from '@/features/parks';
import { calculateDistance } from '@/lib/services/location.service';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { resolveParkImage } from '@/lib/park-image';

export interface NearbyParkCard {
  id: string;
  name: string;
  imageUrl: string | undefined;
  walkingMinutes: number;
  distanceMeters: number;
}

const MAX_PARK_DISTANCE_M = 2000;
const WALKING_SPEED_MPM = 80;
export const PARK_FALLBACK_IMAGE = '/images/park-placeholder.svg';

export function useNearbyParks(isOpen: boolean): NearbyParkCard[] {
  const [parks, setParks] = useState<NearbyParkCard[]>([]);
  // Coordinates come from the shared GPS store (driven by useGPS). This hook
  // never opens its own watcher or queries the Permissions API — when there is
  // no fix the section just stays hidden.
  const coords = useGPSStore((s) => s.coords);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isOpen || fetchedRef.current) return;
    if (!coords) return;

    let cancelled = false;

    (async () => {
      fetchedRef.current = true;
      try {
        // fetchRealParks (shared localStorage 6h SWR cache + in-flight dedup)
        // instead of the raw, uncached getAllParks() — same fix shape as the
        // onboarding location step. See .claude/plans/cryptic-munching-gadget.md.
        const allParks = await fetchRealParks();

        const withDistance = allParks
          .map((p) => {
            const dist = calculateDistance(
              coords.lat, coords.lng,
              p.location.lat, p.location.lng,
            );
            return {
              id: p.id,
              name: p.name,
              // imageUrl (Bunny, real park photo) first — was inverted
              // (images[0]/image first), which showed the stale Firebase cover
              // (often a back-filled equipment shot) on the overview-drawer
              // "where to train" park cards. Card ~200px → 400 for retina.
              imageUrl: resolveParkImage(p, 400) || undefined,
              walkingMinutes: Math.round(dist / WALKING_SPEED_MPM),
              distanceMeters: dist,
            } satisfies NearbyParkCard;
          })
          .filter((p) => p.distanceMeters <= MAX_PARK_DISTANCE_M)
          .sort((a, b) => a.distanceMeters - b.distanceMeters)
          .slice(0, 3);

        if (!cancelled) setParks(withDistance);
      } catch {
        // Park fetch failed — silently hide section.
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, coords]);

  return parks;
}

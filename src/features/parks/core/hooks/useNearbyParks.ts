'use client';

import { useState, useEffect, useRef } from 'react';
import { getAllParks } from '@/features/parks';
import { calculateDistance } from '@/lib/services/location.service';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';

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
        const allParks = await getAllParks();

        const withDistance = allParks
          .map((p) => {
            const dist = calculateDistance(
              coords.lat, coords.lng,
              p.location.lat, p.location.lng,
            );
            return {
              id: p.id,
              name: p.name,
              imageUrl: p.images?.[0] || p.image || p.imageUrl || undefined,
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

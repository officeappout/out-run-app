'use client';

import { useState, useEffect, useRef } from 'react';
import { getAllParks } from '@/features/parks';
import { calculateDistance } from '@/lib/services/location.service';

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
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isOpen || fetchedRef.current) return;
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state !== 'granted') return;

        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 60_000,
          }),
        );

        if (cancelled) return;
        fetchedRef.current = true;

        const allParks = await getAllParks();

        const withDistance = allParks
          .map((p) => {
            const dist = calculateDistance(
              pos.coords.latitude, pos.coords.longitude,
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
        // Permission API unsupported or geolocation error — silently hide section
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen]);

  return parks;
}

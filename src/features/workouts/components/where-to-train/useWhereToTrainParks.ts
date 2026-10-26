'use client';

/**
 * useWhereToTrainParks — nearby parks for the workout preview's "איפה מתאמנים?" carousel
 * (enable_where_to_train_v1), best match first.
 *
 * Reads: the shared cached park catalog (fetchRealParks, no extra read), then ONE getPark point-fetch
 * for each of the nearest WHERE_TO_TRAIN_FETCH_LIMIT parks — the catalog carries no gymEquipment /
 * city / featureTags / rating (SPEC-07), and those drive the ranking and the card. Point-fetches are
 * memoised per session, so re-opening the drawer costs nothing. GPS comes from the shared store
 * (never its own watcher); no fix → empty list, the section shows no carousel.
 */

import { useEffect, useMemo, useState } from 'react';
import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { getParkOnce } from '@/features/parks/core/services/park-point-fetch';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { calculateDistance } from '@/lib/services/location.service';
import { resolveParkImage } from '@/lib/park-image';
import type { Park, ParkFeatureTag } from '@/features/parks/core/types/park.types';
import {
  ensureEquipmentCachesLoaded,
  normalizeGearIds,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { parkGymEquipmentToGearIds } from '@/features/workout-engine/hybrid/park-equipment.util';
import { deriveAmenityTags } from '@/features/parks/client/components/park-preview/park-card-meta';
import { COMPACT_MAX_CHIPS } from '@/features/parks/client/components/park-preview/ParkCardCompact';
import { nearestWithin, rankParksForWorkout } from './where-to-train.logic';

export interface WhereToTrainPark {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
  heroSrc: string | null;
  objectPosition?: string;
  rating: { avg: number; count: number } | null;
  city: string | null;
  machineCount: number;
  amenityTags: ParkFeatureTag[];
  gearIds: string[];
}

function toCard(park: Park, distanceM: number): WhereToTrainPark {
  const hasRating = park.ratingAvg != null && (park.reviewCount ?? 0) > 0;
  return {
    id: park.id,
    name: park.name,
    lat: park.location.lat,
    lng: park.location.lng,
    distanceM,
    heroSrc: resolveParkImage(park, 600) || null,
    objectPosition: park.imagePosition || undefined,
    rating: hasRating ? { avg: park.ratingAvg as number, count: park.reviewCount ?? 0 } : null,
    city: park.city || null,
    machineCount: park.gymEquipment?.length ?? 0,
    amenityTags: deriveAmenityTags(park, COMPACT_MAX_CHIPS),
    gearIds: parkGymEquipmentToGearIds(park.gymEquipment, normalizeGearIds),
  };
}

export function useWhereToTrainParks(
  enabled: boolean,
  workoutGear: readonly string[],
): { parks: WhereToTrainPark[]; loading: boolean } {
  const coords = useGPSStore((s) => s.coords);
  const [cards, setCards] = useState<WhereToTrainPark[]>([]);
  const [loading, setLoading] = useState(false);
  // Fetch once per coarse position (~100 m) — not on every GPS tick.
  const posKey = coords ? `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}` : null;

  useEffect(() => {
    if (!enabled || !coords) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const catalog = await fetchRealParks();
        const near = nearestWithin(
          catalog
            .filter((p) => p.location?.lat != null && p.location?.lng != null)
            .map((p) => ({ id: p.id, distanceM: calculateDistance(coords.lat, coords.lng, p.location.lat, p.location.lng) })),
        );
        await ensureEquipmentCachesLoaded();
        const full = await Promise.all(near.map((n) => getParkOnce(n.id)));
        const next = full
          .map((park, i) => (park?.location ? toCard(park, near[i].distanceM) : null))
          .filter((c): c is WhereToTrainPark => c !== null);
        if (!cancelled) setCards(next);
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, posKey]);

  const gearKey = workoutGear.join('|');
  const parks = useMemo(
    () => rankParksForWorkout(cards, workoutGear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, gearKey],
  );
  return { parks, loading };
}

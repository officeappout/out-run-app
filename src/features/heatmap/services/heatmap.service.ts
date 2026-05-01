/**
 * Heatmap Aggregation Service — Privacy-First Live & Historical Heat Map.
 *
 * ABSOLUTE ANONYMITY CONTRACT:
 *   ✅  Returns: lat/lng points, gender ratio, average age, workout type counts
 *   ❌  NEVER returns: uid, name, email, or any PII
 *
 * Two modes:
 *   1. Live — subscribes to `active_workouts/{uid}` (real-time onSnapshot).
 *   2. Historical — one-shot query against `workouts` collection for a time
 *      window, extracts routePath GPS points, and applies Point Sampling
 *      (every Nth point) to keep the heatmap performant.
 */

import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAuthorityWithChildrenIds } from '@/features/admin/services/analytics.service';

// ── Public types (consumed by the heatmap UI component) ──────────────────────

export interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
}

export interface HeatmapAggregatedStats {
  totalActive: number;
  malePercent: number;
  femalePercent: number;
  otherPercent: number;
  averageAge: string;
  byWorkoutType: Record<string, number>;
}

export interface HeatmapSnapshot {
  points: HeatmapPoint[];
  stats: HeatmapAggregatedStats;
  geojson: GeoJSON.FeatureCollection;
}

// ── Age-group → midpoint mapping for average calculation ─────────────────────

const AGE_MIDPOINTS: Record<string, number> = {
  '0-17': 15,
  '18-25': 22,
  '26-35': 30,
  '36-45': 40,
  '46-55': 50,
  '56+': 62,
  'unknown': 30,
};

// ── Filters ──────────────────────────────────────────────────────────────────

export interface HeatmapFilters {
  gender: 'all' | 'male' | 'female' | 'other';
  workoutType: 'all' | 'running' | 'walking' | 'cycling' | 'strength';
  /** Inclusive lower bound (years). Default 18. */
  ageMin: number;
  /** Inclusive upper bound (years). Default 99. */
  ageMax: number;
}

/** Default = "show everything in adult range". */
export const DEFAULT_HEATMAP_FILTERS: HeatmapFilters = {
  gender: 'all',
  workoutType: 'all',
  ageMin: 18,
  ageMax: 99,
};

/** True when the filter is the default open range — used to relax 'unknown' fallbacks. */
function isDefaultAgeRange(filters: HeatmapFilters): boolean {
  return filters.ageMin <= 18 && filters.ageMax >= 99;
}

/** Live-mode `demographics.ageGroup` → inclusive [min, max] year range. */
const AGE_GROUP_RANGES: Record<string, [number, number]> = {
  '0-17': [0, 17],
  '18-25': [18, 25],
  '26-35': [26, 35],
  '36-45': [36, 45],
  '46-55': [46, 55],
  '56+': [56, 99],
};

/** Returns true iff the bucket [bMin, bMax] overlaps the filter [fMin, fMax]. */
function ageGroupPassesFilter(group: string | undefined, filters: HeatmapFilters): boolean {
  if (!group || group === 'unknown') {
    // Only let unknown through when the user hasn't restricted the range.
    return isDefaultAgeRange(filters);
  }
  const range = AGE_GROUP_RANGES[group];
  if (!range) return isDefaultAgeRange(filters);
  const [bMin, bMax] = range;
  return bMax >= filters.ageMin && bMin <= filters.ageMax;
}

/** Convert a Firestore birthDate (Timestamp | Date | string | null) to a year. */
function extractBirthYear(birthDate: unknown): number | null {
  if (!birthDate) return null;
  if (birthDate instanceof Date) {
    const y = birthDate.getFullYear();
    return y > 1900 ? y : null;
  }
  if (typeof birthDate === 'string') {
    const parsed = new Date(birthDate);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      return y > 1900 ? y : null;
    }
    return null;
  }
  if (typeof birthDate === 'object' && birthDate !== null) {
    const ts = birthDate as { toDate?: () => Date; seconds?: number };
    if (typeof ts.toDate === 'function') {
      const d = ts.toDate();
      const y = d.getFullYear();
      return y > 1900 ? y : null;
    }
    if (typeof ts.seconds === 'number') {
      const y = new Date(ts.seconds * 1000).getFullYear();
      return y > 1900 ? y : null;
    }
  }
  return null;
}

// ── Real-time listener ───────────────────────────────────────────────────────

/**
 * Subscribe to live active-workout docs for an authority (city + neighborhoods).
 *
 * Returns an unsubscribe function.
 * The `onData` callback receives a fully anonymized HeatmapSnapshot — no UIDs.
 */
export function subscribeToLiveHeatmap(
  authorityId: string,
  filters: HeatmapFilters,
  onData: (snapshot: HeatmapSnapshot) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let unsubscribed = false;
  let unsub: Unsubscribe = () => {};

  (async () => {
    try {
      const authorityIds = await getAuthorityWithChildrenIds(authorityId);

      if (unsubscribed) return;

      const constraints = [
        where('authorityId', 'in', authorityIds.slice(0, 30)),
      ];

      const q = query(collection(db, 'active_workouts'), ...constraints);

      unsub = onSnapshot(q, (snap) => {
        const rawDocs: Record<string, unknown>[] = [];
        snap.forEach((d) => rawDocs.push(d.data()));

        const currentYear = new Date().getFullYear();
        const filtered = rawDocs.filter((doc) => {
          const demo = doc.demographics as Record<string, unknown> | undefined;

          if (filters.gender !== 'all') {
            const gender = demo?.gender;
            if (gender !== filters.gender) return false;
          }
          if (filters.workoutType !== 'all') {
            if (doc.workoutType !== filters.workoutType) return false;
          }

          // Age filter — prefer exact birthYear when present, fall back to ageGroup overlap.
          const birthYear = demo?.birthYear as number | null | undefined;
          if (typeof birthYear === 'number' && birthYear > 1900) {
            const age = currentYear - birthYear;
            if (age < filters.ageMin || age > filters.ageMax) return false;
          } else {
            const ageGroup = demo?.ageGroup as string | undefined;
            if (!ageGroupPassesFilter(ageGroup, filters)) return false;
          }
          return true;
        });

        const snapshot = aggregateToSnapshot(filtered);
        onData(snapshot);
      }, (err) => {
        console.error('[Heatmap] onSnapshot error:', err);
        onError?.(err);
      });
    } catch (err) {
      console.error('[Heatmap] subscription setup error:', err);
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return () => {
    unsubscribed = true;
    unsub();
  };
}

// ── Historical query (one-shot, privacy-first) ──────────────────────────────

/** Point Sampling rate — take every Nth GPS point to keep heatmap responsive */
const SAMPLE_RATE = 7;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetch historical workout data for the given authority within a time window.
 * Extracts `routePath` GPS points, applies Point Sampling, and returns an
 * anonymized HeatmapSnapshot (no UIDs, no names).
 *
 * @param authorityId  City or neighborhood ID
 * @param timeWindow   Explicit { start, end } range computed by the UI
 * @param filters      Gender / workout type filters
 */
export async function fetchHistoricalHeatmap(
  authorityId: string,
  timeWindow: { start: Date; end: Date },
  filters: HeatmapFilters,
): Promise<HeatmapSnapshot> {
  const authorityIds = await getAuthorityWithChildrenIds(authorityId);

  // 1. Get user IDs for this authority + denormalize gender/birthYear so we can
  //    apply demographic filters against the workout collection (which has no
  //    gender/age fields of its own).
  const userIds: string[] = [];
  const userGenderMap = new Map<string, string>();
  const userBirthYearMap = new Map<string, number | null>();

  await Promise.all(chunk(authorityIds.slice(0, 30), 30).map(async (batch) => {
    const snap = await getDocs(query(
      collection(db, 'users'),
      where('core.authorityId', 'in', batch),
    ));
    snap.docs.forEach((d) => {
      userIds.push(d.id);
      const data = d.data() as { core?: { gender?: string; birthDate?: unknown } };
      userGenderMap.set(d.id, data.core?.gender ?? 'other');
      userBirthYearMap.set(d.id, extractBirthYear(data.core?.birthDate));
    });
  }));

  if (userIds.length === 0) return emptySnapshot();

  // 2. Build time window
  const startTs = Timestamp.fromDate(timeWindow.start);
  const endTs = Timestamp.fromDate(timeWindow.end);

  // 3. Query workouts in parallel batches
  const features: GeoJSON.Feature[] = [];
  const points: HeatmapPoint[] = [];
  let totalWorkouts = 0;
  const workoutTypeCounts: Record<string, number> = {};
  const currentYear = new Date().getFullYear();

  await Promise.all(chunk(userIds, 30).map(async (batch) => {
    try {
      const q = query(
        collection(db, 'workouts'),
        where('userId', 'in', batch),
        where('date', '>=', startTs),
        where('date', '<=', endTs),
      );
      const snap = await getDocs(q);

      snap.docs.forEach((d) => {
        const raw = d.data();
        const ownerId = raw.userId as string | undefined;

        // Apply gender filter via the userId → gender map built above.
        if (filters.gender !== 'all') {
          const g = ownerId ? userGenderMap.get(ownerId) : undefined;
          if (g !== filters.gender) return;
        }

        // Apply age filter via the userId → birthYear map. Users without a
        // valid birthYear are only included when the filter is the default
        // open range (consistent with live mode's "unknown" handling).
        const by = ownerId ? userBirthYearMap.get(ownerId) ?? null : null;
        if (by != null) {
          const age = currentYear - by;
          if (age < filters.ageMin || age > filters.ageMax) return;
        } else if (!isDefaultAgeRange(filters)) {
          return;
        }

        totalWorkouts++;

        // Count workout types
        const wt = (raw.activityType ?? raw.workoutType ?? 'strength') as string;

        // Apply workout-type filter
        if (filters.workoutType !== 'all' && wt !== filters.workoutType) return;

        workoutTypeCounts[wt] = (workoutTypeCounts[wt] ?? 0) + 1;

        // Extract routePath GPS points with sampling
        const path = raw.routePath as Array<Record<string, number> | number[]> | undefined;
        if (!path || !Array.isArray(path) || path.length === 0) return;

        for (let i = 0; i < path.length; i += SAMPLE_RATE) {
          const coord = path[i];
          let lat: number;
          let lng: number;

          if (Array.isArray(coord) && coord.length >= 2) {
            // Could be [lng, lat] (Mapbox) or [lat, lng] — use same heuristic as storage
            const first = Number(coord[0]);
            const second = Number(coord[1]);
            if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
              lng = first; lat = second;
            } else {
              lat = first; lng = second;
            }
          } else if (coord && typeof coord === 'object' && 'lat' in coord && 'lng' in coord) {
            lat = Number(coord.lat);
            lng = Number(coord.lng);
          } else {
            continue;
          }

          if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

          points.push({ lat, lng, weight: 1 });
          features.push({
            type: 'Feature',
            properties: { weight: 1 },
            geometry: { type: 'Point', coordinates: [lng, lat] },
          });
        }
      });
    } catch (err) {
      console.warn('[Heatmap] historical batch error:', err);
    }
  }));

  return {
    points,
    stats: {
      totalActive: totalWorkouts,
      malePercent: 0,
      femalePercent: 0,
      otherPercent: 0,
      averageAge: '-',
      byWorkoutType: workoutTypeCounts,
    },
    geojson: { type: 'FeatureCollection', features },
  };
}

function emptySnapshot(): HeatmapSnapshot {
  return {
    points: [],
    stats: {
      totalActive: 0,
      malePercent: 0,
      femalePercent: 0,
      otherPercent: 0,
      averageAge: '-',
      byWorkoutType: {},
    },
    geojson: { type: 'FeatureCollection', features: [] },
  };
}

// ── Aggregation (strips all PII) — used by LIVE mode ─────────────────────────

function aggregateToSnapshot(docs: Record<string, unknown>[]): HeatmapSnapshot {
  const points: HeatmapPoint[] = [];
  const features: GeoJSON.Feature[] = [];

  let maleCount = 0;
  let femaleCount = 0;
  let otherCount = 0;
  let ageSum = 0;
  let ageCount = 0;
  const workoutTypeCounts: Record<string, number> = {};

  for (const raw of docs) {
    const loc = raw.location as { lat: number; lng: number } | undefined;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;

    points.push({ lat: loc.lat, lng: loc.lng, weight: 1 });

    features.push({
      type: 'Feature',
      properties: { weight: 1 },
      geometry: { type: 'Point', coordinates: [loc.lng, loc.lat] },
    });

    const demo = raw.demographics as Record<string, unknown> | undefined;
    const gender = (demo?.gender as string) ?? 'other';
    if (gender === 'male') maleCount++;
    else if (gender === 'female') femaleCount++;
    else otherCount++;

    const birthYear = demo?.birthYear as number | undefined;
    if (birthYear && birthYear > 1900) {
      ageSum += new Date().getFullYear() - birthYear;
    } else {
      const ageGroup = (demo?.ageGroup as string) ?? 'unknown';
      ageSum += AGE_MIDPOINTS[ageGroup] ?? 30;
    }
    ageCount++;

    const wt = (raw.workoutType as string) ?? 'unknown';
    workoutTypeCounts[wt] = (workoutTypeCounts[wt] ?? 0) + 1;
  }

  const total = docs.length || 1;
  const avgAge = ageCount > 0 ? Math.round(ageSum / ageCount) : 0;

  return {
    points,
    stats: {
      totalActive: docs.length,
      malePercent: Math.round((maleCount / total) * 100),
      femalePercent: Math.round((femaleCount / total) * 100),
      otherPercent: Math.round((otherCount / total) * 100),
      averageAge: avgAge > 0 ? String(avgAge) : '-',
      byWorkoutType: workoutTypeCounts,
    },
    geojson: { type: 'FeatureCollection', features },
  };
}

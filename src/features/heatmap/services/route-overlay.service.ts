/**
 * Route Overlay Service — Curated Routes Layer for the Live Heatmap.
 *
 * Loads `official_routes` for an authority (city + neighborhoods), normalizes
 * the geometry, and surfaces the per-route usage analytics so the admin map
 * can render route popularity on top of the density heatmap.
 *
 * Reads from `official_routes` only — no PII involved.
 *
 * Note on `published`: matches the lenient pattern used by
 * `InventoryService.fetchOfficialRoutes` — routes with `published === false`
 * are excluded; `undefined` is treated as published (legacy/seed data).
 */

import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAuthorityWithChildrenIds } from '@/features/admin/services/analytics.service';

export interface RouteOverlayItem {
  id: string;
  name: string;
  /** Geometry as { lat, lng } objects (Firestore native shape). */
  path: Array<{ lat: number; lng: number }>;
  usageCount: number;
  /** Last completion time, when known. */
  lastUsed: Date | null;
  /** Activity classification, when stored on the doc. */
  activityType: 'running' | 'walking' | 'cycling' | 'workout' | null;
  /** Authority the route is associated with (denormalized for hover popups). */
  authorityId: string | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null) {
    const ts = value as { toDate?: () => Date; seconds?: number };
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  }
  return null;
}

function normalisePath(rawPath: unknown): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(rawPath)) return [];
  const out: Array<{ lat: number; lng: number }> = [];
  for (const p of rawPath) {
    // Firestore stores routes as [{lat, lng}, ...] (per InventoryService).
    if (p && typeof p === 'object' && !Array.isArray(p) && 'lat' in p && 'lng' in p) {
      const lat = Number((p as { lat: unknown }).lat);
      const lng = Number((p as { lng: unknown }).lng);
      if (!isNaN(lat) && !isNaN(lng)) out.push({ lat, lng });
      continue;
    }
    // Defensive: also accept legacy [lng, lat] tuples.
    if (Array.isArray(p) && p.length >= 2) {
      const a = Number(p[0]);
      const b = Number(p[1]);
      if (!isNaN(a) && !isNaN(b)) {
        if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
          out.push({ lat: b, lng: a });
        } else {
          out.push({ lat: a, lng: b });
        }
      }
    }
  }
  return out;
}

/**
 * Fetch routes published for the given authority (and its child authorities).
 * Returns at most ~500 routes per authority — caller-side rendering caps still
 * apply on the map layer for performance.
 */
export async function fetchRoutesForOverlay(
  authorityId: string,
): Promise<RouteOverlayItem[]> {
  const authorityIds = await getAuthorityWithChildrenIds(authorityId);
  if (authorityIds.length === 0) return [];

  const items: RouteOverlayItem[] = [];

  await Promise.all(
    chunk(authorityIds, 30).map(async (batch) => {
      try {
        const q = query(
          collection(db, 'official_routes'),
          where('authorityId', 'in', batch),
        );
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          if (data.published === false) return;

          const path = normalisePath(data.path);
          if (path.length < 2) return;

          const analytics = (data.analytics ?? {}) as Record<string, unknown>;
          const usageCount = Number(analytics.usageCount ?? 0) || 0;
          const lastUsed = toDate(analytics.lastUsed);
          const activityRaw =
            (data.activityType as string | undefined) ??
            (data.type as string | undefined) ??
            null;
          const activityType =
            activityRaw === 'running' ||
            activityRaw === 'walking' ||
            activityRaw === 'cycling' ||
            activityRaw === 'workout'
              ? activityRaw
              : null;

          items.push({
            id: d.id,
            name: (data.name as string) ?? 'Route',
            path,
            usageCount,
            lastUsed,
            activityType,
            authorityId: (data.authorityId as string) ?? null,
          });
        });
      } catch (err) {
        console.warn('[RouteOverlay] batch fetch failed:', err);
      }
    }),
  );

  return items;
}

/**
 * Convenience: top-N routes by usageCount (descending). Routes with zero
 * usage are dropped so callers can show an explicit empty state.
 */
export async function fetchPopularRoutes(
  authorityId: string,
  limit = 5,
): Promise<RouteOverlayItem[]> {
  const all = await fetchRoutesForOverlay(authorityId);
  return all
    .filter((r) => r.usageCount > 0)
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit);
}

// ════════════════════════════════════════════════════════════════════════════
// Parks Overlay — sibling layer to routes for the Live Heatmap.
// ════════════════════════════════════════════════════════════════════════════

/**
 * One park as rendered on the heatmap parks overlay.
 *
 * `visitCount` / `peakHour` / `genderSplit` are computed from the `sessions`
 * collection (one doc per park visit at workout-finish — see
 * `WorkoutSummaryPage` / `RunSummary` / `[id]/active/page.tsx`).
 *
 * `topActivity` is enriched from `workouts` where `parkId` matches — that
 * field is set by `saveWorkout()` from the same callsites. Demo-seed data
 * does not stamp `parkId` on workouts, so `topActivity` will be `null` for
 * pure-mock authorities.
 */
export interface ParkOverlayItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  facilityType: string;
  status: 'open' | 'closed' | 'under_repair';
  /** Park visits this calendar month (count of `sessions` rows). */
  visitCount: number;
  /** Most common hour-of-day (0–23) of visits this month, or null when no data. */
  peakHour: number | null;
  /** Visit-weighted male / female counts derived from session.userId → users.core.gender. */
  genderSplit: { male: number; female: number };
  /** Most common activity type from workouts with this parkId, or null. */
  topActivity: 'running' | 'walking' | 'strength' | null;
}

interface SessionRow {
  parkId: string;
  userId: string;
  date: Date;
}

interface ParkRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  facilityType: string;
  status: 'open' | 'closed' | 'under_repair';
}

interface WorkoutByParkRow {
  parkId: string;
  activityType: string;
}

function startOfThisMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function fetchParksForAuthorities(authorityIds: string[]): Promise<ParkRow[]> {
  const out: ParkRow[] = [];
  await Promise.all(
    chunk(authorityIds, 30).map(async (batch) => {
      try {
        const snap = await getDocs(
          query(collection(db, 'parks'), where('authorityId', 'in', batch)),
        );
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const loc = (data.location ?? {}) as { lat?: unknown; lng?: unknown };
          const lat = Number(loc.lat);
          const lng = Number(loc.lng);
          if (isNaN(lat) || isNaN(lng)) return;
          const status = data.status as ParkRow['status'] | undefined;
          out.push({
            id: d.id,
            name: (data.name as string) ?? 'Park',
            lat,
            lng,
            facilityType: (data.facilityType as string) ?? '',
            status:
              status === 'closed' || status === 'under_repair' ? status : 'open',
          });
        });
      } catch (err) {
        console.warn('[ParksOverlay] parks batch failed:', err);
      }
    }),
  );
  return out;
}

async function fetchSessionsThisMonth(
  authorityIds: string[],
  startTs: Timestamp,
): Promise<SessionRow[]> {
  const out: SessionRow[] = [];
  await Promise.all(
    chunk(authorityIds, 30).map(async (batch) => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'sessions'),
            where('authorityId', 'in', batch),
            where('date', '>=', startTs),
          ),
        );
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const parkId = data.parkId as string | undefined;
          const userId = data.userId as string | undefined;
          const date = toDate(data.date);
          if (!parkId || !userId || !date) return;
          out.push({ parkId, userId, date });
        });
      } catch (err) {
        console.warn('[ParksOverlay] sessions batch failed:', err);
      }
    }),
  );
  return out;
}

async function fetchUserGenders(
  userIds: string[],
): Promise<Map<string, 'male' | 'female' | 'other'>> {
  const out = new Map<string, 'male' | 'female' | 'other'>();
  if (userIds.length === 0) return out;
  await Promise.all(
    chunk(userIds, 30).map(async (batch) => {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), where('__name__', 'in', batch)),
        );
        snap.docs.forEach((d) => {
          const core = (d.data() as { core?: { gender?: string } })?.core;
          const g = core?.gender;
          out.set(
            d.id,
            g === 'male' || g === 'female' ? g : 'other',
          );
        });
      } catch (err) {
        console.warn('[ParksOverlay] users batch failed:', err);
      }
    }),
  );
  return out;
}

async function fetchWorkoutsForParks(
  parkIds: string[],
  startTs: Timestamp,
): Promise<WorkoutByParkRow[]> {
  const out: WorkoutByParkRow[] = [];
  if (parkIds.length === 0) return out;
  await Promise.all(
    chunk(parkIds, 30).map(async (batch) => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'workouts'),
            where('parkId', 'in', batch),
            where('date', '>=', startTs),
          ),
        );
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const parkId = data.parkId as string | undefined;
          const activityType =
            (data.activityType as string | undefined) ??
            (data.workoutType as string | undefined);
          if (!parkId || !activityType) return;
          out.push({ parkId, activityType });
        });
      } catch (err) {
        // Composite index on (parkId, date) may not exist yet — degrade
        // gracefully: topActivity will be null until the index is built.
        console.warn('[ParksOverlay] workouts batch failed:', err);
      }
    }),
  );
  return out;
}

function modeOf<T extends string | number>(items: T[]): T | null {
  if (items.length === 0) return null;
  const counts = new Map<T, number>();
  items.forEach((it) => counts.set(it, (counts.get(it) ?? 0) + 1));
  let best: { val: T; n: number } | null = null;
  counts.forEach((n, val) => {
    if (!best || n > best.n) best = { val, n };
  });
  // `best` is reassigned inside forEach but TS narrows it back to the
  // declaration type after the callback — cast through unknown to read it.
  const winner = best as unknown as { val: T; n: number } | null;
  return winner ? winner.val : null;
}

/**
 * Fetch every park in the authority (city + neighborhoods) merged with this
 * month's `sessions`-derived analytics. Returns one row per park even when
 * the park has zero visits, so the overlay can still render the location.
 */
export async function fetchParksForOverlay(
  authorityId: string,
): Promise<ParkOverlayItem[]> {
  const authorityIds = await getAuthorityWithChildrenIds(authorityId);
  if (authorityIds.length === 0) return [];

  const startTs = Timestamp.fromDate(startOfThisMonth());

  // Step 1 (parallel): parks scoped to authority + sessions in this month.
  const [parks, sessions] = await Promise.all([
    fetchParksForAuthorities(authorityIds),
    fetchSessionsThisMonth(authorityIds, startTs),
  ]);

  if (parks.length === 0) return [];

  // Step 2 (parallel, dependent): user genders + workouts tagged with parkId.
  const userIds = Array.from(new Set(sessions.map((s) => s.userId)));
  const parkIds = parks.map((p) => p.id);
  const [gendersByUser, workoutsRaw] = await Promise.all([
    fetchUserGenders(userIds),
    fetchWorkoutsForParks(parkIds, startTs),
  ]);

  // Step 3: aggregate in-memory per park.
  const sessionsByPark = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const arr = sessionsByPark.get(s.parkId);
    if (arr) arr.push(s);
    else sessionsByPark.set(s.parkId, [s]);
  }

  const activitiesByPark = new Map<string, string[]>();
  for (const w of workoutsRaw) {
    const arr = activitiesByPark.get(w.parkId);
    if (arr) arr.push(w.activityType);
    else activitiesByPark.set(w.parkId, [w.activityType]);
  }

  return aggregateParks(parks, sessionsByPark, activitiesByPark, gendersByUser);
}

/**
 * Convenience: top-N parks by `visitCount` (descending). Parks with zero
 * visits are dropped so the card can render an explicit empty state.
 */
export async function fetchPopularParks(
  authorityId: string,
  limit = 5,
): Promise<ParkOverlayItem[]> {
  const all = await fetchParksForOverlay(authorityId);
  return all
    .filter((p) => p.visitCount > 0)
    .sort((a, b) => b.visitCount - a.visitCount)
    .slice(0, limit);
}

// ── Aggregation helper (extracted so fetchPopularParks doesn't re-aggregate) ──
function aggregateParks(
  parks: ParkRow[],
  sessionsByPark: Map<string, SessionRow[]>,
  activitiesByPark: Map<string, string[]>,
  gendersByUser: Map<string, 'male' | 'female' | 'other'>,
): ParkOverlayItem[] {
  return parks.map((park) => {
    const parkSessions = sessionsByPark.get(park.id) ?? [];
    const visitCount = parkSessions.length;

    const peakHour = modeOf(parkSessions.map((s) => s.date.getHours()));

    let male = 0;
    let female = 0;
    for (const s of parkSessions) {
      const g = gendersByUser.get(s.userId);
      if (g === 'male') male++;
      else if (g === 'female') female++;
    }

    const activityRaw = modeOf(activitiesByPark.get(park.id) ?? []);
    let topActivity: ParkOverlayItem['topActivity'] = null;
    if (activityRaw === 'running') topActivity = 'running';
    else if (activityRaw === 'walking') topActivity = 'walking';
    else if (
      activityRaw === 'strength' ||
      activityRaw === 'workout' ||
      activityRaw === 'STRENGTH'
    ) {
      topActivity = 'strength';
    }

    return {
      id: park.id,
      name: park.name,
      lat: park.lat,
      lng: park.lng,
      facilityType: park.facilityType,
      status: park.status,
      visitCount,
      peakHour,
      genderSplit: { male, female },
      topActivity,
    };
  });
}

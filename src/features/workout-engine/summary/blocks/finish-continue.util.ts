/**
 * G7.1 "finish & continue" (flag enable_finish_and_continue) — pure logic for
 * the continuation suggestions shown in the summary drawer's pinned footer.
 * No React, no Firebase — unit-tested in node.
 *
 * Every suggestion maps onto an EXISTING entry point (nothing new is built):
 *   - keep_walking  → /map?openRun=walking  (FreeRunDrawer config, walking
 *                     pre-selected — the same deep-link /home's step-goal
 *                     card already uses, consumed by DiscoverLayer).
 *   - park_strength → useMapStore.pendingParkWorkoutStart + /home (the same
 *                     hand-off ParkDetailSheet's "התחל אימון" uses; /home
 *                     composes the park workout and opens the preview drawer).
 *   - run_home      → /map?openRun=running (FreeRunDrawer config, running
 *                     pre-selected; the drawer's existing "📍 יעד: כתובת"
 *                     option is how the user points it home — the app stores
 *                     no home location, so we never guess one).
 */

export type ContinuationKind = 'keep_walking' | 'park_strength' | 'run_home';

export interface ContinuationOption {
  kind: ContinuationKind;
  title: string;
  subtitle: string;
}

/** The minimal park shape the picker needs (Park satisfies it). */
export interface ParkLike {
  id: string;
  name?: string;
  location?: { lat: number; lng: number } | null;
}

export interface NearestPark<P extends ParkLike = ParkLike> {
  park: P;
  distanceMeters: number;
  walkingMinutes: number;
}

/** Same radius + walking speed as useNearbyParks (the overview drawer's "where to train"). */
export const CONTINUE_PARK_MAX_DISTANCE_M = 2000;
const WALKING_SPEED_MPM = 80;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Nearest park within maxMeters of pos, or null (no position / no park close enough). */
export function pickNearestPark<P extends ParkLike>(
  parks: readonly P[],
  pos: { lat: number; lng: number } | null | undefined,
  maxMeters: number = CONTINUE_PARK_MAX_DISTANCE_M,
): NearestPark<P> | null {
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return null;
  let best: NearestPark<P> | null = null;
  for (const park of parks) {
    const lat = park?.location?.lat;
    const lng = park?.location?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = haversineMeters(pos.lat, pos.lng, lat, lng);
    if (d > maxMeters) continue;
    if (!best || d < best.distanceMeters) {
      best = { park, distanceMeters: d, walkingMinutes: Math.max(1, Math.round(d / WALKING_SPEED_MPM)) };
    }
  }
  return best;
}

/**
 * The 2–3 suggestions, in display order. The park suggestion only appears when
 * a real park is within range; the other two never depend on data.
 */
export function buildContinuationOptions(nearest: NearestPark | null): ContinuationOption[] {
  const options: ContinuationOption[] = [
    { kind: 'keep_walking', title: 'ממשיכים ללכת', subtitle: 'הליכה חופשית' },
  ];
  if (nearest) {
    const name = nearest.park.name?.trim();
    options.push({
      kind: 'park_strength',
      title: name ? `כוח ב${name}` : 'כוח בגינה קרובה',
      subtitle: `${nearest.walkingMinutes} דק׳ הליכה`,
    });
  }
  options.push({ kind: 'run_home', title: 'ריצה קצרה הביתה', subtitle: 'בוחרים יעד: כתובת' });
  return options;
}

/** Where each continuation lands after the normal finish teardown. */
export function continuationHref(kind: ContinuationKind): string {
  switch (kind) {
    case 'keep_walking':
      return '/map?openRun=walking';
    case 'run_home':
      return '/map?openRun=running';
    case 'park_strength':
      return '/home';
  }
}

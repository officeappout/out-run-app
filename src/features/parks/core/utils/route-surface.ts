/**
 * Route surface class for the map's (planned) surface filter — pure, no I/O,
 * no street_segments join on the client (owner-approved 23.10.2026).
 *
 * `routeSurfaceClass` reads the stored `surfaceClass` (official_routes carry it
 * from the route-score pipeline); a doc that doesn't have it yet is derived
 * from its OWN fields with the same logic the pipeline uses (trail stats →
 * surfaceType → coarse features.surface), else 'unknown'. Never throws on a
 * sparse doc (field-guards).
 */
import { classifySurface, isSurfaceClass, surfaceSharesFromDoc, type SurfaceClass } from '@/lib/route-score/surface-class';

export type { SurfaceClass };

/** What the user picks: any surface, paved only, or off-road only. */
export type SurfaceFilter = 'any' | 'paved' | 'offroad';
/** Which activity family the filter applies to; undefined = either family. */
export type SurfaceActivity = 'running' | 'walking' | 'cycling' | 'workout' | null | undefined;

/** What to do with routes whose class is 'unknown' while a surface filter is active. */
export type UnknownSurfacePolicy = 'hide' | 'show';

export const DEFAULT_UNKNOWN_SURFACE_POLICY: UnknownSurfacePolicy = 'hide';

export function routeSurfaceClass(route: unknown): SurfaceClass {
  const r = (route && typeof route === 'object' ? route : {}) as Record<string, any>;
  if (isSurfaceClass(r.surfaceClass)) return r.surfaceClass;
  const activity = typeof r.activityType === 'string' ? r.activityType : typeof r.type === 'string' ? r.type : null;
  return classifySurface(activity, surfaceSharesFromDoc(r));
}

const PAVED: ReadonlySet<SurfaceClass> = new Set<SurfaceClass>(['walk_run_paved', 'bike_road']);
const OFFROAD: ReadonlySet<SurfaceClass> = new Set<SurfaceClass>(['hike_offroad', 'bike_offroad']);
const BIKE: ReadonlySet<SurfaceClass> = new Set<SurfaceClass>(['bike_road', 'bike_offroad']);

/**
 * Does a route of class `cls` pass the surface filter?
 * - 'any' passes everything (including unknown).
 * - 'paved' / 'offroad': unknown follows `unknownPolicy` (default: hide).
 * - With `activity`, only that family passes: cycling → bike_*, running/walking/workout → walk_run_paved / hike_offroad.
 *   Without it either family passes.
 */
export function surfaceMatchesFilter(
  cls: SurfaceClass,
  filter: SurfaceFilter,
  opts: { activity?: SurfaceActivity; unknownPolicy?: UnknownSurfacePolicy } = {},
): boolean {
  if (filter === 'any') return true;
  if (cls === 'unknown') return (opts.unknownPolicy ?? DEFAULT_UNKNOWN_SURFACE_POLICY) === 'show';
  if (opts.activity) {
    const wantsBike = opts.activity === 'cycling';
    if (BIKE.has(cls) !== wantsBike) return false;
  }
  return filter === 'paved' ? PAVED.has(cls) : OFFROAD.has(cls);
}

/** Convenience: classify a route doc and test it against the filter. */
export function routeMatchesSurfaceFilter(
  route: unknown,
  filter: SurfaceFilter,
  opts: { activity?: SurfaceActivity; unknownPolicy?: UnknownSurfacePolicy } = {},
): boolean {
  return surfaceMatchesFilter(routeSurfaceClass(route), filter, opts);
}

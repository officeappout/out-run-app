/**
 * Route session types — what kind of session a published route can host.
 *
 * A small extensible list per route: today only 'walk_with_stops' is implemented (walk the
 * route, stop at the parks/benches along it). Combined sessions (e.g. an AMRAP or EMOM that
 * mixes the walk with the stops, from the protocols workstream) plug in here later by adding
 * an entry with `implemented: true` and a compose branch — the card and ranking don't change.
 *
 * Pure — no I/O.
 */

export type RouteSessionTypeId = 'walk_with_stops' | 'amrap_combo' | 'emom_combo';

export interface RouteSessionType {
  id: RouteSessionTypeId;
  /** Short Hebrew label for a future picker. */
  label: string;
  /** Only implemented types are ever offered to the user. */
  implemented: boolean;
  /** Minimum stops on the route for this type to make sense. */
  minStops: number;
  /** Needs at least one strength (equipped) stop. */
  needsStrengthStop: boolean;
}

export const ROUTE_SESSION_TYPES: readonly RouteSessionType[] = [
  { id: 'walk_with_stops', label: 'הליכה עם עצירות', implemented: true, minStops: 1, needsStrengthStop: false },
  { id: 'amrap_combo', label: 'AMRAP משולב', implemented: false, minStops: 2, needsStrengthStop: true },
  { id: 'emom_combo', label: 'EMOM משולב', implemented: false, minStops: 2, needsStrengthStop: true },
];

/** The session types a route with these stops can host — implemented ones only. */
export function sessionTypesForRoute(
  stops: { stopCount: number; strengthStopCount: number },
  registry: readonly RouteSessionType[] = ROUTE_SESSION_TYPES,
): RouteSessionType[] {
  return registry.filter((t) =>
    t.implemented
    && stops.stopCount >= t.minStops
    && (!t.needsStrengthStop || stops.strengthStopCount > 0));
}

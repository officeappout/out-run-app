/**
 * leg-plan.service.ts — Phase 0 of capability ג' (leg_chaining, 08.08).
 *
 * A pure compiler that turns a user-composed, ORDERED list of route legs
 * (e.g. "detour toward the promenade, then continue to a friend's address")
 * into one continuous, real-street route via a SINGLE Mapbox Directions
 * call — reusing `MapboxService.getSmartPath` exactly as-is, no engine
 * changes. See `.claude/knowledge/free-run-multileg-feasibility-scoping.md`
 * for the full research trail this design is grounded in (4 confirmed
 * product recommendations, the loop-mode distance-cap fixes this file has
 * zero dependency on, and why `waypoints_through_stops` in
 * start-hybrid-session.ts was rejected as an integration point).
 *
 * Scope (v1, David 08.08): every leg is a plain destination pick
 * (`kind: 'to_point'`) — no forced via-points yet. `RouteLeg` is already a
 * discriminated union so a `via_point` kind (capability ד', explicitly the
 * very next task) can be added without a breaking change, but
 * `compileLegPlan` only handles `to_point` today and throws clearly if it
 * ever sees anything else — the Phase-1 UI (not built yet) has no way to
 * produce a `via_point` leg, so that branch should be unreachable until ד'
 * ships.
 */

import { MapboxService } from './mapbox.service';
import type { Route, ActivityType } from '../types/route.types';

/** One user-composed hop in a leg plan. */
export type RouteLeg =
  | {
      kind: 'to_point';
      /** Stable id for UI list rendering/reordering and legBreakdown alignment. */
      id: string;
      /** Human label shown in the plan-builder list ("לכתובת של דני"). */
      label?: string;
      destination: { lat: number; lng: number };
    }
  | {
      /** NOT YET SUPPORTED — reserved for capability ד' (via_point). See file header. */
      kind: 'via_point';
      id: string;
      label?: string;
      viaPoint: { lat: number; lng: number; label?: string };
      destination: { lat: number; lng: number };
    };

/** A full leg-chaining plan, authored/held as local state (David, 08.08: no Firestore doc for the plan itself — see the scoping doc's ephemeral-persistence recommendation). */
export interface RouteLegPlan {
  /** Single shared profile for the whole plan — no mid-plan activity switching in v1 (David, 08.08). */
  activity: ActivityType;
  /** Ordered — execution order is array order, no separate `order` field needed. */
  legs: RouteLeg[];
  /** Where the whole plan starts — typically the user's GPS at build time. */
  origin: { lat: number; lng: number };
}

/**
 * What a RouteLegPlan compiles into at "start run" time. `legBreakdown` is
 * the free per-leg distance/duration Mapbox already computes for a
 * multi-waypoint request — surfaced now that `mapbox.service.ts`'s wrapper
 * stops discarding `route.legs[]` (08.08) — no extra API cost.
 */
export interface CompiledLegPlanRoute {
  /** Same shape the rest of the map/player pipeline already consumes. */
  route: Route;
  /** Per-leg distance/duration, index-aligned with the plan's `legs`. */
  legBreakdown: Array<{ legId: string; distanceKm: number; durationMin: number }>;
}

/**
 * Mapbox Directions API hard limit (verified — see the scoping doc's
 * "תקציב Mapbox API" section): up to 25 coordinates per request for
 * walking/cycling/driving profiles. External to this codebase, not
 * configurable.
 */
const MAPBOX_MAX_COORDINATES = 25;

/**
 * Max legs per plan (David, 08.08): no arbitrary product number — derive
 * from the real Mapbox limit instead, the same principle already applied
 * to the distance slider (no product-chosen cap, only real technical
 * ones). Every leg contributes exactly one coordinate (its destination) in
 * v1 since via-point legs aren't supported yet; the plan's origin consumes
 * one more slot. 25 - 1 = 24.
 */
export const MAX_LEGS_PER_PLAN = MAPBOX_MAX_COORDINATES - 1;

export class LegPlanTooLongError extends Error {
  constructor(public legCount: number) {
    super(
      `תוכנית עם ${legCount} עצירות חורגת מהמגבלה של Mapbox (${MAX_LEGS_PER_PLAN} עצירות לכל היותר בבקשה אחת). הסר עצירה אחת או יותר.`,
    );
    this.name = 'LegPlanTooLongError';
  }
}

export class EmptyLegPlanError extends Error {
  constructor() {
    super('אי אפשר להתחיל תוכנית ריקה — הוסף לפחות עצירה אחת.');
    this.name = 'EmptyLegPlanError';
  }
}

export class LegPlanNoRouteError extends Error {
  constructor() {
    super('לא הצלחנו למצוא מסלול בין העצירות שנבחרו. נסה לשנות את סדר העצירות או להסיר אחת מהן.');
    this.name = 'LegPlanNoRouteError';
  }
}

function legDestination(leg: RouteLeg): { lat: number; lng: number } {
  if (leg.kind !== 'to_point') {
    // Defensive — see file header. The Phase-1 UI can't produce this yet.
    throw new Error(`Leg kind "${leg.kind}" is not supported yet (via_point ships in capability ד').`);
  }
  return leg.destination;
}

/**
 * Compiles an ordered leg plan into one continuous route via a single
 * Mapbox Directions call — `[origin, ...allButLast, last]`, i.e. every leg
 * but the last becomes an intermediate waypoint and the last leg's
 * destination becomes the request's `end`. Throws on an empty plan, a plan
 * over `MAX_LEGS_PER_PLAN`, or no route found between the chosen points —
 * callers (the Phase-1 UI) should catch these and show the message on the
 * error directly (already Hebrew, user-facing).
 */
export async function compileLegPlan(plan: RouteLegPlan): Promise<CompiledLegPlanRoute> {
  if (plan.legs.length === 0) throw new EmptyLegPlanError();
  if (plan.legs.length > MAX_LEGS_PER_PLAN) throw new LegPlanTooLongError(plan.legs.length);

  const destinations = plan.legs.map(legDestination);
  const finalDestination = destinations[destinations.length - 1];
  const intermediateWaypoints = destinations.slice(0, -1);
  const profile: 'walking' | 'cycling' = plan.activity === 'cycling' ? 'cycling' : 'walking';

  const result = await MapboxService.getSmartPath(plan.origin, finalDestination, profile, intermediateWaypoints);
  if (!result || !result.path || result.path.length === 0) throw new LegPlanNoRouteError();

  const km = parseFloat((result.distance / 1000).toFixed(2));
  const durationMin = Math.max(1, Math.round(result.duration / 60));
  const calories = Math.round(km * (plan.activity === 'cycling' ? 25 : 65));

  const route: Route = {
    id: `legplan-${Date.now()}`,
    name: 'המסלול שהרכבת',
    description: `${plan.legs.length} עצירות · ${km.toFixed(1)} ק"מ`,
    distance: km,
    duration: durationMin,
    score: Math.round(km * 60),
    rating: 5,
    calories,
    type: plan.activity,
    activityType: plan.activity,
    difficulty: 'easy',
    path: result.path,
    segments: [],
    features: {
      hasGym: false,
      hasBenches: false,
      lit: true,
      scenic: false,
      terrain: 'road',
      environment: 'urban',
      trafficLoad: 'medium',
      surface: 'asphalt',
    },
    source: { type: 'system', name: 'OutRun Leg Plan' },
    etaSeconds: result.duration,
  };

  const legBreakdown = (result.legs ?? []).map((leg, i) => ({
    legId: plan.legs[i]?.id ?? `leg-${i}`,
    distanceKm: parseFloat((leg.distance / 1000).toFixed(2)),
    durationMin: Math.max(1, Math.round(leg.duration / 60)),
  }));

  return { route, legBreakdown };
}

/**
 * suggestWorkoutsForPlace — up to 3 workouts for a park or a route, ranked:
 *
 *   1. Today's plan workout, if it fits here (a strength day at a park; the
 *      planned run on a route where workoutFitForRoute says it fits — a hill
 *      run only where a climb meets the rep spec; the planned walk on a route).
 *   2. Plan-compatible alternatives. Extra strength is offered only while the
 *      weekly strength budget is not spent (weekly-budget-gate).
 *   3. Variety: at most one card per style, at most MAX_SUGGESTIONS cards.
 *
 * Never a workout that doesn't fit. A hybrid (aerobic + strength) only when a
 * route is ≤ HYBRID_MAX_KM from the park (park page) or a park is on / beside
 * the route (route page). No plan → the onboarding persona orders the styles.
 *
 * Pure and cheap: route scoring is route-fit's pure scorer; no generator runs
 * here (the park page generates only the first card's workout, on open).
 */

import { workoutFitForRoute, type ScorableRoute } from '../players/running/lib/route-fit/score-route-for-workout';
import { routeKm } from '../players/running/lib/route-fit/distance-fit';
import { lighting } from '../players/running/lib/route-fit/route-traits';
import type { WorkoutRouteNeeds } from '../players/running/lib/route-fit/types';
import { isWeeklyStrengthBudgetSpent } from '../hybrid/weekly-budget-gate';
import { DEFAULT_BASE_PACE_SEC_PER_KM } from '../hybrid/aerobic-kind';
import { parkTraits } from './park-traits';
import type {
  ParkPlace, Place, PlaceBanner, PlaceUserContext, PlaceWorkoutStyle, PlaceWorkoutSuggestion, RoutePlace,
} from './types';

export const MAX_SUGGESTIONS = 3;
/** "Route close to the park" for a hybrid (owner, matching doc §7 q4). */
export const HYBRID_MAX_KM = 0.4;
/** The park workout's default length — the same availableTime home composes with. */
export const PARK_WORKOUT_MIN = 20;
export const SHORT_STRENGTH_MIN = 15;
export const HYBRID_MIN = 40;
export const EASY_RUN_MIN = 30;
export const WALK_MIN = 40;
/** Walking pace for a generic walk (route-overview's ACTIVITY_MIN_PER_KM.walking). */
export const WALK_MIN_PER_KM = 12;
/** A free easy run on the route as-is is offered only within this length. */
const ROUTE_RUN_MIN_RANGE: [number, number] = [15, 60];

function budgetSpent(ctx: PlaceUserContext): boolean {
  return isWeeklyStrengthBudgetSpent(ctx.weeklyStrength);
}

function runStyleOf(needs: WorkoutRouteNeeds): PlaceWorkoutStyle {
  if (needs.hill) return 'run_hills';
  if (needs.kind === 'interval' || needs.kind === 'tempo') return 'run_quality';
  return 'run_easy';
}

/** Walker = a walk plan, or a walking persona with no run plan. */
function isWalker(ctx: PlaceUserContext): boolean {
  return ctx.hasWalkPlan || (ctx.persona === 'walk' && !ctx.hasRunPlan);
}

function hybridAerobic(ctx: PlaceUserContext): 'running' | 'walking' {
  return isWalker(ctx) ? 'walking' : 'running';
}

/** Keep the first card of each style, cap at MAX_SUGGESTIONS. */
function dedupeStyles(list: PlaceWorkoutSuggestion[]): PlaceWorkoutSuggestion[] {
  const seen = new Set<PlaceWorkoutStyle>();
  const out: PlaceWorkoutSuggestion[] = [];
  for (const s of list) {
    if (seen.has(s.style)) continue;
    seen.add(s.style);
    out.push(s);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/** Persona order of the alternative styles (no plan, or after the plan card). */
function alternativeOrder(ctx: PlaceUserContext, place: Place['kind']): PlaceWorkoutStyle[] {
  if (place === 'park') {
    if (ctx.persona === 'run' || ctx.persona === 'walk') return ['hybrid', 'strength', 'strength_short'];
    return ['strength', 'hybrid', 'strength_short'];
  }
  if (isWalker(ctx)) return ['walk', 'hybrid', 'run_easy'];
  if (ctx.persona === 'run' || ctx.hasRunPlan) return ['run_easy', 'hybrid', 'walk'];
  return ['hybrid', 'run_easy', 'walk'];
}

function orderBy(list: PlaceWorkoutSuggestion[], order: PlaceWorkoutStyle[]): PlaceWorkoutSuggestion[] {
  return [...list].sort((a, b) => order.indexOf(a.style) - order.indexOf(b.style));
}

// ── Park ──────────────────────────────────────────────────────────────────

function forPark(place: ParkPlace, ctx: PlaceUserContext): PlaceWorkoutSuggestion[] {
  const traits = parkTraits(place.equipment);
  const hybridOk = place.nearestRouteKm != null && place.nearestRouteKm <= HYBRID_MAX_KM;
  const spent = budgetSpent(ctx);
  const plan: PlaceWorkoutSuggestion[] = [];
  const alts: PlaceWorkoutSuggestion[] = [];

  if (ctx.today.strength) {
    plan.push({
      id: 'plan-strength', style: 'strength', isFromPlan: true, planTitle: ctx.today.strength.title,
      durationMin: PARK_WORKOUT_MIN, meta: { kind: 'park_workout' }, reason: 'plan_today',
      start: { kind: 'park_strength', parkId: place.parkId, difficulty: 'medium', minutes: PARK_WORKOUT_MIN },
    });
  }
  // Today's run from a park: only with a route close by (the map then suggests one for it).
  if (ctx.today.run && hybridOk) {
    const r = ctx.today.run;
    plan.push({
      id: 'plan-run', style: runStyleOf(r.needs), isFromPlan: true, planTitle: r.title,
      durationMin: r.needs.durationMin, meta: { kind: 'distance', km: r.needs.targetKm, laps: null }, reason: 'plan_today',
      start: { kind: 'planned_run', workoutId: r.workoutId, week: r.week, day: r.day },
    });
  }

  if (hybridOk) {
    const aerobicKind = hybridAerobic(ctx);
    alts.push({
      id: 'hybrid', style: 'hybrid', isFromPlan: false, planTitle: null, durationMin: HYBRID_MIN,
      meta: { kind: 'loop', minutes: HYBRID_MIN }, reason: 'route_near_park',
      start: { kind: 'hybrid', aerobicKind, minutes: HYBRID_MIN, parkId: place.parkId },
    });
  }
  if (!spent) {
    alts.push({
      id: 'strength', style: 'strength', isFromPlan: false, planTitle: null, durationMin: PARK_WORKOUT_MIN,
      meta: { kind: 'park_workout' }, reason: place.equipment.length > 0 ? 'equipment' : 'persona',
      start: { kind: 'park_strength', parkId: place.parkId, difficulty: 'medium', minutes: PARK_WORKOUT_MIN },
    });
    if (traits.hasPullBar || traits.hasDipBars) {
      alts.push({
        id: 'strength-short', style: 'strength_short', isFromPlan: false, planTitle: null, durationMin: SHORT_STRENGTH_MIN,
        meta: { kind: 'equipment', names: traits.highlightNames }, reason: 'bars',
        start: { kind: 'park_strength', parkId: place.parkId, difficulty: 'hard', minutes: SHORT_STRENGTH_MIN },
      });
    }
  }
  return dedupeStyles([...plan, ...orderBy(alts, alternativeOrder(ctx, 'park'))]);
}

// ── Route ─────────────────────────────────────────────────────────────────

function easyNeeds(ctx: PlaceUserContext, minutes: number): WorkoutRouteNeeds {
  const pace = ctx.easyPaceSecPerKm && ctx.easyPaceSecPerKm > 0 ? ctx.easyPaceSecPerKm : DEFAULT_BASE_PACE_SEC_PER_KM;
  return {
    kind: 'easy', category: null, targetKm: Math.round(((minutes * 60) / pace) * 10) / 10,
    durationMin: minutes, hill: null, afterDark: ctx.afterDark,
  };
}

/** Does the planned run fit here? A hill run needs a climb that meets the rep spec. */
export function planRunFitsRoute(route: ScorableRoute, needs: WorkoutRouteNeeds): ReturnType<typeof workoutFitForRoute> | null {
  const v = workoutFitForRoute(route, needs);
  if (!v.fits) return null;
  if (needs.hill && !v.climb?.meetsSpec) return null;
  return v;
}

function forRoute(place: RoutePlace, ctx: PlaceUserContext): PlaceWorkoutSuggestion[] {
  const { route } = place;
  const routeId = route.id;
  const plan: PlaceWorkoutSuggestion[] = [];
  const alts: PlaceWorkoutSuggestion[] = [];

  const r = ctx.today.run;
  if (r) {
    const v = planRunFitsRoute(route, r.needs);
    if (v) {
      const meta = r.needs.hill && v.climb
        ? { kind: 'hill_reps' as const, reps: r.needs.hill.reps, climbAtKm: v.climb.startM != null ? Math.round(v.climb.startM / 100) / 10 : null }
        : { kind: 'distance' as const, km: r.needs.targetKm, laps: v.fit.laps };
      plan.push({
        id: 'plan-run', style: runStyleOf(r.needs), isFromPlan: true, planTitle: r.title,
        durationMin: r.needs.durationMin, meta, reason: 'plan_today',
        start: { kind: 'planned_run', workoutId: r.workoutId, week: r.week, day: r.day, routeId },
      });
    }
  }
  if (ctx.today.walk) {
    const km = routeKm(route);
    plan.push({
      id: 'plan-walk', style: 'walk', isFromPlan: true, planTitle: ctx.today.walk.title,
      durationMin: ctx.today.walk.minutes ?? (km > 0 ? Math.round(km * WALK_MIN_PER_KM) : null),
      meta: { kind: 'distance', km: km > 0 ? km : null, laps: null }, reason: 'walk_plan',
      start: { kind: 'route_activity', routeId, activity: 'walking' },
    });
  }

  // Easy run: 30′ when the route fits it (laps), else the route as-is when it's a sane length.
  if (!isWalker(ctx) || ctx.hasRunPlan) {
    const needs = easyNeeds(ctx, EASY_RUN_MIN);
    const v = workoutFitForRoute(route, needs);
    const km = routeKm(route);
    const pace = needs.targetKm ? (EASY_RUN_MIN * 60) / needs.targetKm : DEFAULT_BASE_PACE_SEC_PER_KM;
    const asIsMin = km > 0 ? Math.round((km * pace) / 60) : 0;
    if (v.fits || (asIsMin >= ROUTE_RUN_MIN_RANGE[0] && asIsMin <= ROUTE_RUN_MIN_RANGE[1])) {
      alts.push({
        id: 'run-easy', style: 'run_easy', isFromPlan: false, planTitle: null,
        durationMin: v.fits ? EASY_RUN_MIN : asIsMin,
        meta: { kind: 'distance', km: v.fits ? needs.targetKm : km, laps: v.fits ? v.fit.laps : null },
        reason: 'distance_fits',
        start: { kind: 'route_activity', routeId, activity: 'running' },
      });
    }
  }

  const park = place.parkNearRoute;
  if (park && park.offRouteKm <= HYBRID_MAX_KM) {
    alts.push({
      id: 'hybrid', style: 'hybrid', isFromPlan: false, planTitle: null, durationMin: HYBRID_MIN,
      meta: { kind: 'stop_at', km: park.atKm }, reason: 'park_on_route',
      start: { kind: 'hybrid', aerobicKind: hybridAerobic(ctx), minutes: HYBRID_MIN, routeId },
    });
  }

  if (isWalker(ctx)) {
    const km = routeKm(route);
    alts.push({
      id: 'walk', style: 'walk', isFromPlan: false, planTitle: null,
      durationMin: km > 0 ? Math.max(10, Math.round(km * WALK_MIN_PER_KM)) : WALK_MIN,
      meta: { kind: 'distance', km: km > 0 ? km : null, laps: null }, reason: 'persona',
      start: { kind: 'route_activity', routeId, activity: 'walking' },
    });
  }

  return dedupeStyles([...plan, ...orderBy(alts, alternativeOrder(ctx, 'route'))]);
}

export function suggestWorkoutsForPlace(place: Place, ctx: PlaceUserContext): PlaceWorkoutSuggestion[] {
  return place.kind === 'park' ? forPark(place, ctx) : forRoute(place, ctx);
}

/**
 * The page's one banner, or none (priority: safety → a change we made → a special fit).
 *   safety      — the run ends after dark on a route that isn't lit
 *   change      — park page: the weekly strength budget is spent, so no extra strength is offered
 *   special fit — today's hill run has a climb that meets the rep spec on this route
 */
export function pickPlaceBanner(place: Place, ctx: PlaceUserContext, suggestions: readonly PlaceWorkoutSuggestion[]): PlaceBanner | null {
  if (place.kind === 'route') {
    if (ctx.afterDark && suggestions.length > 0 && lighting(place.route) === 'unlit') return 'unlit_after_dark';
    const planHill = suggestions.find((s) => s.isFromPlan && s.style === 'run_hills');
    return planHill ? 'climb_for_plan' : null;
  }
  if (budgetSpent(ctx) && !ctx.today.strength) return 'budget_spent';
  return null;
}

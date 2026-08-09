/**
 * start-hybrid-session — the live assembly (Phase 3c ④ / ב).
 *
 * Split into COMPOSE and RUN so the overview screen (phase ב) shows EXACTLY the
 * plan that will run — compose once, display, then run the SAME plan object (no
 * re-compose; the generator randomises, so a second compose would differ).
 *   composeHybridPlan(intent, ctx) → { plan, routePath, aerobicKind, fallbackHint }
 *   runHybridPlan(composed)         → setHybridMode + start (no re-compose)
 *   startHybridSession(intent, ctx) → compose → run (back-compat convenience)
 *
 * All heavy deps are dynamically imported. XP/coins display-only (§8).
 */

import type { HybridStartIntent } from './build-hybrid-input';
import type { HybridPlan } from './compose-hybrid-session.service';
import type { ContextualFilterContext } from '../logic/contextual-engine.types';
import type { WorkoutGenerationContext, GeneratedWorkout } from '../logic/workout-generator.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';
import { MAP_ROUTE_STOPS_V1 } from '@/config/feature-flags';
import { deriveAerobicTargetKm } from './hybrid-aerobic.util';
import { hasAssessedStrengthDomain } from '@/features/user/identity/services/access-control.service';
import { buildStepContext } from '../core/context/build-step-context';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

export interface HybridSessionContext {
  userPosition: { lat: number; lng: number } | null;
  cityName?: string;
  /** logic.startActiveWorkout — transitions the map into workout mode. */
  startRun: () => void;
  /**
   * OUTPUT side-channel (route-stops Parts A+B): composeRouteStopsWorkout mutates this on
   * the SAME ctx object the caller passed in when it returns null because a gate blocked
   * the compose — so the caller can show the right message instead of a silent fallback.
   * Mirrors the existing `isWarmupActive`/`bolts.selectedIndex` mutate-the-shared-object
   * pattern already used elsewhere in this file. Undefined = no gate fired (any other
   * null-return reason — no route, no position, etc.).
   */
  stopGateReason?: 'needs_assessment' | 'insufficient_home_content';
}

/** The composed session — the SAME object drives the overview and the run. */
export interface ComposedHybridSession {
  plan: HybridPlan;
  routePath: [number, number][];
  aerobicKind: 'running' | 'walking';
  /** Friendly message when the station fell back to bodyweight (A3). */
  fallbackHint?: string;
  /**
   * needs-assessment link follow-up: set ONLY when `fallbackHint` is the
   * needsAssessment message (buildNeedsAssessmentResult's own `assessmentDomains`,
   * home-workout.service.ts) — never for a real rest day. Lets the caller render
   * `fallbackHint` as an actionable link to the mini-questionnaire instead of a
   * dead-end banner, matching the existing pattern (ProgramsSection, StatsOverview,
   * WorkoutBuilderSheet — all via startMiniDomainAssessment).
   */
  assessmentDomains?: string[];
  /** The strength station's marker on the map — absent for a bodyweight (A3) stop.
   *  @deprecated kept for back-compat only — `stations` (below) is the full per-stop list;
   *  for a single-station plan (full_park) it is `stations[0]`. */
  station?: { lat: number; lng: number; name?: string; image?: string };
  /** Every stop's own map marker (Part 5) — one entry per stop, each with its own park
   *  photo when available. `station` above stays the first/anchor stop for back-compat. */
  stations?: { lat: number; lng: number; name?: string; image?: string }[];
  /**
   * Full-park-workout only (Phase 2): the 3 difficulty options (קל/בינוני/קשה) for the
   * overview carousel, composed ONCE. `plan` mirrors `plans[selectedIndex]` (starts at
   * 1 = balanced) so existing consumers keep working; the carousel swaps by index with
   * no re-compose. Absent for budget-split cards, which have a single plan.
   */
  bolts?: { plans: HybridPlan[]; selectedIndex: number; labels: string[] };
  /**
   * Full-park only: warmup-active flag driven by the overview's SectionHeader skip
   * pill. Mutated on the shared object (like bolts.selectedIndex) so runHybridPlan
   * carries the user's skip into the run. Undefined = active (warmup runs).
   */
  isWarmupActive?: boolean;
  /**
   * Run-flatten selector — decouples the DISPLAY trio (`bolts`) from the RUN's station
   * flattening. runHybridPlan historically inferred full-park flattening from `!!bolts`;
   * route-stops ALSO carries `bolts` (a trio) but its stations are budget-split blocks,
   * so it sets `fullParkRun: false` to use the proven single-segment station flattening.
   * Omitted → runHybridPlan falls back to `!!bolts` (full_park stays byte-identical).
   */
  fullParkRun?: boolean;
}

/** A dense square loop around a point, ~`km` perimeter — the no-route fallback. */
function synthesizeLoop(center: { lat: number; lng: number }, km: number): [number, number][] {
  const quarter = Math.max(0.2, km) / 4 / 111;
  const lngScale = 1 / Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  const d = quarter;
  const dl = quarter * lngScale;
  const corners: [number, number][] = [
    [center.lng, center.lat], [center.lng + dl, center.lat], [center.lng + dl, center.lat + d],
    [center.lng, center.lat + d], [center.lng, center.lat],
  ];
  const path: [number, number][] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i], b = corners[i + 1];
    path.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  path.push(corners[corners.length - 1]);
  return path;
}
function normalizePath(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => (Array.isArray(p) ? [p[0], p[1]] : [p?.lng ?? p?.longitude, p?.lat ?? p?.latitude]))
    .filter((c: any[]) => Number.isFinite(c[0]) && Number.isFinite(c[1])) as [number, number][];
}

/**
 * unassessed-domain-gate: does this park include at least one HYDRAULIC (isFunctional:false)
 * machine? Cross-references the park's own `gymEquipment[].equipmentId` against the live
 * equipment catalog (`gym_equipment`, 55 docs, `isFunctional` 100%-populated — audited
 * 04.08.2026) — NOT via canonical-gear-id, since gear-mapping.utils.ts deliberately still
 * collapses hydraulic + real calisthenics gear onto the same id (see the comment there).
 * Hydraulic machines are self-limiting (adjustable resistance) — safe to compose a workout
 * from one even at the silent level=1 default; real calisthenics gear is NOT (a wrong-level
 * bodyweight movement can be genuinely inappropriate), so it requires a completed assessment.
 */
// unassessed-domain-gate content follow-up (05.08.2026): returns the MATCHED docs
// (not just a boolean) so a caller that lets a stop through the gate can also attach
// them to the stop candidate for station-content-resolver.ts to render — the gate
// no longer discards which machine(s) it found. `parkHasHydraulicEquipment` stays a
// thin boolean wrapper so gate-only call sites don't need to change shape.
function findHydraulicEquipment(park: any, equipmentCatalog: GymEquipment[]): GymEquipment[] {
  const ids = new Set<string>((park?.gymEquipment ?? []).map((e: any) => e.equipmentId).filter(Boolean));
  if (ids.size === 0) return [];
  return equipmentCatalog.filter((eq) => ids.has(eq.id) && eq.isFunctional === false);
}
function parkHasHydraulicEquipment(park: any, equipmentCatalog: GymEquipment[]): boolean {
  return findHydraulicEquipment(park, equipmentCatalog).length > 0;
}

/**
 * Dedup (Gate G, 08.08.2026, plan §ד): the SAME park-fetch-with-empty-fallback pattern was
 * hand-written 3× across composeFullParkWorkout / composeRouteStopsWorkout / composeHybridPlan
 * — each caller's own diagnostic comment/logging stays at the call site, only the
 * fetch-or-empty-array mechanics move here.
 */
async function safeFetchRealParks(): Promise<any[]> {
  try {
    const { fetchRealParks } = await import('@/features/parks/core/services/parks.service');
    return await fetchRealParks();
  } catch {
    return [];
  }
}

/**
 * Dedup (Gate G): the SAME weekly-gaps-with-fallback block was byte-identical in
 * composeRouteStopsWorkout and composeHybridPlan (not in composeFullParkWorkout, which never
 * reads weeklyGaps at all — untouched).
 */
async function safeGetWeeklyGaps(): Promise<{ aerobicGapMin: number; strengthGapDays: number; neglectedDomains: string[] }> {
  const fallback = { aerobicGapMin: 90, strengthGapDays: 1, neglectedDomains: [] as string[] };
  const [{ getWeeklyLoadSnapshot }, { auth }] = await Promise.all([
    import('./weekly-load.service'),
    import('@/lib/firebase'),
  ]);
  const uid = auth.currentUser?.uid;
  if (!uid) return fallback;
  try {
    return (await getWeeklyLoadSnapshot(uid)).gaps;
  } catch {
    return fallback;
  }
}

/**
 * Dedup (Gate G): the needs-assessment fallback-session construction introduced by the
 * 08.08.2026 live-bug fix (see the 3 gate comments below) turned out to be duplicated 3× too
 * — extracted here rather than left copy-pasted across all 3 sites.
 */
async function buildNeedsAssessmentFallback(): Promise<{
  workout: GeneratedWorkout;
  fallbackHint: string;
  assessmentDomains: string[];
}> {
  const [{ buildNeedsAssessmentResult }, { PRIMARY_CATEGORIES }] = await Promise.all([
    import('@/features/workout-engine/services/home-workout.service'),
    import('@/features/user/onboarding/services/single-domain-assessment.service'),
  ]);
  const { workout } = buildNeedsAssessmentResult(
    [...PRIMARY_CATEGORIES],
    { daysInactive: 0, persona: null, location: 'park', timeOfDay: 'morning', injuryAreas: [], exercisesConsidered: 0, exercisesExcluded: 0 },
  );
  return { workout, fallbackHint: workout.description, assessmentDomains: workout.assessmentDomains ?? [] };
}

/**
 * Full-park-workout branch (mode: 'full_park_workout', Phase 1.3) — walk to the
 * nearest EQUIPPED park, do the FULL home-recommended strength workout there, walk
 * back. Reuses the home recommendation as a READ-ONLY preview (skipCycleRestart) at
 * the balanced bolt, instead of the budget-split station. Returns null when no
 * equipped park is reachable (Phase 3 hides the card) or the user has no profile.
 *
 * ⚠️ Empty pool at a sparse park → treated as a REST-DAY (aerobic-only walk), never an
 * empty station: `restLike` zeroes the workout and composeParkWorkoutPlan drops the
 * strength segment (double-guarded by its own isEmpty check).
 */
async function composeFullParkWorkout(
  intent: HybridStartIntent,
  ctx: HybridSessionContext,
): Promise<ComposedHybridSession | null> {
  if (!ctx.userPosition) { console.warn('[composeFullParkWorkout] no user position'); return null; }

  const [
    { useUserStore }, { resolveParkOutAndBack },
    { composeParkWorkoutPlan }, { generateHomeWorkoutTrio }, { getAllGymEquipment },
  ] = await Promise.all([
    import('@/features/user/identity/store/useUserStore'),
    import('./park-out-and-back'),
    import('./compose-park-workout.service'),
    import('@/features/workout-engine/services/home-workout.service'),
    import('@/features/content/equipment/gym/core/gym-equipment.service'),
  ]);

  const profile = useUserStore.getState().profile;
  if (!profile) { console.warn('[composeFullParkWorkout] no profile'); return null; }
  // `||` (not `??`) so an unset weight of 0 falls back to 70kg (calorie terms).
  const userWeightKg = profile?.core?.weight || 70;
  const pp = profile?.running?.paceProfile;
  const paceProfile = { basePace: pp?.basePace ?? 390, profileType: (pp?.profileType ?? 2) as 1 | 2 | 3 | 4 };

  // unassessed-domain-gate: reuses the SAME hasAssessedStrengthDomain signal as the home
  // hero-gate (hasStrengthProgram) and route_stops (access-control.service.ts) — checks the
  // real assessed-domain axis only, independent of onboarding/lifestyle completion.
  const hasAssessment = hasAssessedStrengthDomain(profile as any);

  // Parks — same all-parks proximity source the budget-split path uses.
  const parks = await safeFetchRealParks();

  // Phase 1.1 — nearest equipped park + out-and-back route (warms caches internally).
  const oab = await resolveParkOutAndBack({
    userPosition: ctx.userPosition,
    parks,
    aerobicKind: intent.aerobicKind,
    cityName: ctx.cityName,
  });
  if (!oab) { console.warn('[composeFullParkWorkout] no equipped park reachable → no card'); return null; }

  // unassessed-domain-gate: without a completed assessment, only a HYDRAULIC-equipped park
  // is safe to compose from silently (self-limiting resistance — see parkHasHydraulicEquipment
  // doc comment). A real calisthenics-equipped park needs a real level → block.
  //
  // Live-bug fix (08.08.2026): this used to `return null` here — the caller has no reference
  // left to read ctx.stopGateReason off (composeAndShowOverview/composeTrioDeduped both
  // construct `ctx` inline and never keep it), and even a caller that DID check it has
  // nowhere to render it → the user just silently bounces back to the carousel. Fixed by
  // reusing the SAME fallbackHint/assessmentDomains shape the needsAssessment-bolt path
  // below already returns (a real ComposedHybridSession, not null) — HybridOverviewScreen
  // (:452-470) and DiscoverLayer's onAssessmentLink (:1460-1463) already render this shape
  // correctly today (proven: that's the exact mechanism the bolt-level needsAssessment case
  // already uses). No new UI. `buildNeedsAssessmentResult` (home-workout.service.ts:326) is
  // the same real, established copy — not invented text.
  if (!hasAssessment) {
    const equipmentCatalog = await getAllGymEquipment();
    const oabPark = parks.find((p: any) => p.id === oab.station.parkId);
    if (!oabPark || !parkHasHydraulicEquipment(oabPark, equipmentCatalog)) {
      console.warn('[composeFullParkWorkout] gated: no completed assessment + nearest park is not hydraulic → needs_assessment');
      ctx.stopGateReason = 'needs_assessment';
      const needsAssessment = await buildNeedsAssessmentFallback();
      const station = {
        stopId: oab.station.name ? `park:${oab.station.name}` : (oab.station.parkId ?? 'park'),
        parkId: oab.station.parkId,
        locationKind: 'gym' as const,
        lat: oab.station.lat,
        lng: oab.station.lng,
        waypointIndex: oab.station.waypointIndex,
      };
      const plan = composeParkWorkoutPlan({
        routePath: oab.routePath,
        station,
        workout: needsAssessment.workout,
        aerobicKind: intent.aerobicKind,
        paceProfile,
        userWeightKg,
        emphasis: 'strength',
      });
      return {
        plan,
        routePath: oab.routePath,
        aerobicKind: intent.aerobicKind,
        fallbackHint: needsAssessment.fallbackHint,
        assessmentDomains: needsAssessment.assessmentDomains,
        station: { lat: oab.station.lat, lng: oab.station.lng, name: oab.station.name, image: oab.station.image },
        stations: [{ lat: oab.station.lat, lng: oab.station.lng, name: oab.station.name, image: oab.station.image }],
      };
    }
  }

  try {
    // Home recommendation — READ-ONLY preview (skipCycleRestart). All 3 bolts, one call.
    const trio = await generateHomeWorkoutTrio({
      userProfile: profile as any,
      location: 'park',
      parkEquipmentIds: oab.station.availableEquipment,
      skipCycleRestart: true,
    });

    const station = {
      stopId: oab.station.name ? `park:${oab.station.name}` : (oab.station.parkId ?? 'park'),
      parkId: oab.station.parkId,
      locationKind: 'gym' as const,
      lat: oab.station.lat,
      lng: oab.station.lng,
      waypointIndex: oab.station.waypointIndex,
    };

    // One plan per bolt option — same park + route, only the strength content differs.
    // ⚠️ (uncertainty #b): an empty pool at a sparse park is a rest-day PER OPTION →
    // aerobic-only, never an empty station.
    const built = trio.options.map((opt) => {
      const w = opt.result.workout;
      const rest = trio.isRestDay || (w.exercises?.length ?? 0) === 0 || w.isRecovery === true;
      const planWorkout = rest ? { ...w, exercises: [] } : w;
      return {
        rest,
        // needs-assessment bug (scenarios 5/6): buildNeedsAssessmentResult (home-workout.service.ts)
        // already distinguishes "no assessed level for this domain" from a real rest day via
        // w.needsAssessment — `rest` above collapses both into the same exercises.length===0
        // bucket. Carried separately so the selected bolt can show the real reason below.
        needsAssessment: w.needsAssessment === true,
        assessmentMessage: w.description,
        assessmentDomains: w.assessmentDomains,
        plan: composeParkWorkoutPlan({
          routePath: oab.routePath,
          station,
          workout: planWorkout,
          aerobicKind: intent.aerobicKind,
          paceProfile,
          userWeightKg,
          emphasis: 'strength', // display-only; full-park is strength-dominant
        }),
      };
    });

    const selectedIndex = 1; // balanced (bolt 2) — the recommended default
    const restLike = built[selectedIndex].rest;
    const needsAssessmentLike = built[selectedIndex].needsAssessment;
    const plans = built.map((b) => b.plan);

    console.log(
      `[hybrid:diag] full-park compose: park="${oab.station.name}"` +
      ` equip=[${oab.station.availableEquipment.join(',')}] bolts=${plans.length}` +
      ` default#${selectedIndex} restLike=${restLike} needsAssessment=${needsAssessmentLike}` +
      ` routeKm=${plans[selectedIndex].totals.distanceKm}`,
    );

    return {
      plan: plans[selectedIndex],
      routePath: oab.routePath,
      aerobicKind: intent.aerobicKind,
      // needs-assessment bug (scenarios 5/6): a needsAssessment bolt must show ITS OWN
      // reason (buildNeedsAssessmentResult's existing, approved copy), never the generic
      // rest-day string — every other exercises.length===0 cause keeps 'יום מנוחה' as before.
      fallbackHint: needsAssessmentLike
        ? built[selectedIndex].assessmentMessage
        : restLike ? 'יום מנוחה — הליכה בלבד' : undefined,
      // needs-assessment link follow-up: only set alongside the needsAssessment
      // fallbackHint — never for a real rest day — so the caller can render an
      // actionable mini-questionnaire link instead of a dead-end banner.
      assessmentDomains: needsAssessmentLike ? built[selectedIndex].assessmentDomains : undefined,
      station: { lat: oab.station.lat, lng: oab.station.lng, name: oab.station.name, image: oab.station.image },
      // full_park has exactly one stop — stations mirrors station as a 1-element array.
      stations: [{ lat: oab.station.lat, lng: oab.station.lng, name: oab.station.name, image: oab.station.image }],
      bolts: { plans, selectedIndex, labels: ['קליל', 'מאוזן', 'עוצמתי'] },
    };
  } catch (e) {
    console.warn('[composeFullParkWorkout] home trio / compose failed', e);
    return null;
  }
}

/**
 * Lightweight route-only preview for the full-park card's settle-preview.
 *
 * `composeFullParkWorkout` above is heavy: after resolving the route it calls
 * `generateHomeWorkoutTrio` (THREE full strength workouts) + a park-plan compose
 * per bolt — none of which the map needs to DRAW the route. So the settle-preview
 * calls this instead: it runs ONLY the fast half (nearest equipped park + the
 * out-and-back route) and returns route + station + distance. The heavy trio is
 * deferred to the CTA (`composeFullParkWorkout`, via the overview), so the route
 * paints on focus while the workout options compute only when the user taps in.
 *
 * Returns null (leave map as-is) when there's no position / no equipped park.
 */
export interface HybridRoutePreview {
  routePath: [number, number][];
  /** Straight-line round-trip distance (km) — a preview approximation of the plan total. */
  distanceKm: number;
  station?: { lat: number; lng: number; name?: string; image?: string };
  stations?: { lat: number; lng: number; name?: string; image?: string }[];
}

export async function composeFullParkRoutePreview(
  intent: HybridStartIntent,
  ctx: HybridSessionContext,
): Promise<HybridRoutePreview | null> {
  if (intent.mode !== 'full_park_workout') return null; // route-preview is full-park only
  if (!ctx.userPosition) { console.warn('[composeFullParkRoutePreview] no user position'); return null; }

  const [{ fetchRealParks }, { resolveParkOutAndBack }] = await Promise.all([
    import('@/features/parks/core/services/parks.service'),
    import('./park-out-and-back'),
  ]);

  let parks: any[] = [];
  try { parks = await fetchRealParks(); } catch { /* no parks → no card */ }

  const oab = await resolveParkOutAndBack({
    userPosition: ctx.userPosition,
    parks,
    aerobicKind: intent.aerobicKind,
    cityName: ctx.cityName,
  });
  if (!oab) { console.warn('[composeFullParkRoutePreview] no equipped park reachable → no route'); return null; }

  return {
    routePath: oab.routePath,
    distanceKm: oab.targetKm,
    station: { lat: oab.station.lat, lng: oab.station.lng, name: oab.station.name, image: oab.station.image },
    stations: [{ lat: oab.station.lat, lng: oab.station.lng, name: oab.station.name, image: oab.station.image }],
  };
}

/** ~800 m: the user must be near the chosen route's line for a route-stops card to make sense. */
const ROUTE_STOPS_MAX_START_M = 800;

/**
 * Level-window tolerance for route stops (Bug 5a, option א — SCOPED). The default is ±3
 * (ContextualEngine); at a route stop we widen to ±6 so a mid-level or slightly-off domain
 * doesn't collapse the pool (e.g. push L12 → L6-18 instead of L9-15). context-driven, so
 * this NEVER affects home / the recommended card / full_park — only route-stops pools.
 * ⚠️ This does NOT fix the elite catalog-ceiling (pull L22 has no L19-25 exercises at all) —
 * that needs the catalog-aware / asymmetric window, which is the GLOBAL build-quality project
 * (option ב), deliberately NOT smuggled into this branch.
 */
const ROUTE_STOPS_LEVEL_TOLERANCE = 6;

/**
 * Resolve the ROUTE BACKBONE for a route-stops session (clarification §1). Two modes, so
 * neither is hard-coded:
 *   (א) 'existing_route'          — the PUBLISHED official_route nearest the user (pilot).
 *                                    Stops are matched onto its line downstream.
 *   (ב) 'waypoints_through_stops' — SEAM: build a path THROUGH the stops as Mapbox
 *                                    waypoints when there is no ready route (also the base
 *                                    for a future short-detour). Not wired for the pilot.
 */
type RouteStopsBackboneMode = 'generated_loop' | 'existing_route' | 'waypoints_through_stops';

async function resolveRouteStopsBackbone(
  mode: RouteStopsBackboneMode,
  opts: {
    userPosition: { lat: number; lng: number };
    parks?: any[];
    targetKm?: number;
    cityName?: string;
    activity?: ActivityType;
  },
): Promise<{ routePath: [number, number][]; routeId: string; routeName?: string } | null> {
  const { userPosition } = opts;

  // (ג) 'generated_loop' — the ROOT fix (§7.3): build a loop FROM the user's location, so
  // entry = user (0m) and the workout never "starts from a distant park".
  // P6/P1 — includeStrength is deliberately OFF: it would make findFitnessAnchor splice a gym
  // 400-960m away as a must-visit waypoint, producing the long "escaping" leg (the +34% overshoot
  // and the "near not through" symptom). We DON'T need it for stops: resolveRouteStops downstream
  // scans ALL parks within 180m of the loop, and the loop passes through the user's GPS — so a near
  // gym (e.g. 63m away) is still captured as a stop. resolveRouteStops is independent of the anchor.
  //
  // P6 round 2 (device-confirmed): a ceiling-driven reject-to-synth was WRONG. A real street loop
  // is always preferable to synthesizeLoop's geometric square — the user walks on an actual street,
  // not an imaginary rectangle. maxRoutes:3 asks the generator to try several waypoint-combination
  // rotations (same candidate pool, different 3-of-N picks — genuinely different Mapbox-snapped
  // results); we then pick whichever REAL candidate lands CLOSEST to targetKm, never rejecting a
  // real loop just for being over target. synthesizeLoop is the true last resort — only when the
  // generator returns NOTHING real (no street data / API failure), never as a "too long" penalty.
  if (mode === 'generated_loop') {
    const targetKm = opts.targetKm ?? 2.5;
    const { generateDynamicRoutes } = await import('@/features/parks/core/services/route-generator.service');
    let routePath: [number, number][] = [];
    let chosenKm: number | undefined;
    let candidateCount = 0;
    try {
      const routes = await generateDynamicRoutes({
        userLocation: userPosition,
        targetDistance: targetKm,
        activity: opts.activity ?? ('walking' as ActivityType),
        routeGenerationIndex: 0,
        preferences: {
          includeStrength: false, qualityRoute: true, maxRoutes: 3,
          // P6 calibration: scoreWaypoint's default ideal-distance (1.0km) isn't scaled to a
          // short target — it pulls candidates to the edge of the (also target-relative) search
          // radius instead of toward the target. targetKm/6 mirrors generateRandomWaypoints' own
          // triangular-loop perimeter correction (3 waypoints ~120° apart → perimeter ≈ 5.2·r) —
          // both waypoint sources feed the same 3-point combination logic downstream. NOTE
          // (round 2): this alone is not sufficient when street_segments candidates are picked by
          // road-QUALITY score (not proximity) — it only re-ranks within that already-selected
          // pool, hence maxRoutes:3 + pick-closest below. Route-stops-only; every other caller of
          // generateDynamicRoutes is unaffected (the option is additive/opt-in).
          idealWaypointDistanceKm: targetKm / 6,
        },
        parks: (opts.parks ?? []) as any,
        cityName: opts.cityName,
      });
      // ד' — prefer a REAL street loop over synth: pick whichever candidate the generator
      // collected is CLOSEST to targetKm (not just routes[0]) — a real loop that's a bit over or
      // under target beats a synthetic square every time.
      if (routes && routes.length > 0) {
        candidateCount = routes.length;
        const best = routes.reduce((a, b) =>
          Math.abs((b.distance ?? Infinity) - targetKm) < Math.abs((a.distance ?? Infinity) - targetKm) ? b : a);
        routePath = normalizePath(best.path);
        chosenKm = best.distance;
      }
    } catch { /* generator failed → synthesized loop below */ }
    if (routePath.length < 2) {
      console.warn(
        `[route-stops] no real street loop from the generator` +
        `${chosenKm !== undefined ? ` (best candidate ${chosenKm.toFixed(2)}km was unusable)` : ''} → synthesizeLoop (last resort)`,
      );
      routePath = synthesizeLoop(userPosition, targetKm);
    } else if (chosenKm !== undefined) {
      console.log(
        `[route-stops] backbone: real street loop ${chosenKm.toFixed(2)}km ` +
        `(target ${targetKm.toFixed(2)}km, diff ${(chosenKm - targetKm).toFixed(2)}km, chosen from ${candidateCount} candidate(s))`,
      );
    }
    if (routePath.length < 2) { console.warn('[route-stops] generated_loop produced no usable path → no card'); return null; }
    return { routePath, routeId: 'generated_loop', routeName: 'סיבוב מהמיקום' };
  }

  if (mode === 'existing_route') {
    const [{ getCachedOfficialRoutes }, { haversineMeters }] = await Promise.all([
      import('@/features/parks/core/services/inventory.service'),
      import('@/features/parks/core/services/geoUtils'),
    ]);
    let routes: any[] = [];
    try { routes = await getCachedOfficialRoutes(); } catch { return null; }
    let best: { id: string; name?: string; path: [number, number][]; d: number } | null = null;
    for (const r of routes) {
      const path = normalizePath(r?.path);
      if (path.length < 2) continue;
      let d = Infinity;
      for (const v of path) {
        const dv = haversineMeters(userPosition.lat, userPosition.lng, v[1], v[0]);
        if (dv < d) d = dv;
      }
      if (!best || d < best.d) best = { id: r.id, name: r.name, path, d };
    }
    if (!best || best.d > ROUTE_STOPS_MAX_START_M) {
      console.warn(
        `[route-stops] nearest published route ${best ? `"${best.name}" @${best.d.toFixed(0)}m` : 'none'}` +
        ` — beyond ${ROUTE_STOPS_MAX_START_M}m cap → no card`,
      );
      return null;
    }
    // Field-tuning aid: which route did we snap to, and how far is the user from it?
    console.log(
      `[route-stops] backbone="${best.name}" id=${best.id} @${best.d.toFixed(0)}m from user` +
      ` (published nearest of ${routes.length})`,
    );
    return { routePath: best.path, routeId: best.id, routeName: best.name };
  }
  // (ב) waypoints-through-stops — deferred for the pilot (§1).
  console.warn('[route-stops] backbone mode "waypoints_through_stops" not wired (pilot = existing_route)');
  return null;
}

/**
 * Route-stops branch (mode: 'route_stops', MAP_ROUTE_STOPS_V1). Generalizes full_park: a
 * REAL published official_route is the backbone (§1a), and EVERY POI on/near it becomes a
 * generic stop (resolveRouteStops → strength / stretch / core). Reuses the budget-split
 * engine (composeHybridSession) in ANCHOR mode ('as_provided') so all hand-placed stops
 * survive. Returns the SAME shape as full_park (bolts trio) so the SAME overview drawer
 * renders it (clarification §3, wired in Part 5). Returns null (no card) when there is no
 * nearby published route or the route carries no POIs.
 *
 * ⚠️ Part 2b scope: non-strength stops (stretch/core) hit dispatchStopContent's default and
 * are skipped until Part 3; the near-end cooldown is Part 4. XP display-only (§8).
 */
async function composeRouteStopsWorkout(
  intent: HybridStartIntent,
  ctx: HybridSessionContext,
): Promise<ComposedHybridSession | null> {
  if (!ctx.userPosition) { console.warn('[composeRouteStopsWorkout] no user position'); return null; }

  const [
    { useUserStore }, { getAllExercises },
    { composeHybridSession }, { resolveRouteStops }, { resolveHybridUserLevels },
    { warmHybridCaches },
    { planFromPoint, detectTopology }, { getAllGymEquipment },
  ] = await Promise.all([
    import('@/features/user/identity/store/useUserStore'),
    import('@/features/content/exercises/core/exercise.service'),
    import('./compose-hybrid-session.service'),
    import('./route-stops.service'),
    import('./hybrid-context.util'),
    import('./hybrid-warmup'),
    import('./plan-from-point'),
    import('@/features/content/equipment/gym/core/gym-equipment.service'),
  ]);

  const profile = useUserStore.getState().profile;
  if (!profile) { console.warn('[composeRouteStopsWorkout] no profile'); return null; }
  const userWeightKg = profile?.core?.weight || 70;
  const pp = profile?.running?.paceProfile;
  const paceProfile = { basePace: pp?.basePace ?? 390, profileType: (pp?.profileType ?? 2) as 1 | 2 | 3 | 4 };

  // route-stops Part A — questionnaire gate: reuses the SAME hasAssessedStrengthDomain signal
  // as the home hero-gate (hasStrengthProgram) — the real assessed-domain axis, independent
  // of onboarding/lifestyle completion (access-control.service.ts).
  const hasAssessment = hasAssessedStrengthDomain(profile as any);

  // Warm caches + fetch parks FIRST — the generated-loop backbone biases the loop toward equipped
  // parks (findFitnessAnchor), and gear translation reads the warm cache downstream.
  await warmHybridCaches();
  let parks: any[] = await safeFetchRealParks();
  // Part A: open_field (grass, no equipment, legs+core only) is gated on the assessment —
  // without it, exclude these parks from stop-matching entirely (mapParkToStop stays pure/
  // profile-agnostic; the gate lives here, at the one caller that has the profile).
  if (!hasAssessment) {
    parks = parks.filter((p: any) => p.facilityType !== 'open_field');
  }

  // Backbone — a LOOP generated FROM the user's location (root fix), so entry = user (0m).
  // ('existing_route' mode is kept for a future "use a close existing route" decision, not v1.)
  // Step-gap calibration (09.08.2026): same buildStepContext(useActivityStore.getState().today)
  // call already used by build-map-user-context.ts — resolved here as plain numbers, the
  // function itself stays pure (LAW 0).
  const stepContext = buildStepContext(useActivityStore.getState().today);
  const targetKm = deriveAerobicTargetKm(intent, paceProfile.basePace, stepContext);
  const backbone = await resolveRouteStopsBackbone('generated_loop', {
    userPosition: ctx.userPosition, parks, targetKm,
    cityName: ctx.cityName, activity: intent.aerobicKind as ActivityType,
  });
  if (!backbone) return null;
  const routePath = backbone.routePath;
  const rawStops = resolveRouteStops(routePath, parks as any);

  // Part A / unassessed-domain-gate: no assessment AND no real equipped gym nearby
  // (stairs/bench aren't a "גינת כושר") → the open_field stops that would have filled this
  // gap are locked, and the generic bodyweight fallback would silently stand in for them.
  // Additionally (unassessed-domain-gate, 04.08.2026 round): even a REAL equipped gym isn't
  // safe to guess level=1 on — only a HYDRAULIC-equipped one is (self-limiting resistance;
  // see parkHasHydraulicEquipment). Block + let the caller show the assessment message
  // instead of a silent degrade.
  if (!hasAssessment) {
    const equippedStops = rawStops.filter((s) => s.activityType === 'strength' && s.availableEquipment.length > 0);
    const equipmentCatalog = equippedStops.length > 0 ? await getAllGymEquipment() : [];
    // unassessed-domain-gate content follow-up (05.08.2026): capture WHICH hydraulic
    // gym_equipment doc(s) matched per stop (not just a boolean), and attach them
    // directly onto the rawStops object — coredStops/planFromPoint both spread the
    // stop untouched, so `hydraulicEquipment` survives to composeHybridSession's
    // stopCandidates and reaches dispatchStopContent → resolveStationContent.
    let hasHydraulicStop = false;
    for (const s of equippedStops) {
      const stopPark = parks.find((p: any) => p.id === s.parkId);
      if (!stopPark) continue;
      const matched = findHydraulicEquipment(stopPark, equipmentCatalog);
      if (matched.length > 0) {
        hasHydraulicStop = true;
        (s as any).hydraulicEquipment = matched;
      }
    }
    if (!hasHydraulicStop) {
      console.warn('[composeRouteStopsWorkout] gated: no completed assessment + no hydraulic-equipped park nearby → needs_assessment');
      ctx.stopGateReason = 'needs_assessment';
      // Live-bug fix (08.08.2026), same as composeFullParkWorkout's gate above: return a
      // real session with fallbackHint/assessmentDomains (the shape HybridOverviewScreen /
      // DiscoverLayer's onAssessmentLink already render) instead of null, which the caller
      // has no way to read a reason off of. This branch is dark (MAP_ROUTE_STOPS_V1=false)
      // so today it's zero live exposure — fixed for consistency, not for an active user path.
      const needsAssessment = await buildNeedsAssessmentFallback();
      return {
        plan: {
          segments: [],
          totals: { aerobicMin: 0, strengthMin: 0, distanceKm: 0, estCalories: 0, stations: 0 },
          meta: { emphasisResolved: intent.emphasis, whoGapNote: null, usedFieldFallback: false, insufficientHomeContent: false, log: [] },
        },
        routePath,
        aerobicKind: intent.aerobicKind,
        fallbackHint: needsAssessment.fallbackHint,
        assessmentDomains: needsAssessment.assessmentDomains,
      };
    }
  }

  // Recommendation-path DEFAULT (not a cap): when the weekly STRENGTH set-budget is spent, a
  // strength station would only muster a sparse 1–2 sets. Default those stops to CORE instead —
  // core is always available in a park (no ParkGating), fits any level, and is coherent for a
  // short stop. Threshold: remaining strength sets < 4 (below a coherent station; <=0 would still
  // allow a 1–2 set sliver). getRemainingBudget() is STRENGTH-ONLY (useWeeklyVolumeStore:
  // strength.weeklyBudget − strength.totalSetsCompleted), NOT the aggregate active-minutes.
  // Scoped to this fn → the manual combined generator (composeHybridPlan) is untouched.
  const { useWeeklyVolumeStore } = await import('@/features/workout-engine/core/store/useWeeklyVolumeStore');
  const remainingStrengthBudget = useWeeklyVolumeStore.getState().getRemainingBudget();
  const strengthSpent = remainingStrengthBudget < 4;
  const coredStops = strengthSpent
    ? rawStops.map((s) => (s.activityType === 'strength' ? { ...s, activityType: 'core' as const } : s))
    : rawStops;
  if (strengthSpent && rawStops.some((s) => s.activityType === 'strength')) {
    console.log(`[route-stops] weekly strength budget spent (remaining=${remainingStrengthBudget} < 4) → strength stop(s) defaulted to core`);
  }

  // ── Entry-relative ordering (§7.3 Part 4 · planFromPoint, Axis ①) ─────────────────────────────
  // Retires the interim km-sort-from-wp0 + cooldown pin-relocation. planFromPoint orders stops by
  // distance-from-entry over the ACTUAL traversal (rotated to the user's current position) — the
  // stretch stays at its real geographic POI ("last" falls out of traversalKm, no pin move).
  // Topology auto-detected: closed route → 'loop' (cyclic wrap, keeps every stop); open route →
  // 'one_way' (clip the pre-entry portion). PURE ordering — no set-counting, no SoT reads (② boundary
  // preserved). direction 'forward' for v1 (backward = Axis ②, deferred).
  const plan = planFromPoint({
    canonical: { path: routePath },
    entry: { position: ctx.userPosition },
    direction: 'forward',
    topology: detectTopology(routePath),
    stops: coredStops,
  });
  const traversalPath = plan.traversal;
  // Reindex each stop's waypointIndex onto the traversal so composeHybridSession's km-sort
  // (byte-identical) becomes entry-relative. Stops arrive already in traversal order.
  const stops = plan.stops.map((p) => ({ ...p.stop, waypointIndex: p.traversalIndex }));

  console.log(
    `[route-stops] route="${backbone.routeName}" stops=${stops.length}` +
    ` [${stops.map((s) => `${s.activityType}@wp${s.waypointIndex}(${s.distToPathM}m)`).join(', ')}]`,
  );
  if (stops.length === 0) {
    // Zero-stations degrade (root-fix QA): a generated loop may pass no equipped park. Do NOT
    // return null — let it flow into composeHybridSession's field fallback (ONE bodyweight stop at
    // the route midpoint), yielding a valid aerobic + bodyweight route workout instead of no card.
    console.warn('[route-stops] 0 stops on the loop → degrading to aerobic + bodyweight-mid-route (field fallback)');
  }

  // Levels + contexts (shared resolver — same real per-domain levels as the budget-split path).
  const { userProgramLevels, baseUserLevel, resolveUserLevelForExercise } =
    await resolveHybridUserLevels(profile as any, '[RouteStops]');
  const weeklyGaps = await safeGetWeeklyGaps();

  const masterExercises = await getAllExercises();
  const filterContext: ContextualFilterContext = {
    location: 'park', lifestyles: [], injuryShield: [], intentMode: 'normal', availableEquipment: [],
    getUserLevelForExercise: resolveUserLevelForExercise,
    // Bug 5a: widen the level window for route stops only (default ±3 → ±6) so a slightly-off
    // domain doesn't collapse the pool. Scoped via the context → byte-identical everywhere else.
    levelTolerance: ROUTE_STOPS_LEVEL_TOLERANCE,
  };

  // Bug 5b (part 2/2) — TARGET-DERIVED domain coverage:
  //  • requiredDomains = the user's active-program child domains. This makes the station's
  //    strategy reflect the user's TARGET (a full-body user requires legs; an upper-only user
  //    does NOT get legs forced) — exactly like home's FullBodyGuarantee fires only for full_body.
  //  • globalExercisePool = a bodyweight FIELD pool so the domain-quota / FullBodyDomainGuarantee
  //    can fall back to BODYWEIGHT (squat/lunge) for a TARGET domain the park has no equipment for.
  // Both scoped to route-stops via generationContext → byte-identical everywhere else.
  const [{ resolveChildDomainsForParent }, { filterExercisesContextually }, { getWorkoutContext }] = await Promise.all([
    import('../services/program-hierarchy.utils'),
    import('../logic/ContextualEngine'),
    import('../services/split-decision/SplitDecisionService'),
  ]);
  const activeProgramId = (profile as any)?.progression?.activePrograms?.[0]?.templateId;
  const targetDomains = resolveChildDomainsForParent(activeProgramId, profile as any);
  const bodyweightGuaranteePool = filterExercisesContextually(masterExercises, {
    ...filterContext, availableEquipment: [], intentMode: 'field',
  }).exercises.map((e) => e.exercise);

  // Bug 5c — REUSE Path A's skill source (no parallel list). getWorkoutContext derives
  // priority1/2SkillIds from profile.progression.skillFocusIds — the exact input the home
  // trio (Path A) feeds the SAME lower pipeline. Without these the station targets only
  // GENERIC domains, so an elite's high-level pull (front/back-lever) — which lives in SKILL
  // programs, not generic "pull" — never surfaces (generic pull tops ~L12 → L22 window empty
  // → collapse). The shared PipelineOrchestrator already reads context.priority1SkillIds.
  const splitCtx = getWorkoutContext({ userProfile: profile as any });
  const priority1SkillIds = splitCtx.priority1SkillIds ?? [];
  const priority2SkillIds = splitCtx.priority2SkillIds ?? [];
  console.log(
    `[route-stops] targetDomains=[${targetDomains.join(',')}] skillsP1=[${priority1SkillIds.join(',')}]` +
    ` skillsP2=[${priority2SkillIds.join(',')}] bodyweightPool=${bodyweightGuaranteePool.length}`,
  );

  // One plan per bolt (קל/בינוני/קשוח) — same route + stops, difficulty drives the engine.
  const buildForBolt = (difficulty: 1 | 2 | 3): HybridPlan => {
    const generationContext: WorkoutGenerationContext = {
      availableTime: 10, userLevel: baseUserLevel, daysInactive: 1, intentMode: 'normal', persona: null,
      location: 'park', injuryCount: 0,
      difficulty: difficulty as WorkoutGenerationContext['difficulty'],
      userWeight: userWeightKg, userProgramLevels,
      // Bug 5b: target-derived domain coverage + bodyweight fallback (built above).
      ...(targetDomains.length > 0 ? { requiredDomains: targetDomains } : {}),
      globalExercisePool: bodyweightGuaranteePool,
      // Bug 5c: thread the user's active skills so an elite's high-level pull (skill programs)
      // surfaces at the station instead of collapsing on generic-pull catalog ceiling.
      ...(priority1SkillIds.length ? { priority1SkillIds } : {}),
      ...(priority2SkillIds.length ? { priority2SkillIds } : {}),
    };
    return composeHybridSession({
      timeBudgetMin: intent.timeBudgetMin, emphasis: intent.emphasis, aerobicKind: intent.aerobicKind,
      paceProfile, routePath: traversalPath, stopCandidates: stops, stopSelection: 'as_provided',
      // Bug 2a: every route stop is a full-body workout (mixed domains), not single-domain.
      stationDomainMode: 'multi',
      masterExercises, filterContext, generationContext, weeklyGaps, userWeightKg,
    });
  };
  const plans = [1, 2, 3].map((d) => buildForBolt(d as 1 | 2 | 3));
  const selectedIndex = 1; // balanced default (bolt 2)

  // Part B gate: the field fallback fired AND the level-banded bodyweight pool was too thin
  // for a real difficulty-equivalent session (compose-hybrid-session.service.ts). Checked on
  // the default/balanced bolt — block + let the caller show an "not enough content" message
  // instead of starting a thin session.
  //
  // Live-bug fix (08.08.2026, same class as the 3 needs_assessment gates + Gate G dedup):
  // this used to `return null` — the caller has no reference left to read ctx.stopGateReason
  // off, so the user just silently bounced back with no explanation, exactly the bug already
  // fixed for needs_assessment. Unlike those 3 gates, there is no established canonical copy
  // for "insufficient content" (no buildNeedsAssessmentResult equivalent) — this is a real,
  // minimal, honest message, not invented to sound more authoritative than it is. Returns the
  // SAME minimal-stub shape the other 3 gates use (empty plan, real routePath, no
  // assessmentDomains — this isn't an assessment issue, so no actionable link;
  // HybridOverviewScreen's fallbackHint-without-onAssessmentLink branch already renders a
  // plain info banner for exactly this case). Dark today (MAP_ROUTE_STOPS_V1=false).
  if (plans[selectedIndex].meta.insufficientHomeContent) {
    console.warn('[composeRouteStopsWorkout] gated: field-fallback pool too thin for this level → insufficient_home_content');
    ctx.stopGateReason = 'insufficient_home_content';
    return {
      plan: {
        segments: [],
        totals: { aerobicMin: 0, strengthMin: 0, distanceKm: 0, estCalories: 0, stations: 0 },
        meta: { emphasisResolved: intent.emphasis, whoGapNote: null, usedFieldFallback: false, insufficientHomeContent: true, log: [] },
      },
      routePath: traversalPath,
      aerobicKind: intent.aerobicKind,
      fallbackHint: 'אין מספיק תרגילים מותאמים לרמה שלך בסביבה הזו כרגע — נסו מיקום אחר או חזרו מאוחר יותר.',
    };
  }

  // `station` (singular, back-compat): the first strength stop is still the best single
  // anchor for any consumer that only reads one marker. `stations` (below, Part 5) is the
  // full per-stop list — every resolved stop gets its own map marker now.
  const firstStrength = stops.find((s) => s.activityType === 'strength');
  const markerStations = stops
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({ lat: s.lat, lng: s.lng, name: s.name, image: s.image }));

  return {
    plan: plans[selectedIndex],
    // Return the TRAVERSAL (entry-relative, rotated/clipped) — the same frame the plan geometry &
    // stops were built in, so the drawn/run route matches the ordering (not the canonical wp0 path).
    routePath: traversalPath,
    aerobicKind: intent.aerobicKind,
    station: firstStrength ? { lat: firstStrength.lat, lng: firstStrength.lng } : undefined,
    stations: markerStations,
    bolts: { plans, selectedIndex, labels: ['קליל', 'מאוזן', 'עוצמתי'] },
    // Budget-split stations → proven single-segment flattening, NOT full-park warmup-split.
    fullParkRun: false,
  };
}

/** COMPOSE the plan (no run start). Returns null if no route can be built. */
export async function composeHybridPlan(
  intent: HybridStartIntent,
  ctx: HybridSessionContext,
): Promise<ComposedHybridSession | null> {
  // Full-park-workout branch (Phase 1.3): a separate, self-contained path. The
  // budget-split body below is NOT entered for this mode and stays byte-identical
  // for every other hybrid card.
  if (intent.mode === 'full_park_workout') {
    return composeFullParkWorkout(intent, ctx);
  }

  // Route-stops branch (MAP_ROUTE_STOPS_V1): a REAL official_route backbone + generic
  // stops placed on it. Self-contained like full_park; the budget-split body below stays
  // byte-identical. The flag is the kill-switch — false → never entered (and no slot
  // produces this intent anyway until Part 5).
  if (intent.mode === 'route_stops') {
    if (!MAP_ROUTE_STOPS_V1) return null;
    return composeRouteStopsWorkout(intent, ctx);
  }

  const [
    { getAllExercises }, { generateDynamicRoutes },
    { composeHybridSession }, { buildSandwichComposeInput }, { resolveHybridShape },
    { useUserStore },
  ] = await Promise.all([
    import('@/features/content/exercises/core/exercise.service'),
    import('@/features/parks/core/services/route-generator.service'),
    import('./compose-hybrid-session.service'),
    import('./build-hybrid-input'),
    import('./hybrid-shape'),
    import('@/features/user/identity/store/useUserStore'),
  ]);

  const profile = useUserStore.getState().profile;
  // `||` (not `??`) so an unset weight of 0 falls back to 70kg — otherwise every
  // hybrid calorie term (aerobic km×w×1.036 + strength MET×w) collapses to 0.
  const userWeightKg = profile?.core?.weight || 70;
  const pp = profile?.running?.paceProfile;
  const paceProfile = { basePace: pp?.basePace ?? 390, profileType: (pp?.profileType ?? 2) as 1 | 2 | 3 | 4 };

  // ── User levels: shared resolver (hybrid-context.util) — the SAME real per-domain
  // levels (push/pull/legs/core) home-workout feeds the pipeline, fixing the "empty
  // domainLevels" bug where the user was treated as their global level for every domain.
  // Extracted so the route-stops composer reuses it instead of duplicating.
  const { resolveHybridUserLevels } = await import('./hybrid-context.util');
  const { userProgramLevels, baseUserLevel, resolveUserLevelForExercise } =
    await resolveHybridUserLevels(profile as any, '[Hybrid]');
  console.log(
    `[hybrid:diag] levels: base=L${baseUserLevel} domainLevels={${
      Array.from(userProgramLevels.entries()).map(([k, v]) => `${k}:L${v}`).join(', ')
    }}`,
  );
  // Invariant B verification: confirm the REAL profile→levels builder emits a
  // core level (legs_core stations depend on it). null ⇒ core falls to base.
  console.log(
    `[hybrid:diag] core-level: ${userProgramLevels.has('core') ? `L${userProgramLevels.get('core')} (real)` : `base L${baseUserLevel} (no core domain — verify buildUserProgramLevels)`}`,
  );

  const weeklyGaps = await safeGetWeeklyGaps();

  // Aerobic target distance (shared, pure) — walking = fixed 12 min/km · running = runner pace,
  // guarded so a 0 pace never yields "Target: Infinity km" → 0 routes. Clamped [1,20].
  // Step-gap calibration (09.08.2026): same buildStepContext(useActivityStore.getState().today)
  // call already used by build-map-user-context.ts — resolved here as plain numbers, the
  // function itself stays pure (LAW 0).
  const stepContext = buildStepContext(useActivityStore.getState().today);
  const targetKm = deriveAerobicTargetKm(intent, paceProfile.basePace, stepContext);

  // Parks for BOTH route bias and the whole-path station search. PROXIMITY source —
  // the same all-parks set + 6h cache the live map uses (fetchRealParks), NOT
  // authority-scoped: a nearby park in another authority (or an unset authorityId)
  // must not hide the station. The whole-path search does the geo filtering.
  const authorityId = profile?.core?.authorityId ?? null; // diag/fallback only
  const parks: any[] = await safeFetchRealParks();
  // DIAG (temporary — remove once the live station is confirmed).
  console.log(
    `[hybrid:diag] source=fetchRealParks · authorityId=${authorityId ?? 'NULL'} · parksLoaded=${parks.length}` +
    ` · hasElectric=${parks.some((p) => /החשמל/.test(p?.name ?? ''))}`,
  );

  let routePath: [number, number][] = [];
  if (ctx.userPosition) {
    let chosenKm: number | undefined;
    let candidateCount = 0;
    try {
      const routes = await generateDynamicRoutes({
        userLocation: ctx.userPosition, targetDistance: targetKm, activity: intent.aerobicKind as ActivityType,
        routeGenerationIndex: 0,
        // Bias the loop THROUGH a fitness park when we have parks (findFitnessAnchor),
        // and enable the hybrid-only quality passes (bearing-order + continue_straight
        // + Douglas-Peucker) for a clean loop. Free-run omits qualityRoute → unchanged.
        //
        // Square-route fix (08.08.2026, ported from resolveRouteStopsBackbone's
        // 'generated_loop' mode above — David flagged this card, the highest-traffic of
        // the 3, never got the fix). maxRoutes:1 used to accept routes[0] blindly: the
        // FIRST waypoint-combination the generator tried, taken as-is even when it
        // snapped to a boxy/square Mapbox shape. maxRoutes:3 asks the generator to keep
        // trying up to 5 different waypoint-combination rotations (its own existing
        // retry-per-combination loop, route-generator.service.ts:910-993) until it
        // collects 3 real candidates; below we pick whichever lands CLOSEST to
        // targetKm, never just routes[0] — the same selection resolveRouteStopsBackbone
        // already does. includeStrength stays park-conditional here (unlike route-stops,
        // which deliberately keeps it off) — this card's whole point is the
        // anchor-biased splice of a nearby gym (plan §ב, "3 intentional route shapes"),
        // not touched.
        preferences: { includeStrength: parks.length > 0, qualityRoute: true, maxRoutes: 3 },
        parks: parks as any, cityName: ctx.cityName,
      });
      if (routes && routes.length > 0) {
        candidateCount = routes.length;
        const best = routes.reduce((a, b) =>
          Math.abs((b.distance ?? Infinity) - targetKm) < Math.abs((a.distance ?? Infinity) - targetKm) ? b : a);
        routePath = normalizePath(best.path);
        chosenKm = best.distance;
      }
    } catch { /* synthetic fallback */ }
    if (routePath.length < 2) {
      console.warn(
        `[hybrid:diag] recommended-card: no real street loop from the generator` +
        `${chosenKm !== undefined ? ` (best candidate ${chosenKm.toFixed(2)}km was unusable)` : ''} → synthesizeLoop (last resort)`,
      );
      routePath = synthesizeLoop(ctx.userPosition, targetKm);
    } else if (chosenKm !== undefined) {
      console.log(
        `[hybrid:diag] recommended-card backbone: real street loop ${chosenKm.toFixed(2)}km ` +
        `(target ${targetKm.toFixed(2)}km, diff ${(chosenKm - targetKm).toFixed(2)}km, chosen from ${candidateCount} candidate(s))`,
      );
    }
  }
  if (routePath.length < 2) { console.warn('[composeHybridPlan] no user position / route'); return null; }

  // Warm equipment cache + program id→slug map BEFORE composing (א.1).
  const { warmHybridCaches } = await import('./hybrid-warmup');
  await warmHybridCaches();
  const { resolveStationSource } = await import('./station-source');
  const source = await resolveStationSource(routePath, { parks: parks as any, authorityId });

  // unassessed-domain-gate: reuses the SAME hasAssessedStrengthDomain signal as the home
  // hero-gate, route_stops and full_park. Only a HYDRAULIC-equipped station (self-limiting
  // resistance) is safe to compose from silently without a completed assessment — real
  // calisthenics gear needs a real level.
  //
  // shared-default-branch gate follow-up (06.08.2026): this is THE ONE place both live
  // entry points into the budget-split branch land — the "מומלץ לך" carousel slot
  // (hybrid-slots.ts, presetToIntent with no `mode`) and FreeRunDrawer's manual
  // "התחל משולב" (handleStartHybrid, also no `mode`) — so a single check here covers
  // both without touching either UI caller. `source.kind === 'bodyweight'` (no equipped
  // park found at all) used to be left UNGATED here (the old comment reasoned it was
  // "already gated via the route_stops open_field branch" — wrong: that's a DIFFERENT
  // compose function, composeRouteStopsWorkout, never entered by this branch). A
  // bodyweight-fallback station still calls dispatchStopContent's 'strength'/isBodyweight
  // path, which still resolves level via getBaseUserLevel — same invented-level-1 problem,
  // just with bodyweight moves instead of park equipment. Gated the same as 'park' now;
  // there's no hydraulic exception to check (no equipment at all), so it blocks outright.
  // Live-bug fix (08.08.2026): both branches below used to `return null` — the caller
  // (composeAndShowOverview / FreeRunDrawer's handleStartHybrid) has no way to read
  // ctx.stopGateReason (constructed inline, never retained) or show anything, so the user
  // just silently bounced back to the carousel/slots. Same fix as composeFullParkWorkout
  // and composeRouteStopsWorkout above: return a real session with fallbackHint/
  // assessmentDomains instead — the shape HybridOverviewScreen (:452-470) and
  // DiscoverLayer's onAssessmentLink (:1460-1463) already render correctly today. This is
  // THE highest-traffic of the 3 gates (the "מומלץ לך" carousel slot's own branch).
  const needsAssessmentSession = async (): Promise<ComposedHybridSession> => {
    const needsAssessment = await buildNeedsAssessmentFallback();
    return {
      plan: {
        segments: [],
        totals: { aerobicMin: 0, strengthMin: 0, distanceKm: 0, estCalories: 0, stations: 0 },
        meta: { emphasisResolved: intent.emphasis, whoGapNote: null, usedFieldFallback: false, insufficientHomeContent: false, log: [] },
      },
      routePath,
      aerobicKind: intent.aerobicKind,
      fallbackHint: needsAssessment.fallbackHint,
      assessmentDomains: needsAssessment.assessmentDomains,
    };
  };

  let gateHydraulicEquipment: GymEquipment[] | undefined;
  if (!hasAssessedStrengthDomain(profile as any)) {
    if (source.kind === 'park') {
      const { getAllGymEquipment } = await import('@/features/content/equipment/gym/core/gym-equipment.service');
      const equipmentCatalog = await getAllGymEquipment();
      const sourcePark = parks.find((p: any) => p.id === source.parkId);
      const matched = sourcePark ? findHydraulicEquipment(sourcePark, equipmentCatalog) : [];
      if (matched.length === 0) {
        console.warn('[composeHybridPlan] gated: no completed assessment + nearest station is not hydraulic → needs_assessment');
        ctx.stopGateReason = 'needs_assessment';
        return needsAssessmentSession();
      }
      // unassessed-domain-gate content follow-up (05.08.2026): carry the matched doc(s)
      // onto stopCandidates[0] below so dispatchStopContent → resolveStationContent shows
      // the machine's own real content instead of a generic Exercise.
      gateHydraulicEquipment = matched;
    } else {
      console.warn('[composeHybridPlan] gated: no completed assessment + no equipped park nearby (bodyweight fallback) → needs_assessment');
      ctx.stopGateReason = 'needs_assessment';
      return needsAssessmentSession();
    }
  }

  const midIdx = Math.floor(routePath.length / 2);
  const [midLng, midLat] = routePath[midIdx];
  const stopCandidates = [{
    // Readable label for logs/segments; the persisted firestore id stays in parkId.
    stopId: source.kind === 'park' && source.name ? `park:${source.name}` : (source.parkId ?? 'hybrid-mid'),
    parkId: source.parkId, locationKind: source.locationKind,
    lat: source.lat ?? midLat, lng: source.lng ?? midLng, waypointIndex: source.waypointIndex ?? midIdx,
    availableEquipment: source.availableEquipment, activityType: 'strength' as const,
    ...(gateHydraulicEquipment ? { hydraulicEquipment: gateHydraulicEquipment } : {}),
  }];

  const masterExercises = await getAllExercises();
  const filterContext: ContextualFilterContext = {
    location: 'park', lifestyles: [], injuryShield: [], intentMode: 'normal', availableEquipment: [],
    getUserLevelForExercise: resolveUserLevelForExercise,
  };
  const generationContext: WorkoutGenerationContext = {
    availableTime: 10, userLevel: baseUserLevel, daysInactive: 1, intentMode: 'normal', persona: null,
    // ⚡ (invariant B): the slot's bolts drive the real engine difficulty knob.
    // Drawer path omits intent.difficulty → default 2 (byte-identical to before).
    location: 'park', injuryCount: 0,
    difficulty: (intent.difficulty ?? 2) as WorkoutGenerationContext['difficulty'],
    userWeight: userWeightKg,
    userProgramLevels,
  };

  const input = buildSandwichComposeInput({
    timeBudgetMin: intent.timeBudgetMin, emphasis: intent.emphasis, aerobicKind: intent.aerobicKind,
    paceProfile, routePath, stopCandidates, masterExercises, filterContext, generationContext,
    weeklyGaps, userWeightKg, shape: resolveHybridShape('sandwich'),
  });
  const plan = composeHybridSession(input);
  const station = source.kind === 'park' && source.lat != null && source.lng != null
    ? { lat: source.lat, lng: source.lng, name: source.name, image: source.image }
    : undefined;
  return { plan, routePath, aerobicKind: intent.aerobicKind, fallbackHint: source.uiHint, station };
}

/** RUN the already-composed plan — no re-compose (stability guarantee). */
export async function runHybridPlan(composed: ComposedHybridSession, startRun: () => void): Promise<void> {
  const [{ useRunningPlayer }, { useHybridRun }] = await Promise.all([
    import('@/features/workout-engine/players/running/store/useRunningPlayer'),
    import('./useHybridRun'),
  ]);
  const rp = useRunningPlayer.getState();
  rp.setHybridMode(true);
  rp.setActiveRoutePath(composed.routePath);
  // Belt-and-suspenders: run the SELECTED bolt straight from the trio (full-park), so
  // the run always tracks the overview's carousel choice even if composed.plan wasn't
  // synced. Budget-split cards have no `bolts` → their single composed.plan is used.
  const activePlan = composed.bolts ? composed.bolts.plans[composed.bolts.selectedIndex] : composed.plan;
  // Run-flatten gate. Historically inferred from `!!bolts` (only full-park carried a trio).
  // route-stops ALSO carries a trio but flattens as budget-split → it sets fullParkRun:false
  // explicitly. Fallback to `!!bolts` keeps full-park + budget-split byte-identical.
  const fullPark = composed.fullParkRun ?? !!composed.bolts;
  useHybridRun.getState().startHybrid(activePlan, composed.aerobicKind, fullPark, composed.isWarmupActive ?? true);
  startRun();
}

/** Back-compat: compose → run in one call (no overview). */
export async function startHybridSession(intent: HybridStartIntent, ctx: HybridSessionContext): Promise<void> {
  const composed = await composeHybridPlan(intent, ctx);
  if (!composed) return;
  await runHybridPlan(composed, ctx.startRun);
}

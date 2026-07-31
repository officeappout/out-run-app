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
import type { WorkoutGenerationContext } from '../logic/workout-generator.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';
import { MAP_ROUTE_STOPS_V1 } from '@/config/feature-flags';
import { deriveAerobicTargetKm } from './hybrid-aerobic.util';

export interface HybridSessionContext {
  userPosition: { lat: number; lng: number } | null;
  cityName?: string;
  /** logic.startActiveWorkout — transitions the map into workout mode. */
  startRun: () => void;
}

/** The composed session — the SAME object drives the overview and the run. */
export interface ComposedHybridSession {
  plan: HybridPlan;
  routePath: [number, number][];
  aerobicKind: 'running' | 'walking';
  /** Friendly message when the station fell back to bodyweight (A3). */
  fallbackHint?: string;
  /** The strength station's marker on the map — absent for a bodyweight (A3) stop. */
  station?: { lat: number; lng: number; name?: string; image?: string };
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
    { useUserStore }, { fetchRealParks }, { resolveParkOutAndBack },
    { composeParkWorkoutPlan }, { generateHomeWorkoutTrio },
  ] = await Promise.all([
    import('@/features/user/identity/store/useUserStore'),
    import('@/features/parks/core/services/parks.service'),
    import('./park-out-and-back'),
    import('./compose-park-workout.service'),
    import('@/features/workout-engine/services/home-workout.service'),
  ]);

  const profile = useUserStore.getState().profile;
  if (!profile) { console.warn('[composeFullParkWorkout] no profile'); return null; }
  // `||` (not `??`) so an unset weight of 0 falls back to 70kg (calorie terms).
  const userWeightKg = profile?.core?.weight || 70;
  const pp = profile?.running?.paceProfile;
  const paceProfile = { basePace: pp?.basePace ?? 390, profileType: (pp?.profileType ?? 2) as 1 | 2 | 3 | 4 };

  // Parks — same all-parks proximity source the budget-split path uses.
  let parks: any[] = [];
  try { parks = await fetchRealParks(); } catch { /* no parks → no card */ }

  // Phase 1.1 — nearest equipped park + out-and-back route (warms caches internally).
  const oab = await resolveParkOutAndBack({
    userPosition: ctx.userPosition,
    parks,
    aerobicKind: intent.aerobicKind,
    cityName: ctx.cityName,
  });
  if (!oab) { console.warn('[composeFullParkWorkout] no equipped park reachable → no card'); return null; }

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
    const plans = built.map((b) => b.plan);

    console.log(
      `[hybrid:diag] full-park compose: park="${oab.station.name}"` +
      ` equip=[${oab.station.availableEquipment.join(',')}] bolts=${plans.length}` +
      ` default#${selectedIndex} restLike=${restLike} routeKm=${plans[selectedIndex].totals.distanceKm}`,
    );

    return {
      plan: plans[selectedIndex],
      routePath: oab.routePath,
      aerobicKind: intent.aerobicKind,
      fallbackHint: restLike ? 'יום מנוחה — הליכה בלבד' : undefined,
      station: { lat: oab.station.lat, lng: oab.station.lng, name: oab.station.name, image: oab.station.image },
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

  // (ג) 'generated_loop' — the ROOT fix (§7.3): build a loop FROM the user's location via the
  // existing generator, so entry = user (0m) and the workout never "starts from a distant park".
  // includeStrength biases the loop toward equipped parks so route-stops has stops to place;
  // the whole downstream pipeline (resolveRouteStops → planFromPoint → composeHybridSession) is
  // unchanged. Mirrors composeHybridPlan's generator call. Pure geometry — no SoT/set-counting.
  if (mode === 'generated_loop') {
    const targetKm = opts.targetKm ?? 2.5;
    const { generateDynamicRoutes } = await import('@/features/parks/core/services/route-generator.service');
    let routePath: [number, number][] = [];
    try {
      const routes = await generateDynamicRoutes({
        userLocation: userPosition,
        targetDistance: targetKm,
        activity: opts.activity ?? ('walking' as ActivityType),
        routeGenerationIndex: 0,
        preferences: { includeStrength: (opts.parks?.length ?? 0) > 0, qualityRoute: true, maxRoutes: 1 },
        parks: (opts.parks ?? []) as any,
        cityName: opts.cityName,
      });
      routePath = normalizePath(routes?.[0]?.path);
    } catch { /* generator failed → synthesized loop below */ }
    if (routePath.length < 2) routePath = synthesizeLoop(userPosition, targetKm);
    if (routePath.length < 2) { console.warn('[route-stops] generated_loop produced no usable path → no card'); return null; }
    console.log(`[route-stops] backbone=generated_loop from user · pts=${routePath.length} · targetKm=${targetKm.toFixed(2)}`);
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
    { useUserStore }, { getAllExercises }, { fetchRealParks },
    { composeHybridSession }, { resolveRouteStops }, { resolveHybridUserLevels },
    { getWeeklyLoadSnapshot }, { warmHybridCaches }, { auth },
    { planFromPoint, detectTopology },
  ] = await Promise.all([
    import('@/features/user/identity/store/useUserStore'),
    import('@/features/content/exercises/core/exercise.service'),
    import('@/features/parks/core/services/parks.service'),
    import('./compose-hybrid-session.service'),
    import('./route-stops.service'),
    import('./hybrid-context.util'),
    import('./weekly-load.service'),
    import('./hybrid-warmup'),
    import('@/lib/firebase'),
    import('./plan-from-point'),
  ]);

  const profile = useUserStore.getState().profile;
  if (!profile) { console.warn('[composeRouteStopsWorkout] no profile'); return null; }
  const userWeightKg = profile?.core?.weight || 70;
  const pp = profile?.running?.paceProfile;
  const paceProfile = { basePace: pp?.basePace ?? 390, profileType: (pp?.profileType ?? 2) as 1 | 2 | 3 | 4 };

  // Warm caches + fetch parks FIRST — the generated-loop backbone biases the loop toward equipped
  // parks (findFitnessAnchor), and gear translation reads the warm cache downstream.
  await warmHybridCaches();
  let parks: any[] = [];
  try { parks = await fetchRealParks(); } catch { /* no parks → unbiased loop, bodyweight fallback */ }

  // Backbone — a LOOP generated FROM the user's location (root fix), so entry = user (0m).
  // ('existing_route' mode is kept for a future "use a close existing route" decision, not v1.)
  const targetKm = deriveAerobicTargetKm(intent, paceProfile.basePace);
  const backbone = await resolveRouteStopsBackbone('generated_loop', {
    userPosition: ctx.userPosition, parks, targetKm,
    cityName: ctx.cityName, activity: intent.aerobicKind as ActivityType,
  });
  if (!backbone) return null;
  const routePath = backbone.routePath;
  const rawStops = resolveRouteStops(routePath, parks as any);

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
  let weeklyGaps = { aerobicGapMin: 90, strengthGapDays: 1, neglectedDomains: [] as string[] };
  const uid = auth.currentUser?.uid;
  if (uid) { try { weeklyGaps = (await getWeeklyLoadSnapshot(uid)).gaps; } catch { /* keep fallback */ } }

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

  // Map pin: the first strength stop is the best visual anchor; other stops render as
  // segments in the overview journey axis (Part 5).
  const firstStrength = stops.find((s) => s.activityType === 'strength');

  return {
    plan: plans[selectedIndex],
    // Return the TRAVERSAL (entry-relative, rotated/clipped) — the same frame the plan geometry &
    // stops were built in, so the drawn/run route matches the ordering (not the canonical wp0 path).
    routePath: traversalPath,
    aerobicKind: intent.aerobicKind,
    station: firstStrength ? { lat: firstStrength.lat, lng: firstStrength.lng } : undefined,
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
    { getAllExercises }, { generateDynamicRoutes }, { getWeeklyLoadSnapshot },
    { composeHybridSession }, { buildSandwichComposeInput }, { resolveHybridShape },
    { useUserStore }, { auth },
  ] = await Promise.all([
    import('@/features/content/exercises/core/exercise.service'),
    import('@/features/parks/core/services/route-generator.service'),
    import('./weekly-load.service'),
    import('./compose-hybrid-session.service'),
    import('./build-hybrid-input'),
    import('./hybrid-shape'),
    import('@/features/user/identity/store/useUserStore'),
    import('@/lib/firebase'),
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

  let weeklyGaps = { aerobicGapMin: 90, strengthGapDays: 1, neglectedDomains: [] as string[] };
  const uid = auth.currentUser?.uid;
  if (uid) { try { weeklyGaps = (await getWeeklyLoadSnapshot(uid)).gaps; } catch { /* keep fallback */ } }

  // Aerobic target distance (shared, pure) — walking = fixed 12 min/km · running = runner pace,
  // guarded so a 0 pace never yields "Target: Infinity km" → 0 routes. Clamped [1,20].
  const targetKm = deriveAerobicTargetKm(intent, paceProfile.basePace);

  // Parks for BOTH route bias and the whole-path station search. PROXIMITY source —
  // the same all-parks set + 6h cache the live map uses (fetchRealParks), NOT
  // authority-scoped: a nearby park in another authority (or an unset authorityId)
  // must not hide the station. The whole-path search does the geo filtering.
  const authorityId = profile?.core?.authorityId ?? null; // diag/fallback only
  let parks: any[] = [];
  try {
    const { fetchRealParks } = await import('@/features/parks/core/services/parks.service');
    parks = await fetchRealParks();
  } catch { /* no parks → unbiased route, station falls back to bodyweight */ }
  // DIAG (temporary — remove once the live station is confirmed).
  console.log(
    `[hybrid:diag] source=fetchRealParks · authorityId=${authorityId ?? 'NULL'} · parksLoaded=${parks.length}` +
    ` · hasElectric=${parks.some((p) => /החשמל/.test(p?.name ?? ''))}`,
  );

  let routePath: [number, number][] = [];
  if (ctx.userPosition) {
    try {
      const routes = await generateDynamicRoutes({
        userLocation: ctx.userPosition, targetDistance: targetKm, activity: intent.aerobicKind as ActivityType,
        routeGenerationIndex: 0,
        // Bias the loop THROUGH a fitness park when we have parks (findFitnessAnchor),
        // and enable the hybrid-only quality passes (bearing-order + continue_straight
        // + Douglas-Peucker) for a clean loop. Free-run omits qualityRoute → unchanged.
        // maxRoutes:1 — we consume routes[0] only; stops the generator after the
        // first valid loop, before its trailing 1.5s inter-route delays.
        preferences: { includeStrength: parks.length > 0, qualityRoute: true, maxRoutes: 1 },
        parks: parks as any, cityName: ctx.cityName,
      });
      routePath = normalizePath(routes?.[0]?.path);
    } catch { /* synthetic fallback */ }
    if (routePath.length < 2) routePath = synthesizeLoop(ctx.userPosition, targetKm);
  }
  if (routePath.length < 2) { console.warn('[composeHybridPlan] no user position / route'); return null; }

  // Warm equipment cache + program id→slug map BEFORE composing (א.1).
  const { warmHybridCaches } = await import('./hybrid-warmup');
  await warmHybridCaches();
  const { resolveStationSource } = await import('./station-source');
  const source = await resolveStationSource(routePath, { parks: parks as any, authorityId });
  const midIdx = Math.floor(routePath.length / 2);
  const [midLng, midLat] = routePath[midIdx];
  const stopCandidates = [{
    // Readable label for logs/segments; the persisted firestore id stays in parkId.
    stopId: source.kind === 'park' && source.name ? `park:${source.name}` : (source.parkId ?? 'hybrid-mid'),
    parkId: source.parkId, locationKind: source.locationKind,
    lat: source.lat ?? midLat, lng: source.lng ?? midLng, waypointIndex: source.waypointIndex ?? midIdx,
    availableEquipment: source.availableEquipment, activityType: 'strength' as const,
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

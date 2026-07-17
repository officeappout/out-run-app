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

  // ── User levels: REUSE the strength engine's mechanism (single source of truth) ──
  // The empty domainLevels bug made the pipeline treat the user as their global level
  // for EVERY domain. buildUserProgramLevels(profile) yields the real per-domain levels
  // (push/pull/legs/core) — exactly what home-workout feeds the pipeline.
  const [{ buildUserProgramLevels, getBaseUserLevel }, { getAllPrograms }, { resolveToSlug, buildIdToSlugMapFromPrograms }, { MG_TO_DOMAIN }] =
    await Promise.all([
      import('../services/level-resolution.utils'),
      import('@/features/content/programs/core/program.service'),
      import('../services/program-hierarchy.utils'),
      import('../shared/constants/domain-mapping.constants'),
    ]);
  const allPrograms = await getAllPrograms();
  // Warm the ID→slug map BEFORE level resolution — otherwise resolveToSlug can't map
  // hash program-ids and skill domains (muscle_up / handstand) silently fall to L1.
  buildIdToSlugMapFromPrograms(allPrograms);
  const masterProgramIds = new Set(allPrograms.filter((p: any) => p.isMaster).map((p: any) => p.id));
  const userProgramLevels = profile
    ? buildUserProgramLevels(profile as any, masterProgramIds, '[Hybrid]').levels
    : new Map<string, number>();
  const baseUserLevel = profile ? getBaseUserLevel(profile as any) : 5;
  // Per-exercise level = the user's level in the exercise's domain (movementGroup →
  // domain, else targetPrograms → slug), mirroring home-workout's getUserLevelForExercise.
  const resolveUserLevelForExercise = (exercise: any): number => {
    const mgDomain = MG_TO_DOMAIN[exercise?.movementGroup ?? ''];
    if (mgDomain && userProgramLevels.has(mgDomain)) return userProgramLevels.get(mgDomain)!;
    for (const tp of exercise?.targetPrograms ?? []) {
      const slug = resolveToSlug(tp.programId);
      if (userProgramLevels.has(slug)) return userProgramLevels.get(slug)!;
      if (userProgramLevels.has(tp.programId)) return userProgramLevels.get(tp.programId)!;
    }
    return baseUserLevel;
  };
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

  const aerobicMin = intent.timeBudgetMin * intent.aerobicShare;
  // Running pace can be missing / 0 on profiles that never ran → guard so
  // targetKm stays finite (walking uses a fixed 12 min/km). A 0 pace here was
  // producing "Target: Infinity km" → 0 routes → world-view camera jump.
  const runPaceMinPerKm = paceProfile.basePace > 0 ? paceProfile.basePace / 60 : 6.5;
  const speedMinPerKm = intent.aerobicKind === 'walking' ? 12 : runPaceMinPerKm;
  let targetKm = aerobicMin / speedMinPerKm;
  if (!Number.isFinite(targetKm) || targetKm <= 0) targetKm = 2.5;
  targetKm = Math.max(1, Math.min(20, targetKm));

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
  // Full-park is the only card carrying a bolt trio → the gate for the new plan/run path.
  // Budget-split (no bolts) → fullPark=false → strengthBlockToWorkoutPlan's legacy path.
  const fullPark = !!composed.bolts;
  useHybridRun.getState().startHybrid(activePlan, composed.aerobicKind, fullPark, composed.isWarmupActive ?? true);
  startRun();
}

/** Back-compat: compose → run in one call (no overview). */
export async function startHybridSession(intent: HybridStartIntent, ctx: HybridSessionContext): Promise<void> {
  const composed = await composeHybridPlan(intent, ctx);
  if (!composed) return;
  await runHybridPlan(composed, ctx.startRun);
}

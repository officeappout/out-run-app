/**
 * start-hybrid-session — the live assembly (Phase 3c ④).
 *
 * Turns drawer intent into a running hybrid session:
 *   route (generateDynamicRoutes, synthetic-loop fallback) + ONE synthesized
 *   mid-route stop + level-filtered pool + contexts → composeHybridSession →
 *   setHybridMode(true) + start the run + hand the plan to useHybridRun.
 *
 * All heavy deps are dynamically imported (matches the codebase pattern and
 * keeps this module light). XP/coins are display-only (§8).
 */

import type { HybridStartIntent } from './build-hybrid-input';
import type { ContextualFilterContext } from '../logic/contextual-engine.types';
import type { WorkoutGenerationContext } from '../logic/workout-generator.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';

export interface HybridSessionContext {
  userPosition: { lat: number; lng: number } | null;
  cityName?: string;
  /** logic.startActiveWorkout — transitions the map into workout mode. */
  startRun: () => void;
}

/** A dense square loop around a point, ~`km` perimeter — the no-route fallback. */
function synthesizeLoop(center: { lat: number; lng: number }, km: number): [number, number][] {
  const quarter = Math.max(0.2, km) / 4 / 111; // km → degrees latitude
  const lngScale = 1 / Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  const d = quarter;
  const dl = quarter * lngScale;
  const corners: [number, number][] = [
    [center.lng, center.lat],
    [center.lng + dl, center.lat],
    [center.lng + dl, center.lat + d],
    [center.lng, center.lat + d],
    [center.lng, center.lat],
  ];
  const path: [number, number][] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i];
    const b = corners[i + 1];
    path.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  path.push(corners[corners.length - 1]);
  return path;
}

function normalizePath(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) =>
      Array.isArray(p) ? [p[0], p[1]] : [p?.lng ?? p?.longitude, p?.lat ?? p?.latitude],
    )
    .filter((c: any[]) => Number.isFinite(c[0]) && Number.isFinite(c[1])) as [number, number][];
}

export async function startHybridSession(
  intent: HybridStartIntent,
  ctx: HybridSessionContext,
): Promise<void> {
  const [
    { getAllExercises },
    { generateDynamicRoutes },
    { getWeeklyLoadSnapshot },
    { composeHybridSession },
    { buildSandwichComposeInput },
    { resolveHybridShape },
    { useUserStore },
    { useRunningPlayer },
    { useHybridRun },
    { auth },
  ] = await Promise.all([
    import('@/features/content/exercises/core/exercise.service'),
    import('@/features/parks/core/services/route-generator.service'),
    import('./weekly-load.service'),
    import('./compose-hybrid-session.service'),
    import('./build-hybrid-input'),
    import('./hybrid-shape'),
    import('@/features/user/identity/store/useUserStore'),
    import('@/features/workout-engine/players/running/store/useRunningPlayer'),
    import('./useHybridRun'),
    import('@/lib/firebase'),
  ]);

  const profile = useUserStore.getState().profile;
  const userWeightKg = profile?.core?.weight ?? 70;
  const pp = profile?.running?.paceProfile;
  const paceProfile = { basePace: pp?.basePace ?? 390, profileType: (pp?.profileType ?? 2) as 1 | 2 | 3 | 4 };
  const userLevel = profile?.progression?.globalLevel ?? 5;

  // ── Weekly gaps (best-effort) ──────────────────────────────────────────────
  let weeklyGaps = { aerobicGapMin: 90, strengthGapDays: 1, neglectedDomains: [] as string[] };
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      weeklyGaps = (await getWeeklyLoadSnapshot(uid)).gaps;
    } catch { /* fallback stays */ }
  }

  // ── Route (target km from the aerobic budget) ──────────────────────────────
  const aerobicMin = intent.timeBudgetMin * intent.aerobicShare;
  const speedMinPerKm = intent.aerobicKind === 'walking' ? 12 : paceProfile.basePace / 60;
  const targetKm = Math.max(1, aerobicMin / speedMinPerKm);

  let routePath: [number, number][] = [];
  if (ctx.userPosition) {
    try {
      const routes = await generateDynamicRoutes({
        userLocation: ctx.userPosition,
        targetDistance: targetKm,
        activity: intent.aerobicKind as ActivityType,
        routeGenerationIndex: 0,
        preferences: { includeStrength: false },
        parks: [],
        cityName: ctx.cityName,
      });
      routePath = normalizePath(routes?.[0]?.path);
    } catch { /* fall through to synthetic */ }
    if (routePath.length < 2) routePath = synthesizeLoop(ctx.userPosition, targetKm);
  }
  if (routePath.length < 2) {
    console.warn('[startHybridSession] no user position / route — aborting');
    return;
  }

  // ── Resolve the station source: real park equipment → bodyweight fallback ──
  // א.1: warm the equipment cache AND the program id→slug map BEFORE composing,
  // or Firestore ids don't translate (empty station) and resolveToSlug is NULL
  // (broken level/program filtering). The hybrid path bypasses home-workout.service.
  const { warmHybridCaches } = await import('./hybrid-warmup');
  await warmHybridCaches();
  const { resolveStationSource } = await import('./station-source');
  const source = await resolveStationSource(routePath, {
    authorityId: profile?.core?.authorityId ?? null,
  });
  if (source.uiHint) console.log('[startHybridSession]', source.uiHint); // friendly fallback (UI later)
  const midIdx = Math.floor(routePath.length / 2);
  const [midLng, midLat] = routePath[midIdx];
  const stopCandidates = [{
    stopId: source.parkId ?? 'hybrid-mid',
    parkId: source.parkId,
    locationKind: source.locationKind,
    lat: source.lat ?? midLat,
    lng: source.lng ?? midLng,
    waypointIndex: source.waypointIndex ?? midIdx,
    availableEquipment: source.availableEquipment,
    activityType: 'strength' as const,
  }];

  // ── Pool + contexts ────────────────────────────────────────────────────────
  const masterExercises = await getAllExercises();
  const filterContext: ContextualFilterContext = {
    location: 'park',
    lifestyles: [],
    injuryShield: [],
    intentMode: 'normal',
    availableEquipment: [],
    getUserLevelForExercise: () => userLevel,
  };
  const generationContext: WorkoutGenerationContext = {
    availableTime: 10,
    userLevel,
    daysInactive: 1,
    intentMode: 'normal',
    persona: null,
    location: 'park',
    injuryCount: 0,
    difficulty: 2,
    userWeight: userWeightKg,
  };

  // ── Compose ────────────────────────────────────────────────────────────────
  const input = buildSandwichComposeInput({
    timeBudgetMin: intent.timeBudgetMin,
    emphasis: intent.emphasis,
    aerobicKind: intent.aerobicKind,
    paceProfile,
    routePath,
    stopCandidates,
    masterExercises,
    filterContext,
    generationContext,
    weeklyGaps,
    userWeightKg,
    shape: resolveHybridShape('sandwich'),
  });
  const plan = composeHybridSession(input);

  // ── Start ──────────────────────────────────────────────────────────────────
  const rp = useRunningPlayer.getState();
  rp.setHybridMode(true);
  rp.setActiveRoutePath(routePath);
  useHybridRun.getState().startHybrid(plan, intent.aerobicKind);
  ctx.startRun();
}

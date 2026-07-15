/**
 * scripts/probe-hybrid-compose.ts — READ ONLY. Reproduces the live bug headlessly:
 * a real park stop that sits OFF the km-midpoint (near the route start) used to be
 * discarded to a field (bodyweight) fallback. After the fix it must be USED with its
 * real equipment. Emits the [hybrid:diag] stop line + usedFieldFallback.
 * Run from the worktree root: npx tsx scripts/probe-hybrid-compose.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
// eslint-disable-next-line @typescript-eslint/no-var-requires
(globalThis as any).React = require('react');

async function main() {
  const { getAllExercises } = await import('@/features/content/exercises/core/exercise.service');
  const { warmHybridCaches } = await import('@/features/workout-engine/hybrid/hybrid-warmup');
  const { composeHybridSession } = await import('@/features/workout-engine/hybrid/compose-hybrid-session.service');
  const { buildSandwichComposeInput } = await import('@/features/workout-engine/hybrid/build-hybrid-input');
  const { resolveHybridShape } = await import('@/features/workout-engine/hybrid/hybrid-shape');

  await warmHybridCaches();
  const masterExercises = await getAllExercises();

  // ~2.2 km straight route, 21 vertices. Park sits at vertex 2 (~10% of the route)
  // — OFF the km-midpoint, so the ±25% even-spacing gate rejects it (the bug trigger).
  const path: [number, number][] = [];
  for (let i = 0; i <= 20; i++) path.push([34.77 + i * 0.0012, 32.06]);
  const stationWaypoint = 2;

  const stopCandidates = [{
    stopId: 'park:הר ציון (test)', parkId: 'test-park', locationKind: 'gym',
    lat: path[stationWaypoint][1], lng: path[stationWaypoint][0], waypointIndex: stationWaypoint,
    availableEquipment: ['pullup_bar', 'dip_station'], activityType: 'strength' as const,
  }];

  // ── REUSE the strength level mechanism (as composeHybridPlan now does) ──
  const { buildUserProgramLevels, getBaseUserLevel } = await import('@/features/workout-engine/services/level-resolution.utils');
  const { getAllPrograms } = await import('@/features/content/programs/core/program.service');
  const { resolveToSlug } = await import('@/features/workout-engine/services/program-hierarchy.utils');
  const { MG_TO_DOMAIN } = await import('@/features/workout-engine/shared/constants/domain-mapping.constants');
  // Real-shaped profile: pull 22 / push 12 / legs 12 / core 12 (the reported user).
  const fakeProfile: any = { progression: { domains: { push: { level: 12 }, pull: { level: 22 }, legs: { level: 12 }, core: { level: 12 } }, tracks: {}, globalLevel: 4, activePrograms: [] } };
  const allPrograms = await getAllPrograms();
  const masterProgramIds = new Set(allPrograms.filter((p: any) => p.isMaster).map((p: any) => p.id));
  const userProgramLevels = buildUserProgramLevels(fakeProfile, masterProgramIds, '[HybridProbe]').levels;
  const baseUserLevel = getBaseUserLevel(fakeProfile);
  const resolveLvl = (ex: any): number => {
    const mg = MG_TO_DOMAIN[ex?.movementGroup ?? '']; if (mg && userProgramLevels.has(mg)) return userProgramLevels.get(mg)!;
    for (const tp of ex?.targetPrograms ?? []) { const s = resolveToSlug(tp.programId); if (userProgramLevels.has(s)) return userProgramLevels.get(s)!; if (userProgramLevels.has(tp.programId)) return userProgramLevels.get(tp.programId)!; }
    return baseUserLevel;
  };
  console.log('injected domainLevels =', Array.from(userProgramLevels.entries()).map(([k, v]) => `${k}:L${v}`).join(', '), '· base=L' + baseUserLevel);

  const input = buildSandwichComposeInput({
    timeBudgetMin: 40, emphasis: 'balanced' as any, aerobicKind: 'running',
    paceProfile: { basePace: 390, profileType: 2 },
    routePath: path, stopCandidates: stopCandidates as any, masterExercises,
    filterContext: { location: 'park', lifestyles: [], injuryShield: [], intentMode: 'normal', availableEquipment: [], getUserLevelForExercise: resolveLvl } as any,
    generationContext: { availableTime: 10, userLevel: baseUserLevel, daysInactive: 1, intentMode: 'normal', persona: null, location: 'park', injuryCount: 0, difficulty: 2, userWeight: 70, userProgramLevels } as any,
    weeklyGaps: { aerobicGapMin: 90, strengthGapDays: 1, neglectedDomains: ['pull'] },
    userWeightKg: 70, shape: resolveHybridShape('sandwich'),
  });

  const plan = composeHybridSession(input);
  const strength = plan.segments.filter((s: any) => s.kind === 'strength');
  const legs = plan.segments.filter((s: any) => s.kind === 'aerobic');
  console.log('\n════ RESULT ════');
  console.log('LEGS km:', legs.map((l: any) => l.distanceKm).join(' + '), '= total', plan.totals.distanceKm,
    '| ranges:', legs.map((l: any) => `${l.fromKm}→${l.toKm}`).join(' , '), '(station at ~10% of route → expect asymmetric, not 50/50)');
  console.log('usedFieldFallback =', plan.meta.usedFieldFallback, plan.meta.usedFieldFallback ? '❌ (dropped park to bodyweight)' : '✅ (park used)');
  console.log('swap bench (altPool) =', (strength[0] as any)?.content?.altPool?.length ?? 0, 'alternatives',
    '→ e.g.', ((strength[0] as any)?.content?.altPool ?? []).slice(0, 3).map((a: any) => a.exercise?.name?.he ?? a.exercise?.name).join(' · '));
  for (const s of strength as any[]) {
    const nm = (e: any) => { const n = e.exercise?.name ?? e.name; return typeof n === 'string' ? n : (n?.he ?? n?.en ?? e.exercise?.id ?? e.exerciseId); };
    const ex = (s.content?.exercises ?? []).map(nm);
    console.log(`strength stop → ${ex.length} exercises:`, ex.join(' · '));
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

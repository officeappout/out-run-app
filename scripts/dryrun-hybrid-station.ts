/**
 * scripts/dryrun-hybrid-station.ts — READ ONLY, throwaway (do not commit).
 *
 * Phase-א dry-run: proves (1) a REAL park's equipment normalizes to canonical gear
 * ids and composes a station using them, and (2) the bodyweight FALLBACK composes a
 * NON-EMPTY station. Warms the equipment cache first (א.1) — the whole point.
 *
 * Usage: npx tsx scripts/dryrun-hybrid-station.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
// eslint-disable-next-line @typescript-eslint/no-var-requires
(globalThis as any).React = require('react'); // exercises barrel loads admin JSX under bare tsx

function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}
const heName = (ex: any) => ex?.content?.name?.he ?? ex?.content?.name ?? ex?.name?.he ?? ex?.name ?? ex?.id ?? '?';

async function main() {
  initFirebase();
  const db = admin.firestore();

  // 1. A real route (for the path) + a real PRIMARY park with equipment.
  const routesSnap = await db.collection('official_routes').limit(200).get();
  const route = routesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => (r.path?.length ?? 0) >= 40).sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))[0];
  route.path = route.path.map((p: any) => (Array.isArray(p) ? p : [p.lng ?? p.longitude, p.lat ?? p.latitude]));

  const parksSnap = await db.collection('parks').limit(1500).get();
  const park = parksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((p) => (p.gymEquipment?.length ?? 0) >= 4)
    .filter((p) => p.category === 'gym_park' || (Array.isArray(p.sportTypes) && p.sportTypes.includes('calisthenics')))
    .sort((a, b) => (b.gymEquipment?.length ?? 0) - (a.gymEquipment?.length ?? 0))[0];
  const parkEquipmentDocIds: string[] = (park?.gymEquipment ?? []).map((g: any) => g.equipmentId).filter(Boolean);
  console.log(`\n🏋️  park: "${park?.name}" · ${parkEquipmentDocIds.length} raw equipment ids`);

  // 2. Warm the equipment cache from the master collection (א.1) → seedEquipmentCaches.
  const gymSnap = await db.collection('gym_equipment').get();
  const gymEquip = gymSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const { seedEquipmentCaches, normalizeGearIds } = await import('../src/features/workout-engine/shared/utils/gear-mapping.utils');
  seedEquipmentCaches([], gymEquip as any);

  // 3. Normalize park equipment → canonical gear ids (the phase-א util).
  const { parkGymEquipmentToGearIds } = await import('../src/features/workout-engine/hybrid/park-equipment.util');
  const gearIds = parkGymEquipmentToGearIds(park?.gymEquipment, normalizeGearIds);
  console.log(`🔑 normalized → ${gearIds.length} canonical gear ids: ${gearIds.join(', ')}`);

  // 4. Compose twice: PARK equipment vs BODYWEIGHT fallback.
  const exSnap = await db.collection('exercises').get();
  const exercises = exSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const { composeHybridSession } = await import('../src/features/workout-engine/hybrid/compose-hybrid-session.service');
  const { buildIdToSlugMapFromPrograms } = await import('../src/features/workout-engine/services/program-hierarchy.utils');
  const programsSnap = await db.collection('programs').get();
  const SKIP_MAP = process.env.SKIP_MAP === '1';
  if (SKIP_MAP) console.log('⚠️  SKIP_MAP=1 — programs id→slug map NOT built (reproduces bug 1: the live hybrid path)');
  else buildIdToSlugMapFromPrograms(programsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any);

  // ── DIAGNOSTIC: which (location, equipment, intent) yields a bodyweight pool? ──
  const MID = 6;
  const { filterExercisesContextually } = await import('../src/features/workout-engine/logic/ContextualEngine');
  const mkCtx = (location: any, availableEquipment: string[], intentMode: any = 'normal') =>
    ({ location, lifestyles: [], injuryShield: [], intentMode, availableEquipment, getUserLevelForExercise: () => MID }) as any;
  const q = (loc: any, eq: string[], im: any = 'normal') => {
    const rl = console.log, rw = console.warn; console.log = () => {}; console.warn = () => {};
    const n = filterExercisesContextually(exercises as any, mkCtx(loc, eq, im)).exercises.length;
    console.log = rl; console.warn = rw; return n;
  };
  console.log('POOL COUNTS:',
    `park+gear=${q('park', gearIds)} · park+[]=${q('park', [])} · park+[]+field=${q('park', [], 'field')}`,
    `· home+[]=${q('home', [])} · street+[]=${q('street', [])} · home+[]+field=${q('home', [], 'field')} · on_the_way+[]=${q('park', [], 'on_the_way')}`);

  const baseInput = (availableEquipment: string[]) => ({
    timeBudgetMin: 40, emphasis: 'balanced' as const, aerobicKind: 'running' as const,
    paceProfile: { basePace: 390, profileType: 2 as const }, routePath: route.path,
    stopCandidates: [{ stopId: 'stn', parkId: park?.id, locationKind: 'gym' as const,
      lat: route.path[Math.floor(route.path.length / 2)][1], lng: route.path[Math.floor(route.path.length / 2)][0],
      waypointIndex: Math.floor(route.path.length / 2), availableEquipment, activityType: 'strength' as const }],
    stationOverride: 1, masterExercises: exercises as any,
    filterContext: { location: 'park' as const, lifestyles: [], injuryShield: [], intentMode: 'normal' as const,
      availableEquipment, getUserLevelForExercise: () => MID },
    generationContext: { availableTime: 10, userLevel: MID, daysInactive: 1, intentMode: 'normal' as const,
      persona: null, location: 'park', injuryCount: 0, difficulty: 2 as const, userWeight: 75 },
    weeklyGaps: { aerobicGapMin: 90, strengthGapDays: 1, neglectedDomains: ['pull', 'legs'] }, userWeightKg: 75,
  });

  // Direct block test: does bodyweight fail ONLY under a 'pull' focus (needs a bar)?
  const { generateStrengthBlock } = await import('../src/features/workout-engine/core/pipeline/strength-block.service');
  const bwPool = filterExercisesContextually(exercises as any, mkCtx('park', [], 'field')).exercises;
  const genCtx = baseInput([]).generationContext as any;
  const rest = { multiplier: 0.5, exemptSkillAndIsometric: true } as const;
  const rlB = console.log, rwB = console.warn; console.log = () => {}; console.warn = () => {};
  const bPull = generateStrengthBlock({ blockMinutes: 10, scoredPool: bwPool as any, context: genCtx, domainFocus: 'pull', rest });
  const bMixed = generateStrengthBlock({ blockMinutes: 10, scoredPool: bwPool as any, context: genCtx, rest });
  const bLegs = generateStrengthBlock({ blockMinutes: 10, scoredPool: bwPool as any, context: genCtx, domainFocus: 'legs_core', rest });
  console.log = rlB; console.warn = rwB;
  console.log(`BW block direct: pull=${bPull.isEmpty ? 'EMPTY' : bPull.exercises.length} · legs_core=${bLegs.isEmpty ? 'EMPTY' : bLegs.exercises.length} · mixed=${bMixed.isEmpty ? 'EMPTY' : bMixed.exercises.length}`);

  let nullHits = 0;
  const hit = (a: any[]) => { const s = String(a[0] ?? ''); if (s.includes('map is NULL') || s.includes('not found in slug map')) nullHits++; };
  const realLog = console.log, realWarn = console.warn, realErr = console.error;
  console.log = () => {}; console.warn = (...a: any[]) => hit(a); console.error = (...a: any[]) => hit(a);
  const parkPlan = composeHybridSession(baseInput(gearIds) as any);
  const bwPlan = composeHybridSession(baseInput([]) as any);
  console.log = realLog; console.warn = realWarn; console.error = realErr;
  console.log(`resolveToSlug NULL/not-found during compose: ${nullHits}`);

  const stationOf = (plan: any) => plan.segments.find((s: any) => s.kind === 'strength');
  const printStation = (label: string, plan: any) => {
    const st = stationOf(plan);
    const exs = st?.content?.exercises ?? [];
    console.log(`\n${label}: ${exs.length} exercises${exs.length ? '' : '  ⚠️ EMPTY'}`);
    for (const ex of exs) console.log(`   • ${heName(ex.exercise)} — ${ex.sets}×${ex.reps}${ex.isTimeBased ? " שנ'" : ''}`);
    return exs.length;
  };

  console.log('\n' + '═'.repeat(56));
  const nPark = printStation('💪 PARK station (real equipment)', parkPlan);
  const nBW = printStation('🤸 BODYWEIGHT fallback', bwPlan);
  console.log('\n' + '═'.repeat(56));
  console.log(`RESULT: park station ${nPark > 0 ? 'NON-EMPTY ✅' : 'EMPTY ❌'} · fallback ${nBW > 0 ? 'NON-EMPTY ✅' : 'EMPTY ❌'}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

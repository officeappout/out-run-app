/**
 * scripts/_audit-empty-plan-real-composer.ts
 *
 * READ-ONLY mapping audit, item 4 (David, 23.09.2026): run the REAL, pure
 * composeHybridSession (LAW 0 — no Firebase calls inside it) against REAL
 * route/station data for L3q3SY0UaCeJHdtHUOV7, simulating an unassessed
 * user via resolveHybridUserLevels' real "absent=absent" convention
 * (UNASSESSED_DOMAIN_LEVEL = -Infinity for every domain), to find exactly
 * where the plan empties out. No writes. No test data created.
 */
import * as admin from 'firebase-admin';
import { composeHybridSession } from '../src/features/workout-engine/hybrid/compose-hybrid-session.service';
import { UNASSESSED_DOMAIN_LEVEL } from '../src/features/workout-engine/logic/contextual-engine.types';
import type { HybridComposeInput, HybridStopCandidate } from '../src/features/workout-engine/hybrid/compose-hybrid-session.service';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

function normalizePath(raw: any): [number, number][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => (Array.isArray(p) ? [p[0], p[1]] : [p?.lng ?? p?.longitude, p?.lat ?? p?.latitude]))
    .filter((c: any) => Number.isFinite(c[0]) && Number.isFinite(c[1])) as [number, number][];
}

async function main() {
  const routeDoc = await db.collection('official_routes').doc('L3q3SY0UaCeJHdtHUOV7').get();
  const routeData = routeDoc.data() as any;
  const routePath = normalizePath(routeData.path);
  console.log(`Route path: ${routePath.length} points`);

  // The 2 real stops found earlier this session (stretch @ wp68, strength/hydraulic @ wp87).
  const stopCandidates: HybridStopCandidate[] = [
    {
      stopId: 'poi:stretch-station', locationKind: 'scenic', lat: 0, lng: 0,
      waypointIndex: 68, availableEquipment: [], activityType: 'stretch',
    },
    {
      stopId: 'poi:strength-station', locationKind: 'gym', lat: 0, lng: 0,
      waypointIndex: 87, availableEquipment: ['leg_press', 'rowing_machine', 'spin_bike', 'ab_twist'],
      activityType: 'strength',
    },
  ];

  const exSnap = await db.collection('exercises').get();
  const masterExercises = exSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  console.log(`Master exercise pool: ${masterExercises.length}`);

  const UNASSESSED = false; // David's ask: simulate an unassessed user

  const filterContext = {
    location: 'park', lifestyles: [], injuryShield: [], intentMode: 'normal', availableEquipment: [],
    getUserLevelForExercise: () => (UNASSESSED ? UNASSESSED_DOMAIN_LEVEL : 1),
  } as any;

  const generationContext = {
    availableTime: 10, userLevel: 1, daysInactive: 1, intentMode: 'normal', persona: null,
    location: 'park', injuryCount: 0, userWeight: 70,
    userProgramLevels: new Map<string, number>(), // empty — genuinely unassessed
  } as any;

  const input: HybridComposeInput = {
    timeBudgetMin: 30, emphasis: 'balanced', aerobicKind: 'walking',
    paceProfile: { basePace: 390, profileType: 2 },
    routePath, stopCandidates, stopSelection: 'as_provided', stationDomainMode: 'multi',
    masterExercises, filterContext, generationContext,
    weeklyGaps: { aerobicGapMin: 0, strengthGapDays: 0, neglectedDomains: [] },
    userWeightKg: 70,
  };

  console.log('\n=== Calling the REAL composeHybridSession ===\n');
  const plan = composeHybridSession(input);

  console.log(`\n=== RESULT ===`);
  console.log(`segments: ${plan.segments.length}`);
  console.log(`totals: ${JSON.stringify(plan.totals)}`);
  console.log(`meta: ${JSON.stringify({ ...plan.meta, log: undefined })}`);
  console.log(`\n=== FULL LOG (composer's own internal trace) ===`);
  plan.meta.log.forEach((l) => console.log('  ' + l));

  console.log(`\n=== Segments detail ===`);
  plan.segments.forEach((s, i) => console.log(`  [${i}] kind=${s.kind} content-exercises=${(s.content as any)?.exercises?.length ?? 'N/A'}`));
}
main().then(() => process.exit(0)).catch((e) => { console.error('THREW:', e); process.exit(1); });

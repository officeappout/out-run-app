/**
 * scripts/_verify-domain-assessment-gate.ts
 *
 * Mandatory execution verification (David, 23-24.09.2026) for the
 * domain-assessment-gate PR. Calls the REAL, pure composeHybridSession
 * directly (LAW 0 — no Firebase inside it) against REAL route/station/
 * exercise/equipment data (read-only fetches), simulating different
 * assessment states via in-memory userProgramLevels Maps — no writes, no
 * test data created in production, no real user document touched.
 *
 * Route: L3q3SY0UaCeJHdtHUOV7 (Kalaniyot, Sderot) — the same 2 real stops
 * established earlier this session (stretch @wp68, hydraulic strength @wp87).
 * A 3rd SYNTHETIC no-equipment 'strength' stop is added for scenarios that
 * specifically need a no-equipment station (not present on this real route) —
 * clearly labelled synthetic, in-memory only, never written anywhere.
 */
import * as admin from 'firebase-admin';
import { composeHybridSession, stripLockedStationsForRun } from '../src/features/workout-engine/hybrid/compose-hybrid-session.service';
import type { HybridComposeInput, HybridStopCandidate, HybridPlan } from '../src/features/workout-engine/hybrid/compose-hybrid-session.service';

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

  const exSnap = await db.collection('exercises').get();
  // Pre-existing data-quality gap found during this verification run, UNRELATED
  // to the domain-assessment gate (ContextualEngine.ts is out of scope for this
  // PR — David: "אל תיגע ב-ContextualEngine.ts"): doc qHy5Te1jSPSi5jA3W9d6 has
  // both execution_methods:[] AND equipment:undefined, which crashes
  // passesFieldMode's legacy fallback (exercise.equipment.length). Filtered out
  // here so this script's OWN verification can complete — flagged in the PR
  // report as a found-but-not-fixed issue, not touched.
  const masterExercises = exSnap.docs
    .filter((d) => d.id !== 'qHy5Te1jSPSi5jA3W9d6')
    .map((d) => ({ id: d.id, ...(d.data() as any) }));
  console.log(`Master exercise pool: ${masterExercises.length}`);

  // Real Sderot gym park's real gymEquipment refs, matched against the real
  // gym_equipment catalog — the SAME findHydraulicEquipment matching
  // start-hybrid-session.ts now does for EVERY equipped stop (not just
  // Gate-A-gated ones). Read-only.
  const sderotParkDoc = await db.collection('parks').doc('W2BrOhXzngOSUOOsyNvx').get();
  if (!sderotParkDoc.exists) throw new Error('Real Sderot gym park doc W2BrOhXzngOSUOOsyNvx not found — re-check.');
  const sderotPark = sderotParkDoc.data() as any;
  console.log(`Sderot park: ${sderotPark.name}`);
  const equipmentIds: string[] = (sderotPark.gymEquipment ?? []).map((e: any) => e.equipmentId).filter(Boolean);
  const equipmentCatalogSnap = await db.collection('gym_equipment').get();
  const equipmentCatalog = equipmentCatalogSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const matchedHydraulic = equipmentCatalog.filter((eq: any) => equipmentIds.includes(eq.id) && eq.isFunctional === false);
  console.log(`Sderot park gymEquipment refs: ${equipmentIds.length} | matched hydraulic docs: ${matchedHydraulic.length}`);
  matchedHydraulic.forEach((m: any) => console.log(`  - ${m.id} isFunctional=${m.isFunctional} movementPattern=${m.movementPattern}`));

  const realStops: HybridStopCandidate[] = [
    {
      stopId: 'poi:stretch-station', locationKind: 'scenic', lat: 0, lng: 0,
      waypointIndex: 68, availableEquipment: [], activityType: 'stretch',
    },
    {
      stopId: 'poi:strength-station', locationKind: 'gym', lat: 0, lng: 0,
      waypointIndex: 87, availableEquipment: ['leg_press', 'rowing_machine', 'spin_bike', 'ab_twist'],
      activityType: 'strength',
      parkEquipment: matchedHydraulic as any,
    },
  ];

  // SYNTHETIC (in-memory only, not on the real route) — a no-equipment
  // 'strength' stop, needed to exercise the lock-card path (the real
  // Kalaniyot route has no such stop today).
  const syntheticNoEquipStop: HybridStopCandidate = {
    stopId: 'synthetic:no-equip-strength', locationKind: 'open_area', lat: 0, lng: 0,
    waypointIndex: 30, availableEquipment: [], activityType: 'strength',
  };

  function buildInput(stopCandidates: HybridStopCandidate[], userProgramLevels: Map<string, number>): HybridComposeInput {
    const filterContext = {
      location: 'park', lifestyles: [], injuryShield: [], intentMode: 'normal', availableEquipment: [],
      getUserLevelForExercise: () => 3,
    } as any;
    const generationContext = {
      availableTime: 10, userLevel: 3, daysInactive: 1, intentMode: 'normal', persona: null,
      location: 'park', injuryCount: 0, userWeight: 70, difficulty: 2,
      userProgramLevels,
    } as any;
    return {
      timeBudgetMin: 30, emphasis: 'balanced', aerobicKind: 'walking',
      paceProfile: { basePace: 390, profileType: 2 },
      routePath, stopCandidates, stopSelection: 'as_provided', stationDomainMode: 'multi',
      masterExercises, filterContext, generationContext,
      weeklyGaps: { aerobicGapMin: 0, strengthGapDays: 0, neglectedDomains: [] },
      userWeightKg: 70,
    };
  }

  function report(label: string, plan: ReturnType<typeof composeHybridSession>) {
    console.log(`\n=== ${label} ===`);
    console.log(`segments: ${plan.segments.length} | totals: ${JSON.stringify(plan.totals)}`);
    console.log(`meta (no log): ${JSON.stringify({ ...plan.meta, log: undefined })}`);
    plan.segments.forEach((s, i) => {
      if (s.kind === 'aerobic') {
        console.log(`  [${i}] aerobic distanceKm=${s.distanceKm} durationSec=${s.durationSec}`);
      } else if (s.kind === 'strength') {
        const c: any = s.content;
        console.log(
          `  [${i}] strength stopId=${s.stopId} exercises=${c?.exercises?.length ?? 0}` +
          ` isEmpty=${c?.isEmpty} needsAssessment=${JSON.stringify(c?.needsAssessment) ?? 'none'}` +
          ` assessmentNudge=${JSON.stringify(c?.assessmentNudge) ?? 'none'}` +
          ` tabataBlocks=${c?.tabataBlocks?.length ?? 0}`,
        );
        if (c?.exercises?.length) {
          c.exercises.forEach((we: any) => {
            const name = we.exercise?.name?.he ?? we.exercise?.name ?? we.exercise?.id;
            console.log(`      - ${name} (movementGroup=${we.exercise?.movementGroup ?? 'n/a'}, sets=${we.sets}, isTimeBased=${we.isTimeBased})`);
          });
        }
      }
    });
    console.log(`--- full internal log ---`);
    plan.meta.log.forEach((l) => console.log('  ' + l));
  }

  // ── Scenario A: fully unassessed user, real 2-station route ─────────────
  const unassessed = new Map<string, number>();
  report('A: unassessed user, real 2-station Kalaniyot route (30min)', composeHybridSession(buildInput(realStops, unassessed)));

  // ── Scenario B: unassessed user, real strength station + synthetic no-equip stop ──
  report(
    'B: unassessed user, real hydraulic station + SYNTHETIC no-equipment station',
    composeHybridSession(buildInput([realStops[1], syntheticNoEquipStop], unassessed)),
  );

  // ── Scenario C: core-only-assessed user, synthetic no-equip 'core' station ──
  const coreOnly = new Map<string, number>([['core', 5]]);
  const coreStop: HybridStopCandidate = { ...syntheticNoEquipStop, activityType: 'core' };
  report('C: core-only-assessed user, synthetic no-equipment CORE station', composeHybridSession(buildInput([coreStop], coreOnly)));

  // ── Scenario D: unassessed user, synthetic no-equip 'core' station (should lock) ──
  report('D: unassessed user, synthetic no-equipment CORE station (expect lock card)', composeHybridSession(buildInput([coreStop], unassessed)));

  // ── Scenario E: fully-assessed user, real 2-station route (zero-regression check) ──
  const fullyAssessed = new Map<string, number>([['push', 5], ['pull', 5], ['legs', 5], ['core', 5]]);
  report('E: fully-assessed user, real 2-station Kalaniyot route (zero-regression)', composeHybridSession(buildInput(realStops, fullyAssessed)));

  // ── Scenario F: zero real stops, unassessed → skipFieldFallbackWhenNoCandidates ──
  const inputF = buildInput([], unassessed);
  inputF.skipFieldFallbackWhenNoCandidates = true;
  report('F: zero real stops + unassessed + skipFieldFallbackWhenNoCandidates=true', composeHybridSession(inputF));

  // ── Scenario G: zero real stops, ASSESSED (must be byte-identical to before — flag has no effect without unassessed) ──
  const inputG = buildInput([], fullyAssessed);
  inputG.skipFieldFallbackWhenNoCandidates = false;
  report('G: zero real stops + assessed (flag false — existing field-fallback synthesis, zero regression)', composeHybridSession(inputG));

  // ── Scenario D2: no-equipment stop pull-exercise audit (any level) ──
  console.log('\n=== D2: no-equipment station — pull-domain exercise audit (fully-assessed) ===');
  const planE = composeHybridSession(buildInput(realStops, fullyAssessed));
  // Use scenario E's OWN real strength station content (has equipment) is not the
  // right test — re-run against the SYNTHETIC no-equip stop specifically, assessed.
  const planNoEquipAssessed = composeHybridSession(buildInput([{ ...syntheticNoEquipStop }], fullyAssessed));
  const strengthSeg = planNoEquipAssessed.segments.find((s) => s.kind === 'strength');
  const exercises: any[] = (strengthSeg?.content as any)?.exercises ?? [];
  const pullExercises = exercises.filter((we) => we.exercise?.movementGroup === 'vertical_pull' || we.exercise?.movementGroup === 'horizontal_pull');
  console.log(`no-equipment station exercises: ${exercises.length} | pull-domain exercises among them: ${pullExercises.length}`);
  pullExercises.forEach((we) => console.log(`  UNEXPECTED PULL EXERCISE: ${we.exercise?.name?.he ?? we.exercise?.id} (movementGroup=${we.exercise?.movementGroup})`));

  // ── Scenario H: David's 24.09.2026 correction — a locked station must not
  // reach the ACTIVE RUN at all (stripLockedStationsForRun, called from
  // runHybridPlan). Reuse scenario B's exact plan (real hydraulic station +
  // synthetic no-equip station, unassessed) — 1 locked segment, 1 real
  // equipment-tabata segment, to prove the strip survives a MULTI-station
  // plan, not just the trivial single-station case. ──
  console.log('\n=== H: stripLockedStationsForRun — locked station must vanish from the run, no merge/geometry break ===');
  const planB: HybridPlan = composeHybridSession(buildInput([syntheticNoEquipStop, realStops[1]], unassessed));
  console.log('Pre-strip segments:');
  planB.segments.forEach((s, i) => console.log(
    `  [${i}] kind=${s.kind}` +
    (s.kind === 'aerobic' ? ` fromKm=${s.fromKm} toKm=${s.toKm} distanceKm=${s.distanceKm} durationSec=${s.durationSec}` : '') +
    (s.kind === 'strength' ? ` stopId=${s.stopId} needsAssessment=${!!(s.content as any)?.needsAssessment}` : ''),
  ));
  const preStripDistance = planB.segments.filter((s) => s.kind === 'aerobic').reduce((a, s) => a + (s.distanceKm ?? 0), 0);
  const preStripDuration = planB.segments.filter((s) => s.kind === 'aerobic').reduce((a, s) => a + (s.durationSec ?? 0), 0);
  const preStripStationCount = planB.segments.filter((s) => s.kind === 'strength').length;

  const runPlan = stripLockedStationsForRun(planB);
  console.log('Post-strip segments (what useHybridRun.startHybrid actually receives):');
  runPlan.segments.forEach((s, i) => console.log(
    `  [${i}] kind=${s.kind}` +
    (s.kind === 'aerobic' ? ` fromKm=${s.fromKm} toKm=${s.toKm} distanceKm=${s.distanceKm} durationSec=${s.durationSec}` : '') +
    (s.kind === 'strength' ? ` stopId=${s.stopId} needsAssessment=${!!(s.content as any)?.needsAssessment}` : ''),
  ));

  const postStripDistance = runPlan.segments.filter((s) => s.kind === 'aerobic').reduce((a, s) => a + (s.distanceKm ?? 0), 0);
  const postStripDuration = runPlan.segments.filter((s) => s.kind === 'aerobic').reduce((a, s) => a + (s.durationSec ?? 0), 0);
  const postStripLockedCount = runPlan.segments.filter((s) => s.kind === 'strength' && (s.content as any)?.needsAssessment).length;
  const postStripStationCount = runPlan.segments.filter((s) => s.kind === 'strength').length;
  // No two consecutive aerobic segments (the invariant useHybridRun/hybrid-orchestrator assume).
  let hasAdjacentAerobic = false;
  for (let i = 0; i < runPlan.segments.length - 1; i++) {
    if (runPlan.segments[i].kind === 'aerobic' && runPlan.segments[i + 1].kind === 'aerobic') hasAdjacentAerobic = true;
  }

  const preStripLockedCount = planB.segments.filter((s) => s.kind === 'strength' && (s.content as any)?.needsAssessment).length;
  console.log(`\nlocked stations pre-strip: ${preStripLockedCount} (expect 1)`);
  console.log(`locked stations post-strip: ${postStripLockedCount} (expect 0)`);
  console.log(`total station segments: pre=${preStripStationCount} post=${postStripStationCount} (expect pre-1)`);
  console.log(`total aerobic distanceKm: pre=${preStripDistance.toFixed(3)} post=${postStripDistance.toFixed(3)} (expect EQUAL — no distance lost)`);
  console.log(`total aerobic durationSec: pre=${preStripDuration} post=${postStripDuration} (expect EQUAL — no time lost)`);
  console.log(`adjacent-aerobic-segments (would break isFinalLeg): ${hasAdjacentAerobic} (expect false)`);
  console.log(`totals.stations: pre=${planB.totals.stations} post=${runPlan.totals.stations} (expect pre-1)`);
  console.log(`same-object-if-no-locked-station check: composeHybridSession(realStops only, unassessed) → strip is a no-op reference-equal?`);
  const planNoLocked = composeHybridSession(buildInput([realStops[1]], unassessed));
  const strippedNoLocked = stripLockedStationsForRun(planNoLocked);
  console.log(`  ${strippedNoLocked === planNoLocked ? 'YES (byte-identical fast path confirmed)' : 'NO — unexpected new object for a plan with zero locked stations'}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('THREW:', e); process.exit(1); });

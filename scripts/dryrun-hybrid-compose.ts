/**
 * scripts/dryrun-hybrid-compose.ts — READ ONLY
 *
 * Dry-run of composeHybridSession on real data: 40 min · balanced ·
 * mid-level user (L6, basePace 6:30 profile 2) · a real hybrid route with
 * facility stops + real park equipment + the real exercises collection.
 * Prints the resulting plan. No writes anywhere.
 *
 * Usage: npx tsx scripts/dryrun-hybrid-compose.ts [routeNameFilter]
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as admin from 'firebase-admin';
// The exercises barrel transitively loads admin JSX components; under tsx
// (no Next auto-React) they crash at module scope. Inject React globally
// BEFORE the engine modules load (hence the dynamic import inside main).
// eslint-disable-next-line @typescript-eslint/no-var-requires
(globalThis as any).React = require('react');
import type { HybridStopCandidate } from '../src/features/workout-engine/hybrid/compose-hybrid-session.service';
import type { Exercise } from '../src/features/content/exercises';

function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const heName = (ex: any) =>
  ex?.content?.name?.he ?? ex?.content?.name ?? ex?.name?.he ?? ex?.name ?? ex?.id ?? '?';

async function main() {
  initFirebase();
  const db = admin.firestore();
  const nameFilter = process.argv[2] ?? '';

  // ── 1. A real route (production has ZERO isHybrid routes — finding!) ──────
  // facilityStops are synthesized at real vertices along the real path
  // (~25% / 50% / 75%), which exercises the exact same geometry math.
  const routesSnap = await db.collection('official_routes').limit(200).get();
  const route = routesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => (r.path?.length ?? 0) >= 40 && (r.distance ?? 0) >= 2 && (r.distance ?? 0) <= 5)
    .filter((r) => !nameFilter || String(r.name).includes(nameFilter))
    .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))[0];
  if (!route) throw new Error('no suitable route found');
  // Firestore stores path as {lat,lng} objects (no nested arrays) — the
  // client fetch layer normalizes to [lng,lat] tuples; do the same here.
  route.path = route.path.map((p: any) =>
    Array.isArray(p) ? p : [p.lng ?? p.longitude, p.lat ?? p.latitude],
  );
  const n = route.path.length;
  route.facilityStops = [0.25, 0.5, 0.75].map((f, i) => ({
    id: `synth-stop-${i + 1}`,
    lat: route.path[Math.floor(n * f)][1],
    lng: route.path[Math.floor(n * f)][0],
    waypointIndex: Math.floor(n * f),
  }));
  console.log(`\n🗺  מסלול: "${route.name}" · ${route.distance ?? '?'} ק"מ · ${route.facilityStops.length} תחנות (מסונתזות על קודקודים אמיתיים) · authority=${route.authorityId ?? '?'}\n`);

  // ── 2. Real park equipment for gym-kind stops ─────────────────────────────
  const parksSnap = await db.collection('parks').limit(50).get();
  const equippedPark = parksSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .find((p) => (p.gymEquipment?.length ?? 0) >= 4);
  const parkEquipmentIds: string[] = (equippedPark?.gymEquipment ?? [])
    .map((g: any) => g.equipmentId).filter(Boolean);
  console.log(`🏋️  ציוד פארק לדוגמה (${equippedPark?.name ?? '?'}): ${parkEquipmentIds.length} מתקנים\n`);

  // ── 3. Real exercises collection ──────────────────────────────────────────
  const exSnap = await db.collection('exercises').get();
  const exercises = exSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Exercise[];
  console.log(`📚 pool גולמי: ${exercises.length} תרגילים\n`);

  // ── 4. Stop candidates from the route's facilityStops ─────────────────────
  const stopCandidates: HybridStopCandidate[] = route.facilityStops
    .slice(0, 8)
    .map((s: any, i: number) => ({
      stopId: s.id ?? `stop-${i}`,
      parkId: equippedPark?.id,
      locationKind: 'gym' as const,
      lat: s.lat, lng: s.lng,
      waypointIndex: s.waypointIndex ?? 0,
      availableEquipment: parkEquipmentIds,
      activityType: 'strength' as const,
    }));

  // ── 5. Mid-level contexts (L6 across domains, no injuries) ────────────────
  // Dynamic import AFTER the React global is set — the engine chain loads the
  // exercises barrel which contains admin JSX (crashes under bare tsx).
  const { composeHybridSession } = await import(
    '../src/features/workout-engine/hybrid/compose-hybrid-session.service'
  );
  // Initialize the engine's ID→slug map (home-workout.service does this at
  // startup; the dry-run must too or resolveToSlug warns on every exercise).
  const { buildIdToSlugMapFromPrograms } = await import(
    '../src/features/workout-engine/services/program-hierarchy.utils'
  );
  const programsSnap = await db.collection('programs').get();
  buildIdToSlugMapFromPrograms(programsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any);

  // Mute the engine's console chatter for a readable plan printout.
  const realLog = console.log; const realWarn = console.warn;
  console.log = () => {}; console.warn = () => {};

  const MID_LEVEL = 6;
  const plan = composeHybridSession({
    timeBudgetMin: 40,
    emphasis: 'balanced',
    aerobicKind: 'running',
    paceProfile: { basePace: 390, profileType: 2 },     // 6:30/km, slow-improver
    routePath: route.path,
    stopCandidates,
    masterExercises: exercises,
    filterContext: {
      location: 'park',
      lifestyles: [],
      injuryShield: [],
      intentMode: 'normal',
      availableEquipment: parkEquipmentIds,             // overridden per stop anyway
      getUserLevelForExercise: () => MID_LEVEL,
    },
    generationContext: {
      availableTime: 10,                                 // overridden per block
      userLevel: MID_LEVEL,
      daysInactive: 1,
      intentMode: 'normal',
      persona: null,
      location: 'park',
      injuryCount: 0,
      difficulty: 2,
      userWeight: 75,
      userProgramLevels: new Map([['push', 6], ['pull', 6], ['legs', 5], ['core', 5]]),
    },
    weeklyGaps: { aerobicGapMin: 90, strengthGapDays: 1, neglectedDomains: ['pull', 'legs'] },
    userWeightKg: 75,
  });

  // Restore console for the plan printout.
  console.log = realLog; console.warn = realWarn;

  // ── 6. Print the plan ──────────────────────────────────────────────────────
  console.log('═'.repeat(64));
  console.log(`תוכנית: 40 דק' · מאוזן${plan.meta.whoGapNote ? ` · 💬 "${plan.meta.whoGapNote}"` : ''}`);
  console.log(`דגש שנפתר: ${plan.meta.emphasisResolved} · fallback שדה: ${plan.meta.usedFieldFallback}`);
  console.log('═'.repeat(64));
  for (const seg of plan.segments) {
    if (seg.kind === 'aerobic') {
      console.log(
        `\n🏃 מקטע ${seg.index}: ריצה · zone=${seg.zone} · ${seg.distanceKm} ק"מ ` +
        `(${seg.fromKm}→${seg.toKm}) · ~${Math.round((seg.durationSec ?? 0) / 60)} דק' · ` +
        `קצב ${fmtPace(seg.targetPaceSecPerKm!.min)}–${fmtPace(seg.targetPaceSecPerKm!.max)} /ק"מ · ${seg.estCalories} קק"ל`,
      );
    } else {
      console.log(
        `\n💪 מקטע ${seg.index}: תחנה ${seg.stopId} (${seg.locationKind}) · focus=${seg.domainFocus} · ` +
        `~${Math.round((seg.durationSec ?? 0) / 60)} דק' · ${seg.estCalories} קק"ל`,
      );
      for (const ex of seg.content!.exercises) {
        console.log(
          `     • ${heName(ex.exercise)} — ${ex.sets}×${ex.reps}${ex.isTimeBased ? ' שנ\'' : ''} · ` +
          `מנוחה ${ex.restSeconds} שנ' · tier=${ex.tier ?? '?'} · priority=${ex.priority}`,
        );
      }
    }
  }
  console.log(`\n${'═'.repeat(64)}`);
  const t = plan.totals;
  console.log(`סה"כ: אירובי ${t.aerobicMin} דק' · כוח ${t.strengthMin} דק' · ${t.distanceKm} ק"מ · ${t.stations} תחנות · ~${t.estCalories} קק"ל`);
  console.log(`\n— pipeline log (אחרונות) —`);
  for (const l of plan.meta.log.slice(-12)) console.log('  ' + l);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

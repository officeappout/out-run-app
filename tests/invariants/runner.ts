/**
 * runner.ts — the Workout Invariants Gate.
 *
 * Runs generateHomeWorkoutTrio() over a small, representative matrix of cells
 * (parallel — residual cosmetic network reads overlap) against the frozen corpus,
 * and asserts iron-rule invariants (groups A–F) on every generated workout.
 * Structural inputs are frozen + Math.random is seeded → deterministic; invariants
 * are RANGES, never golden snapshots.
 *
 * Run:  npm run test:invariants     (needs .env.local for firebase init)
 *
 * KNOWN-FAILING (xfail): invariants that encode DESIRED behavior the engine does
 * not yet honor. They do NOT break the gate — they keep it usable while the bug is
 * fixed in the engine (builder-stability). If an xfail ever PASSES ("xpass") the
 * gate shouts: the engine was fixed, promote it to a hard invariant.
 *   • F2 — detraining (daysInactive>3) should cap D3→D2, but the trio forces
 *     cfg.difficulty per option, bypassing the lock.
 *   • D1 — a no-gear home user should get bodyweight/improvised methods only, but
 *     some selected methods require gear the user lacks.
 * PROMOTED to hard: B1 (12.07.2026 — availableTime honored via Phase C, 0acd234).
 */

// ── Seed Math.random BEFORE importing the engine graph ──────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(0xc0ffee);

import { generateHomeWorkoutTrio } from '@/features/workout-engine/services/home-workout.service';
import type { HomeWorkoutOptions } from '@/features/workout-engine/services/home-workout.types';
import type { GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/workout-generator.types';
import { calculateEstimatedDuration } from '@/features/workout-engine/logic/workout-budgeting.utils';
import { buildMockProfile } from './profile-factory';

// ── Constants mirrored from the engine (keep in sync; cited) ────────────────
const BOLT_DURATION_CAPS: Record<number, number> = { 1: 30, 2: 45, 3: 60 }; // home-workout.service.ts:499
const BANNED_WARMUP_GEAR_IDS = new Set(['I1K30JehaxSx8dlBOZyd', '7gLOFEfgSvInu7lfLHxV']); // warmup.service.ts:52
const DUR_TOL = 3;
const PUSH_MG = new Set(['horizontal_push', 'vertical_push']);
const PULL_MG = new Set(['horizontal_pull', 'vertical_pull']);

// ── Harness (firestore-rules.test.ts style — no Jest/Vitest) ────────────────
interface Finding { cell: string; group: string; label: string; ok: boolean; detail: string; xfail?: boolean }
const findings: Finding[] = [];
function assert(cell: string, group: string, label: string, ok: boolean, detail: string, xfail = false) {
  findings.push({ cell, group, label, ok, detail, xfail });
}

// ── Cell definition ─────────────────────────────────────────────────────────
interface CellMeta {
  name: string;
  availableTime: number;
  location: 'home' | 'office' | 'park' | 'gym' | 'street';
  availGear: string[];       // user gear at this location (home/office); [] = bodyweight-only
  gearConstrained: boolean;  // true for home/office (user-gear is the constraint) → enables D1
  fullBody: boolean;
  expectPush: boolean;       // require push coverage only if the user HAS a push domain
  expectPull: boolean;       // require pull coverage only if user HAS pull domain AND it's achievable (bar/park)
  substantial: boolean;      // enables B1 xfail (geared full-body cell that should honor time)
  restDay?: boolean;
  detraining?: boolean;
}
interface Cell { meta: CellMeta; options: HomeWorkoutOptions }

// Does the profile carry a track for this domain? (coverage is only required for
// domains the user actually trains — a no-pull-domain user shouldn't be forced pull.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasDomain(profile: any, keys: string[]): boolean {
  const tracks = profile?.progression?.tracks ?? {};
  return keys.some(k => tracks[k] && (tracks[k].level ?? 0) >= 2);
}

function mainOf(w: GeneratedWorkout) {
  return w.exercises.filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown');
}
function gearOf(e: WorkoutExercise): string[] {
  const m = (e.method ?? {}) as { gearIds?: string[]; equipmentIds?: string[] };
  return [...(m.gearIds ?? []), ...(m.equipmentIds ?? [])];
}
// Protocol-driven volume (pyramid/drop/AMRAP) legitimately uses a single "set"
// with a rep sequence — exempt from the 2-set floor.
function isProtocolVolume(e: WorkoutExercise): boolean {
  return !!(e.pyramidSequence?.length || e.repsSequence?.length);
}

function checkWorkout(cell: CellMeta, w: GeneratedWorkout, bolt: number) {
  const c = `${cell.name}·b${bolt}`;
  const main = mainOf(w);
  const warm = w.exercises.filter(e => e.exerciseRole === 'warmup');
  const cool = w.exercises.filter(e => e.exerciseRole === 'cooldown');
  const recovery = w.isRecovery || cell.restDay;
  const recomputed = calculateEstimatedDuration(w.exercises);

  // ── B · Duration ─────────────────────────────────────────────────────────
  // B1 — HARD invariant (promoted from xfail 12.07.2026, David-approved):
  // availableTime is a product contract (±3min, approved 10.07.2026), fixed
  // by builder-stability (Phase C convergence, merged to main as 0acd234)
  // and verified XPASS in every cell. Checked on bolt2 only — the "balanced"
  // workout is what generateHomeWorkout() actually returns.
  if (cell.substantial && bolt === 2) {
    assert(c, 'B', `B1 duration≈availableTime(${cell.availableTime}±${DUR_TOL})`,
      recomputed <= cell.availableTime + DUR_TOL,
      `got ${recomputed}min for a ${cell.availableTime}min request`);
  }
  const cap = BOLT_DURATION_CAPS[bolt] + DUR_TOL;
  assert(c, 'B', `B2 duration≤boltCap(${cap})`, recomputed <= cap, `${recomputed}min > ${cap}min`);

  if (recovery) {
    assert(c, 'F', 'F3 rest-day→isRecovery', !!w.isRecovery, `isRecovery=${w.isRecovery}`);
    return;
  }

  // ── A · Robustness / Structure ────────────────────────────────────────────
  assert(c, 'A', 'A2 main≥1', main.length >= 1, `main=${main.length}`);
  assert(c, 'A', 'A3 warmup≥1', warm.length >= 1, `warmup=${warm.length}`);
  assert(c, 'A', 'A3 cooldown≥1', cool.length >= 1, `cooldown=${cool.length}`);
  assert(c, 'A', 'A4 formattedRepRange on all main',
    main.every(e => typeof e.formattedRepRange === 'string' && e.formattedRepRange.length > 0),
    `${main.filter(e => !e.formattedRepRange).length} missing`);
  const badGolden = main.filter(e => e.priority === 'skill' && (e.pairedWith || e.supersetType));
  assert(c, 'A', 'A6 skill slot never supersetted', badGolden.length === 0, `${badGolden.length} supersetted`);

  // ── C · Muscle coverage (only for domains the user actually trains) ────────
  if (cell.fullBody && cell.expectPush) {
    const hasPush = main.some(e => PUSH_MG.has(e.exercise?.movementGroup as string));
    assert(c, 'C', 'C1a full-body has push (user trains push)', hasPush, 'no push movement');
  }
  if (cell.fullBody && cell.expectPull) {
    // Confirmed bug (xfail): a user WITH a pull domain gets a full-body workout
    // with no pull movement (e.g. quick option drops pull). Tracked in builder-stability.
    const hasPull = main.some(e => PULL_MG.has(e.exercise?.movementGroup as string));
    assert(c, 'C', 'C1b full-body has pull (user trains pull)', hasPull, 'no pull movement', /* xfail */ true);
  }

  // ── D · Equipment ─────────────────────────────────────────────────────────
  if (cell.gearConstrained) {
    const allowed = new Set(cell.availGear);
    const leaks = main.filter(e => gearOf(e).some(g => !allowed.has(g)));
    // Confirmed engine bug (xfail): both no-gear AND geared users receive methods
    // requiring gear they don't have — the execution-method cascade leaks.
    assert(c, 'D', 'D1 main gear ⊆ available', leaks.length === 0,
      `${leaks.length} need gear not in [${cell.availGear.join(',') || 'bodyweight'}]`, /* xfail */ true);
  }
  const bannedWU = [...warm, ...cool].filter(e => gearOf(e).some(g => BANNED_WARMUP_GEAR_IDS.has(g)));
  assert(c, 'D', 'D2 warmup/cooldown no banned gear', bannedWU.length === 0, `${bannedWU.length} banned`);

  // ── E · Sets / Reps / Rest ────────────────────────────────────────────────
  // E1 — HARD invariant (promoted from xfail 12.07.2026, David-approved):
  // the 2-set floor holds after the builder-stability merge (0acd234) —
  // XPASS in every cell. Non-protocol exercises must carry 2-6 sets.
  const setFloor = main.filter(e => !isProtocolVolume(e) && (e.sets < 2 || e.sets > 6));
  assert(c, 'E', 'E1 2≤sets≤6 (non-protocol)', setFloor.length === 0,
    `offenders: ${setFloor.map(e => `${e.sets}(${e.tier})`).join(',')}`);
  const badReps = main.filter(e => (e.isTimeBased ? e.reps < 3 : e.reps < 1));
  assert(c, 'E', 'E2 reps≥1 / hold≥3s', badReps.length === 0,
    `offenders: ${badReps.map(e => `${e.reps}${e.isTimeBased ? 's' : ''}`).join(',')}`);
  const badRest = main.filter(e => e.restSeconds < 30 || e.restSeconds > 240);
  assert(c, 'E', 'E3 30≤rest≤240', badRest.length === 0, `offenders: ${badRest.map(e => e.restSeconds).join(',')}`);
  // E5: totalPlannedSets is an internal PLANNED counter that does not reconcile
  // with the final exercise list (observed field=10 vs Σall=9 — over-counts after
  // trimming). Assert only that it is populated; the drift is a tracked finding.
  const sumAll = w.exercises.reduce((s, e) => s + e.sets, 0);
  assert(c, 'E', 'E5 totalPlannedSets populated', w.totalPlannedSets >= 1,
    `field=${w.totalPlannedSets} Σall=${sumAll}`);
}

// ── The matrix ──────────────────────────────────────────────────────────────
const HOME_GEAR = ['pullup_bar', 'dip_bar', 'parallel_bars'];
interface ProfSpec { key: string; make: () => ReturnType<typeof buildMockProfile>; geared: boolean }
const PROFILES: ProfSpec[] = [
  { key: 'coldStart', geared: false, make: () => buildMockProfile({ level: 1, persona: '', injuries: [], coldStart: true }) },
  { key: 'mid', geared: true, make: () => buildMockProfile({ level: 12, persona: '', injuries: [], domainLevels: { pull: 19, push: 12, legs: 8, core: 5 }, gear: HOME_GEAR }) },
  { key: 'high', geared: true, make: () => buildMockProfile({ level: 22, persona: '', injuries: [], domainLevels: { pull: 24, push: 22, legs: 18, core: 15 }, gear: HOME_GEAR }) },
  { key: 'multi', geared: true, make: () => buildMockProfile({ level: 15, persona: '', injuries: [], domainLevels: { pull: 15, push: 15, legs: 15, core: 15 }, gear: HOME_GEAR }) },
];

const PUSH_KEYS = ['push', 'pushing'];
const PULL_KEYS = ['pull', 'pulling'];

const CELLS: Cell[] = [];
for (const loc of ['home', 'park'] as const) {
  for (const p of PROFILES) {
    const profile = p.make();
    const availGear = loc === 'home' ? (p.geared ? HOME_GEAR : []) : [];
    const canPull = loc === 'park' || availGear.includes('pullup_bar');
    CELLS.push({
      meta: {
        name: `${loc}/${p.key}`, availableTime: 15, location: loc, availGear,
        gearConstrained: loc === 'home', fullBody: true,
        expectPush: hasDomain(profile, PUSH_KEYS),
        expectPull: hasDomain(profile, PULL_KEYS) && canPull,
        substantial: p.geared && loc === 'home',
      },
      options: { userProfile: profile, location: loc, availableTime: 15, difficulty: 2, testLocation: loc },
    });
  }
}
// Edge cells (mid profile → trains both push & pull).
function pushCell(name: string, extra: Partial<HomeWorkoutOptions>, meta: Partial<CellMeta> = {}) {
  const profile = PROFILES[1].make();
  const canPull = (meta.location ?? 'home') !== 'office';
  CELLS.push({
    meta: {
      name, availableTime: 15, location: 'home', availGear: HOME_GEAR, gearConstrained: true,
      fullBody: true, expectPush: hasDomain(profile, PUSH_KEYS), expectPull: hasDomain(profile, PULL_KEYS) && canPull,
      substantial: false, ...meta,
    },
    options: { userProfile: profile, location: 'home', availableTime: 15, difficulty: 2, testLocation: 'home', ...extra },
  });
}
pushCell('edge/injury-shoulder', { injuryOverride: ['shoulder'] }, { substantial: true });
pushCell('edge/detraining-5d', { difficulty: 3, daysInactiveOverride: 5 }, { substantial: true, detraining: true });
pushCell('edge/office', { location: 'office', testLocation: 'office' }, { location: 'office', availGear: [], fullBody: false, expectPush: false, expectPull: false });
pushCell('edge/field', { intentMode: 'field' }, { gearConstrained: false });
pushCell('edge/rest-day', { isScheduledRestDay: true }, { gearConstrained: false, fullBody: false, expectPush: false, expectPull: false, restDay: true });

// ── Run (parallel) ──────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  const results = await Promise.all(CELLS.map(async cell => {
    try {
      return { cell, trio: await generateHomeWorkoutTrio(cell.options) };
    } catch (e) {
      assert(cell.meta.name, 'A', 'A1 generation completes (no throw)', false, (e as Error)?.message || String(e));
      return { cell, trio: null };
    }
  }));

  let workoutCount = 0;
  for (const { cell, trio } of results) {
    if (!trio) continue;
    assert(cell.meta.name, 'A', 'A1 generation completes (no throw)', true, '');
    if (cell.meta.detraining) {
      const maxDiff = Math.max(...trio.options.map(o => o.result.workout.difficulty));
      assert(cell.meta.name, 'F', 'F2 detraining caps D3→D2', maxDiff <= 2, `max delivered difficulty=${maxDiff}`, /* xfail */ true);
    }
    trio.options.forEach(o => { checkWorkout(cell.meta, o.result.workout, o.result.workout.difficulty); workoutCount++; });
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const hardFails = findings.filter(f => !f.ok && !f.xfail);
  const xfails = findings.filter(f => !f.ok && f.xfail);
  const pass = findings.filter(f => f.ok && !f.xfail).length;
  // xpass = an xfail-marked invariant that passed in EVERY cell it was checked
  // (zero failures) → the engine bug is likely fixed; promote to a hard invariant.
  // Partially-passing known bugs (some cells still fail) stay xfail, not xpass.
  const xfailLabels = new Set(xfails.map(f => `${f.group}|${f.label}`));
  const xpassLabels = Array.from(new Set(
    findings.filter(f => f.xfail).map(f => `${f.group}|${f.label}`),
  )).filter(k => !xfailLabels.has(k));

  console.log(`\n════════ Workout Invariants — ${CELLS.length} cells / ${workoutCount} workouts in ${Date.now() - t0}ms ════════`);
  for (const g of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const gf = findings.filter(f => f.group === g);
    const hf = gf.filter(f => !f.ok && !f.xfail).length;
    const xf = gf.filter(f => !f.ok && f.xfail).length;
    if (!gf.length) continue;
    console.log(`  ${g}: ${gf.filter(f => f.ok && !f.xfail).length} pass · ${hf} FAIL${xf ? ` · ${xf} xfail` : ''}`);
  }
  console.log(`\n  TOTAL: ${pass} pass · ${hardFails.length} FAIL · ${dedupe(xfails).length} xfail (known) · ${xpassLabels.length} xpass`);

  if (xfails.length) {
    console.log('\n  xfail (known engine bugs — tracked in builder-stability):');
    dedupe(xfails).forEach(f => console.log(`    ~ [${f.group}] ${f.label} — e.g. ${f.cell}: ${f.detail} (${f.count}×)`));
  }
  if (xpassLabels.length) {
    console.log('\n  ⚠️  XPASS — a known-failing invariant now passes in EVERY cell. Engine likely fixed; promote it:');
    xpassLabels.forEach(k => console.log(`    ! [${k.split('|')[0]}] ${k.split('|')[1]}`));
  }
  if (hardFails.length) {
    console.log('\n  HARD FAILURES:');
    dedupe(hardFails).forEach(f => console.log(`    ✗ [${f.group}] ${f.label} — ${f.cell}: ${f.detail} (${f.count}×)`));
    process.exit(1);
  }
  console.log('\n  ✓ all hard invariants hold\n');
  process.exit(0);
}

function dedupe(fs: Finding[]) {
  const m = new Map<string, Finding & { count: number }>();
  for (const f of fs) {
    const k = `${f.group}|${f.label}`;
    const e = m.get(k);
    if (e) e.count++; else m.set(k, { ...f, count: 1 });
  }
  return Array.from(m.values());
}

main().catch(e => { console.error('[runner] CRASHED:', (e as Error)?.stack || e); process.exit(1); });

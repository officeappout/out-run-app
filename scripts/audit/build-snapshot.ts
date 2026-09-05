/**
 * scripts/audit/build-snapshot.ts — READ ONLY against Firestore (public-read
 * catalog collections only: exercises/programs/gear_definitions/gym_equipment/
 * levels — all `allow read: if true` in firestore.rules). NO Firestore writes:
 * every call passes `skipCycleRestart: true`, which is the ONLY write path
 * inside generateHomeWorkoutTrio (home-workout.service.ts:1175-1176,
 * _persistCycleRestart) — verified by grepping the whole file for
 * setDoc/updateDoc/writeBatch/addDoc/deleteDoc; that's the single hit.
 * Also WRITES scripts/audit/snapshot.sqlite (local file, not Firestore).
 *
 * Runs the real production pipeline — `generateHomeWorkoutTrio`
 * (src/features/workout-engine/services/home-workout.service.ts) fed by
 * `buildMockProfile` (extracted verbatim from the admin Workout Simulator
 * into src/features/workout-engine/shared/utils/mock-profile.utils.ts — see
 * that file's header; the simulator page now imports it, zero behavior
 * change) — across a level×duration×location×domain-subset×daysInactive
 * matrix, and records every generated exercise into snapshot.sqlite.
 *
 * ── Why the client Firestore SDK works headless here ────────────────────
 * home-workout.service.ts imports `db` from src/lib/firebase.ts, which has
 * an explicit `typeof window === 'undefined'` SSR branch (getFirestore(app),
 * no persistence, no App Check) — exactly what a tsx/Node process is.
 * Confirmed empirically (2026-09-04): a single real call completed in ~4.4s
 * cold / ~1.9s warm-cache / ~340ms amortized at concurrency=8.
 *
 * ── Authentication (added 2026-09-04, second pass) ──────────────────────
 * `exercises`/`programs`/`gear_definitions`/`gym_equipment`/`levels` are all
 * `allow read: if true` — the first pass ran fully unauthenticated against
 * those. But `programLevelSettings` (`firestore.rules:651`) is `allow read:
 * if isAuthenticated()` — the source of `preferredProtocols`/
 * `protocolProbability`, i.e. superset/antagonist_pair/tabata/emom. The
 * first pass's unauthenticated calls failed there with permission-denied
 * (caught non-fatally inside home-workout.service.ts:2259, "Non-critical
 * error" — protocolProbability silently defaults to 0), so 0 paired blocks
 * were ever observed — a measurement gap, not a real 0%. Fixed by minting a
 * Firebase Admin custom token for an arbitrary uid (no real `users/{uid}`
 * doc needed — `isAuthenticated()` only checks `request.auth != null`) and
 * signing the client SDK in with it once, before the matrix runs. Confirmed
 * this unblocks real data: 97 programLevelSettings docs across 8 programs,
 * most with preferredProtocols populated.
 *
 * ── "בולטים" (bolts) are free ────────────────────────────────────────────
 * One generateHomeWorkoutTrio call returns all 3 bolt options (difficulty
 * 1/2/3) simultaneously — bolt is NOT an independent axis requiring separate
 * calls. The matrix below is level×duration×location×domains×daysInactive
 * (5×4×3×7×3 = 1260 calls), each producing 3 `workouts` rows (one per bolt).
 *
 * ── "seed קבוע" — NOT ACTUALLY ACHIEVABLE, documented not hidden ────────
 * getShuffleSeed (workout-selection.utils.ts:164-167) has
 * `DEBUG_SHUFFLE_ON_REFRESH = true` hardcoded, which makes it ALWAYS return
 * `Date.now()` regardless of any `selectedDate`/`userId` context passed in —
 * this is pre-existing production behavior, out of scope to change here (the
 * task's own instruction: no production code changes beyond extracting
 * buildMockProfile). A literal fixed seed is therefore not obtainable from
 * the outside. The `seed` column below stores THIS SCRIPT's own call-time
 * `Date.now()` (for row provenance/ordering only — it is close to but not
 * identical to whatever internal seed(s) getShuffleSeed produced during that
 * call, since it's invoked separately, sometimes twice, inside the pipeline).
 * Practical implication for 05-BENCHMARK.md: BLOCK SHAPES, applied protocols,
 * and resolved levels should be stable across a re-run (nothing else is
 * randomized); WHICH SPECIFIC exercise wins among near-tied score candidates
 * can differ between runs. Do not present a re-run as byte-reproducible.
 *
 * ── Real-call-site gap audit (David, 05.09.2026) — what changed and why ──
 * Compared this script's call against the 2 real production call sites
 * (StatsOverview.tsx's home carousel, UserWorkoutAdjuster's slider — both
 * ultimately call this same generateHomeWorkoutTrio, confirmed no parallel
 * engine exists) and the admin Workout Simulator. Found and fixed:
 *   1. `strictDomains: true` — REMOVED. No real caller ever sets it. It
 *      silently disables VerticalFoundation + HorizontalGuarantee + the
 *      domain-overflow fill path (home-workout.types.ts's own doc comment).
 *      Empirically moved full-body-without-core at 45min by ~20 points in a
 *      15-sample paired trace (66.7% with vs 46.7% without) — not dominant,
 *      but not negligible either.
 *   2. `requiredDomains` — now `undefined` by default (was always
 *      `['push','pull','legs']`-style). Neither the carousel nor the slider
 *      (unless the user explicitly picks muscle-group chips) ever sets this
 *      — `undefined` is the common real case, letting the engine
 *      auto-select domains. The old exhaustive 7-subset sweep survives as
 *      an opt-in (`SNAPSHOT_FORCE_DOMAINS=1`) for deliberately testing a
 *      specific chip-picked combination.
 *   3. `remainingWeeklyBudget` / `domainSetsCompletedThisWeek` /
 *      `remainingScheduleDays` — were absent from EVERY call this script
 *      (and the Simulator) has ever made. Budget Floor (recovery-mode
 *      override below a 6-set threshold) and Phase 4 Deficit Redistribution
 *      have never been exercised in any measurement to date, in either
 *      direction — not "assumed full budget," the checks simply never ran.
 *      Now simulated with plausible mid-week values (see
 *      SIMULATED_REMAINING_WEEKLY_BUDGET etc. below) — not real per-combo
 *      data (there is none to use here), just no longer silently absent.
 * NOT changed: `availableTime` still equals the requested duration exactly
 * (unlike the real carousel, which hardcodes 60 regardless of user choice —
 * see `isLateNightPivot`/StatsOverview.tsx:730-734 — because the engine's
 * own per-bolt caps + Volume Guard do the real trimming downstream; testing
 * `duration` directly here is closer to the SLIDER path, which does pass
 * the user's real chosen value). Every % reported from a snapshot built
 * BEFORE this fix should be treated as needing re-verification, not
 * discarded — the mechanical bugs found via those snapshots (warmup-role
 * leak, Part B leak, no_safe_victim) are independent of this gap.
 *
 * Run:  npx tsx scripts/audit/build-snapshot.ts
 * (Runs build-exercise-bridge.ts's output must already exist in
 * snapshot.sqlite — run that script first.)
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import Database from 'better-sqlite3';
import * as path from 'path';
import * as admin from 'firebase-admin';
import { buildMockProfile } from '../../src/features/workout-engine/shared/utils/mock-profile.utils';
import { generateHomeWorkoutTrio } from '../../src/features/workout-engine/services/home-workout.service';
import { getLocalizedText } from '../../src/features/content/exercises/core/exercise.types';

/**
 * Signs the client SDK's `auth` in via a Firebase Admin custom token, so
 * requests carry `request.auth != null` for rules like `programLevelSettings`
 * that require it. Read-only purpose — this script never writes to
 * Firestore (see file header). The uid is arbitrary and has no `users/{uid}`
 * document; nothing here reads one.
 */
async function authenticateHeadlessClient(): Promise<void> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local — required to mint a ' +
      'custom token for programLevelSettings reads (allow read: if isAuthenticated()).',
    );
  }
  const cred = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(cred as any), projectId: cred.project_id });

  const customToken = await admin.auth().createCustomToken('benchmark_snapshot_script');
  const { signInWithCustomToken } = await import('firebase/auth');
  const { auth } = await import('../../src/lib/firebase');
  await signInWithCustomToken(auth, customToken);
}

// Suppress the pipeline's own verbose console output (hundreds of lines per
// call) — this script's own progress lines go through the captured
// `rawWrite` reference below, which bypasses the override.
const rawWrite = process.stdout.write.bind(process.stdout);
console.log = () => {};
console.warn = () => {};
console.error = () => {};
console.group = () => {};
console.groupEnd = () => {};
console.table = () => {};
function report(msg: string) { rawWrite(`${msg}\n`); }

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DB_PATH = path.join(REPO_ROOT, 'scripts', 'audit', 'snapshot.sqlite');
const LEGACY_DB_PATH = path.join(REPO_ROOT, 'docs', 'workout-engine', 'legacy-workouts.sqlite');

// ============================================================================
// Matrix definition
// ============================================================================

// SNAPSHOT_SMOKE=1 shrinks the matrix for a fast end-to-end correctness check
// before committing to the full ~1260-call run. Not part of the task spec —
// a local verification aid only.
const SMOKE = process.env.SNAPSHOT_SMOKE === '1';

const LEVELS = SMOKE ? [1, 8] : [1, 3, 5, 8, 12];
const DURATIONS = SMOKE ? [20] : [15, 20, 30, 45];
const LOCATIONS: ('home' | 'park' | 'gym')[] = SMOKE ? ['park'] : ['home', 'park', 'gym'];
// David, 05.09.2026 (real-call-site gap investigation): NEITHER production
// (StatsOverview.tsx's home carousel) NOR the slider path (UserWorkoutAdjuster
// → generateHomeWorkout) ever passes requiredDomains unless the user
// explicitly picked muscle-group chips — the common case is `undefined`,
// letting the engine auto-select domains from the schedule. `undefined` is
// therefore the default matrix value now. `strictDomains:true` is REMOVED
// entirely (see the call below) — no real caller ever sets it; it silently
// disabled VerticalFoundation + HorizontalGuarantee + the domain-overflow
// fill path, and empirically moved the full-body-without-core rate at 45min
// by ~20 points (66.7% with strictDomains vs 46.7% without, 15-sample paired
// trace) — real numbers reported before this fix used the wrong mode.
// The old exhaustive 7-subset sweep (for deliberately testing a SPECIFIC
// domain combination, e.g. a user who picked "push" + "legs" chips) is kept
// as an explicit opt-in via SNAPSHOT_FORCE_DOMAINS=1 — not deleted, since
// that scenario IS real (the slider path when chips ARE picked), just not
// the default/common one.
const FORCE_DOMAINS = process.env.SNAPSHOT_FORCE_DOMAINS === '1';
const DOMAIN_SUBSETS: (string[] | undefined)[] = FORCE_DOMAINS
  ? (SMOKE
      ? [['push'], ['push', 'pull', 'legs']]
      : [
          ['push'], ['pull'], ['legs'],
          ['push', 'pull'], ['push', 'legs'], ['pull', 'legs'],
          ['push', 'pull', 'legs'],
        ])
  : [undefined];
const DAYS_INACTIVE = SMOKE ? [0] : [0, 3, 10];

// David, 05.09.2026: remainingWeeklyBudget/domainSetsCompletedThisWeek/
// remainingScheduleDays were absent from every call this script has ever
// made — Budget Floor (recovery-mode override) and Phase 4 Deficit
// Redistribution have NEVER been exercised in any measurement so far, in
// either direction. Simulating a plausible mid-week, non-exhausted state
// (not a real user's data — there's no per-combo "real" value to use here)
// so these two real production mechanisms are finally represented instead
// of silently skipped. Deliberately gives core LESS completed volume than
// push/pull/legs (2 vs 6) so Deficit Redistribution has real signal to act
// on for core specifically, not just an all-equal no-op. Comfortably above
// the <6 Budget Floor threshold so recovery-mode doesn't override every run.
// EXPECT NUMBERS TO MOVE — do not tune these to reproduce prior results.
const SIMULATED_REMAINING_WEEKLY_BUDGET = 20;
const SIMULATED_DOMAIN_SETS_COMPLETED_THIS_WEEK = { push: 6, pull: 6, legs: 6, core: 2 };
const SIMULATED_REMAINING_SCHEDULE_DAYS = 3;

const CONCURRENCY = 8;

// Same movementGroup→domain map the workout-simulator page uses for its own
// on-screen domain column (page.tsx MG_TO_DOMAIN) — reused verbatim so the
// snapshot's `domain` column matches what a human reviewing the simulator
// UI would see, not an independently-invented classification.
const MG_TO_DOMAIN: Record<string, string> = {
  vertical_pull: 'pull', horizontal_pull: 'pull',
  vertical_push: 'push', horizontal_push: 'push',
  squat: 'legs', hinge: 'legs', lunge: 'legs',
  core: 'core', anti_extension: 'core', anti_rotation: 'core',
};

interface Combo {
  level: number; duration: number; location: 'home' | 'park' | 'gym';
  domains: string[] | undefined; daysInactive: number;
}

function buildCombos(): Combo[] {
  const combos: Combo[] = [];
  for (const level of LEVELS)
    for (const duration of DURATIONS)
      for (const location of LOCATIONS)
        for (const domains of DOMAIN_SUBSETS)
          for (const daysInactive of DAYS_INACTIVE)
            combos.push({ level, duration, location, domains, daysInactive });
  return combos;
}

// ============================================================================
// Extract relaxed_constraints from pipelineLog (WorkoutGenerator.ts:459-460
// pushes exactly one line: `relaxed_constraints: [${...joined}]`).
// ============================================================================

function extractRelaxedConstraints(pipelineLog: string[] | undefined): string | null {
  if (!pipelineLog) return null;
  const line = pipelineLog.find(l => l.startsWith('relaxed_constraints: ['));
  if (!line) return null;
  const m = line.match(/relaxed_constraints: \[(.*)\]/);
  return m ? m[1] : null;
}

// ============================================================================
// Extract the core promise-validation outcome from pipelineLog
// (GuaranteePassRunner.validateCorePromise pushes exactly one
// `promise_validation:core:outcome=<satisfied|injected|replaced|failed>:...`
// line per workout — David, 05.09.2026: "אני רוצה שנמדוד את זה בשאילתה
// במקום לרדוף אחרי traces").
// ============================================================================

function extractCorePromiseOutcome(pipelineLog: string[] | undefined): string | null {
  if (!pipelineLog) return null;
  const line = pipelineLog.find(l => l.startsWith('promise_validation:core:'));
  if (!line) return null;
  const m = line.match(/outcome=([a-z_]+)/);
  return m ? m[1] : null;
}

// David, 05.09.2026: quantify the "no candidate within ±6" (no_candidate_within_band)
// open item without fixing it — the outcome alone collapses every failure reason
// (optional_below_20min / unassessed / empty_pool / no_candidate_within_band /
// no_safe_victim / victim_not_found) into one 'failed' bucket, so pull the reason too.
function extractCorePromiseReason(pipelineLog: string[] | undefined): string | null {
  if (!pipelineLog) return null;
  const line = pipelineLog.find(l => l.startsWith('promise_validation:core:'));
  if (!line) return null;
  const m = line.match(/reason=([a-z0-9_]+)/);
  return m ? m[1] : null;
}

// ============================================================================
// Run one combo → up to 3 workout rows + their exercises
// ============================================================================

interface WorkoutRow {
  run_id: string; seed: number; bolt: number;
  req_level: number; req_duration: number; req_location: string; req_domains: string;
  days_inactive: number; title: string; structure: string | null; applied_protocol: string | null;
  estimated_duration: number | null; total_planned_sets: number | null;
  chip_location: string; relaxed_constraints: string | null;
  core_promise_outcome: string | null; core_promise_reason: string | null;
}
interface ExerciseRow {
  run_id: string; position: number; exercise_id: string; name: string;
  exercise_role: string | null; domain: string | null; movement_group: string | null;
  resolved_level: number | null; user_domain_level: number | null; level_diff: number | null;
  sets: number | null; reps: number | null; is_time_based: number; rest_seconds: number | null;
  priority: string | null; score: number | null; method_location: string | null;
  paired_with: string | null; superset_type: string | null; protocol_block: string | null; pyramid_sequence: string | null;
  is_follow_along: number;
}

async function runCombo(combo: Combo, runIndex: number): Promise<{ workouts: WorkoutRow[]; exercises: ExerciseRow[] } | null> {
  const { level, duration, location, domains, daysInactive } = combo;
  // callId identifies the ONE generateHomeWorkoutTrio call (shared context/seed
  // across its 3 bolt options). workout_exercises has no `bolt` column, so
  // `run_id` must be unique PER GENERATED WORKOUT (call + bolt), not per call —
  // otherwise 3 bolts' exercise lists collapse into one ambiguous group sharing
  // overlapping `position` values. `workouts.run_id` uses this same per-bolt id;
  // `workouts.bolt` is kept as its own column too, matching the task's schema,
  // purely for convenient filtering without parsing the id.
  const callId = `r${runIndex}`;
  const callSeed = Date.now();

  const domainLevels = { pull: level, push: level, legs: level, core: level };
  const profile = buildMockProfile({
    level, persona: '', injuries: [],
    domainLevels, coldStart: false,
    gear: ['pullup_bar', 'dip_bar', 'parallel_bars'],
    activePrograms: [],
  });

  let result;
  try {
    result = await generateHomeWorkoutTrio({
      userProfile: profile,
      location,
      testLocation: location,
      availableTime: duration,
      difficulty: 2,
      daysInactiveOverride: daysInactive,
      requiredDomains: domains, // undefined by default — see DOMAIN_SUBSETS comment above
      // strictDomains: NOT passed — no real caller ever sets this (see above).
      remainingWeeklyBudget: SIMULATED_REMAINING_WEEKLY_BUDGET,
      domainSetsCompletedThisWeek: SIMULATED_DOMAIN_SETS_COMPLETED_THIS_WEEK,
      remainingScheduleDays: SIMULATED_REMAINING_SCHEDULE_DAYS,
      skipCycleRestart: true,
    } as any);
  } catch (err: any) {
    report(`  ERROR ${callId} (L${level} d${duration} ${location} [${domains?.join(',') ?? 'auto'}] inactive${daysInactive}): ${err?.message ?? err}`);
    return null;
  }

  const workouts: WorkoutRow[] = [];
  const exercises: ExerciseRow[] = [];

  result.options.forEach((opt: any, boltIdx: number) => {
    if (!opt?.result?.workout) return; // needsAssessment / null slot
    const w = opt.result.workout;
    const runId = `${callId}_b${boltIdx + 1}`; // unique per generated workout — see comment above
    workouts.push({
      run_id: runId, seed: callSeed, bolt: boltIdx + 1,
      req_level: level, req_duration: duration, req_location: location,
      req_domains: domains?.join(',') || 'auto', days_inactive: daysInactive,
      title: w.title ?? '', structure: w.structure ?? null,
      applied_protocol: w.appliedProtocol ?? null,
      estimated_duration: w.estimatedDuration ?? null,
      total_planned_sets: w.totalPlannedSets ?? null,
      chip_location: location, // see script header — pipeline logs confirm requested location is "honored"
      relaxed_constraints: extractRelaxedConstraints(w.pipelineLog),
      core_promise_outcome: extractCorePromiseOutcome(w.pipelineLog),
      core_promise_reason: extractCorePromiseReason(w.pipelineLog),
    });

    (w.exercises ?? []).forEach((ex: any, pos: number) => {
      const mg = ex.exercise?.movementGroup ?? null;
      const domain = mg ? (MG_TO_DOMAIN[mg] ?? 'other') : null;
      const userDomainLevel = domain && domain in domainLevels ? (domainLevels as any)[domain] : null;
      exercises.push({
        run_id: runId, position: pos,
        exercise_id: ex.exercise?.id ?? '', name: getLocalizedText(ex.exercise?.name) ?? '',
        exercise_role: ex.exerciseRole ?? null, domain, movement_group: mg,
        resolved_level: ex.programLevel ?? null, user_domain_level: userDomainLevel,
        level_diff: ex.levelDelta ?? null,
        sets: ex.sets ?? null, reps: ex.reps ?? null,
        is_time_based: ex.isTimeBased ? 1 : 0, rest_seconds: ex.restSeconds ?? null,
        priority: ex.priority ?? null, score: ex.score ?? null,
        method_location: ex.method?.location ?? null,
        paired_with: ex.pairedWith ?? null, superset_type: ex.supersetType ?? null,
        protocol_block: ex.protocolBlock ?? null,
        pyramid_sequence: ex.pyramidSequence ? JSON.stringify(ex.pyramidSequence.map((s: any) => ({ setIndex: s.setIndex, level: s.level }))) : null,
        is_follow_along: ex.exercise?.isFollowAlong ? 1 : 0,
      });
    });
  });

  return { workouts, exercises };
}

// ============================================================================
// Schema
// ============================================================================

function createSchema(db: Database.Database) {
  db.exec(`
    DROP TABLE IF EXISTS workouts;
    DROP TABLE IF EXISTS workout_exercises;
    CREATE TABLE workouts (
      run_id TEXT, seed INTEGER, bolt INTEGER,
      req_level INTEGER, req_duration INTEGER, req_location TEXT, req_domains TEXT,
      days_inactive INTEGER, title TEXT, structure TEXT, applied_protocol TEXT,
      estimated_duration INTEGER, total_planned_sets INTEGER,
      chip_location TEXT, relaxed_constraints TEXT, core_promise_outcome TEXT, core_promise_reason TEXT
    );
    CREATE TABLE workout_exercises (
      run_id TEXT, position INTEGER, exercise_id TEXT, name TEXT,
      exercise_role TEXT, domain TEXT, movement_group TEXT,
      resolved_level INTEGER, user_domain_level INTEGER, level_diff REAL,
      sets INTEGER, reps INTEGER, is_time_based INTEGER, rest_seconds INTEGER,
      priority TEXT, score REAL, method_location TEXT,
      paired_with TEXT, superset_type TEXT, protocol_block TEXT, pyramid_sequence TEXT,
      is_follow_along INTEGER
    );
    CREATE INDEX idx_we_run_id ON workout_exercises(run_id);
    CREATE INDEX idx_we_exercise_id ON workout_exercises(exercise_id);
    CREATE INDEX idx_w_run_id ON workouts(run_id);
  `);
}

function copyLegacyTables(db: Database.Database) {
  db.exec(`ATTACH DATABASE '${LEGACY_DB_PATH.replace(/'/g, "''")}' AS legacy`);
  const tables = ['workouts', 'workout_sets', 'set_exercises', 'exercises', 'levels', 'targets'];
  for (const t of tables) {
    const newName = `legacy_${t}`;
    db.exec(`DROP TABLE IF EXISTS ${newName}`);
    db.exec(`CREATE TABLE ${newName} AS SELECT * FROM legacy.${t}`);
  }
  db.exec(`DETACH DATABASE legacy`);
  report(`Copied legacy tables into snapshot.sqlite: ${tables.map(t => 'legacy_' + t).join(', ')}`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  report('Authenticating headless client (custom token) so programLevelSettings reads succeed...');
  await authenticateHeadlessClient();
  report('Authenticated.');

  const combos = buildCombos();
  report(`Matrix: ${LEVELS.length} levels × ${DURATIONS.length} durations × ${LOCATIONS.length} locations × ${DOMAIN_SUBSETS.length} domain-subsets × ${DAYS_INACTIVE.length} daysInactive = ${combos.length} calls (×3 bolts each, free per call)`);
  report(`Concurrency: ${CONCURRENCY}`);

  const db = new Database(SNAPSHOT_DB_PATH);
  createSchema(db);

  const insertWorkout = db.prepare(`
    INSERT INTO workouts (run_id, seed, bolt, req_level, req_duration, req_location, req_domains, days_inactive, title, structure, applied_protocol, estimated_duration, total_planned_sets, chip_location, relaxed_constraints, core_promise_outcome, core_promise_reason)
    VALUES (@run_id, @seed, @bolt, @req_level, @req_duration, @req_location, @req_domains, @days_inactive, @title, @structure, @applied_protocol, @estimated_duration, @total_planned_sets, @chip_location, @relaxed_constraints, @core_promise_outcome, @core_promise_reason)
  `);
  const insertExercise = db.prepare(`
    INSERT INTO workout_exercises (run_id, position, exercise_id, name, exercise_role, domain, movement_group, resolved_level, user_domain_level, level_diff, sets, reps, is_time_based, rest_seconds, priority, score, method_location, paired_with, superset_type, protocol_block, pyramid_sequence, is_follow_along)
    VALUES (@run_id, @position, @exercise_id, @name, @exercise_role, @domain, @movement_group, @resolved_level, @user_domain_level, @level_diff, @sets, @reps, @is_time_based, @rest_seconds, @priority, @score, @method_location, @paired_with, @superset_type, @protocol_block, @pyramid_sequence, @is_follow_along)
  `);
  const insertBatch = db.transaction((workouts: WorkoutRow[], exercises: ExerciseRow[]) => {
    for (const w of workouts) insertWorkout.run(w as any);
    for (const e of exercises) insertExercise.run(e as any);
  });

  const t0 = Date.now();
  let idx = 0;
  let completed = 0;
  let errorCount = 0;
  let totalWorkouts = 0;
  let totalExercises = 0;

  async function worker() {
    while (idx < combos.length) {
      const my = idx++;
      const res = await runCombo(combos[my], my);
      if (res === null) { errorCount++; } else {
        insertBatch(res.workouts, res.exercises);
        totalWorkouts += res.workouts.length;
        totalExercises += res.exercises.length;
      }
      completed++;
      if (completed % 50 === 0 || completed === combos.length) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = completed / elapsed;
        const eta = (combos.length - completed) / rate;
        report(`  [${completed}/${combos.length}] elapsed=${elapsed.toFixed(0)}s eta=${eta.toFixed(0)}s errors=${errorCount} workouts=${totalWorkouts} exercises=${totalExercises}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const totalElapsed = (Date.now() - t0) / 1000;
  report(`\nDone in ${totalElapsed.toFixed(0)}s (${(totalElapsed / 60).toFixed(1)} min). Calls: ${combos.length}, errors: ${errorCount}. workouts=${totalWorkouts}, workout_exercises=${totalExercises}`);

  copyLegacyTables(db);
  db.close();
  process.exit(0);
}

main();

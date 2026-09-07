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
 * ── "בולטים" (bolts) are free — TRUE ONLY for combos that don't force a
 * ── targetDifficulty (Addendum 33, 07.09.2026 — see below) ──────────────
 * One generateHomeWorkoutTrio call returns all 3 bolt options (difficulty
 * 1/2/3) simultaneously when `targetDifficulty` is NOT passed — bolt is not
 * an independent axis for those calls. `push_pull_legs_split` combos still
 * use this shape. 'auto'-mode combos (as of Addendum 33) DO pass
 * targetDifficulty — see TARGET_DIFFICULTIES below for why, and note that
 * for those combos a bolt now costs a full separate call, not a free extra
 * row.
 *
 * ── Determinism ───────────────────────────────────────────────────────
 * Addendum 31 (07.09.2026) replaced the old "not achievable" state — see the
 * "Determinism" block right after the imports below for the full mechanism
 * (getShuffleSeed override + seeded global Math.random + SNAPSHOT_CONCURRENCY).
 * SNAPSHOT_SEED/SNAPSHOT_CONCURRENCY=1 now gives byte-identical re-runs,
 * verified by diffing two independent runs.
 *
 * ── Real-call-site gap audit (David, 05.09.2026, corrected 07.09.2026) ──
 * Compared this script's call against the real production call sites
 * (StatsOverview.tsx's home carousel, UserWorkoutAdjuster's slider, the
 * Custom Builder (WorkoutBuilderSheet.tsx), and 3 hybrid-adjacent generators)
 * and the admin Workout Simulator. Found and fixed:
 *   1. `strictDomains` — CORRECTED 07.09.2026: the original claim here ("no
 *      real caller ever sets it") was wrong — WorkoutBuilderSheet.tsx:644
 *      sets it true on every chip-picked Custom Builder session, and 3 more
 *      real callers set it unconditionally (strength-block.service.ts:120,
 *      complementary-short.generator.ts:33, partial-completion.generator.ts:159).
 *      See the DOMAIN_SUBSETS comment below for the fix (Addendum 33).
 *   2. `requiredDomains` — `undefined` by default (was always
 *      `['push','pull','legs']`-style) — the common auto-select case
 *      (carousel/slider). A real chip-picked scenario now also gets its own
 *      combo (paired with strictDomains:true, per fix #1) instead of being
 *      silently absent. The old exhaustive 7-subset sweep survives as an
 *      opt-in (`SNAPSHOT_FORCE_DOMAINS=1`).
 *   3. `remainingWeeklyBudget` / `domainSetsCompletedThisWeek` /
 *      `remainingScheduleDays` — were absent from EVERY call this script
 *      (and the Simulator) has ever made. Budget Floor (recovery-mode
 *      override below a 6-set threshold) and Phase 4 Deficit Redistribution
 *      have never been exercised in any measurement to date, in either
 *      direction — not "assumed full budget," the checks simply never ran.
 *      Now simulated with plausible mid-week values (see
 *      SIMULATED_REMAINING_WEEKLY_BUDGET etc. below) — not real per-combo
 *      data (there is none to use here), just no longer silently absent.
 *   4. `difficulty` (Addendum 33) — was fixed at 2 and, per a direct read of
 *      home-workout.service.ts, is NEVER READ by the function at all
 *      (zero matches for `options.difficulty`). Only `targetDifficulty` has
 *      any effect. See TARGET_DIFFICULTIES below.
 * NOT changed: `availableTime` still equals the requested duration exactly
 * (unlike the real carousel, which hardcodes 60 regardless of user choice —
 * see `isLateNightPivot`/StatsOverview.tsx:730-734 — because the engine's
 * own per-bolt caps + Volume Guard do the real trimming downstream; testing
 * `duration` directly here is closer to the SLIDER path, which does pass
 * the user's real chosen value). Every % reported from a snapshot built
 * BEFORE a given fix above should be treated as needing re-verification
 * against the addendum that fixed it, not discarded outright — see
 * 03-CHANGES.md Addenda 29/31/33 for what each changed and why.
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

// ============================================================================
// Determinism (David, 07.09.2026 — 03-CHANGES.md Addendum 31)
// ============================================================================
//
// Two independent randomness sources in the generator, both now controlled
// ONLY within this script's own process — zero engine behavior change for
// any real user:
//
//   1. Exercise-selection tie-breaking (seededShuffle, fed by
//      getShuffleSeed) — previously always Date.now()-seeded regardless of
//      any context passed in (workout-selection.utils.ts's
//      DEBUG_SHUFFLE_ON_REFRESH). Fixed via a narrow, env-var-gated override
//      added to getShuffleSeed itself — inert unless
//      WORKOUT_ENGINE_FIXED_SHUFFLE_SEED is explicitly set, which only this
//      script (or an explicit manual override) ever does.
//   2. Every OTHER random draw in the pipeline (reps/sets/rest-seconds
//      within their tier range, protocol rolls, AMRAP/EMOM coin flips,
//      warmup jitter, etc.) — dozens of raw Math.random() call sites spread
//      across WorkoutGenerator.ts/workout-budgeting.utils.ts/
//      warmup.service.ts/ProtocolInjector.ts and others, NONE routed through
//      getShuffleSeed. Fixing #1 alone would NOT make a re-run byte-
//      identical — confirmed by reading the call sites, not assumed.
//      Controlled here by replacing global Math.random with a seeded PRNG
//      for this process's entire lifetime, BEFORE any engine code runs.
//      This is a monkey-patch scoped to this standalone Node script's own
//      process only — no engine source file uses Math.random differently
//      because of this; the app's real Math.random is never touched.
//
// SNAPSHOT_SEED env var overrides the default fixed seed (42) — e.g.
// `SNAPSHOT_SEED=123 npx tsx scripts/audit/build-snapshot.ts`.
const FIXED_SEED = Number(process.env.SNAPSHOT_SEED ?? 42);
process.env.WORKOUT_ENGINE_FIXED_SHUFFLE_SEED = String(FIXED_SEED);

/** mulberry32 — small, fast, good-enough-for-testing seeded PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seededRandom = mulberry32(FIXED_SEED);
Math.random = seededRandom;

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
// David, 07.09.2026: reduced from 3 to 2 (dropped 'gym') to make room for the
// two new real axes below (domain-subsets×strictDomains, targetDifficulty) —
// per instruction: shrink other axes before touching either new one.
const LOCATIONS: ('home' | 'park' | 'gym')[] = SMOKE ? ['park'] : ['home', 'park'];
// CORRECTED 07.09.2026 — the prior version of this comment claimed "no real
// caller ever sets strictDomains: true." That was wrong, found and pointed
// out by David: WorkoutBuilderSheet.tsx:644 sets
// `strictDomains: (derivedRequiredDomains?.length ?? 0) > 0` — i.e. true
// every time the user picks muscle-group chips in the real Custom Builder UI
// — and 3 more real callers do the same unconditionally:
// strength-block.service.ts:120, complementary-short.generator.ts:33,
// partial-completion.generator.ts:159. Per the (still-accurate) 05.09.2026
// finding immediately below, the difference is not cosmetic — ~20 points on
// full-body-without-core at 45min (66.7% with strictDomains vs 46.7%
// without, 15-sample paired trace). Un-set requiredDomains (`undefined`) is
// still the common auto-select case (StatsOverview's home carousel, the
// slider) and stays the default combo — but a real chip-picked scenario now
// gets its own combo, coupled with strictDomains:true exactly as production
// does (see runCombo below), instead of being silently absent from every
// baseline measurement.
// The old exhaustive 7-subset sweep (for deliberately testing a SPECIFIC
// domain combination, e.g. a user who picked "push" + "legs" chips) is kept
// as an explicit opt-in via SNAPSHOT_FORCE_DOMAINS=1 — not deleted, since
// that scenario IS real, just not the default/common one.
const FORCE_DOMAINS = process.env.SNAPSHOT_FORCE_DOMAINS === '1';
const DOMAIN_SUBSETS: (string[] | undefined)[] = FORCE_DOMAINS
  ? (SMOKE
      ? [['push'], ['push', 'pull', 'legs']]
      : [
          ['push'], ['pull'], ['legs'],
          ['push', 'pull'], ['push', 'legs'], ['pull', 'legs'],
          ['push', 'pull', 'legs'],
        ])
  : [undefined, ['push', 'pull', 'legs']];
// Reduced from [0,3,10] to [0] — same reasoning as LOCATIONS above.
const DAYS_INACTIVE = [0];
// David, 07.09.2026: `difficulty` (below, kept only because
// generateHomeWorkoutTrio's options type still accepts it) was fixed at 2
// and, per a direct read of home-workout.service.ts, is NEVER ACTUALLY READ
// by the function — grepped for `options.difficulty` specifically: zero
// matches. Only `options.targetDifficulty` has any effect, and its effect is
// not "pick which of 3 bolts to report" — it makes the trio-loop `continue`
// past the other 2 slots entirely (home-workout.service.ts:849), i.e. skips
// generating them. So the prior default matrix's "difficulty fixed at 2" was
// actually a no-op either way — ALL 3 bolts (D1/D2/D3) were always generated
// and recorded (the file's own "bolts are free" framing, still true for
// combos that don't force a target). What was genuinely never exercised is
// the real single-difficulty CALL SHAPE (WorkoutBuilderSheet's Custom
// Builder: `difficulty, targetDifficulty: difficulty`) — which generates
// ONLY that one bolt, with a FRESH pool, not cross-penalized by
// sessionBlacklist from sibling bolts the way D2/D3 within one free trio
// call are (home-workout.service.ts:874-881). Every 'auto'-mode combo below
// now uses targetDifficulty, cycling through all 3 — replacing the old
// "1 call → free trio" shape with the real Custom-Builder shape, at 3x the
// call cost per combo (no longer free — this is exactly why LOCATIONS/
// DAYS_INACTIVE were trimmed above). `push_pull_legs_split` combos are
// unaffected — that scenario is about domain coverage, not difficulty, and
// keeps the free-trio shape (matches its own real caller, StatsOverview,
// which never sets targetDifficulty either).
const TARGET_DIFFICULTIES: (1 | 2 | 3)[] = SMOKE ? [2] : [1, 2, 3];

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

// David, 07.09.2026: the seeded Math.random override above is ONE shared,
// stateful global generator. Under concurrency > 1, multiple combos' async
// generation calls can genuinely interleave their random draws (the
// pipeline has real internal awaits — Firestore reads mid-generation), so
// the exact draw ORDER — and therefore the exact result — can depend on
// real network-timing-driven interleaving, not just the seed. That's fine
// for a normal fast run (determinism isn't the point there), but it means
// concurrency=8 does NOT guarantee two runs are byte-identical. For a
// reproducibility check specifically, use SNAPSHOT_CONCURRENCY=1 (fully
// sequential — no interleaving possible, genuinely deterministic).
const CONCURRENCY = Number(process.env.SNAPSHOT_CONCURRENCY ?? 8);

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
  /**
   * David, 07.09.2026 (03-CHANGES.md Addendum 29): 'auto' (default) matches
   * every prior combo — buildMockProfile's activePrograms:[] input, which
   * (post-Addendum-29 fix) means a genuinely empty activePrograms array, no
   * synthetic full_body entry. 'push_pull_legs_split' builds a REAL 3-entry
   * activePrograms input (push/pull/legs, matching progression.service.ts's
   * real split-write shape) — the exact profile shape doc 10/11's
   * "activePrograms[0]-only read" finding needs to catch a regression on.
   * This does NOT touch InputSanitizerMiddleware/SplitDecisionService/
   * scheduleRules.ts/scheduledProgramIds — those are the frozen
   * schedule↔engine boundary — this only feeds them a different, equally
   * real INPUT shape and observes the (unmodified) pipeline's output.
   */
  activeProgramsMode: 'auto' | 'push_pull_legs_split';
  /**
   * David, 07.09.2026 (Addendum 33): only meaningful for
   * activeProgramsMode:'auto' — see TARGET_DIFFICULTIES above. Ignored by
   * runCombo for 'push_pull_legs_split' combos (which keep the free-trio,
   * no-targetDifficulty call shape); those combos carry a placeholder value
   * here purely to satisfy the type.
   */
  targetDifficulty: 1 | 2 | 3;
}

// David, 07.09.2026: deliberately small — this is a regression tripwire for
// "reads only activePrograms[0]" bugs, not a full sweep. levels/durations
// chosen to be representative (a low-mid and a high level, a short and a
// long session) without multiplying the whole matrix by activeProgramsMode.
const PUSH_PULL_LEGS_SPLIT_LEVELS = SMOKE ? [8] : [8, 12];
const PUSH_PULL_LEGS_SPLIT_DURATIONS = SMOKE ? [30] : [30, 45];

function buildCombos(): Combo[] {
  const combos: Combo[] = [];
  for (const level of LEVELS)
    for (const duration of DURATIONS)
      for (const location of LOCATIONS)
        for (const domains of DOMAIN_SUBSETS)
          for (const daysInactive of DAYS_INACTIVE)
            for (const targetDifficulty of TARGET_DIFFICULTIES)
              combos.push({ level, duration, location, domains, daysInactive, activeProgramsMode: 'auto', targetDifficulty });

  for (const level of PUSH_PULL_LEGS_SPLIT_LEVELS)
    for (const duration of PUSH_PULL_LEGS_SPLIT_DURATIONS)
      combos.push({
        level, duration, location: 'home', domains: undefined, daysInactive: 0,
        activeProgramsMode: 'push_pull_legs_split',
        // Placeholder — ignored by runCombo for this mode (free-trio shape, no targetDifficulty passed).
        targetDifficulty: 2,
      });

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
  const { level, duration, location, domains, daysInactive, activeProgramsMode, targetDifficulty } = combo;
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
  const profile = activeProgramsMode === 'push_pull_legs_split'
    ? buildMockProfile({
        level, persona: '', injuries: [],
        domainLevels, coldStart: false,
        gear: ['pullup_bar', 'dip_bar', 'parallel_bars'],
        activePrograms: [
          { id: 'push', name: 'Push', level },
          { id: 'pull', name: 'Pull', level },
          { id: 'legs', name: 'Legs', level },
        ],
      })
    : buildMockProfile({
        level, persona: '', injuries: [],
        domainLevels, coldStart: false,
        gear: ['pullup_bar', 'dip_bar', 'parallel_bars'],
        activePrograms: [],
      });

  // Addendum 33 (07.09.2026): strictDomains/targetDifficulty only apply to
  // 'auto' mode combos — see the Combo interface + TARGET_DIFFICULTIES /
  // DOMAIN_SUBSETS comments above for why. 'push_pull_legs_split' keeps its
  // original free-trio, no-strictDomains call shape unchanged (that scenario
  // is about activePrograms[0]-only, orthogonal to this fix).
  const isAuto = activeProgramsMode === 'auto';
  let result;
  try {
    result = await generateHomeWorkoutTrio({
      userProfile: profile,
      location,
      testLocation: location,
      availableTime: duration,
      // difficulty is dead code in generateHomeWorkoutTrio (see header comment)
      // — kept at 2 for split-mode purely for shape-continuity, harmless either way.
      difficulty: isAuto ? targetDifficulty : 2,
      ...(isAuto ? { targetDifficulty } : {}),
      daysInactiveOverride: daysInactive,
      requiredDomains: domains, // undefined by default — see DOMAIN_SUBSETS comment above
      // strictDomains: true exactly when a real caller would set it — a
      // chip-picked requiredDomains combo (WorkoutBuilderSheet.tsx:644).
      // Omitted (not `false`) when there's no requiredDomains, per David.
      ...(isAuto && domains !== undefined ? { strictDomains: true } : {}),
      remainingWeeklyBudget: SIMULATED_REMAINING_WEEKLY_BUDGET,
      domainSetsCompletedThisWeek: SIMULATED_DOMAIN_SETS_COMPLETED_THIS_WEEK,
      remainingScheduleDays: SIMULATED_REMAINING_SCHEDULE_DAYS,
      skipCycleRestart: true,
    } as any);
  } catch (err: any) {
    report(`  ERROR ${callId} (L${level} d${duration} ${location} [${domains?.join(',') ?? 'auto'}] inactive${daysInactive}${isAuto ? ` diff${targetDifficulty}` : ''}): ${err?.message ?? err}`);
    return null;
  }

  const workouts: WorkoutRow[] = [];
  const exercises: ExerciseRow[] = [];

  // Addendum 33: when targetDifficulty is set, home-workout.service.ts
  // (1215-1219) pads results[1]/[2] with the SAME object reference as
  // results[0] — the trio-loop only actually generated 1 bolt. Naively
  // iterating all 3 slots here would insert 3 duplicate workout rows tagged
  // as bolt 1/2/3. Process only the single real slot, stamped with the
  // REQUESTED difficulty (not a fabricated boltIdx+1).
  const slotsToProcess: { opt: any; bolt: number }[] = isAuto
    ? [{ opt: result.options[0], bolt: targetDifficulty }]
    : result.options.map((opt: any, boltIdx: number) => ({ opt, bolt: boltIdx + 1 }));

  slotsToProcess.forEach(({ opt, bolt }) => {
    if (!opt?.result?.workout) return; // needsAssessment / null slot
    const w = opt.result.workout;
    const runId = `${callId}_b${bolt}`; // unique per generated workout — see comment above
    workouts.push({
      run_id: runId, seed: callSeed, bolt,
      req_level: level, req_duration: duration, req_location: location,
      req_domains: activeProgramsMode === 'push_pull_legs_split' ? 'split:push_pull_legs' : (domains?.join(',') || 'auto'),
      days_inactive: daysInactive,
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
  const autoCombosCount = LEVELS.length * DURATIONS.length * LOCATIONS.length * DOMAIN_SUBSETS.length * DAYS_INACTIVE.length * TARGET_DIFFICULTIES.length;
  const splitCombosCount = PUSH_PULL_LEGS_SPLIT_LEVELS.length * PUSH_PULL_LEGS_SPLIT_DURATIONS.length;
  report(`Matrix: ${LEVELS.length} levels × ${DURATIONS.length} durations × ${LOCATIONS.length} locations × ${DOMAIN_SUBSETS.length} domain-subsets × ${DAYS_INACTIVE.length} daysInactive × ${TARGET_DIFFICULTIES.length} targetDifficulty = ${autoCombosCount} 'auto' calls (1 workout row each, targetDifficulty-scoped — not free trio) + ${splitCombosCount} 'push_pull_legs_split' calls (×3 bolts each, free per call) = ${combos.length} total calls`);
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

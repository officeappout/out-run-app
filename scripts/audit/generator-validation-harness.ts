/**
 * scripts/audit/generator-validation-harness.ts — READ-ONLY generator validation sweep.
 *
 * Calls the real `generateHomeWorkoutTrio` (home-workout.service.ts) across a
 * program×level×duration×difficulty grid — the FULL assembled workout
 * (warmup + main + cooldown), not just the exercise pool. Extends the
 * #117 pool-only skill-leak check (skill-eligibility-generator-e2e.test.ts)
 * to the real assembled output, and extends `scripts/audit/build-snapshot.ts`'s
 * proven full-assembly-caller approach to the 7 SKILL programs it only
 * token-tests today (one scenario, front_lever L1).
 *
 * Zero Firestore writes: every call passes `skipCycleRestart: true`, the
 * ONLY write path inside generateHomeWorkoutTrio (same guarantee
 * build-snapshot.ts documents and relies on). Firestore READS (catalog,
 * programs, programLevelSettings, onboarding level counts) are required —
 * there's no way to run the real engine without them — but this script
 * itself writes nothing to Firestore and persists nothing to git. The only
 * output is one markdown report written to a scratch directory (env
 * GEN_VALIDATION_OUT_DIR, default os.tmpdir()).
 *
 * ── Deliberate divergence from build-snapshot.ts: NO seeded Math.random ──
 * build-snapshot.ts seeds Math.random for byte-identical reproducibility.
 * This harness's Variety checks exist specifically to MEASURE whether
 * identical inputs produce identical outputs — seeding would make that
 * question unanswerable by construction. Real (unseeded) randomness is used
 * throughout.
 *
 * ── Staged execution with fail-fast (approved plan, 2026-10-04) ──────────
 *   Stage 0 — probe real per-program authored level ceilings (no generation)
 *   Stage 1 — ~10 hand-picked smoke combos, 3 reruns each (repeatability)
 *   Stage 2 — one combo per program×level (55 calls)
 *   Stage 3 — full grid (825 calls) + 11 location spot-checks (home)
 * Fail-fast: abort immediately on (a) the SAME hard rule failing on 3
 * consecutive combos, (b) ≥10% of a stage's combos failing any hard rule
 * (once ≥10 combos processed in that stage), or (c) any uncaught
 * exception/crash from the engine call itself. `no_core_assessment` is
 * tracked as a SOFT/known-issue rule (see below) and never trips fail-fast.
 *
 * Run (default — all stages, gated):
 *   npx tsx scripts/audit/generator-validation-harness.ts
 * Single stage:
 *   GEN_VALIDATION_STAGE=2 npx tsx scripts/audit/generator-validation-harness.ts
 * Custom output dir:
 *   GEN_VALIDATION_OUT_DIR=/tmp/foo npx tsx scripts/audit/generator-validation-harness.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import * as admin from 'firebase-admin';
import { buildMockProfile, type ActiveProgramItem } from '../../src/features/workout-engine/shared/utils/mock-profile.utils';
import { generateHomeWorkoutTrio } from '../../src/features/workout-engine/services/home-workout.service';
import { getLocalizedText } from '../../src/features/content/exercises/core/exercise.types';
import { DOMAIN_RESOLUTION_SKILL_PARENT_MAP } from '../../src/features/workout-engine/logic/workout-selection.utils';
import { resolveToSlug } from '../../src/features/workout-engine/services/program-hierarchy.utils';
import { MG_TO_DOMAIN } from '../../src/features/workout-engine/shared/constants/domain-mapping.constants';
import { getExerciseCountForDuration } from '../../src/features/workout-engine/logic/workout-budgeting.utils';
import { applyDomainPrioritySort } from '../../src/features/workout-engine/logic/workout-sorting.utils';
import { getOnboardingLevelsForCategory } from '../../src/features/user/onboarding/services/visual-content-resolver.service';

// ============================================================================
// Auth (verbatim pattern from build-snapshot.ts — programLevelSettings
// requires isAuthenticated(); read-only purpose, arbitrary uid, no write)
// ============================================================================

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
  const customToken = await admin.auth().createCustomToken('generator_validation_harness');
  const { signInWithCustomToken } = await import('firebase/auth');
  const { auth } = await import('../../src/lib/firebase');
  await signInWithCustomToken(auth, customToken);
}

// Suppress the pipeline's own verbose console output — this script's own
// progress lines go through `rawWrite`, bypassing the override.
const rawWrite = process.stdout.write.bind(process.stdout);
console.log = () => {};
console.warn = () => {};
console.error = () => {};
console.group = () => {};
console.groupEnd = () => {};
console.table = () => {};
function report(msg: string) { rawWrite(`${msg}\n`); }

// ============================================================================
// Program definitions (11 real programs — see plan: 4 foundational + 7 skill)
// ============================================================================

interface ProgramDef {
  id: string;
  kind: 'foundational' | 'skill';
  /** For 'skill': which foundational domain(s) receive the derived level
   *  (level + SKILL_TO_FOUNDATION_OFFSET), mirroring onboarding-sync's real
   *  SKILL_TO_FOUNDATION_OFFSET=9 and build-snapshot.ts's own
   *  'skill_only_front_lever' precedent. */
  parentDomains: string[];
  /** Annotation only — does not change combo construction or gating. */
  note?: string;
}

const SKILL_TO_FOUNDATION_OFFSET = 9;

const PROGRAM_DEFS: ProgramDef[] = [
  { id: 'push', kind: 'foundational', parentDomains: ['push'] },
  { id: 'pull', kind: 'foundational', parentDomains: ['pull'] },
  { id: 'legs', kind: 'foundational', parentDomains: ['legs'] },
  { id: 'core', kind: 'foundational', parentDomains: ['core'] },
  { id: 'calisthenics_upper', kind: 'skill', parentDomains: ['push', 'pull'] },
  { id: 'front_lever', kind: 'skill', parentDomains: ['pull'] },
  { id: 'muscle_up', kind: 'skill', parentDomains: ['pull'] },
  { id: 'one_arm_pullup', kind: 'skill', parentDomains: ['pull'] },
  { id: 'planche', kind: 'skill', parentDomains: ['push'] },
  { id: 'hspu', kind: 'skill', parentDomains: ['push'] },
  {
    id: 'handstand', kind: 'skill', parentDomains: ['push'],
    note: 'Frozen for NEW onboarding selection (PR #117, merged 2026-10-04) — ' +
      'not reachable via skill-picker for new users. This harness simulates an ' +
      'EXISTING user who already has a handstand track (a real, still-generator-' +
      'reachable scenario) by constructing the profile directly. A result here is ' +
      'NOT a regression of the freeze — it is the freeze working as designed ' +
      '(new selection blocked; existing trackers unaffected).',
  },
];

// Representative levels — grounded in RestCalculator.ts's own
// beginner/intermediate/advanced/elite bands (≤5/≤10/≤15/≤22), not arbitrary.
const LEVELS = [1, 5, 10, 15, 22];
// Representative durations — hit every getExerciseCountForDuration tier
// boundary (≤10/≤20/≤30/≤45/>45); build-snapshot.ts's own [15,20,30,45]
// misses both end tiers.
const DURATIONS = [10, 20, 30, 45, 60];
const DIFFICULTIES: (1 | 2 | 3)[] = [1, 2, 3];
const PRIMARY_LOCATION = 'park' as const;
const SPOT_CHECK_LOCATION = 'home' as const;

// ============================================================================
// Combo + profile construction
// ============================================================================

interface Combo {
  stage: 1 | 2 | 3;
  program: ProgramDef;
  level: number;
  duration: number;
  difficulty: 1 | 2 | 3;
  location: 'park' | 'home';
}

function comboLabel(c: Combo): string {
  return `${c.program.id} L${c.level} ${c.duration}min D${c.difficulty} @${c.location}`;
}

function buildProfileAndOptions(c: Combo): {
  profile: ReturnType<typeof buildMockProfile>;
  requiredDomains: string[] | undefined;
  strictDomains: boolean;
  assessedSkillIds: Set<string>;
  coreAssessed: boolean;
} {
  const gear = ['pullup_bar', 'dip_bar', 'parallel_bars'];

  if (c.program.kind === 'foundational') {
    // Mirrors build-snapshot.ts's dedicated 'no_core_assessment' combo shape:
    // core is genuinely OMITTED (key absent, not 0) unless core IS the
    // program under test — this is the exact real-shape trigger for the
    // known no_core_assessment rubber-stamp issue (see RUBRIC_RULES.S1).
    const domainLevels: Record<string, number> = { push: c.level, pull: c.level, legs: c.level };
    if (c.program.id === 'core') domainLevels.core = c.level;
    const profile = buildMockProfile({
      level: c.level, persona: '', injuries: [], domainLevels, coldStart: false,
      gear, activePrograms: [],
    });
    return {
      profile, requiredDomains: [c.program.id], strictDomains: true,
      assessedSkillIds: new Set(), coreAssessed: c.program.id === 'core',
    };
  }

  const domainLevels: Record<string, number> = {};
  for (const parent of c.program.parentDomains) domainLevels[parent] = c.level + SKILL_TO_FOUNDATION_OFFSET;
  const activePrograms: ActiveProgramItem[] = [{ id: c.program.id, name: c.program.id, level: c.level }];
  const profile = buildMockProfile({
    level: c.level, persona: '', injuries: [], domainLevels, coldStart: false,
    gear, activePrograms,
  });
  // Same correction build-snapshot.ts applies for 'skill_only_front_lever':
  // buildMockProfile unconditionally stamps domains.full_body — wrong for a
  // user who only ever assessed one skill, no full_body assessment at all.
  delete (profile.progression!.domains as any).full_body;
  return {
    profile, requiredDomains: undefined, strictDomains: false,
    assessedSkillIds: new Set([c.program.id]), coreAssessed: false,
  };
}

// ============================================================================
// pipelineLog extraction (same technique as build-snapshot.ts's
// extractRelaxedConstraints/extractCorePromiseOutcome — generalised to a
// line-prefix frequency table for the rule-usage distribution).
// ============================================================================

function logLinePrefix(line: string): string {
  const colonIdx = line.indexOf(':');
  const bracketIdx = line.indexOf('[');
  const cut = colonIdx === -1 ? line.length : (bracketIdx !== -1 && bracketIdx < colonIdx ? bracketIdx : colonIdx);
  return line.slice(0, cut).trim() || line.trim();
}

function extractCorePromiseOutcome(pipelineLog: string[] | undefined): string | null {
  const line = (pipelineLog ?? []).find(l => l.startsWith('promise_validation:core:'));
  if (!line) return null;
  const m = line.match(/outcome=([a-z_]+)/);
  return m ? m[1] : null;
}

// ============================================================================
// Rubric — HARD rules (fail-fast eligible) + SOFT rules (reported, never abort)
// ============================================================================

const ELITE_SKILL_SLUGS = new Set(Object.keys(DOMAIN_RESOLUTION_SKILL_PARENT_MAP));

/** Re-derives InputSanitizerMiddleware.ts's isExerciseSkillEligible against
 *  the ASSEMBLED workout's exercises (that function itself is module-private
 *  and runs only at the pool stage — #117 never checked past it). Reuses the
 *  already-exported DOMAIN_RESOLUTION_SKILL_PARENT_MAP + resolveToSlug
 *  verbatim rather than re-guessing the gated-skill set. */
function isSkillLeak(ex: any, assessedSkillIds: Set<string>): boolean {
  const tags: string[] = [
    ...(ex.exercise?.targetPrograms ?? []).map((tp: any) => tp.programId),
    ...(ex.exercise?.programIds ?? []),
  ];
  if (tags.length === 0) return false;
  for (const raw of tags) {
    const slug = resolveToSlug(raw);
    const isSkillTag = ELITE_SKILL_SLUGS.has(slug) || ELITE_SKILL_SLUGS.has(raw);
    if (!isSkillTag) return false; // a foundational tag keeps it eligible
    if (assessedSkillIds.has(slug) || assessedSkillIds.has(raw)) return false; // directly assessed
  }
  return true; // every tag was an unreached skill -> leak
}

interface RuleResult { rule: string; pass: boolean; detail: string; }

function runHardRules(workout: any, combo: Combo, assessedSkillIds: Set<string>): RuleResult[] {
  const exemptEmpty = !!workout.needsAssessment || !!workout.isRecovery;
  const exercises: any[] = workout.exercises ?? [];
  const results: RuleResult[] = [];

  // H1 — no_empty_workout
  if (exercises.length === 0 && !exemptEmpty) {
    results.push({ rule: 'no_empty_workout', pass: false, detail: 'exercises=0, no needsAssessment/isRecovery exemption' });
  } else {
    results.push({ rule: 'no_empty_workout', pass: true, detail: `${exercises.length} exercises` });
  }

  // H2 — no_skill_leak (extends #117's pool-level check to the full assembly, incl. warmup)
  const leaks = exercises.filter(ex => isSkillLeak(ex, assessedSkillIds));
  if (leaks.length > 0) {
    const names = leaks.map(ex => getLocalizedText(ex.exercise?.name) ?? ex.exercise?.id ?? '?').join(', ');
    results.push({ rule: 'no_skill_leak', pass: false, detail: `${leaks.length} leaked: ${names}` });
  } else {
    results.push({ rule: 'no_skill_leak', pass: true, detail: 'clean' });
  }

  // H3 — warmup_main_structure (LAW 5: warmup block precedes main; cooldown follows)
  if (exemptEmpty) {
    results.push({ rule: 'warmup_main_structure', pass: true, detail: 'exempt (needsAssessment/isRecovery)' });
  } else if (exercises.length === 0) {
    results.push({ rule: 'warmup_main_structure', pass: false, detail: 'empty, no exemption (see no_empty_workout)' });
  } else {
    const roles = exercises.map(ex => ex.exerciseRole ?? 'main');
    const firstMain = roles.indexOf('main');
    const lastMain = roles.lastIndexOf('main');
    const warmupAfterMain = firstMain !== -1 && roles.slice(0, firstMain).some(r => r !== 'warmup');
    const nonCooldownAfterMain = lastMain !== -1 && roles.slice(lastMain + 1).some(r => r !== 'cooldown');
    const noMainAtAll = firstMain === -1;
    if (noMainAtAll) {
      results.push({ rule: 'warmup_main_structure', pass: false, detail: `no main-role exercise present — roles=[${roles.join(',')}]` });
    } else if (warmupAfterMain || nonCooldownAfterMain) {
      results.push({ rule: 'warmup_main_structure', pass: false, detail: `roles=[${roles.join(',')}]` });
    } else {
      results.push({ rule: 'warmup_main_structure', pass: true, detail: `roles=[${roles.join(',')}]` });
    }
  }

  // H4 — exercise_priority_order (self-consistency against the REAL final sort)
  //
  // CORRECTED 2026-10-04 (generator-validation-harness investigation, PR #121):
  // the original check re-derived LAW 4's doc as a flat static-priority-tag
  // rank — `{skill:0, compound:1, accessory:2, isolation:3}` — and flagged a
  // genuinely correct `core`-only workout as broken, because that doc (now
  // fixed — see Workout_Engine_Truth.md LAW 4) was stale: the real final sort
  // (`applyDomainPrioritySort`, workout-sorting.utils.ts) buckets by
  // `movementGroup` domain-weight FIRST (core/isolation/accessory all collapse
  // to the SAME weight), then by `tier` (elite/hard outranks the static
  // `priority` tag), then `priority`, then `programLevel`. Re-deriving that
  // logic here a second time would only create a second place for it to drift
  // out of date — so this check instead uses the REAL function, imported
  // read-only, as the oracle: does the array already equal what
  // `applyDomainPrioritySort` would produce from the same exercises? If
  // something mutated the array AFTER the real sort ran (the actual bug class
  // this check exists to catch), the two will disagree.
  const oracleOrder = applyDomainPrioritySort(exercises);
  const orderOk = oracleOrder.length === exercises.length && oracleOrder.every((ex, i) => ex === exercises[i]);
  results.push({
    rule: 'exercise_priority_order', pass: orderOk,
    detail: orderOk ? 'matches applyDomainPrioritySort oracle' :
      `actual=[${exercises.map(e => e.exercise?.id ?? '?').join(',')}] oracle=[${oracleOrder.map((e: any) => e.exercise?.id ?? '?').join(',')}]`,
  });

  // H5 — sa_ba_balance: self-consistency against the REAL penalty mechanism.
  //
  // CORRECTED 2026-10-05 (sa_ba_balance investigation): LAW 8's own doc text
  // was already accurate ("penalized, not excluded") -- the bug was in THIS
  // check, which hard-asserted the outcome the design never guarantees.
  // `applyMechanicalBalancing` (ContextualEngine.ts) applies a SCORE PENALTY
  // (`(count-2)*5`) to the 3rd+ straight-arm exercise encountered while
  // scoring the pool -- it never excludes one. Traced the one documented
  // escape hatch (`relaxSABA`, single-program-filter) and confirmed by
  // direct reproduction that it did NOT apply to the combo that first
  // surfaced this (push L15 -- the user's overall assessed domains include
  // pull/legs too, so `activeProgramFilters.length > 1`); the penalty fired
  // correctly every time, confirmed live via each exercise's own
  // `reasoning` array (`"SA עודף: -N (count/2)"`) -- a thin single-domain
  // pool can still let a heavily-penalized (even negative-scored) exercise
  // win when nothing better is available. That is the mechanism working as
  // designed, not a bypassed cap.
  //
  // Since the penalty only ever skips the 1st and 2nd straight-arm exercise
  // ENCOUNTERED during pool-scoring (not the 1st/2nd in the final cut), a
  // pigeonhole argument gives the real, checkable invariant: whenever the
  // FINAL straight-arm count exceeds 2, at least (count - 2) of those final
  // straight-arm exercises must carry an "SA עודף" marker in their own
  // `reasoning` -- proof the mechanism actually engaged for them, rather
  // than asserting a cap the design never promises to hold.
  const saCount = workout.mechanicalBalance?.straightArm ?? 0;
  if (saCount <= 2) {
    results.push({ rule: 'sa_ba_balance', pass: true, detail: `straightArm=${saCount} (within soft cap)` });
  } else {
    const mainStraightArm = exercises.filter(
      (ex: any) => (ex.exerciseRole ?? 'main') === 'main' && ex.mechanicalType === 'straight_arm',
    );
    const penalizedCount = mainStraightArm.filter((ex: any) =>
      (ex.reasoning ?? []).some((r: string) => r.startsWith('SA עודף')),
    ).length;
    const expectedMinPenalized = saCount - 2;
    const pass = penalizedCount >= expectedMinPenalized;
    results.push({
      rule: 'sa_ba_balance', pass,
      detail: pass
        ? `straightArm=${saCount}, ${penalizedCount}/${mainStraightArm.length} carry the SA penalty marker (mechanism engaged, soft cap exceeded by design)`
        : `straightArm=${saCount} but only ${penalizedCount}/${mainStraightArm.length} carry the SA penalty marker (expected >=${expectedMinPenalized}) -- the penalty mechanism may not have run`,
    });
  }

  return results;
}

interface SoftResult { rule: string; flagged: boolean; detail: string; known?: boolean; }

function runSoftRules(workout: any, combo: Combo, coreAssessed: boolean): SoftResult[] {
  const exercises: any[] = workout.exercises ?? [];
  const results: SoftResult[] = [];

  // S1 — no_core_assessment (KNOWN issue — fix held on unmerged branch
  // fix/no-core-assessment-rubber-stamp, commit 58a420b1. Tracked here for
  // visibility only; NEVER feeds the fail-fast gate.)
  if (!coreAssessed) {
    const coreLeaks = exercises.filter(ex => {
      const mg = ex.exercise?.movementGroup;
      return mg && MG_TO_DOMAIN[mg] === 'core';
    });
    results.push({
      rule: 'no_core_assessment', flagged: coreLeaks.length > 0, known: true,
      detail: coreLeaks.length > 0
        ? `${coreLeaks.length} core exercise(s) present for an unassessed user (KNOWN — fix held on fix/no-core-assessment-rubber-stamp, not yet merged)`
        : 'clean',
    });
  }

  // S2 — volume_duration_sanity (informational — real variance expected)
  const { exerciseCount: expectedMin } = getExerciseCountForDuration(combo.duration);
  const mainCount = exercises.filter(ex => (ex.exerciseRole ?? 'main') === 'main').length;
  const estimated = workout.estimatedDuration ?? 0;
  const grossOutlier = combo.duration >= 20 && (mainCount === 0 || estimated > combo.duration * 2.5);
  results.push({
    rule: 'volume_duration_sanity', flagged: grossOutlier,
    detail: `requested=${combo.duration}min mainExercises=${mainCount} estimatedDuration=${estimated}min (tier-expected~${expectedMin})`,
  });

  return results;
}

// ============================================================================
// Fail-fast gate
// ============================================================================

class FailFastGate {
  private consecutiveByRule = new Map<string, number>();
  private processed = 0;
  private hardFailedCombos = 0;
  aborted = false;
  abortReason = '';

  /**
   * CORRECTED 2026-10-05: a beyond-authored-ceiling probe (content past the
   * program's real, Stage-0-discovered level range) must never feed the
   * fail-fast counters — it's a deliberate edge-probe, not a scenario the
   * gate is meant to police. Without this, a single beyond-ceiling combo
   * (e.g. `pull L22` against a ceiling of 20) could inflate the per-stage
   * failure rate or contribute to a consecutive-same-rule streak and trip
   * the gate on its own — exactly what happened on the 2026-10-04 run
   * (`pull L22 30min D2 @park` counted toward the 2/10 that tripped Stage 2).
   * `beyondCeiling` combos are still run and still reported (§8 of the
   * rendered report) — they just don't count here.
   */
  record(combo: Combo, hardResults: RuleResult[], beyondCeiling: boolean): void {
    if (beyondCeiling) return;

    this.processed++;
    const anyHardFail = hardResults.some(r => !r.pass);
    if (anyHardFail) this.hardFailedCombos++;

    for (const r of hardResults) {
      const streak = r.pass ? 0 : (this.consecutiveByRule.get(r.rule) ?? 0) + 1;
      this.consecutiveByRule.set(r.rule, streak);
      if (streak >= 3) {
        this.aborted = true;
        this.abortReason = `Rule "${r.rule}" failed on 3 consecutive combos (latest: ${comboLabel(combo)})`;
      }
    }

    if (!this.aborted && this.processed >= 10 && this.hardFailedCombos / this.processed >= 0.10) {
      this.aborted = true;
      this.abortReason = `${this.hardFailedCombos}/${this.processed} combos (>=10%) failed a hard rule in this stage`;
    }
  }

  recordCrash(combo: Combo, err: unknown): void {
    this.aborted = true;
    this.abortReason = `Uncaught error on ${comboLabel(combo)}: ${(err as any)?.message ?? err}`;
  }
}

// ============================================================================
// Per-combo runner
// ============================================================================

interface ComboOutcome {
  combo: Combo;
  hardResults: RuleResult[];
  softResults: SoftResult[];
  exerciseCount: number;
  estimatedDuration: number | null;
  corePromiseOutcome: string | null;
  logPrefixes: string[];
  mainExerciseIds: string[];
  beyondCeiling: boolean;
  usedEmptyPoolFallback: boolean;
  note?: string;
  crashed?: string;
}

async function runCombo(combo: Combo, ceilings: Map<string, number>): Promise<ComboOutcome> {
  const { profile, requiredDomains, strictDomains, assessedSkillIds, coreAssessed } = buildProfileAndOptions(combo);
  const ceiling = ceilings.get(combo.program.id) ?? Infinity;
  const beyondCeiling = combo.level > ceiling;

  let result: any;
  try {
    result = await generateHomeWorkoutTrio({
      userProfile: profile,
      location: combo.location,
      testLocation: combo.location,
      availableTime: combo.duration,
      difficulty: combo.difficulty,
      targetDifficulty: combo.difficulty,
      daysInactiveOverride: 0,
      requiredDomains,
      ...(strictDomains ? { strictDomains: true } : {}),
      remainingWeeklyBudget: 20,
      domainSetsCompletedThisWeek: { push: 6, pull: 6, legs: 6, core: 2 },
      remainingScheduleDays: 3,
      skipCycleRestart: true,
    } as any);
  } catch (err) {
    return {
      combo, hardResults: [], softResults: [], exerciseCount: 0, estimatedDuration: null,
      corePromiseOutcome: null, logPrefixes: [], mainExerciseIds: [], beyondCeiling,
      usedEmptyPoolFallback: false, note: combo.program.note, crashed: (err as any)?.message ?? String(err),
    };
  }

  const optionResult = result.options[0].result;
  const workout = optionResult.workout;
  const hardResults = runHardRules(workout, combo, assessedSkillIds);
  const softResults = runSoftRules(workout, combo, coreAssessed);
  const logPrefixes = (workout.pipelineLog ?? []).map(logLinePrefix);

  return {
    combo, hardResults, softResults,
    exerciseCount: (workout.exercises ?? []).length,
    estimatedDuration: workout.estimatedDuration ?? null,
    corePromiseOutcome: extractCorePromiseOutcome(workout.pipelineLog),
    logPrefixes,
    mainExerciseIds: (workout.exercises ?? [])
      .filter((ex: any) => (ex.exerciseRole ?? 'main') === 'main')
      .map((ex: any) => ex.exercise?.id ?? '?'),
    beyondCeiling,
    // PipelineOrchestrator's empty-pool honesty guard (park-hero-fix, Decision C) —
    // a REAL "the candidate pool came up empty" signal, distinct from an
    // ordinary low-but-nonzero exercise count. Surfaced as its own category
    // rather than folded into volume_duration_sanity, so the report doesn't
    // read "low volume" when the actual story is "no candidates at all."
    usedEmptyPoolFallback: !!optionResult.usedEmptyPoolFallback,
    note: combo.program.note,
  };
}

// ============================================================================
// Stage builders
// ============================================================================

function buildStage1Combos(): Combo[] {
  // ~10 hand-picked, spanning programs/levels/times/difficulties — one
  // foundational, several skills, low/mid/high level, each difficulty,
  // 2 distinct durations. Reruns (x3) happen in main() for repeatability.
  const picks: Omit<Combo, 'stage'>[] = [
    { program: PROGRAM_DEFS[0], level: 1, duration: 20, difficulty: 1, location: PRIMARY_LOCATION },  // push, low
    { program: PROGRAM_DEFS[3], level: 10, duration: 30, difficulty: 2, location: PRIMARY_LOCATION }, // core, mid
    { program: PROGRAM_DEFS[4], level: 15, duration: 45, difficulty: 3, location: PRIMARY_LOCATION }, // calisthenics_upper, high
    { program: PROGRAM_DEFS[5], level: 5, duration: 10, difficulty: 1, location: PRIMARY_LOCATION },  // front_lever, low/short
    { program: PROGRAM_DEFS[8], level: 22, duration: 60, difficulty: 3, location: PRIMARY_LOCATION }, // planche, elite/long
    { program: PROGRAM_DEFS[10], level: 1, duration: 30, difficulty: 2, location: PRIMARY_LOCATION }, // handstand (frozen annotation)
    { program: PROGRAM_DEFS[1], level: 10, duration: 20, difficulty: 2, location: SPOT_CHECK_LOCATION }, // pull @ home
  ];
  return picks.map(p => ({ ...p, stage: 1 as const }));
}

function buildStage2Combos(): Combo[] {
  const combos: Combo[] = [];
  for (const program of PROGRAM_DEFS) {
    for (const level of LEVELS) {
      combos.push({ stage: 2, program, level, duration: 30, difficulty: 2, location: PRIMARY_LOCATION });
    }
  }
  return combos;
}

function buildStage3Combos(): Combo[] {
  const combos: Combo[] = [];
  for (const program of PROGRAM_DEFS) {
    for (const level of LEVELS) {
      for (const duration of DURATIONS) {
        for (const difficulty of DIFFICULTIES) {
          combos.push({ stage: 3, program, level, duration, difficulty, location: PRIMARY_LOCATION });
        }
      }
    }
  }
  // Location spot-checks: one representative combo per program at 'home'.
  for (const program of PROGRAM_DEFS) {
    combos.push({ stage: 3, program, level: 10, duration: 30, difficulty: 2, location: SPOT_CHECK_LOCATION });
  }
  return combos;
}

// ============================================================================
// Legacy-corpus structural reference (lightweight, read-only — NOT the
// full exercise-identity bridge; analyze-benchmark.ts remains the deeper
// tool for that. This is a structural sanity cross-check only.)
// ============================================================================

interface LegacyStats {
  totalActiveWorkouts: number;
  avgSetsPerWorkout: number;
  avgExercisesPerWorkout: number;
}

function readLegacyStats(): LegacyStats {
  const legacyPath = path.resolve(__dirname, '..', '..', 'docs', 'workout-engine', 'legacy-workouts.sqlite');
  const db = new Database(legacyPath, { readonly: true });
  try {
    const row = db.prepare(`
      SELECT COUNT(DISTINCT w.id) as workouts,
             CAST(COUNT(se.id) AS REAL) / COUNT(DISTINCT w.id) as avgExercises
      FROM workouts w
      JOIN workout_sets ws ON ws.workoutid = w.id
      JOIN set_exercises se ON se.setid = ws.id
      WHERE w.targetid IN (13,14,15,16,17,18) AND w.active = 1
    `).get() as any;
    const setsRow = db.prepare(`
      SELECT CAST(COUNT(*) AS REAL) / COUNT(DISTINCT w.id) as avgSets
      FROM workouts w JOIN workout_sets ws ON ws.workoutid = w.id
      WHERE w.targetid IN (13,14,15,16,17,18) AND w.active = 1
    `).get() as any;
    return {
      totalActiveWorkouts: row?.workouts ?? 0,
      avgSetsPerWorkout: Math.round((setsRow?.avgSets ?? 0) * 10) / 10,
      avgExercisesPerWorkout: Math.round((row?.avgExercises ?? 0) * 10) / 10,
    };
  } finally {
    db.close();
  }
}

// ============================================================================
// Report rendering
// ============================================================================

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a), setB = new Set(b);
  const intersection = Array.from(setA).filter(x => setB.has(x)).length;
  const union = new Set(Array.from(setA).concat(Array.from(setB))).size;
  return union === 0 ? 1 : intersection / union;
}

function renderReport(params: {
  startedAt: Date;
  gitSha: string;
  stage0: { program: string; ceiling: number }[];
  stage1: { outcomes: ComboOutcome[]; repeatability: { combo: string; jaccardPairs: number[] }[] };
  stage2: ComboOutcome[];
  stage3: ComboOutcome[];
  aborted: { stage: number; reason: string } | null;
  legacyStats: LegacyStats;
}): string {
  const { startedAt, gitSha, stage0, stage1, stage2, stage3, aborted, legacyStats } = params;
  const allOutcomes = [...stage1.outcomes, ...stage2, ...stage3];
  const lines: string[] = [];

  lines.push(`# Generator Validation Report`);
  lines.push('');
  lines.push(`Run started: ${startedAt.toISOString()} · origin/main @ \`${gitSha}\``);
  lines.push(`Status: ${aborted ? `**ABORTED at Stage ${aborted.stage}** — ${aborted.reason}` : '**COMPLETED all stages**'}`);
  lines.push('');

  // ── Coverage ──
  lines.push('## 1. Coverage');
  lines.push('');
  lines.push('| Stage | Combos attempted | Crashed |');
  lines.push('|---|---|---|');
  lines.push(`| 1 (smoke) | ${stage1.outcomes.length} | ${stage1.outcomes.filter(o => o.crashed).length} |`);
  lines.push(`| 2 (one per program×level) | ${stage2.length} | ${stage2.filter(o => o.crashed).length} |`);
  lines.push(`| 3 (full grid + location spot-checks) | ${stage3.length} | ${stage3.filter(o => o.crashed).length} |`);
  lines.push('');
  lines.push('Excluded by design: `isRestDay` scenarios (separate code path), full park/gym/home location cross (park-only + home spot-checks per approved plan).');
  lines.push('');

  // ── Stage 0 ──
  lines.push('## Stage 0 — real per-program level ceilings');
  lines.push('');
  lines.push('| Program | Authored max level |');
  lines.push('|---|---|');
  for (const s of stage0) lines.push(`| ${s.program} | ${s.ceiling === Infinity ? 'unknown (0 authored levels found)' : s.ceiling} |`);
  lines.push('');
  const beyondCeilingCombos = allOutcomes.filter(o => o.beyondCeiling && !o.crashed);
  lines.push(`**${beyondCeilingCombos.length} combos probed beyond their program's authored ceiling** (kept, bucketed separately — see §6).`);
  lines.push('');

  // ── Known issues ──
  lines.push('## 2. Known-issue annotations (not new findings)');
  lines.push('');
  const coreIssues = allOutcomes.filter(o => !o.crashed && o.softResults.some(s => s.rule === 'no_core_assessment' && s.flagged));
  lines.push(`- **no_core_assessment**: ${coreIssues.length}/${allOutcomes.filter(o => !o.crashed && o.softResults.some(s => s.rule === 'no_core_assessment')).length} eligible combos show a core exercise for an unassessed user. ` +
    `This is the KNOWN rubber-stamp issue — fix exists on held, unmerged branch \`fix/no-core-assessment-rubber-stamp\` (commit \`58a420b1\`). Not counted toward fail-fast; not a new regression.`);
  const handstandCombos = allOutcomes.filter(o => o.combo.program.id === 'handstand' && !o.crashed);
  lines.push(`- **handstand**: ${handstandCombos.length} combos run against a synthetic *existing tracked user*. Frozen only for NEW onboarding selection (PR #117) — generator-reachable here by design, not a freeze regression.`);
  lines.push('');

  // ── Hard-rule failures ──
  lines.push('## 3. Hard-rule failures (exact combo + rule + evidence)');
  lines.push('');
  const hardFailures = allOutcomes.filter(o => !o.crashed && !o.beyondCeiling && o.hardResults.some(r => !r.pass));
  if (hardFailures.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Combo | Failing rule(s) | Evidence |');
    lines.push('|---|---|---|');
    for (const o of hardFailures) {
      const fails = o.hardResults.filter(r => !r.pass);
      lines.push(`| ${comboLabel(o.combo)} | ${fails.map(f => f.rule).join(', ')} | ${fails.map(f => f.detail).join('; ')} |`);
    }
  }
  lines.push('');
  const crashes = allOutcomes.filter(o => o.crashed);
  if (crashes.length > 0) {
    lines.push('### Crashes');
    lines.push('');
    lines.push('| Combo | Error |');
    lines.push('|---|---|');
    for (const o of crashes) lines.push(`| ${comboLabel(o.combo)} | ${o.crashed} |`);
    lines.push('');
  }

  // ── Empty-pool fallback (own section — distinct from "low volume") ──
  lines.push('## 4. Empty-pool honesty-guard occurrences (PipelineOrchestrator — pool came up empty, not just low)');
  lines.push('');
  const emptyPoolOutcomes = allOutcomes.filter(o => !o.crashed && o.usedEmptyPoolFallback);
  lines.push(`**${emptyPoolOutcomes.length}/${allOutcomes.filter(o => !o.crashed).length} combos hit the empty-pool fallback** (\`usedEmptyPoolFallback\`) — the orchestrator found zero candidate exercises for that exact program/level/duration/difficulty/location combo and returned the honest placeholder rather than fabricating content.`);
  if (emptyPoolOutcomes.length > 0) {
    lines.push('');
    lines.push('| Combo | Beyond authored ceiling? |');
    lines.push('|---|---|');
    const seen = new Set<string>();
    for (const o of emptyPoolOutcomes) {
      const key = comboLabel(o.combo);
      if (seen.has(key)) continue; // dedup across reruns for readability
      seen.add(key);
      lines.push(`| ${key} | ${o.beyondCeiling ? 'yes' : 'no'} |`);
    }
  }
  lines.push('');

  // ── Soft findings ──
  lines.push('## 5. Soft sanity findings (informational, never fail-fast)');
  lines.push('');
  const volumeOutliers = allOutcomes.filter(o => !o.crashed && !o.usedEmptyPoolFallback && o.softResults.some(s => s.rule === 'volume_duration_sanity' && s.flagged));
  lines.push(`**volume_duration_sanity outliers (excluding empty-pool-fallback cases, already in §4):** ${volumeOutliers.length}/${allOutcomes.filter(o => !o.crashed).length}`);
  if (volumeOutliers.length > 0) {
    lines.push('');
    lines.push('| Combo | Detail |');
    lines.push('|---|---|');
    for (const o of volumeOutliers.slice(0, 20)) {
      lines.push(`| ${comboLabel(o.combo)} | ${o.softResults.find(s => s.rule === 'volume_duration_sanity')!.detail} |`);
    }
    if (volumeOutliers.length > 20) lines.push(`| ... | +${volumeOutliers.length - 20} more |`);
  }
  lines.push('');

  // ── Variety ──
  lines.push('## 6. Variety metrics');
  lines.push('');
  lines.push('### Repeatability (Stage 1, 3 reruns per smoke combo, Jaccard overlap of main exercise IDs)');
  lines.push('');
  lines.push('| Combo | Jaccard (run1∩2, run2∩3, run1∩3) |');
  lines.push('|---|---|');
  for (const r of stage1.repeatability) {
    lines.push(`| ${r.combo} | ${r.jaccardPairs.map(j => j.toFixed(2)).join(', ')} |`);
  }
  lines.push('');
  lines.push('(1.00 = identical exercise set every rerun; 0.00 = no overlap at all. Some variation is expected and healthy; 1.00 across all pairs for every combo would suggest under-randomization.)');
  lines.push('');

  // Level/difficulty differentiation (Stage 3 aggregate, grouped by program)
  lines.push('### Level/difficulty differentiation (mean main-exercise count by level, Stage 2+3)');
  lines.push('');
  lines.push('| Program | L1 | L5 | L10 | L15 | L22 |');
  lines.push('|---|---|---|---|---|---|');
  for (const program of PROGRAM_DEFS) {
    const row = LEVELS.map(level => {
      const matches = allOutcomes.filter(o => !o.crashed && o.combo.program.id === program.id && o.combo.level === level);
      if (matches.length === 0) return '—';
      const avg = matches.reduce((s, o) => s + o.exerciseCount, 0) / matches.length;
      return avg.toFixed(1);
    });
    lines.push(`| ${program.id} | ${row.join(' | ')} |`);
  }
  lines.push('');

  // Repetition leaderboard
  const exerciseFreq = new Map<string, number>();
  for (const o of allOutcomes) {
    if (o.crashed) continue;
    for (const id of o.mainExerciseIds) exerciseFreq.set(id, (exerciseFreq.get(id) ?? 0) + 1);
  }
  const sortedFreq = Array.from(exerciseFreq.entries()).sort((a, b) => b[1] - a[1]);
  lines.push('### Catalog repetition leaderboard (top 15 most-used main exercise IDs across the full sweep)');
  lines.push('');
  lines.push('| Exercise ID | Appearances |');
  lines.push('|---|---|');
  for (const [id, count] of sortedFreq.slice(0, 15)) lines.push(`| ${id} | ${count} |`);
  lines.push('');

  // ── Rule-usage distribution ──
  lines.push('## 7. Rule-usage distribution (pipelineLog line-prefix frequency, full sweep)');
  lines.push('');
  const prefixFreq = new Map<string, number>();
  for (const o of allOutcomes) {
    if (o.crashed) continue;
    for (const p of o.logPrefixes) prefixFreq.set(p, (prefixFreq.get(p) ?? 0) + 1);
  }
  const sortedPrefixes = Array.from(prefixFreq.entries()).sort((a, b) => b[1] - a[1]);
  lines.push('| pipelineLog prefix | Count |');
  lines.push('|---|---|');
  for (const [prefix, count] of sortedPrefixes.slice(0, 30)) lines.push(`| \`${prefix}\` | ${count} |`);
  lines.push('');

  // ── Beyond-ceiling probes ──
  lines.push('## 8. Beyond-authored-ceiling probes (kept separate — graceful-degradation check, not failures)');
  lines.push('');
  if (beyondCeilingCombos.length === 0) {
    lines.push('None probed (every requested level was within each program\'s authored ceiling).');
  } else {
    lines.push('| Combo | Exercise count | Hard-rule outcome |');
    lines.push('|---|---|---|');
    for (const o of beyondCeilingCombos) {
      const fails = o.hardResults.filter(r => !r.pass).map(r => r.rule);
      lines.push(`| ${comboLabel(o.combo)} | ${o.exerciseCount} | ${fails.length ? fails.join(', ') : 'clean'} |`);
    }
  }
  lines.push('');

  // ── Quality vs legacy corpus ──
  lines.push('## 9. Quality vs. reference corpus (structural comparison)');
  lines.push('');
  lines.push(`David's curated corpus: \`docs/workout-engine/legacy-workouts.sqlite\` — ${legacyStats.totalActiveWorkouts} real active workouts (targetid 13-18, active=1).`);
  lines.push('');
  lines.push('| | Legacy corpus | This sweep (Stage 2+3, main-role only) |');
  lines.push('|---|---|---|');
  const sweepAvgExercises = allOutcomes.filter(o => !o.crashed).reduce((s, o) => s + o.exerciseCount, 0) / Math.max(1, allOutcomes.filter(o => !o.crashed).length);
  lines.push(`| Avg exercises/workout | ${legacyStats.avgExercisesPerWorkout} | ${sweepAvgExercises.toFixed(1)} |`);
  lines.push(`| Avg sets/workout | ${legacyStats.avgSetsPerWorkout} | n/a (not tracked per-set in this harness) |`);
  lines.push('');
  lines.push('This is a lightweight structural cross-check, not an exercise-identity-level comparison. `scripts/audit/analyze-benchmark.ts` (block classification, level placement, rep-range, co-occurrence — against the 189/366 bridged exercise mapping) remains the deeper tool for that question.');
  lines.push('');

  // ── Anomalies ──
  lines.push('## 10. Anomalies spotlight');
  lines.push('');
  const worstVolume = [...volumeOutliers].sort((a, b) => (b.estimatedDuration ?? 0) - (a.estimatedDuration ?? 0)).slice(0, 3);
  if (worstVolume.length === 0) {
    lines.push('No standout anomalies beyond what\'s already listed in §3/§4.');
  } else {
    for (const o of worstVolume) {
      lines.push(`- **${comboLabel(o.combo)}**: ${o.softResults.find(s => s.rule === 'volume_duration_sanity')!.detail}`);
      lines.push(`  pipelineLog excerpt: ${o.logPrefixes.slice(0, 5).map(p => `\`${p}\``).join(', ')}${o.logPrefixes.length > 5 ? ', ...' : ''}`);
    }
  }
  lines.push('');

  // ── Appendix ──
  lines.push('## Appendix — axes used');
  lines.push('');
  lines.push(`Programs (${PROGRAM_DEFS.length}): ${PROGRAM_DEFS.map(p => p.id).join(', ')}`);
  lines.push(`Levels: ${LEVELS.join(', ')} · Durations: ${DURATIONS.join(', ')} min · Difficulties: ${DIFFICULTIES.join(', ')} · Location: ${PRIMARY_LOCATION} (+ ${SPOT_CHECK_LOCATION} spot-checks)`);
  lines.push('');
  lines.push(`Total real engine calls this run: ${allOutcomes.length}`);
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const startedAt = new Date();
  report('Authenticating headless client (custom token) so programLevelSettings reads succeed...');
  await authenticateHeadlessClient();
  report('Authenticated.');

  const requestedStage = process.env.GEN_VALIDATION_STAGE ?? 'all';

  // ── Stage 0 — real per-program level ceilings ──
  report('Stage 0: probing real per-program authored level ceilings...');
  const ceilings = new Map<string, number>();
  const stage0Results: { program: string; ceiling: number }[] = [];
  for (const program of PROGRAM_DEFS) {
    const levels = await getOnboardingLevelsForCategory(program.id);
    const ceiling = levels.length > 0 ? Math.max(...levels) : Infinity;
    ceilings.set(program.id, ceiling);
    stage0Results.push({ program: program.id, ceiling });
    report(`  ${program.id}: ${levels.length} authored levels, ceiling=${ceiling === Infinity ? 'unknown' : ceiling}`);
  }

  let aborted: { stage: number; reason: string } | null = null;
  let stage1Outcomes: ComboOutcome[] = [];
  let stage1Repeatability: { combo: string; jaccardPairs: number[] }[] = [];
  let stage2Outcomes: ComboOutcome[] = [];
  let stage3Outcomes: ComboOutcome[] = [];

  // ── Stage 1 — smoke + repeatability ──
  if (!aborted && (requestedStage === 'all' || requestedStage === '1')) {
    report('Stage 1: smoke sample (~10 combos, 3 reruns each for repeatability)...');
    const gate = new FailFastGate();
    const smokeCombos = buildStage1Combos();
    for (const combo of smokeCombos) {
      const reruns: ComboOutcome[] = [];
      for (let i = 0; i < 3; i++) {
        const outcome = await runCombo(combo, ceilings);
        reruns.push(outcome);
        stage1Outcomes.push(outcome); // every rerun counted, not just the first — a failure on rerun 2/3 must still show in §3
        if (outcome.crashed) { gate.recordCrash(combo, outcome.crashed); break; }
        gate.record(combo, outcome.hardResults, outcome.beyondCeiling);
        if (gate.aborted) break;
      }
      if (reruns.length === 3 && !reruns.some(r => r.crashed)) {
        stage1Repeatability.push({
          combo: comboLabel(combo),
          jaccardPairs: [
            jaccard(reruns[0].mainExerciseIds, reruns[1].mainExerciseIds),
            jaccard(reruns[1].mainExerciseIds, reruns[2].mainExerciseIds),
            jaccard(reruns[0].mainExerciseIds, reruns[2].mainExerciseIds),
          ],
        });
      }
      report(`  ${comboLabel(combo)}: ${reruns[0].crashed ? `CRASHED: ${reruns[0].crashed}` : reruns[0].hardResults.filter(r => !r.pass).map(r => r.rule).join(',') || 'clean'}`);
      if (gate.aborted) { aborted = { stage: 1, reason: gate.abortReason }; break; }
    }
    if (!aborted) report('Stage 1 passed.');
  }

  // ── Stage 2 — one per program×level ──
  if (!aborted && (requestedStage === 'all' || requestedStage === '2')) {
    report('Stage 2: one combo per program×level (55 calls)...');
    const gate = new FailFastGate();
    for (const combo of buildStage2Combos()) {
      const outcome = await runCombo(combo, ceilings);
      stage2Outcomes.push(outcome);
      if (outcome.crashed) { gate.recordCrash(combo, outcome.crashed); aborted = { stage: 2, reason: gate.abortReason }; break; }
      gate.record(combo, outcome.hardResults, outcome.beyondCeiling);
      if (gate.aborted) { aborted = { stage: 2, reason: gate.abortReason }; break; }
    }
    if (!aborted) report(`Stage 2 passed (${stage2Outcomes.length} combos).`);
  }

  // ── Stage 3 — full grid ──
  if (!aborted && (requestedStage === 'all' || requestedStage === '3')) {
    report('Stage 3: full grid (825 + 11 location spot-checks)...');
    const gate = new FailFastGate();
    const combos = buildStage3Combos();
    const CONCURRENCY = Number(process.env.GEN_VALIDATION_CONCURRENCY ?? 4);
    for (let i = 0; i < combos.length; i += CONCURRENCY) {
      const batch = combos.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.all(batch.map(c => runCombo(c, ceilings)));
      for (let j = 0; j < outcomes.length; j++) {
        const outcome = outcomes[j];
        stage3Outcomes.push(outcome);
        if (outcome.crashed) { gate.recordCrash(batch[j], outcome.crashed); aborted = { stage: 3, reason: gate.abortReason }; break; }
        gate.record(batch[j], outcome.hardResults, outcome.beyondCeiling);
        if (gate.aborted) { aborted = { stage: 3, reason: gate.abortReason }; break; }
      }
      if (aborted) break;
      if ((i / CONCURRENCY) % 20 === 0) report(`  ...${i + outcomes.length}/${combos.length}`);
    }
    if (!aborted) report(`Stage 3 passed (${stage3Outcomes.length} combos).`);
  }

  // ── Legacy corpus reference ──
  report('Reading legacy corpus structural stats...');
  const legacyStats = readLegacyStats();

  // ── Git SHA ──
  const { execSync } = await import('child_process');
  const gitSha = execSync('git rev-parse HEAD', { cwd: path.resolve(__dirname, '..', '..') }).toString().trim();

  const reportMd = renderReport({
    startedAt, gitSha, stage0: stage0Results,
    stage1: { outcomes: stage1Outcomes, repeatability: stage1Repeatability },
    stage2: stage2Outcomes, stage3: stage3Outcomes, aborted, legacyStats,
  });

  const outDir = process.env.GEN_VALIDATION_OUT_DIR ?? os.tmpdir();
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `generator-validation-report-${startedAt.toISOString().replace(/[:.]/g, '-')}.md`);
  fs.writeFileSync(outPath, reportMd, 'utf-8');
  report(`\nReport written to: ${outPath}`);
  if (aborted) report(`\nABORTED at Stage ${aborted.stage}: ${aborted.reason}`);

  process.exit(0);
}

main().catch(err => {
  report(`FATAL: ${err?.stack ?? err}`);
  process.exit(1);
});

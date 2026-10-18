/**
 * Decision Record — WHY the engine built this workout, as typed scalars.
 *
 * A pure function of the finished GeneratedWorkout + a small context the
 * pipeline already computed (recovery flag, inactivity, periodization policy,
 * weekly budgets, focus, location, time). It never reads Firestore, never
 * mutates the workout, and carries only light scalars so it can ride the
 * sessionStorage plan snapshot (axioms §19) next to `metadataCtx`.
 *
 * Consumers: the "דגשי האימון" coach note (coach-note.ts) renders 2–4 Hebrew
 * sentences from it. Anything the note says must come from this record —
 * the renderer never looks at the workout itself.
 */

import type {
  DifficultyLevel,
  GeneratedWorkout,
  WorkoutExercise,
  WorkoutStructure,
} from '../logic/workout-generator.types';
import { collectMethodGear } from '../shared/constants/domain-mapping.constants';

// ============================================================================
// TYPES
// ============================================================================

export type IntensityWord = 'easy' | 'balanced' | 'intense';
export type DayTimeSlot = 'morning' | 'evening' | 'night';
export type GearSummary = 'bodyweight' | 'equipment';

/** Reason codes. Emitted sorted by REASON_RANK (index 0 = strongest "why"). */
export type DecisionReason =
  | { code: 'RECOVERY_DAY' }
  | { code: 'RETURNING'; days: number }
  | { code: 'DELOAD_WEEK'; week: number }
  | { code: 'PEAK_WEEK'; week: number }
  | { code: 'BUILD_WEEK'; week: number }
  | { code: 'WEEKLY_GAP'; domain: string; pct: number }
  | { code: 'SKILL_FOCUS'; skill: string }
  | { code: 'PROGRAM_FOCUS'; program: string; level: number }
  | { code: 'WEATHER_RAIN' }
  | { code: 'WEATHER_HEAT' }
  | { code: 'WEATHER_COLD' }
  | { code: 'WEATHER_UV' }
  | { code: 'LOCATION'; loc: string; gearSummary: GearSummary }
  | { code: 'TIME'; slot: DayTimeSlot }
  | { code: 'DIFFICULTY'; level: IntensityWord }
  | { code: 'LEVEL_CEILING' }
  | { code: 'MUSCLES_RESTED'; muscles: string[] };

export type DecisionReasonCode = DecisionReason['code'];

export const REASON_RANK: readonly DecisionReasonCode[] = [
  'RECOVERY_DAY',
  'RETURNING',
  'DELOAD_WEEK',
  'PEAK_WEEK',
  'BUILD_WEEK',
  'WEEKLY_GAP',
  'SKILL_FOCUS',
  'PROGRAM_FOCUS',
  'WEATHER_RAIN',
  'WEATHER_HEAT',
  'WEATHER_COLD',
  'WEATHER_UV',
  'LOCATION',
  'TIME',
  'DIFFICULTY',
  'LEVEL_CEILING',
  'MUSCLES_RESTED',
];

export type ProtocolKind = 'straight' | 'pyramid' | 'superset' | 'antagonist' | 'emom' | 'tabata';

export interface NumRange {
  min: number;
  max: number;
}

export interface DecisionExpect {
  structure: WorkoutStructure;
  protocol: ProtocolKind;
  /** Main exercises only (warmup/cooldown excluded). */
  exercisesCount: number;
  /** Typical (middle-half) ranges — see rangeOf. */
  setsRange: NumRange | null;
  /** unit 'reps' for rep-based work, 'seconds' when most main work is holds. */
  repRange: (NumRange & { unit: 'reps' | 'seconds' }) | null;
  /** Seconds between sets (main, non-tabata). */
  restRange: NumRange | null;
  intensityWord: IntensityWord;
  durationMin: number;
  /** Present only when a tabata block is part of the workout. */
  tabata?: { workSec: number; restSec: number; rounds: number };
}

export interface DecisionRecord {
  v: 1;
  /** Stable per exercise list — drives deterministic phrase-variant picks. */
  seed: number;
  reasons: DecisionReason[];
  expect: DecisionExpect;
}

/** Everything the pipeline knows that the finished workout itself doesn't. */
export interface DecisionContext {
  isRecoveryDay?: boolean;
  daysInactive?: number;
  /** SessionPolicy.reason (periodization.service.ts). */
  policyReason?: 'build' | 'peak' | 'deload' | 'detraining' | 'long_gap_deload' | 'rebuild';
  periodizationWeek?: number;
  /** False when the user has no active program — week 1 is then a default, not a fact. */
  hasActiveCycle?: boolean;
  weeklyGap?: { domain: string; pct: number } | null;
  skillFocus?: string | null;
  programFocus?: { program: string; level: number } | null;
  location?: string | null;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  /**
   * Weather flag the generator adapted to (HomeWorkoutOptions.weather, only set
   * while `weather_enabled` is on). See weather-adaptation.ts for what each flag
   * changes; the reason is emitted only when that change is true of the workout.
   */
  weatherFlag?: 'rain' | 'heat' | 'cold' | 'uv' | null;
  /** No producer yet — reserved for a future muscle-recovery signal. */
  restedMuscles?: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

const RETURNING_MIN_DAYS = 4; // periodization GAP_DETRAINING_THRESHOLD is "> 3"

/** FNV-1a — tiny, stable, no deps. */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function isMain(ex: WorkoutExercise): boolean {
  return ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown';
}

/**
 * The TYPICAL range — the middle half of the values (25th..75th percentile,
 * nearest-rank) — so one outlier (a 1-rep skill hold, a 3-minute rest after
 * the pyramid) doesn't turn "8 to 12 reps" into "1 to 12 reps". With 1–3
 * values this is simply min..max.
 */
function rangeOf(values: number[]): NumRange | null {
  const v = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  if (v.length <= 3) return { min: v[0], max: v[v.length - 1] };
  const at = (q: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  return { min: at(0.25), max: at(0.75) };
}

export function intensityWordFor(difficulty: DifficultyLevel | number | undefined): IntensityWord {
  if (difficulty === 1) return 'easy';
  if (difficulty === 3) return 'intense';
  return 'balanced';
}

/**
 * The domain furthest behind its weekly set target, as "percent still
 * missing" (0–100). Returns null when there is nothing meaningful to say:
 * no completion data, fewer than 2 domains, or no domain clearly behind the
 * rest (e.g. start of the week — everyone is at 0%).
 */
export function computeWeeklyGap(
  budgets: Array<{ domain: string; weekly: number }> | undefined,
  completedThisWeek: Record<string, number> | undefined,
): { domain: string; pct: number } | null {
  if (!budgets?.length || !completedThisWeek) return null;
  const rows = budgets
    .filter((b) => b.weekly > 0)
    .map((b) => ({
      domain: b.domain,
      done: Math.min(100, ((completedThisWeek[b.domain] ?? 0) / b.weekly) * 100),
    }));
  if (rows.length < 2) return null;
  rows.sort((a, b) => a.done - b.done);
  const lowest = rows[0];
  const othersAvg = rows.slice(1).reduce((s, r) => s + r.done, 0) / (rows.length - 1);
  // "Clearly behind": at least 20 points under the others and not nearly done.
  if (othersAvg - lowest.done < 20 || lowest.done >= 80) return null;
  return { domain: lowest.domain, pct: Math.round(100 - lowest.done) };
}

function protocolOf(workout: GeneratedWorkout, main: WorkoutExercise[]): ProtocolKind {
  if (workout.tabataBlock || main.some((e) => e.protocolBlock === 'tabata')) return 'tabata';
  if (workout.structure === 'emom' || workout.blastMode?.type === 'emom') return 'emom';
  if (main.some((e) => (e.pyramidSequence?.length ?? 0) > 0 || (e.repsSequence?.length ?? 0) > 0)) {
    return 'pyramid';
  }
  const paired = main.filter((e) => e.pairedWith);
  if (paired.length > 0) {
    return paired.some((e) => e.supersetType === 'compound') ? 'superset' : 'antagonist';
  }
  if (workout.appliedProtocol === 'antagonist_pair') return 'antagonist';
  if (workout.appliedProtocol === 'superset') return 'superset';
  return 'straight';
}

function buildExpect(workout: GeneratedWorkout): DecisionExpect {
  const main = workout.exercises.filter(isMain);
  const regular = main.filter((e) => e.protocolBlock !== 'tabata');
  const timed = regular.filter((e) => e.isTimeBased);
  const reps = regular.filter((e) => !e.isTimeBased);
  const useSeconds = timed.length > reps.length;
  const pool = useSeconds ? timed : reps;
  const repValues = pool.flatMap((e) =>
    e.repsRange ? [e.repsRange.min, e.repsRange.max] : [e.reps],
  );
  const repRange = rangeOf(repValues);

  const expect: DecisionExpect = {
    structure: workout.structure,
    protocol: protocolOf(workout, main),
    exercisesCount: main.length,
    setsRange: rangeOf(regular.map((e) => e.sets)),
    repRange: repRange ? { ...repRange, unit: useSeconds ? 'seconds' : 'reps' } : null,
    restRange: rangeOf(regular.map((e) => e.restSeconds)),
    intensityWord: intensityWordFor(workout.difficulty),
    durationMin: Math.round(workout.estimatedDuration || 0),
  };
  if (workout.tabataBlock?.config) {
    const { workSec, restSec, rounds } = workout.tabataBlock.config;
    expect.tabata = { workSec, restSec, rounds };
  }
  return expect;
}

// ============================================================================
// BUILDER
// ============================================================================

export function buildDecisionRecord(
  workout: GeneratedWorkout,
  ctx: DecisionContext = {},
): DecisionRecord {
  const main = workout.exercises.filter(isMain);
  const reasons: DecisionReason[] = [];
  const isRecovery = !!(ctx.isRecoveryDay || workout.isRecovery);

  if (isRecovery) reasons.push({ code: 'RECOVERY_DAY' });

  const days = Math.max(0, Math.floor(ctx.daysInactive ?? 0));
  const returningPolicy =
    ctx.policyReason === 'detraining' ||
    ctx.policyReason === 'long_gap_deload' ||
    ctx.policyReason === 'rebuild';
  // A brand-new user can look "inactive" for hundreds of days — only say
  // "welcome back" inside a believable window.
  if (!isRecovery && days >= RETURNING_MIN_DAYS && days <= 365 && (returningPolicy || ctx.policyReason == null)) {
    reasons.push({ code: 'RETURNING', days });
  }

  const week = ctx.periodizationWeek;
  if (!isRecovery && week != null && !returningPolicy) {
    if (ctx.policyReason === 'deload' || (ctx.policyReason == null && week === 5)) {
      reasons.push({ code: 'DELOAD_WEEK', week });
    } else if (ctx.policyReason === 'peak' || (ctx.policyReason == null && week === 4)) {
      reasons.push({ code: 'PEAK_WEEK', week });
    } else if (ctx.hasActiveCycle && week >= 1 && week <= 3) {
      reasons.push({ code: 'BUILD_WEEK', week });
    }
  }

  if (!isRecovery && ctx.weeklyGap && ctx.weeklyGap.pct > 0) {
    reasons.push({ code: 'WEEKLY_GAP', domain: ctx.weeklyGap.domain, pct: ctx.weeklyGap.pct });
  }

  if (!isRecovery && ctx.skillFocus) {
    reasons.push({ code: 'SKILL_FOCUS', skill: ctx.skillFocus });
  }

  if (!isRecovery && ctx.programFocus && ctx.programFocus.level > 0) {
    reasons.push({
      code: 'PROGRAM_FOCUS',
      program: ctx.programFocus.program,
      level: Math.round(ctx.programFocus.level),
    });
  }

  if (ctx.restedMuscles?.length) {
    reasons.push({ code: 'MUSCLES_RESTED', muscles: ctx.restedMuscles.slice(0, 3) });
  }

  const loc = workout.executionLocation ?? ctx.location ?? null;

  // Weather — each code only when its adaptation is true of THIS workout:
  // rain → a home workout (the resolver sent an inferred park workout home);
  // heat / uv → shorter + more rest (applied to every option);
  // cold → longer warm-up.
  if (ctx.weatherFlag === 'rain' && loc === 'home') {
    reasons.push({ code: 'WEATHER_RAIN' });
  } else if (ctx.weatherFlag === 'heat') {
    reasons.push({ code: 'WEATHER_HEAT' });
  } else if (ctx.weatherFlag === 'uv') {
    reasons.push({ code: 'WEATHER_UV' });
  } else if (ctx.weatherFlag === 'cold') {
    reasons.push({ code: 'WEATHER_COLD' });
  }

  if (loc && main.length > 0) {
    const usesGear = main.some((e) => collectMethodGear(e.method as never).length > 0);
    reasons.push({ code: 'LOCATION', loc, gearSummary: usesGear ? 'equipment' : 'bodyweight' });
  }

  if ((workout.pipelineLog ?? []).some((l) => l.startsWith('level_ceiling_clamp'))) {
    reasons.push({ code: 'LEVEL_CEILING' });
  }

  if (!isRecovery) {
    reasons.push({ code: 'DIFFICULTY', level: intensityWordFor(workout.difficulty) });
  }

  if (ctx.timeOfDay === 'morning' || ctx.timeOfDay === 'evening' || ctx.timeOfDay === 'night') {
    reasons.push({ code: 'TIME', slot: ctx.timeOfDay });
  }

  reasons.sort((a, b) => REASON_RANK.indexOf(a.code) - REASON_RANK.indexOf(b.code));

  return {
    v: 1,
    seed: stableHash(main.map((e) => e.exercise?.id ?? '').join('|') || workout.title || ''),
    reasons,
    expect: buildExpect(workout),
  };
}

/**
 * The first selected skill that the finished workout actually trains — so
 * the note never promises skill work the exercise list doesn't contain.
 * `idToSlug` resolves targetPrograms' Firestore ids to slugs.
 */
export function pickSkillFocus(
  workout: GeneratedWorkout,
  candidateSkills: readonly string[],
  idToSlug?: Map<string, string>,
): string | null {
  if (candidateSkills.length === 0) return null;
  const trained = new Set<string>();
  for (const ex of workout.exercises) {
    if (!isMain(ex)) continue;
    for (const tp of ex.exercise?.targetPrograms ?? []) {
      trained.add(tp.programId);
      const slug = idToSlug?.get(tp.programId);
      if (slug) trained.add(slug);
    }
  }
  return candidateSkills.find((s) => trained.has(s)) ?? null;
}

/**
 * Re-derive `expect` from the CURRENT exercise list (after a swap the stored
 * one can be stale — sets/reps/rest change with the exercise) while keeping
 * the generation-time reasons and seed.
 */
export function refreshDecisionExpect(
  record: DecisionRecord | null | undefined,
  workout: GeneratedWorkout,
): DecisionRecord | null {
  if (!record) return null;
  return { ...record, expect: buildExpect(workout) };
}

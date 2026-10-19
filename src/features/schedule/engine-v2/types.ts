/**
 * Schedule engine v2 — public types.
 *
 * Pure data shapes: no Firebase, no React, no clock. Day index 0 = Sunday … 6 = Saturday
 * (same as the rest of the schedule code). Spec: agent-briefs/schedule-combos.md §4.
 */
import type { RunningDayRole, RunningExperienceLevel } from '../engine/runningRules';
import type { V2Reason } from './reasonsV2';

export type RunSlot = RunningDayRole;
export type TrainingLevel = RunningExperienceLevel;
export type TimeWindow = 'morning' | 'noon' | 'evening';

/**
 * How the user wants conflicts resolved (the "עדיפות" step of the questionnaire).
 * - run_first: runs keep their days; strength drops to the floor before doubling up.
 * - balanced: everything fits if it can, doubles go on quality days (default).
 * - strength_first: strength gets the fresh days; Q2 / easy runs give way first.
 * - skill: like balanced, but skill sessions are protected and never paired with a run.
 */
export type SchedulePriority = 'run_first' | 'balanced' | 'strength_first' | 'skill';

/** Optional detail of a run session — the engine places runs by `slot`, never by position. */
export type RunWorkoutType =
  | 'intervals'
  | 'tempo'
  | 'hills'
  | 'fartlek'
  | 'strides'
  | 'easy'
  | 'long'
  | 'recovery';

export interface AvailabilityException {
  fromDow: number;
  toDow: number;
  kind: 'travel' | 'illness' | 'busy';
  equipment?: 'none' | 'bands' | 'full';
}

export interface Availability {
  /** Specific days the user can train. */
  days: number[];
  /** Per-day windows, keyed '0'..'6' or '*' for "same for all". Missing = any window. */
  windows?: Partial<Record<string, TimeWindow[]>>;
  /** 2 = "two workouts on the same day is OK". */
  maxSessionsPerDay: 1 | 2;
  /** Optional cap on distinct training days ("4 training days wanted"). */
  maxTrainingDays?: number;
  /** The user's long-run day, when they picked one. */
  preferredLongRunDay?: number | null;
  /** This-week-only exceptions (travel / illness / busy). */
  exceptions?: AvailabilityException[];
}

export interface LoadVector {
  push: number;
  pull: number;
  legs: number;
  core: number;
  straightArm: number;
  cns: number;
}

export type Intensity = 'light' | 'moderate' | 'hard';

/** Per-program scheduling profile (§4.1.2 / §4.4). Code defaults until admin fields exist. */
export interface ProgramScheduleProfile {
  load: LoadVector;
  intensity: Intensity;
  perWeek: { min: number; ideal: number; max: number };
  /** Hard floor between two same-pattern sessions (H6). */
  minRecoveryHours: number;
  /** Soft target between two same-pattern sessions (S9 spread). */
  idealRecoveryHours: number;
  sessionMinutes: number;
  /** 'free' = handstand / mobility: never a main session, never counted for H1. */
  slotKind: 'main' | 'free';
  isSkill: boolean;
  /** A no-legs variant used the day before a key run (full body → upper body). */
  noLegsVariant?: string;
}

export interface StrengthProgramInput {
  /** Generator slug (planche, push, legs, full_body …). */
  slug: string;
  sessionsPerWeek: number;
  /** 1 = most important. */
  priority: number;
  freeSlot?: boolean;
  /** Admin overrides of the code default profile. */
  profile?: Partial<ProgramScheduleProfile>;
}

export interface RunSessionInput {
  slot: RunSlot;
  workout?: RunWorkoutType;
  minutes?: number;
}

/** A fixed commitment, e.g. a community group run Tuesday 19:00 that fills Q1. */
export interface FixedRun {
  dow: number;
  time?: string;
  fills: RunSlot;
  source?: 'community' | 'user';
}

export interface RunPlanInput {
  level: TrainingLevel;
  /** '2k' | '3k' | '5k' | '10k' | 'half' | 'maintenance' … */
  targetDistance: string;
  phase?: 'base' | 'build' | 'peak' | 'taper';
  /** This week's sessions by TYPE. Order does not matter. */
  sessions: RunSessionInput[];
  isDeloadWeek?: boolean;
  fixed?: FixedRun[];
}

export type SessionRef =
  | { kind: 'run'; slot: RunSlot }
  | { kind: 'strength'; slug: string };

export interface ExistingWeek {
  days: Partial<Record<number, SessionRef[]>>;
  /**
   * 'rebuild' = soft "keep the user's days" (S4).
   * 'add_track' = keep everything, move only what a hard rule forces, report it.
   */
  mode: 'rebuild' | 'add_track';
  /** 'system-default' days are cheaper to move (S4: 2 instead of 5). */
  source?: 'user' | 'system-default';
}

/** Completed / missed history for the current week. Days before `todayDow` are frozen. */
export interface WeekHistory {
  todayDow: number;
  completed?: Array<{ dow: number; session: SessionRef }>;
  missed?: Array<{ dow: number; weekOffset?: number; session: SessionRef }>;
}

export interface WalkingInput {
  dailyStepGoal?: number;
  weeklyAerobicTargetMin?: number;
}

export interface ScheduleEngineInput {
  availability: Availability;
  strength: StrengthProgramInput[];
  running: RunPlanInput | null;
  priority?: SchedulePriority;
  levels: { strength: TrainingLevel | null; running: TrainingLevel | null };
  existing?: ExistingWeek | null;
  history?: WeekHistory | null;
  walking?: WalkingInput | null;
  /** 1..5 position in the strength 5-week cycle (4 = peak, 5 = deload). */
  strengthCycleWeek?: number;
}

// ── Output ────────────────────────────────────────────────────────────────

export interface PlacedSession {
  kind: 'run' | 'strength' | 'mobility' | 'walk';
  slot?: RunSlot;
  slug?: string;
  workout?: RunWorkoutType;
  /** <100 = lighter session (deload 50, combined 60, post-OAPU recovery 50). */
  volumePct?: number;
  minutes?: number;
  optional?: boolean;
  makeup?: boolean;
  fixed?: boolean;
  time?: string;
  window?: TimeWindow;
  /** Same window as the previous session of the day: one continuous session. */
  continuous?: boolean;
  /** Two strength programs merged into one combined session. */
  combined?: boolean;
  /** This session replaces `variantOf` (full body → upper body before a key run). */
  variantOf?: string;
  equipment?: 'none' | 'bands' | 'full';
}

export type DiffStatus = 'new' | 'kept' | 'moved' | 'removed';

export interface DiffEntry {
  status: DiffStatus;
  session: SessionRef;
  fromDow?: number;
  toDow?: number;
  /** Hebrew label: "חדש", "נשאר", "הוזז: … · כי …", "הוסר". */
  labelHe: string;
}

export interface DayPlan {
  dow: number;
  available: boolean;
  sessions: PlacedSession[];
  reasons: V2Reason[];
  reasonsHe: string[];
}

export interface WeekPlan {
  priority: SchedulePriority;
  days: DayPlan[];
  warnings: V2Reason[];
  warningsHe: string[];
  dropped: SessionRef[];
  diff: DiffEntry[];
  penalty: number;
  penaltyBreakdown: Record<string, number>;
  /** Hard-rule ids violated by the final week (empty unless nothing valid exists). */
  hardViolations: string[];
  /** The search hit its node budget (the week is the best found, not proven best). */
  searchTruncated: boolean;
}

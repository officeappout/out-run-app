/**
 * Schedule engine v2 — every tunable number in one place.
 *
 * Weights are the §4.3 table of agent-briefs/schedule-combos.md. Owner decisions that may
 * change later (19.10.2026) are marked OWNER: and are plain constants on purpose.
 */
import { MAX_CONSECUTIVE_TRAINING_DAYS } from '../engine/runningRules';
import { MIN_DAYS_FOR_HARD_SKILLS } from '../engine/scheduleRules';
import { WHO_STRENGTH_TARGET_DAYS } from '@/lib/who-strength-target';
import type { RunSlot, SchedulePriority, TrainingLevel } from './types';

// ── Owner decisions ─────────────────────────────────────────────────────────

/**
 * OWNER: the long-run day = the user's preferred long-run day when set (and free),
 * else the LAST free day of the week. Fri / Sat count only when marked free.
 */
export const LONG_RUN_DEFAULT_RULE = 'preferred-else-last-free-day' as const;

/** OWNER: "≥2 strength days" is SOFT — a recommendation with an explanation, never a block. */
export const STRENGTH_FLOOR_DAYS = WHO_STRENGTH_TARGET_DAYS;
export const STRENGTH_FLOOR_IS_HARD = false;

/** OWNER: default priority when the user didn't pick one. */
export const DEFAULT_PRIORITY: SchedulePriority = 'balanced';

// ── Soft preferences (§4.3) ─────────────────────────────────────────────────

export const W = {
  /** S1 long run on the preferred day, per day away. */
  S1_LONG_RUN_DAY: 8,
  /** S2 strength floor, per missing day (part of the floor drop cost below). */
  S2_STRENGTH_FLOOR: 10,
  /** S3 program frequency, per missing session × 1/priority. */
  S3_PROGRAM_FREQUENCY: 4,
  /** S4 keep the user's days, per moved session. */
  S4_KEEP_DAYS: 5,
  S4_KEEP_DAYS_SYSTEM_DEFAULT: 2,
  /** add_track mode: an existing session moves only for a hard rule or a clearly better week (e.g. the long-run day, S1 ≥ 16). */
  S4_KEEP_DAYS_ADD_TRACK: 12,
  /** S5 a double day that is not a quality day. */
  S5_DOUBLE_NOT_QUALITY: 3,
  /** S6 more than one double when the week has ≤ 4 sessions, per extra double. */
  S6_EXTRA_DOUBLE_SMALL_WEEK: 6,
  S6_SMALL_WEEK_SESSIONS: 4,
  /** S7 moderate legs (full body) the day before a quality / long run. */
  S7_MODERATE_LEGS_BEFORE_KEY: 6,
  /** S8 long run right after a quality day, or quality right after the long run. */
  S8_LONG_AFTER_QUALITY: 4,
  /** S9 adjacent hard days (same domain), per pair; also same-pattern sessions under the ideal gap. */
  S9_ADJACENT_HARD: 2,
  /** S10 consecutive training days over the level comfort, per extra day. */
  S10_STREAK: 3,
  /** S12 a skill (cns ≥ 0.7) session on a run day. */
  S12_SKILL_WITH_RUN: 2,
  /** S13 double-day gap < 6h, only when both sessions carry an explicit time. */
  S13_SHORT_DOUBLE_GAP: 3,
  /** Tie-break: separate days are preferred over a double when nothing else differs. */
  TIE_DOUBLE_DAY: 1,
  /** Tie-break: spread same-program sessions (× Σ 1/gap). */
  TIE_SPREAD: 0.5,
  /** A full body swapped to its no-legs variant (cheaper than S7). */
  VARIANT_SWAP: 4,
} as const;

/** S10 comfort (consecutive training days) by level. */
export const STREAK_COMFORT: Record<TrainingLevel, number> = {
  beginner: 3,
  intermediate: 5,
  advanced: 6,
};

/** H8 run-day streak cap by level — the existing RUN-04 table. */
export const RUN_STREAK_CAP = MAX_CONSECUTIVE_TRAINING_DAYS;

/** Hard-skill count → recommended strength days (the existing ERR_DAYS_MIN table). */
export const SKILL_DAYS_MIN = MIN_DAYS_FOR_HARD_SKILLS;

// ── Conflict resolution (§4.3 order) as drop costs ──────────────────────────
//
// Kept from the top, dropped from the bottom:
//   H rules > availability > long run (>5k) / Q1 (≤5k) > the other one > strength floor >
//   priority-1 skill frequency > Q2 > further strength (merged before dropped) > easy /
//   recovery > free slots (never dropped: merged into existing days).
// The S2 / S3 weights are folded into the strength costs.

export const DROP = {
  KEY_RUN_TOP: 300,
  KEY_RUN_SECOND: 200,
  STRENGTH_FLOOR: 50,
  SKILL_P1_EXTRA: 35,
  QUALITY_SECONDARY: 25,
  /** + S3 / priority. */
  STRENGTH_EXTRA: 6,
  EASY: 5,
  RECOVERY: 4,
  /** The calisthenics_upper overflow day added for skill users. */
  OVERFLOW: 2,
  /** Merging two strength programs into one combined day. */
  MERGE: 5,
  /** strength_first only: Q2 becomes an easy run (strength first that day). */
  Q2_TO_EASY: 2,
  /** Travel week: everything but L / Q1 / the strength floor becomes optional. */
  TRAVEL_OPTIONAL: 1,
} as const;

/** Priority modifiers. */
export const PRIORITY_TUNING: Record<
  SchedulePriority,
  {
    /** Extra cost per double day. */
    doubleDay: number;
    /** Multiplier on the drop cost of further (non-floor) strength sessions. */
    strengthExtraDrop: number;
    /** Drop cost of Q2 (overrides DROP.QUALITY_SECONDARY). */
    qualitySecondaryDrop: number;
    /** Extra cost when strength follows a quality / long run the same day. */
    strengthAfterKeyRun: number;
    /** Extra cost when a skill shares a day with any run. */
    skillWithRun: number;
    /** Multiplier on the drop cost of skill sessions. */
    skillDrop: number;
    /** Q2 may be turned into an easy run before it is dropped. */
    q2CanBecomeEasy: boolean;
    /** On an easy-run double, strength goes first. */
    strengthFirstOnEasyDouble: boolean;
  }
> = {
  run_first: {
    doubleDay: 10, strengthExtraDrop: 0.5, qualitySecondaryDrop: DROP.QUALITY_SECONDARY,
    strengthAfterKeyRun: 0, skillWithRun: 0, skillDrop: 1, q2CanBecomeEasy: false, strengthFirstOnEasyDouble: false,
  },
  balanced: {
    doubleDay: 0, strengthExtraDrop: 1, qualitySecondaryDrop: DROP.QUALITY_SECONDARY,
    strengthAfterKeyRun: 0, skillWithRun: 0, skillDrop: 1, q2CanBecomeEasy: false, strengthFirstOnEasyDouble: false,
  },
  strength_first: {
    doubleDay: 0, strengthExtraDrop: 1.5, qualitySecondaryDrop: 8,
    strengthAfterKeyRun: 6, skillWithRun: 0, skillDrop: 1, q2CanBecomeEasy: true, strengthFirstOnEasyDouble: true,
  },
  skill: {
    doubleDay: 0, strengthExtraDrop: 1, qualitySecondaryDrop: DROP.QUALITY_SECONDARY,
    strengthAfterKeyRun: 0, skillWithRun: 6, skillDrop: 2, q2CanBecomeEasy: false, strengthFirstOnEasyDouble: false,
  },
};

// ── Runs ────────────────────────────────────────────────────────────────────

/** Target distance → km (for the ≤5k / >5k split of the conflict order). */
export const TARGET_DISTANCE_KM: Record<string, number> = {
  '2k': 2,
  '3k': 3,
  '5k': 5,
  '10k': 10,
  half: 21.1,
  marathon: 42.2,
  maintenance: 5,
};
export const SHORT_DISTANCE_KM = 5;

/** Default minutes per run slot, for the weekly aerobic estimate only. */
export const RUN_SLOT_MINUTES: Record<RunSlot, number> = {
  quality_primary: 40,
  quality_secondary: 40,
  long_run: 55,
  easy_run: 30,
  recovery: 25,
};

export const isQualitySlot = (s: RunSlot | undefined): boolean =>
  s === 'quality_primary' || s === 'quality_secondary';
export const isKeySlot = (s: RunSlot | undefined): boolean => isQualitySlot(s) || s === 'long_run';

// ── Free slots, walks, makeups ──────────────────────────────────────────────

export const MOBILITY_MINUTES = 10;
export const WALK_MINUTES = 30;
/** A combined (merged) day runs each program at this share. */
export const COMBINED_VOLUME_PCT = 60;
/** Strength deload week (cycle week 5) and run deload volume. */
export const STRENGTH_DELOAD_VOLUME_PCT = 50;
export const RUN_DELOAD_VOLUME_PCT = 80;
/** FIX-01: the front lever after a one-arm pull-up in the same week is a recovery session. */
export const OAPU_RECOVERY_VOLUME_PCT = 50;

/** At most one makeup per week; the miss must be ≤ this many days old (calm-return policy). */
export const MAKEUP_PER_WEEK = 1;
export const MAKEUP_WEIGHTS = { DELAY_PER_DAY: 1, DOUBLE: 3, MOVE_OTHER: 2 } as const;

/** Search safety net (leaves evaluated per reduction step). */
export const SEARCH_NODE_BUDGET = 400_000;

/** Days are linked across Saturday → Sunday for H3 / H4 / H6 / H7 / S7 / S8 (the week repeats). */
export const WRAP_WEEK = true;

// ── Shabbat (OWNER 20.10.2026) ──────────────────────────────────────────────

/** Saturday (day 6) is not a training day by default; it opens only when the user marks it free. */
export const SATURDAY_DOW = 6;
export const SATURDAY_DEFAULT_OFF = true;

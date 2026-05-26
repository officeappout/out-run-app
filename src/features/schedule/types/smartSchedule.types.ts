/**
 * Smart Schedule v1.3 — Type Definitions & Constants
 *
 * Source of truth: src/features/schedule/out-run-schedule-logic-v1.3.md
 * Implements section 9 of the spec verbatim.
 *
 * RULES:
 *   - HANDSTAND is a Free Slot — does NOT count toward MAX_ACTIVE_SKILLS.
 *   - ScheduleDay.sessions is ALWAYS an array (rest day = `sessions: []`).
 *   - CARDIO_ACCESSORY is declared for forward-compatibility (Phase 2) but
 *     carries no runtime logic in v1.3.
 */

// ── Identifiers ────────────────────────────────────────────────────────────
export type SkillId =
  | 'PLANCHE'
  | 'HSPU'
  | 'FRONT_LEVER'
  | 'OAPU'
  | 'MUSCLE_UP'
  | 'HANDSTAND';

export type ProgramId = 'FULL_BODY' | 'UPPER_BODY' | 'UPPER_CALISTHENICS';

export type SessionType =
  | 'FULL'
  | 'COMBINED'
  | 'RECOVERY'
  | 'PROTECTIVE'
  | 'REST'
  | 'ACCESSORY';

export type MovementType = 'PUSH' | 'PULL' | 'DYNAMIC' | 'NEURAL' | 'CARDIO';

export type WarningLevel = 'ERROR' | 'WARN';

export type UBDominance = 'PUSH_DOM' | 'PULL_DOM' | 'BALANCED';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Identifier accepted anywhere a "thing the user trains" is referenced.
export type ScheduleItemId = SkillId | ProgramId;

// ── Skill / Session models ─────────────────────────────────────────────────
export interface PrioritizedSkill {
  id: SkillId;
  priority: number;
  movementType: MovementType;
  isFreeSlot: boolean; // true only for HANDSTAND
  minRestHours: number;
  countsTowardCap: boolean; // false only for HANDSTAND
}

export interface SessionItem {
  skillId: ScheduleItemId;
  volumePercent: number; // 0–100
  sessionType: SessionType;
  dominance?: UBDominance;
  orderInDay?: number; // ordering inside a Multi-Session day
}

// [ARCH-02] ScheduleDay — `sessions: SessionItem[]` (multi-session aware).
export interface ScheduleDay {
  dayOfWeek: DayOfWeek;
  sessions: SessionItem[]; // always an array; empty = rest
  isRestDay: boolean;
  warnings: Warning[];
}

export interface Warning {
  code: string;
  level: WarningLevel;
  message: string;
  affectedDays: number[];
}

export interface MultiSessionRule {
  condition: (sessions: SessionItem[]) => boolean;
  code: string;
  message: string;
}

// ── Recovery (Phase-coupled — used only by SmartWeeklySchedule, not wizard) ──
export interface RecoveryRecommendation {
  suggestedSession: SessionItem;
  reason: string;
  rollingWindowProposal?: RollingWindowProposal;
}

export interface RollingWindowProposal {
  missedSession: SessionItem;
  proposedDay: number;
  shiftedSessions: ScheduleDay[];
  validationErrors: Warning[];
}

// ── [ARCH-01 Phase 2] CARDIO_ACCESSORY — type stub only ────────────────────
// No runtime logic in v1.3. Keeps the surface stable for Phase 2.
export interface CardioAccessory {
  id: 'RUN' | 'WALK' | 'HIIT_CARDIO';
  conflictType: 'NONE';
  countsTowardSkillCap: false;
  minRestHours: 0;
  canShareDayWith: 'ALL';
  phase: 2;
}

// ── Anatomical Classification ──────────────────────────────────────────────
export const PUSH_SKILLS: SkillId[] = ['PLANCHE', 'HSPU'];
export const PULL_SKILLS: SkillId[] = ['FRONT_LEVER', 'OAPU'];
export const DYNAMIC_SKILLS: SkillId[] = ['MUSCLE_UP'];
export const NEURAL_SKILLS: SkillId[] = ['HANDSTAND'];

export const ALL_SKILL_IDS: SkillId[] = [
  'PLANCHE',
  'HSPU',
  'FRONT_LEVER',
  'OAPU',
  'MUSCLE_UP',
  'HANDSTAND',
];

export const ALL_PROGRAM_IDS: ProgramId[] = [
  'FULL_BODY',
  'UPPER_BODY',
  'UPPER_CALISTHENICS',
];

// ── Skill Cap Logic ────────────────────────────────────────────────────────
export const MAX_ACTIVE_SKILLS = 4;

export function countActiveSkills(skills: SkillId[]): number {
  return skills.filter((s) => s !== 'HANDSTAND').length;
}

// ── Minimum Rest Hours ─────────────────────────────────────────────────────
export const MIN_REST_HOURS: Record<string, number> = {
  OAPU: 48,
  MUSCLE_UP: 48,
  FRONT_LEVER: 36,
  PLANCHE: 36,
  HSPU: 36,
  HANDSTAND: 24,
  FULL_BODY: 24,
  UPPER_BODY: 24,
  UPPER_CALISTHENICS: 24,
  RUN: 0, // Phase 2
  WALK: 0,
};

// ── Session Order in a Multi-Session Day ───────────────────────────────────
// Used to deterministically sort sessions[] within a single day.
export const SESSION_ORDER_IN_DAY: ScheduleItemId[] = [
  'HANDSTAND', // morning — neural skill, fresh CNS
  'PLANCHE',
  'FRONT_LEVER',
  'MUSCLE_UP',
  'HSPU',
  'OAPU',
  'UPPER_CALISTHENICS',
  'UPPER_BODY',
  'FULL_BODY',
];

// ── Schedule Policy ────────────────────────────────────────────────────────
export const SCHEDULE_POLICY = {
  WEEKDAYS_AVAILABLE: [0, 1, 2, 3, 4, 5] as const,
  FRIDAY_STATUS: 'AVAILABLE' as const,
  SATURDAY_STATUS: 'REST_DEFAULT' as const,
  SATURDAY_MANUAL_OVERRIDE: true,
  MAX_ACTIVE_SKILLS: 4,
  PREFERRED_DAYS: {
    2: [0, 3], // א + ד
    3: [0, 2, 4], // א + ג + ה  (lifestyle weekend protection)
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
  } as Record<2 | 3 | 4 | 5 | 6, number[]>,
};

// ── Hebrew Day Letters (index 0 = Sunday = 'א') ────────────────────────────
export const DAY_LETTERS: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] = [
  'א',
  'ב',
  'ג',
  'ד',
  'ה',
  'ו',
  'ש',
];

// ── Skill / Program → Movement Type Lookup ─────────────────────────────────
export const MOVEMENT_OF: Record<ScheduleItemId, MovementType | 'MIXED'> = {
  PLANCHE: 'PUSH',
  HSPU: 'PUSH',
  FRONT_LEVER: 'PULL',
  OAPU: 'PULL',
  MUSCLE_UP: 'DYNAMIC',
  HANDSTAND: 'NEURAL',
  FULL_BODY: 'MIXED',
  UPPER_BODY: 'MIXED',
  UPPER_CALISTHENICS: 'MIXED',
};

// ── UI Display Map ─────────────────────────────────────────────────────────
// Used by ScheduleStep DayCard + DayPopover to render badges.
// `iconPath` → path to the detailed vector in /public/icons/programs/ (primary).
// `icon`     → emoji fallback (used when iconPath image fails to load).
// `tint`     → Tailwind bg class for the rounded badge wrapper.
export interface SkillDisplaySpec {
  /** Emoji fallback — only shown if the SVG asset fails to load. */
  icon: string;
  /** Path to /public/icons/programs/*.svg — the canonical detailed icon. */
  iconPath: string;
  shortName: string;
  tint: string;
  iconColor: string;
}

export const SKILL_DISPLAY: Record<ScheduleItemId, SkillDisplaySpec> = {
  PLANCHE: {
    icon: '🤸',
    iconPath: '/icons/programs/planche.svg',
    shortName: "פלאנץ׳",
    tint: 'bg-cyan-100',
    iconColor: 'text-cyan-700',
  },
  HSPU: {
    icon: '🙆',
    iconPath: '/icons/programs/hspu.svg',
    shortName: 'HSPU',
    tint: 'bg-blue-100',
    iconColor: 'text-blue-700',
  },
  FRONT_LEVER: {
    icon: '🏋️',
    iconPath: '/icons/programs/front_lever.svg',
    shortName: 'פרונט',
    tint: 'bg-teal-100',
    iconColor: 'text-teal-700',
  },
  OAPU: {
    icon: '💪',
    iconPath: '/icons/programs/one_arm_pullup.svg',
    shortName: 'OAPU',
    tint: 'bg-indigo-100',
    iconColor: 'text-indigo-700',
  },
  MUSCLE_UP: {
    icon: '⬆️',
    iconPath: '/icons/programs/muscle_up_bar.svg',
    shortName: 'מאסל-אפ',
    tint: 'bg-purple-100',
    iconColor: 'text-purple-700',
  },
  HANDSTAND: {
    icon: '🤲',
    iconPath: '/icons/programs/handstand.svg',
    shortName: 'ע. ידיים',
    tint: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
  },
  FULL_BODY: {
    icon: '⚡',
    iconPath: '/icons/programs/full_body.svg',
    shortName: 'כל הגוף',
    tint: 'bg-orange-100',
    iconColor: 'text-orange-700',
  },
  UPPER_BODY: {
    icon: '⬆️',
    iconPath: '/icons/programs/muscle.svg',
    shortName: 'פ.ג. עליון',
    tint: 'bg-amber-100',
    iconColor: 'text-amber-700',
  },
  UPPER_CALISTHENICS: {
    icon: '🔄',
    iconPath: '/icons/programs/muscle.svg',
    shortName: 'קליסט. עליון',
    tint: 'bg-lime-100',
    iconColor: 'text-lime-700',
  },
};

// Convenience: which IDs are skills vs programs
export function isSkillId(id: string): id is SkillId {
  return (ALL_SKILL_IDS as string[]).includes(id);
}

export function isProgramId(id: string): id is ProgramId {
  return (ALL_PROGRAM_IDS as string[]).includes(id);
}

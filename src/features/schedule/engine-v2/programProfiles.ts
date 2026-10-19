/**
 * Program schedule profiles — the §4.4 load-vector table as code defaults, keyed by
 * generator slug. Admin fields on `programs` can override any field later
 * (StrengthProgramInput.profile); until then these numbers are the source of truth.
 *
 * Ranges in the doc ("2-3", "24-48h") become ideal = the high end and min = the low end.
 */
import { classifyStrengthId, SCHEDULE_ID_NAME_HE } from '../engine/strengthVocabulary';
import type { LoadVector, ProgramScheduleProfile, StrengthProgramInput } from './types';

const lv = (push: number, pull: number, legs: number, core: number, straightArm: number, cns: number): LoadVector => ({
  push, pull, legs, core, straightArm, cns,
});

type P = ProgramScheduleProfile;
const hardSkill = (load: LoadVector, perWeek: P['perWeek'], minH: number, minutes: number): P => ({
  load, intensity: 'hard', perWeek, minRecoveryHours: minH, idealRecoveryHours: Math.max(48, minH),
  sessionMinutes: minutes, slotKind: 'main', isSkill: true,
});

export const PROGRAM_PROFILES: Readonly<Record<string, ProgramScheduleProfile>> = {
  planche: hardSkill(lv(1, 0, 0, 0.4, 1, 0.8), { min: 2, ideal: 3, max: 4 }, 36, 35),
  hspu: hardSkill(lv(1, 0, 0, 0.3, 0, 0.6), { min: 2, ideal: 2, max: 3 }, 36, 30),
  front_lever: hardSkill(lv(0, 1, 0, 0.6, 1, 0.8), { min: 2, ideal: 3, max: 4 }, 36, 35),
  one_arm_pullup: hardSkill(lv(0, 1, 0, 0.2, 0, 0.8), { min: 1, ideal: 2, max: 3 }, 48, 30),
  muscle_up: hardSkill(lv(0.5, 0.8, 0, 0.3, 0, 1), { min: 1, ideal: 2, max: 2 }, 48, 30),
  handstand: {
    load: lv(0.2, 0, 0, 0.2, 0, 0.3), intensity: 'light', perWeek: { min: 3, ideal: 5, max: 7 },
    minRecoveryHours: 24, idealRecoveryHours: 24, sessionMinutes: 12, slotKind: 'free', isSkill: false,
  },
  push: {
    load: lv(1, 0, 0, 0.2, 0, 0.4), intensity: 'moderate', perWeek: { min: 1, ideal: 2, max: 3 },
    minRecoveryHours: 48, idealRecoveryHours: 48, sessionMinutes: 40, slotKind: 'main', isSkill: false,
  },
  pull: {
    load: lv(0, 1, 0, 0.2, 0, 0.4), intensity: 'moderate', perWeek: { min: 1, ideal: 2, max: 3 },
    minRecoveryHours: 48, idealRecoveryHours: 48, sessionMinutes: 40, slotKind: 'main', isSkill: false,
  },
  legs: {
    load: lv(0, 0, 1, 0.3, 0, 0.5), intensity: 'hard', perWeek: { min: 1, ideal: 2, max: 2 },
    minRecoveryHours: 48, idealRecoveryHours: 48, sessionMinutes: 40, slotKind: 'main', isSkill: false,
  },
  core: {
    load: lv(0, 0, 0, 1, 0, 0.1), intensity: 'light', perWeek: { min: 2, ideal: 3, max: 5 },
    minRecoveryHours: 24, idealRecoveryHours: 24, sessionMinutes: 15, slotKind: 'main', isSkill: false,
  },
  full_body: {
    load: lv(0.6, 0.6, 0.6, 0.4, 0.2, 0.5), intensity: 'moderate', perWeek: { min: 2, ideal: 3, max: 3 },
    minRecoveryHours: 24, idealRecoveryHours: 48, sessionMinutes: 45, slotKind: 'main', isSkill: false,
    noLegsVariant: 'upper_body',
  },
  upper_body: {
    load: lv(0.7, 0.7, 0, 0.3, 0.3, 0.5), intensity: 'moderate', perWeek: { min: 2, ideal: 3, max: 4 },
    minRecoveryHours: 24, idealRecoveryHours: 48, sessionMinutes: 40, slotKind: 'main', isSkill: false,
  },
  mobility: {
    load: lv(0, 0, 0, 0, 0, 0), intensity: 'light', perWeek: { min: 0, ideal: 3, max: 7 },
    minRecoveryHours: 0, idealRecoveryHours: 0, sessionMinutes: 10, slotKind: 'free', isSkill: false,
  },
};

/** Aliases → the canonical profile slug. */
const SLUG_ALIASES: Readonly<Record<string, string>> = {
  lower_body: 'legs',
  calisthenics_upper: 'upper_body',
  upper_calisthenics: 'upper_body',
  handstand_pushup: 'hspu',
  oapu: 'one_arm_pullup',
  oap: 'one_arm_pullup',
  stretching: 'mobility',
};

export function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function canonicalSlug(slug: string): string {
  const s = normalizeSlug(slug);
  return SLUG_ALIASES[s] ?? s;
}

/** Unknown slugs get a neutral moderate upper-body profile (never a guessed leg load). */
const FALLBACK = PROGRAM_PROFILES.upper_body;

export function profileOf(slug: string, override?: Partial<ProgramScheduleProfile>): ProgramScheduleProfile {
  const base = PROGRAM_PROFILES[canonicalSlug(slug)] ?? FALLBACK;
  if (!override) return base;
  return { ...base, ...override, load: { ...base.load, ...(override.load ?? {}) } };
}

export function profileOfProgram(p: StrengthProgramInput): ProgramScheduleProfile {
  const prof = profileOf(p.slug, p.profile);
  return p.freeSlot ? { ...prof, slotKind: 'free' } : prof;
}

export const isOapu = (slug: string): boolean => canonicalSlug(slug) === 'one_arm_pullup';
export const isMuscleUp = (slug: string): boolean => canonicalSlug(slug) === 'muscle_up';

/** Patterns H6 reads. Straight-arm is soft only (S07 / S21: planche → front lever next day is fine). */
export const H6_PATTERNS = ['push', 'pull', 'legs'] as const;
export const SHARED_PATTERN_LOAD = 0.7;
/** Spread (S9) also looks at moderate shared loads, e.g. full body ↔ full body. */
export const SPREAD_PATTERN_LOAD = 0.5;
export const HEAVY_LEGS = 0.8;
export const MODERATE_LEGS = 0.5;
export const SKILL_CNS = 0.7;

/** Element-wise max — the load of a combined (merged) session. */
export function maxLoad(a: LoadVector, b: LoadVector): LoadVector {
  return {
    push: Math.max(a.push, b.push),
    pull: Math.max(a.pull, b.pull),
    legs: Math.max(a.legs, b.legs),
    core: Math.max(a.core, b.core),
    straightArm: Math.max(a.straightArm, b.straightArm),
    cns: Math.max(a.cns, b.cns),
  };
}

// ── Hebrew names ────────────────────────────────────────────────────────────

const BASE_PROGRAM_NAME_HE: Readonly<Record<string, string>> = {
  push: 'דחיפה',
  pull: 'משיכה',
  legs: 'רגליים',
  core: 'ליבה',
  mobility: 'מוביליטי',
  upper_body: 'פלג גוף עליון',
  full_body: 'כל הגוף',
};

/** Hebrew name of a strength slug; skills reuse the schedule vocabulary's names. */
export function slugNameHe(slug: string): string {
  const s = normalizeSlug(slug);
  if (s === 'calisthenics_upper' || s === 'upper_calisthenics') return SCHEDULE_ID_NAME_HE.UPPER_CALISTHENICS;
  const base = BASE_PROGRAM_NAME_HE[canonicalSlug(s)];
  if (base) return base;
  const id = classifyStrengthId(s).scheduleId;
  return id ? SCHEDULE_ID_NAME_HE[id] : 'אימון כוח';
}

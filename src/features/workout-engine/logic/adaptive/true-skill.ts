/**
 * 3d — "true skill" classification (owner list, 22.10.2026): one-arm pull-up, front / back
 * lever, planche, handstand push-up, muscle-up, human flag, pistol squat.
 *
 * Why not `classifyPriority(...) === 'skill'`: that also fires for every exercise that merely
 * belongs to a skill program — the catalog files plain pull-ups under front_lever /
 * one_arm_pullup and plain dips under planche — so the 5-rep ceiling hit regular moves.
 *
 * Signals, in order (catalog first, names as the fallback the catalog still needs):
 *   1. tag `true_skill`                     — explicit catalog override
 *   2. base_movement_id in the list         — the admin's "base movement" field
 *   3. the Hebrew / English name of the move — e.g. "פרונט לבר בטאק", "עליית כוח עם טבעות"
 * Pseudo-planche / side-plank flag drills are excluded (regular strength work).
 */
import { getLocalizedText, type Exercise } from '@/features/content/exercises/core/exercise.types';
import type { TierName } from '../workout-generator.types';
import {
  NON_SKILL_ELITE_REPS,
  NON_SKILL_HARD_REPS,
  NON_SKILL_HARD_REP_CEILING,
  SKILL_HOLD_CEILING_S,
  SKILL_REP_CEILING,
} from './adaptive.config';

/** Base-movement ids (exercise-editor BASE_MOVEMENT_LABELS) that are true skills. */
export const TRUE_SKILL_BASE_MOVEMENTS: ReadonlySet<string> = new Set([
  'one_arm_pull',
  'one_arm_pullup',
  'front_lever',
  'back_lever',
  'planche',
  'handstand_pushup',
  'muscle_up',
  'human_flag',
  'pistol_squat',
]);

/** Name patterns of the true-skill moves themselves (not their program's accessories). */
export const TRUE_SKILL_NAME_PATTERNS: readonly RegExp[] = [
  /מתח\s*יד\s*אחת/, /one[\s_-]?arm[\s_-]?pull/i,
  /פרונט\s*לבר/, /מנוף\s*קדמי/, /front[\s_-]?lever/i,
  /באק\s*לבר/, /מנוף\s*אחורי/, /back[\s_-]?lever/i,
  /פלאנץ/, /פלאנש/, /planche/i,
  /סמיכה\s*בעמידת\s*ידיים/, /handstand[\s_-]?push/i, /\bhspu\b/i,
  /עליית\s*כוח/, /מאסל\s*אפ/, /מאסלאפ/, /muscle[\s_-]?up/i,
  /דגל\s*אנושי/, /^דגל/, /human[\s_-]?flag/i,
  /פיסטול/, /pistol/i,
];

/** Drills that carry a skill word but are regular strength work. */
const NOT_TRUE_SKILL_PATTERNS: readonly RegExp[] = [/פסודו/, /pseudo/i, /פלאנק/, /plank/i];

function namesOf(exercise: Exercise): string[] {
  const raw = exercise.name as unknown;
  if (typeof raw === 'string') return [raw];
  const he = getLocalizedText(exercise.name);
  const en = (raw as { en?: string } | null)?.en ?? '';
  return [he, en].filter((s) => !!s);
}

export function isTrueSkillExercise(exercise: Exercise | null | undefined): boolean {
  if (!exercise) return false;
  const tags = (exercise.tags ?? []) as string[];
  if (tags.includes('true_skill')) return true;
  const base = exercise.base_movement_id;
  if (base && TRUE_SKILL_BASE_MOVEMENTS.has(base)) return true;
  const names = namesOf(exercise);
  if (names.some((n) => NOT_TRUE_SKILL_PATTERNS.some((p) => p.test(n)))) return false;
  return names.some((n) => TRUE_SKILL_NAME_PATTERNS.some((p) => p.test(n)));
}

/**
 * Rep range for an ABOVE-level (hard / elite) exercise when the flag is on.
 * True skill → today's TIER_TABLE range (1–3); a regular exercise gets its own range.
 * Returns null for match / easy / flow (the staircase owns those).
 */
export function aboveLevelRepRange(
  tierName: TierName,
  trueSkill: boolean,
  tierRange: { min: number; max: number },
): { min: number; max: number } | null {
  if (tierName !== 'hard' && tierName !== 'elite') return null;
  if (trueSkill) return { min: tierRange.min, max: tierRange.max };
  const r = tierName === 'hard' ? NON_SKILL_HARD_REPS : NON_SKILL_ELITE_REPS;
  return { min: r.min, max: r.max };
}

/** Hold cap with the flag on: a true skill never holds past SKILL_HOLD_CEILING_S. */
export function trueSkillHoldCap(baseCap: number, trueSkill: boolean): number {
  return trueSkill ? Math.min(baseCap, SKILL_HOLD_CEILING_S) : baseCap;
}

/**
 * The rep ceiling for one exercise, or null = no ceiling.
 *   flag OFF: today's rule — any skill-priority exercise OR any hard / elite exercise → 5.
 *   flag ON:  true skill → 5; a regular exercise at hard / elite → NON_SKILL_HARD_REP_CEILING;
 *             everything else uncapped.
 */
export function repCeilingFor(opts: {
  flagOn: boolean;
  trueSkill: boolean;
  isSkillPriority: boolean;
  isAboveLevelTier: boolean;
}): number | null {
  if (!opts.flagOn) {
    return opts.isSkillPriority || opts.isAboveLevelTier ? SKILL_REP_CEILING : null;
  }
  if (opts.trueSkill) return SKILL_REP_CEILING;
  return opts.isAboveLevelTier ? NON_SKILL_HARD_REP_CEILING : null;
}

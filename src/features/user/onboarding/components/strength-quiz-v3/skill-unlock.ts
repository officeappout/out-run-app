/**
 * Strength questionnaire v3 (enable_strength_quiz_v3), screen 5a: which skills the measured push / pull
 * levels unlock, and the estimated level in each. Pure, no React, no Firebase (__tests__/skill-unlock.test.ts).
 *
 * Owner decision 26.10.2026 (round 7): front lever opens from pull 14, planche from push 16.
 * Estimate = base level minus the skill → foundation offset (onboarding-sync.service.ts:
 * foundation level = skill level + 9, "push 20 = planche 11"), never below level 1.
 */

/** Pull level from which the front lever program opens. */
export const FRONT_LEVER_UNLOCK_PULL = 14;
/** Push level from which the planche program opens. */
export const PLANCHE_UNLOCK_PUSH = 16;
/** Mirrors SKILL_TO_FOUNDATION_OFFSET in onboarding-sync.service.ts (not exported there). */
export const SKILL_LEVEL_OFFSET = 9;

export type QuizV3SkillId = 'planche' | 'front_lever';
export type SkillSourceGroup = 'push' | 'pull';

interface SkillRule {
  skillId: QuizV3SkillId;
  source: SkillSourceGroup;
  minLevel: number;
}

/** Board order: planche first, then front lever. */
const SKILL_RULES: readonly SkillRule[] = [
  { skillId: 'planche', source: 'push', minLevel: PLANCHE_UNLOCK_PUSH },
  { skillId: 'front_lever', source: 'pull', minLevel: FRONT_LEVER_UNLOCK_PULL },
];

export interface UnlockedSkill {
  skillId: QuizV3SkillId;
  /** The group whose level unlocked it ("לפי הדחיפה שלך"). */
  source: SkillSourceGroup;
  estimatedLevel: number;
}

/** Skill level estimated from a base push / pull level (base minus 9, at least 1, at most `maxLevel`). */
export function estimateSkillLevel(baseLevel: number, maxLevel?: number): number {
  const est = Math.max(1, Math.round(baseLevel) - SKILL_LEVEL_OFFSET);
  return maxLevel && maxLevel > 0 ? Math.min(est, maxLevel) : est;
}

/** The skills the measured levels unlock, in board order. Empty when none. */
export function unlockedSkills(
  levels: Partial<Record<SkillSourceGroup, number>>,
  maxLevels: Partial<Record<QuizV3SkillId, number>> = {},
): UnlockedSkill[] {
  const out: UnlockedSkill[] = [];
  for (const rule of SKILL_RULES) {
    const base = levels[rule.source];
    if (typeof base !== 'number' || !Number.isFinite(base) || base < rule.minLevel) continue;
    out.push({ skillId: rule.skillId, source: rule.source, estimatedLevel: estimateSkillLevel(base, maxLevels[rule.skillId]) });
  }
  return out;
}

/** The skill level the user settled on (estimate, or what the short skill questionnaire refined). */
export interface ChosenSkill {
  skillId: QuizV3SkillId;
  level: number;
}

/** Shape of one entry of the assignedResults payload the assessment page hands to onboarding-sync. */
export interface AssignedResultLike {
  programId: string;
  levelId: string;
  levelMode?: string;
  masterProgramSubLevels?: Record<string, number>;
}

/**
 * "להוסיף לתוכנית שלי": the skills ride on the same assignedResults payload the signup already writes
 * for skills (programId = skill slug, levelId `<skill>_level_<n>`, levelMode 'manual', exactly like
 * the page's skillLevels branch). They go AFTER the full-body entry so it stays the primary program
 * (onboarding-sync takes currentProgramId from entry 0), and carry no masterProgramSubLevels, so the
 * measured push / pull / legs / core tracks are not touched.
 */
export function withChosenSkills<T extends AssignedResultLike>(
  assignedResults: readonly T[],
  chosen: readonly ChosenSkill[],
): Array<T | AssignedResultLike> {
  const have = new Set(assignedResults.map((r) => r.programId));
  const extra: AssignedResultLike[] = [];
  for (const s of chosen) {
    if (have.has(s.skillId)) continue;
    have.add(s.skillId);
    const level = Math.max(1, Math.round(s.level));
    extra.push({ programId: s.skillId, levelMode: 'manual', levelId: `${s.skillId}_level_${level}` });
  }
  return [...assignedResults, ...extra];
}

/**
 * Assessment level caps — the highest level the level questionnaire
 * (שאלון רמה) may hand a NEW user, per program.
 *
 * Why: several ladders have authored levels (programs.maxLevels) well above
 * the levels that have real workout content. The questionnaire used to be
 * able to place a user there (e.g. a skill answer + the +9 skill→foundation
 * offset → push L22-24 / pull L22, where the generator has nothing to give),
 * so until high-level content exists the questionnaire tops out lower.
 *
 * Source of the cap, in order:
 *   1. `programs/{id}.assessmentMaxLevel` (optional, set from the admin
 *      program editor) — wins when present.
 *   2. ASSESSMENT_MAX_LEVEL_DEFAULTS below (owner-approved, by slug) — so
 *      the caps work with no Firestore write.
 *   3. none → no cap beyond maxLevels.
 * The effective max is always min(maxLevels, cap).
 *
 * Only the questionnaire reads this. Existing users keep whatever level they
 * already have (onboarding-sync's regression block never lowers a track).
 */
import type { Program } from '@/features/content/programs/core/program.types';
import { SKILL_TO_FOUNDATION_DOMAIN } from '../constants/skill-foundation-domain.constants';

/** Owner-approved questionnaire caps, keyed by canonical program slug. */
export const ASSESSMENT_MAX_LEVEL_DEFAULTS: Readonly<Record<string, number>> = {
  push: 19,
  pull: 20,
  legs: 10,
  core: 13,
  planche: 10,
  front_lever: 13,
  one_arm_pullup: 10,
};

/** Onboarding skill ids that differ from the Program doc's own slug. */
const SLUG_ALIASES: Readonly<Record<string, string>> = {
  hspu: 'handstand_pushup',
};

const LITERAL_CATEGORIES = new Set(['push', 'pull', 'legs', 'core']);

function canonical(key: string): string {
  return SLUG_ALIASES[key] ?? key;
}

/**
 * Find the Program doc for an onboarding category / skill id — by slug
 * first (the form onboarding uses: 'push', 'planche'), then by raw doc id.
 * Never "last program with this movementPattern wins": that was the B1 bug,
 * where skill programs (movementPattern push/pull) overwrote the real push /
 * pull domain's maxLevels. The movementPattern fallback is kept only for a
 * slug-less legacy domain doc, and only for the 4 literal categories.
 */
export function findProgramForAssessmentKey(
  programs: readonly Program[],
  key: string,
): Program | undefined {
  const slug = canonical(key);
  const bySlug = programs.find((p) => p.slug === slug || p.slug === key);
  if (bySlug) return bySlug;
  const byId = programs.find((p) => p.id === key || p.id === slug);
  if (byId) return byId;
  if (!LITERAL_CATEGORIES.has(key)) return undefined;
  const legacy = programs
    .filter(
      (p) =>
        !p.isMaster &&
        !p.slug &&
        p.movementPattern === key &&
        SKILL_TO_FOUNDATION_DOMAIN[p.id] == null,
    )
    .sort((a, b) => (b.maxLevels ?? 0) - (a.maxLevels ?? 0));
  return legacy[0];
}

/** The cap alone (no maxLevels): Firestore field, else the code default. */
export function getAssessmentCap(program: Program | undefined, key: string): number | undefined {
  const fromDoc = program?.assessmentMaxLevel;
  if (typeof fromDoc === 'number' && Number.isFinite(fromDoc) && fromDoc > 0) {
    return Math.floor(fromDoc);
  }
  const slug = program?.slug ?? canonical(key);
  return ASSESSMENT_MAX_LEVEL_DEFAULTS[slug] ?? ASSESSMENT_MAX_LEVEL_DEFAULTS[key];
}

/**
 * min(maxLevels, assessmentMaxLevel ?? default). `maxLevels` may be passed
 * explicitly (e.g. a level-settings derived max when the doc has none).
 * Returns undefined when neither a max nor a cap is known.
 */
export function getEffectiveAssessmentMax(
  program: Program | undefined,
  key: string,
  maxLevels: number | undefined = program?.maxLevels,
): number | undefined {
  const cap = getAssessmentCap(program, key);
  const max = maxLevels != null && maxLevels > 0 ? maxLevels : undefined;
  if (max == null) return cap;
  if (cap == null) return max;
  return Math.min(max, cap);
}

/**
 * Highest push/pull level the questionnaire may derive from a skill answer
 * (the +9 skill→foundation offset and the CMS parentLevelMapping).
 */
export function getFoundationAssessmentMax(
  programs: readonly Program[] | null | undefined,
  domain: 'push' | 'pull',
): number {
  const program = programs ? findProgramForAssessmentKey(programs, domain) : undefined;
  return getEffectiveAssessmentMax(program, domain) ?? 25;
}

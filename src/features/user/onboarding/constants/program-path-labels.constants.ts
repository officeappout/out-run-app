import type { ProgramCardId } from '../utils/program-card-selection';
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeT('he', onboarding);

/**
 * Static Hebrew display labels for the 3 program-path cards, muscle chips,
 * and skill programs — used by PrioritiesSection (profile) to render a
 * captured priority order without a live CMS fetch (this data is already
 * hardcoded once in program-path/page.tsx's own card copy / MUSCLE_CHIP_LABELS
 * / SKILL_PROGRAMS; duplicated here rather than refactoring that already-shipped
 * file, matching this codebase's established convention for small stable
 * label maps — see skill-foundation-domain.constants.ts's own note on the
 * same tradeoff).
 */

/** Short-form card label (skills shortened from the card's full sentence
 *  copy to fit a compact priority-list row). */
export const PROGRAM_CARD_LABELS_HE: Record<ProgramCardId, string> = {
  health: t('programPath.page.health.title'),
  body_focus: t('programPath.page.body.title'),
  skills: t('programCard.skills'),
};

export const MUSCLE_NAME_HE: Record<string, string> = {
  chest: t('muscle.chest'),
  back: t('muscle.back'),
  shoulders: t('muscle.shoulders'),
  biceps: t('muscle.biceps'),
  triceps: t('muscle.triceps'),
  legs: t('muscle.legs'),
  core: t('muscle.core'),
  glutes: t('muscle.glutes'),
};

export const SKILL_NAME_HE: Record<string, string> = {
  calisthenics_upper: t('skill.calisthenicsUpper'),
  front_lever: t('skill.frontLever'),
  muscle_up: t('skill.muscleUp'),
  planche: t('skill.planche'),
  handstand: t('skill.handstand'),
  hspu: t('skill.hspu'),
  one_arm_pullup: t('skill.oneArmPullup'),
};

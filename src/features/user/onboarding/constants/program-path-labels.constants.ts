import type { ProgramCardId } from '../utils/program-card-selection';
import { makeLiveT } from '@/lib/i18n/live-t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeLiveT(onboarding);

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
  get health() { return t('programPath.page.health.title'); },
  get body_focus() { return t('programPath.page.body.title'); },
  get skills() { return t('programCard.skills'); },
};

export const MUSCLE_NAME_HE: Record<string, string> = {
  get chest() { return t('muscle.chest'); },
  get back() { return t('muscle.back'); },
  get shoulders() { return t('muscle.shoulders'); },
  get biceps() { return t('muscle.biceps'); },
  get triceps() { return t('muscle.triceps'); },
  get legs() { return t('muscle.legs'); },
  get core() { return t('muscle.core'); },
  get glutes() { return t('muscle.glutes'); },
};

export const SKILL_NAME_HE: Record<string, string> = {
  get calisthenics_upper() { return t('skill.calisthenicsUpper'); },
  get front_lever() { return t('skill.frontLever'); },
  get muscle_up() { return t('skill.muscleUp'); },
  get planche() { return t('skill.planche'); },
  get handstand() { return t('skill.handstand'); },
  get hspu() { return t('skill.hspu'); },
  get one_arm_pullup() { return t('skill.oneArmPullup'); },
};

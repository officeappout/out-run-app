import type { ProgramCardId } from '../utils/program-card-selection';

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
  health: 'בריאות, כוח ואנרגיה',
  body_focus: 'עיצוב ושרירים',
  skills: 'קליסטניקס מתקדם',
};

export const MUSCLE_NAME_HE: Record<string, string> = {
  chest: 'חזה',
  back: 'גב',
  shoulders: 'כתפיים',
  biceps: 'יד קדמית',
  triceps: 'יד אחורית',
  legs: 'רגליים',
  core: 'בטן וליבה',
  glutes: 'ישבן',
};

export const SKILL_NAME_HE: Record<string, string> = {
  calisthenics_upper: 'קליסטניקס עליון (כל האלמנטים)',
  front_lever: 'פרונט לבר',
  muscle_up: 'עליית כוח',
  planche: 'פלאנץ׳',
  handstand: 'עמידת ידיים',
  hspu: 'שכיבות סמיכה בעמידת ידיים',
  one_arm_pullup: 'מתח יד אחת',
};

/**
 * Strength questionnaire v3 (enable_strength_quiz_v3), the assessment part: pure helpers for the
 * progress icons row, the per-group transition screen and the slider's three cards.
 * No React, no Firebase: everything here is unit tested (__tests__/quiz-v3-model.test.ts).
 */

export const QUIZ_V3_GROUPS = ['push', 'pull', 'legs', 'core'] as const;
export type QuizV3Group = (typeof QUIZ_V3_GROUPS)[number];

export type QuizV3Muscle = 'chest' | 'shoulders' | 'triceps' | 'back' | 'biceps' | 'quads' | 'glutes' | 'abs';

const MUSCLE_ICON = (m: QuizV3Muscle) => `/icons/muscles/${m}.svg`;

/** The group's icon in the progress row (the app's muscle icons). */
export const GROUP_ICON: Record<QuizV3Group, string> = {
  push: MUSCLE_ICON('chest'),
  pull: MUSCLE_ICON('back'),
  legs: MUSCLE_ICON('quads'),
  core: MUSCLE_ICON('abs'),
};

/** The muscle tiles on each group's transition screen. */
export const GROUP_MUSCLES: Record<QuizV3Group, readonly QuizV3Muscle[]> = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'biceps'],
  legs: ['quads', 'glutes'],
  core: ['abs'],
};

export function muscleIcon(m: QuizV3Muscle): string {
  return MUSCLE_ICON(m);
}

export function isQuizV3Group(category: string): category is QuizV3Group {
  return (QUIZ_V3_GROUPS as readonly string[]).includes(category);
}

// ── Progress icons row ───────────────────────────────────────────

export type ProgressItemState = 'done' | 'current' | 'upcoming';

export interface ProgressItem {
  group: QuizV3Group;
  icon: string;
  state: ProgressItemState;
}

/**
 * One item per muscle group in `categories` (skill ids are left out), in order.
 * Everything before the current category is done, the current one is current.
 * A skill category (not in the row) marks every group before it as done, none as current.
 */
export function progressRowItems(categories: readonly string[], currentIndex: number): ProgressItem[] {
  const items: ProgressItem[] = [];
  categories.forEach((cat, i) => {
    if (!isQuizV3Group(cat)) return;
    const state: ProgressItemState = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
    items.push({ group: cat, icon: GROUP_ICON[cat], state });
  });
  return items;
}

// ── Transition screen ────────────────────────────────────────────

export interface SavedGroup {
  group: QuizV3Group;
  level: number;
  exerciseName: string | null;
}

export interface TransitionModel {
  group: QuizV3Group;
  /** 1-based, among the muscle groups only. */
  groupNumber: number;
  groupTotal: number;
  muscles: readonly QuizV3Muscle[];
  /** Board Push: the lemur peek line only on the first group. */
  showLemur: boolean;
  /** Board Pull: "<group> נשמרה" for the group just before this one. */
  saved: SavedGroup | null;
  isFirst: boolean;
}

/** null when the category at `index` is not a muscle group (skills get no transition). */
export function transitionModel(
  categories: readonly string[],
  index: number,
  savedByGroup: Partial<Record<QuizV3Group, SavedGroup>>,
): TransitionModel | null {
  const cat = categories[index];
  if (!cat || !isQuizV3Group(cat)) return null;
  const groups = categories.filter(isQuizV3Group);
  const groupNumber = groups.indexOf(cat) + 1;
  const prev = groupNumber > 1 ? groups[groupNumber - 2] : null;
  const isFirst = groupNumber === 1;
  return {
    group: cat,
    groupNumber,
    groupTotal: groups.length,
    muscles: GROUP_MUSCLES[cat],
    showLemur: isFirst,
    saved: prev ? savedByGroup[prev] ?? null : null,
    isFirst,
  };
}

// ── Slider ───────────────────────────────────────────────────────

/** Muscle groups start in the middle of their steps (no tier screen under the flag). */
export function middleStepIndex(stepsLength: number): number {
  if (stepsLength <= 0) return 0;
  return Math.floor((stepsLength - 1) / 2);
}

/** Where the slider opens: the middle, or (returning to a group already answered) the nearest step. */
export function startStepIndex(steps: readonly number[], initialLevel: number, startMiddle: boolean): number {
  if (steps.length === 0) return 0;
  if (startMiddle) return middleStepIndex(steps.length);
  let best = 0;
  for (let i = 1; i < steps.length; i++) {
    if (Math.abs(steps[i] - initialLevel) < Math.abs(steps[best] - initialLevel)) best = i;
  }
  return best;
}

/**
 * The three cards. `selected` is a step index, or -1 for the skill "not yet" card
 * (only when `hasNotYet`).
 */
export interface SliderCards {
  center: 'step' | 'notYet';
  /** The easier side card: none at the floor, the "not yet" card below step 0 on a skill. */
  easier: 'step' | 'notYet' | null;
  harder: 'step' | null;
  /** Dots: total count and the active one (the "not yet" card is dot 0 on a skill). */
  dotCount: number;
  activeDot: number;
}

export function sliderCards(stepsLength: number, selected: number, hasNotYet: boolean): SliderCards {
  const offset = hasNotYet ? 1 : 0;
  if (hasNotYet && selected < 0) {
    return { center: 'notYet', easier: null, harder: stepsLength > 0 ? 'step' : null, dotCount: stepsLength + 1, activeDot: 0 };
  }
  const easier = selected > 0 ? 'step' : hasNotYet ? 'notYet' : null;
  const harder = selected < stepsLength - 1 ? 'step' : null;
  return { center: 'step', easier, harder, dotCount: stepsLength + offset, activeDot: selected + offset };
}

/** One move easier (-1) or harder (+1), clamped; -1 is the floor on a skill with "not yet". */
export function moveSelection(stepsLength: number, selected: number, dir: -1 | 1, hasNotYet: boolean): number {
  const floor = hasNotYet ? -1 : 0;
  return Math.max(floor, Math.min(stepsLength - 1, selected + dir));
}

export const SWIPE_MIN_PX = 40;

/**
 * Horizontal swipe on the cards → easier (-1) / harder (+1) / nothing (0).
 * The easier card sits on the reading-start side (right in Hebrew), so dragging the finger
 * toward the end side pulls it in: in RTL a swipe to the left (dx < 0) means easier.
 */
export function swipeDirection(dx: number, dy: number, rtl: boolean): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return 0;
  const towardEnd = rtl ? dx < 0 : dx > 0;
  return towardEnd ? -1 : 1;
}

/** Story-bar fill inside the assessment phase for a muscle-group index. */
export function assessmentFill(index: number, total: number): number {
  if (total <= 0) return 100;
  return Math.min(100, Math.round(((index + 1) / total) * 100));
}

// ── Skill icon (board SliderSkill) ──────────────────────────────

const SKILL_ICONS: Record<string, string> = {
  planche: '/icons/programs/planche.svg',
  front_lever: '/icons/programs/front_lever.svg',
  hspu: '/icons/programs/hspu.svg',
  handstand_pushup: '/icons/programs/hspu.svg',
  handstand: '/icons/programs/handstand.svg',
  muscle_up: '/icons/programs/muscle_up_bar.svg',
  muscleup: '/icons/programs/muscle_up_bar.svg',
  one_arm_pullup: '/icons/programs/one_arm_pullup.svg',
  oap: '/icons/programs/one_arm_pullup.svg',
  pull_up_pro: '/icons/programs/one_arm_pullup.svg',
};

/** The skill's program icon (/icons/programs); the generic muscle icon for an unknown id. */
export function skillIcon(category: string): string {
  return SKILL_ICONS[category.toLowerCase()] ?? '/icons/programs/muscle.svg';
}

// ── Back inside the assessment ───────────────────────────────────

/**
 * Where back goes under the flag: slider → its own transition (muscle groups), transition → the
 * previous slider, the first transition (or a first skill slider) → out of the assessment ('exit').
 */
export function quizV3Back(inTransition: boolean, index: number, category: string): 'toTransition' | 'toPrevSlider' | 'exit' {
  if (!inTransition && isQuizV3Group(category)) return 'toTransition';
  return index > 0 ? 'toPrevSlider' : 'exit';
}

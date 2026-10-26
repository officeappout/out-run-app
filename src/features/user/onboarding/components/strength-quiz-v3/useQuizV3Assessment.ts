'use client';

import { useCallback, useMemo, useState } from 'react';
import type { QuizV3SliderProps } from '../visual-assessment/VisualSlider';
import {
  assessmentFill,
  isQuizV3Group,
  progressRowItems,
  quizV3Back,
  transitionModel,
  type QuizV3Group,
  type SavedGroup,
  type TransitionModel,
} from './quiz-v3-model';

export interface QuizV3Assessment {
  /** Non-null: show this group's transition screen instead of its slider. */
  transition: TransitionModel | null;
  progress: ReturnType<typeof progressRowItems>;
  fillPercent: number;
  leaveTransition: () => void;
  /** Rolls back one screen; returns 'toPrevSlider' / 'exit' for the page to act on. */
  back: () => 'handled' | 'toPrevSlider' | 'exit';
  /** For VisualSlider's quizV3 prop; undefined with the flag off. */
  sliderProps: QuizV3SliderProps | undefined;
}

/** enable_strength_quiz_v3: the transition-before-each-group state for assessment-visual/page.tsx. */
export function useQuizV3Assessment(
  enabled: boolean,
  categories: readonly string[],
  categoryIndex: number,
): QuizV3Assessment {
  const [inTransition, setInTransition] = useState(true);
  const [saved, setSaved] = useState<Partial<Record<QuizV3Group, SavedGroup>>>({});
  const category = categories[categoryIndex] ?? '';

  const onChosen = useCallback((level: number, exerciseName: string | null) => {
    if (isQuizV3Group(category)) setSaved((prev) => ({ ...prev, [category]: { group: category, level, exerciseName } }));
    // The next category opens on its transition (skills have none, see transitionModel).
    setInTransition(true);
  }, [category]);

  const back = useCallback(() => {
    const r = quizV3Back(inTransition, categoryIndex, category);
    if (r === 'toTransition') { setInTransition(true); return 'handled' as const; }
    if (r === 'toPrevSlider') setInTransition(false);
    return r;
  }, [inTransition, categoryIndex, category]);

  const transition = enabled && inTransition ? transitionModel(categories, categoryIndex, saved) : null;

  const sliderProps = useMemo<QuizV3SliderProps | undefined>(
    () => (enabled
      ? { categories, categoryIndex, startMiddle: !(isQuizV3Group(category) && saved[category]), onChosen }
      : undefined),
    [enabled, categories, categoryIndex, category, saved, onChosen],
  );

  return {
    transition,
    progress: progressRowItems(categories, categoryIndex),
    fillPercent: assessmentFill(categoryIndex, categories.length),
    leaveTransition: useCallback(() => setInTransition(false), []),
    back,
    sliderProps,
  };
}

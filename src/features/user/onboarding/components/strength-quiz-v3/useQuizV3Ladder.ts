'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getOnboardingLevelsForCategory,
  resolveContent,
} from '../../services/visual-content-resolver.service';
import type { UserDemographics } from '../../types/visual-assessment.types';
import { ladderWindow, type LadderNode } from './quiz-v3-outro';

export interface QuizV3Ladder {
  /** Top (hardest) first; empty while loading. */
  nodes: LadderNode[];
  /** Exercise name per level (null when the content has none). */
  names: Record<number, string | null>;
  /** The program's top questionnaire level (the goal), null while unknown. */
  topLevel: number | null;
  loading: boolean;
}

/**
 * The questionnaire's own level ladder for a group or skill (the same content the sliders show,
 * cached by the resolver) around `level`, with one exercise name per level. Read-only.
 */
export function useQuizV3Ladder(
  category: string | null,
  level: number,
  demographics: UserDemographics | null,
  lang = 'he',
): QuizV3Ladder {
  const [levels, setLevels] = useState<number[] | null>(null);
  const [names, setNames] = useState<Record<number, string | null>>({});

  useEffect(() => {
    if (!category) return;
    let cancelled = false;
    setLevels(null);
    getOnboardingLevelsForCategory(category)
      .then((l) => { if (!cancelled) setLevels(l); })
      .catch(() => { if (!cancelled) setLevels([]); });
    return () => { cancelled = true; };
  }, [category]);

  // No ladder data (offline, empty content): the current level alone, so the screen still reads.
  const nodes = useMemo(() => (levels ? ladderWindow(levels.length ? levels : [level], level) : []), [levels, level]);

  useEffect(() => {
    if (!category || !demographics || nodes.length === 0) return;
    let cancelled = false;
    Promise.all(
      nodes.map((n) =>
        resolveContent(category, n.level, demographics, lang)
          .then((c) => [n.level, c.exerciseName || null] as const)
          .catch(() => [n.level, null] as const),
      ),
    ).then((pairs) => { if (!cancelled) setNames(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [category, demographics, lang, nodes]);

  const topLevel = levels && levels.length ? Math.max(...levels) : null;
  return { nodes, names, topLevel, loading: levels === null };
}

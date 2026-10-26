'use client';

import { useEffect, useState } from 'react';
import { resolveContent } from '../../services/visual-content-resolver.service';
import type { UserDemographics } from '../../types/visual-assessment.types';

/** The exercise name at one level (cached by the resolver). null while loading / when absent. */
export function useStepExerciseName(
  category: string,
  level: number | null,
  demographics: UserDemographics,
  lang: string,
): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (level == null) { setName(null); return; }
    let cancelled = false;
    resolveContent(category, level, demographics, lang)
      .then((c) => { if (!cancelled) setName(c.exerciseName || null); })
      .catch(() => { if (!cancelled) setName(null); });
    return () => { cancelled = true; };
  }, [category, level, demographics, lang]);
  return name;
}

'use client';

import { useEffect, useState } from 'react';
import { resolveContent } from '../../services/visual-content-resolver.service';
import type { UserDemographics } from '../../types/visual-assessment.types';

export interface StepPreview {
  name: string | null;
  imageUrl: string | null;
}

const EMPTY: StepPreview = { name: null, imageUrl: null };

/** The exercise name and still at one level (cached by the resolver). Empty while loading / when absent. */
export function useStepPreview(
  category: string,
  level: number | null,
  demographics: UserDemographics,
  lang: string,
): StepPreview {
  const [preview, setPreview] = useState<StepPreview>(EMPTY);
  useEffect(() => {
    if (level == null) { setPreview(EMPTY); return; }
    let cancelled = false;
    resolveContent(category, level, demographics, lang)
      .then((c) => { if (!cancelled) setPreview({ name: c.exerciseName || null, imageUrl: c.thumbnailUrl || null }); })
      .catch(() => { if (!cancelled) setPreview(EMPTY); });
    return () => { cancelled = true; };
  }, [category, level, demographics, lang]);
  return preview;
}

/** The exercise name at one level (cached by the resolver). null while loading / when absent. */
export function useStepExerciseName(
  category: string,
  level: number | null,
  demographics: UserDemographics,
  lang: string,
): string | null {
  return useStepPreview(category, level, demographics, lang).name;
}

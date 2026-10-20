'use client';

/** Exercise page v2 — name + image from the cached catalog (getAllExercisesCached, #456). */
import { useEffect, useState } from 'react';
import { getAllExercisesCached } from '@/features/content/exercises/core/exercise.service';
import { pickThumbnailUrl } from '@/features/content/exercises/client/utils/card-media.utils';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';

export function useExerciseMeta(exerciseId: string): { name: string | null; imageUrl: string | null } {
  const [meta, setMeta] = useState<{ name: string | null; imageUrl: string | null }>({ name: null, imageUrl: null });
  useEffect(() => {
    let alive = true;
    getAllExercisesCached()
      .then((all) => {
        const ex = all.find((e) => e.id === exerciseId);
        if (!alive || !ex) return;
        setMeta({ name: getLocalizedText(ex.name) || null, imageUrl: pickThumbnailUrl(ex, null) });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [exerciseId]);
  return meta;
}

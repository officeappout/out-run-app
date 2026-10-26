'use client';

/**
 * Real media for the welcome screen's push ladder: three single-document reads (exercises/{id}),
 * the park method's still + video, through the library's own resolvers. Missing media = no entry
 * (the tile keeps its placeholder surface).
 */
import { useEffect, useState } from 'react';
import { getExercise } from '@/features/content/exercises/core/exercise.service';
import {
  resolveImageForLocation,
  resolveVideoForLocation,
} from '@/features/content/exercises/core/exercise.types';
import { PUSH_LADDER } from './quiz-v3-entry';

export interface LadderMedia {
  imageUrl: string | null;
  videoUrl: string | null;
}

export function usePushLadderMedia(): Record<string, LadderMedia> {
  const [media, setMedia] = useState<Record<string, LadderMedia>>({});
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      PUSH_LADDER.map(async ({ exerciseId }) => {
        try {
          const ex = await getExercise(exerciseId);
          if (!ex) return null;
          return [
            exerciseId,
            {
              imageUrl: resolveImageForLocation(ex, 'park') || null,
              videoUrl: resolveVideoForLocation(ex, 'park') || null,
            },
          ] as const;
        } catch (e) {
          console.warn('[StrengthQuizV3] push ladder media failed:', exerciseId, e);
          return null;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      setMedia(Object.fromEntries(rows.filter((r): r is NonNullable<typeof r> => r !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return media;
}

'use client';

/**
 * PlayerMethodInfo — the method "i" in the strength player's superset /
 * tabata frames (enable_method_info_sheet_v1). Maps the frame's own rows
 * (ExerciseEntry: name, thumbnail, reps text, rest) into the method model.
 */

import React, { useMemo } from 'react';
import { useCachedMediaMap } from '@/features/favorites/hooks/useCachedMedia';
import type { ExerciseEntry } from '../../players/strength/playlist/types';
import { buildMethodInfo } from '../../core/methods/method-info/method-info.model';
import MethodInfoButton from './MethodInfoButton';

export interface PlayerMethodInfoProps {
  kind: 'superset' | 'tabata';
  label: string;
  entries: ExerciseEntry[];
  /** Tabata: the block's clock (from the segment's block protocol). */
  tabata?: { workSec: number; restSec: number; rounds: number; cycles?: number | null };
}

export default function PlayerMethodInfo({ kind, label, entries, tabata }: PlayerMethodInfoProps) {
  const imageUrls = useMemo(() => entries.map((e) => e.imageUrl ?? null), [entries]);
  const cached = useCachedMediaMap(imageUrls);
  const model = useMemo(
    () =>
      buildMethodInfo({
        kind,
        label,
        tabata,
        sources: entries.map((e, i) => ({
          key: `${e.exerciseId}-${i}`,
          name: e.exerciseName,
          imageUrl: (e.imageUrl && (cached.get(e.imageUrl) || e.imageUrl)) || '',
          sets: e.sets,
          restSec: e.restDuration,
          line: e.repsText,
        })),
      }),
    [kind, label, tabata, entries, cached],
  );
  return model ? <MethodInfoButton model={model} /> : null;
}

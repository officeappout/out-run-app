'use client';

/**
 * ExerciseLibraryCard — list-row card used on /library.
 *
 * Clean read-only card: thumbnail (with lazy previewVideo) + name + muscle chip.
 * No level badge — level is context-dependent per program.
 *
 * RTL layout (via WorkoutCardWrapper flex-row-reverse):
 *   [thumbnail/preview] [name + muscle chip] [chevron]
 */

import React from 'react';
import { ChevronLeft } from 'lucide-react';
import WorkoutCardWrapper from '@/features/workout-engine/components/cards/WorkoutCardWrapper';
import {
  Exercise,
  MUSCLE_GROUP_LABELS,
  getLocalizedText,
  resolvePreviewForLang,
} from '../../core/exercise.types';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';

interface ExerciseLibraryCardProps {
  exercise: Exercise;
  onClick: () => void;
}

function pickPrimaryMuscle(ex: Exercise): { he: string } | null {
  const m = ex.primaryMuscle ?? ex.muscleGroups?.[0];
  if (!m) return null;
  return MUSCLE_GROUP_LABELS[m] ?? null;
}

function pickPreviewVideo(ex: Exercise) {
  const top = resolvePreviewForLang(ex.media as any, 'he');
  if (top) return top;
  const methods = ex.execution_methods ?? ex.executionMethods ?? [];
  for (const m of methods) {
    const mp = resolvePreviewForLang(m?.media as any, 'he');
    if (mp) return mp;
  }
  return undefined;
}

function pickThumbnailUrl(ex: Exercise): string | null {
  if (ex.media?.imageUrl) return ex.media.imageUrl;
  const methods = ex.execution_methods ?? ex.executionMethods ?? [];
  for (const m of methods) {
    if (m?.media?.imageUrl) return m.media.imageUrl;
  }
  return null;
}

export default function ExerciseLibraryCard({
  exercise,
  onClick,
}: ExerciseLibraryCardProps) {
  const name = getLocalizedText(exercise.name);
  const muscle = pickPrimaryMuscle(exercise);
  const previewVideo = pickPreviewVideo(exercise);
  const thumbnailUrl = pickThumbnailUrl(exercise);

  return (
    <WorkoutCardWrapper className="py-2 px-3 cursor-pointer" onClick={onClick}>
      {/* Chevron (Left in RTL after row-reverse) — affordance for "open detail" */}
      <div className="flex items-center text-gray-300 ms-1 me-1">
        <ChevronLeft size={18} />
      </div>

      {/* Center: name + muscle chip */}
      <div className="flex-1 flex flex-col justify-center mx-2 min-w-0">
        <h3 className="text-sm font-bold text-gray-900 truncate">{name}</h3>
        {muscle && (
          <span className="mt-1 self-start px-1.5 py-0.5 bg-cyan-50 text-cyan-700 text-[10px] font-semibold rounded-full border border-cyan-100">
            {muscle.he}
          </span>
        )}
      </div>

      {/* Right (in RTL): thumbnail / preview video */}
      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 relative">
        {previewVideo ? (
          <ExerciseVideoPlayer
            video={previewVideo}
            mode="preview"
            lazyPlay
            className="absolute inset-0 w-full h-full"
          />
        ) : thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-bold">
            OUT
          </div>
        )}
      </div>
    </WorkoutCardWrapper>
  );
}

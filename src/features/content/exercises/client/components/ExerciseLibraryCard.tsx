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
  findMethodForLocation,
  getLocalizedText,
  resolvePreviewForLang,
  resolveTutorialForLang,
} from '../../core/exercise.types';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';
import { buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';

interface ExerciseLibraryCardProps {
  exercise: Exercise;
  onClick: () => void;
}

function pickPrimaryMuscle(ex: Exercise): { he: string } | null {
  const m = ex.primaryMuscle ?? ex.muscleGroups?.[0];
  if (!m) return null;
  return MUSCLE_GROUP_LABELS[m] ?? null;
}

function pickPreviewVideo(ex: Exercise, location: string | null) {
  // Apply the product fallback rule: when no location is active default to 'park'.
  const activeLocation = location ?? 'park';
  const method = findMethodForLocation(ex, activeLocation);

  // Try the location-specific method's previewVideo first (deterministic).
  const methodPreview = resolvePreviewForLang(method?.media as any, 'he');
  if (methodPreview) return methodPreview;

  // Fall back to exercise-level previewVideo (shared / legacy media).
  const topPreview = resolvePreviewForLang(ex.media as any, 'he');
  if (topPreview) return topPreview;

  return undefined;
}

/**
 * Walk the exercise for a Bunny video ID, preferring the execution method that
 * matches the active location. Falls back to exercise-level media so legacy
 * exercises that haven't been split into per-method media always get a thumbnail.
 */
function pickBunnyVideoId(ex: Exercise, location: string | null): string | null {
  const activeLocation = location ?? 'park';
  const method = findMethodForLocation(ex, activeLocation);

  // 1. Location-specific method — previewVideo
  const mp = resolvePreviewForLang(method?.media as Parameters<typeof resolvePreviewForLang>[0], 'he');
  if (mp?.videoId && mp.provider === 'bunny') return mp.videoId;

  // 2. Location-specific method — fullTutorial
  const mt = resolveTutorialForLang(method?.media as Parameters<typeof resolveTutorialForLang>[0], 'he');
  if (mt?.videoId && mt.provider === 'bunny') return mt.videoId;

  // 3. Exercise-level previewVideo
  const topPreview = resolvePreviewForLang(ex.media as Parameters<typeof resolvePreviewForLang>[0], 'he');
  if (topPreview?.videoId && topPreview.provider === 'bunny') return topPreview.videoId;

  // 4. Exercise-level fullTutorial
  const topTutorial = resolveTutorialForLang(ex.media as Parameters<typeof resolveTutorialForLang>[0], 'he');
  if (topTutorial?.videoId && topTutorial.provider === 'bunny') return topTutorial.videoId;

  return null;
}

/**
 * Pick the best static thumbnail URL for an exercise card.
 *
 * Priority:
 *   1. Bunny auto-thumbnail from the location-specific method (deterministic)
 *   2. Manually uploaded imageUrl from the matched method
 *   3. Exercise-level imageUrl (legacy fallback)
 */
function pickThumbnailUrl(ex: Exercise, location: string | null): string | null {
  // 1. Bunny auto-thumbnail — primary
  const bunnyId = pickBunnyVideoId(ex, location);
  if (bunnyId) return buildBunnyThumbnailUrl(bunnyId);

  // 2. Location-specific method imageUrl
  const activeLocation = location ?? 'park';
  const method = findMethodForLocation(ex, activeLocation);
  if (method?.media?.imageUrl) return method.media.imageUrl;

  // 3. Exercise-level imageUrl — fallback
  if (ex.media?.imageUrl) return ex.media.imageUrl;
  return null;
}

export default function ExerciseLibraryCard({
  exercise,
  onClick,
}: ExerciseLibraryCardProps) {
  const filterLocation = useExerciseLibraryStore((s) => s.filters.location);
  const name = getLocalizedText(exercise.name);
  const muscle = pickPrimaryMuscle(exercise);
  const previewVideo = pickPreviewVideo(exercise, filterLocation);
  const thumbnailUrl = pickThumbnailUrl(exercise, filterLocation);

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

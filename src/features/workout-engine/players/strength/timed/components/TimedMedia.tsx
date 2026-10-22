'use client';

/**
 * TimedMedia — the full-screen backdrop of the timed player: the item's demo
 * video (same offline-cached / network-aware resolution and player as the
 * strength player), or a calm cardio backdrop for a run item.
 */
import React from 'react';
import { Footprints } from 'lucide-react';
import type { Exercise } from '@/features/parks/core/types/route.types';
import type { TimedItem } from '@/features/workout-engine/engines/timed/timed.types';
import ExerciseVideoPlayer from '../../components/ExerciseVideoPlayer';
import { usePlayerMedia } from '../../hooks/usePlayerMedia';

export interface TimedMediaProps {
  item: TimedItem | null;
  /** The plan exercise behind the item (video / tutorial fields). */
  planExercise: Exercise | null;
  /** Warmed in the media cache (no second <video> — iOS decoder budget). */
  next: Exercise | null;
  isPaused: boolean;
  /** enable_strength_drawer_v1: 'corner' = the "הסבר" chip at the video's top corner. */
  tutorialPlacement?: 'legacy' | 'corner';
}

export default function TimedMedia({ item, planExercise, next, isPaused, tutorialPlacement = 'legacy' }: TimedMediaProps) {
  const { safeVideoUrl } = usePlayerMedia({
    exerciseVideoUrl: planExercise?.videoUrl ?? null,
    bunnyVideoId: planExercise?.bunnyVideoId ?? null,
    exerciseImageUrl: planExercise?.imageUrl ?? item?.imageUrl ?? null,
    nextExerciseVideoUrl: next?.videoUrl ?? null,
    nextBunnyVideoId: next?.bunnyVideoId ?? null,
  });

  if (!item || item.kind === 'aerobic_leg') {
    return (
      <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#1f2a1a] to-[#05080b]" aria-hidden>
        <Footprints size={72} strokeWidth={1.6} className="-mt-40 text-[#84cc16]/70" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-black">
      <ExerciseVideoPlayer
        key={`timed-${item.key}`}
        exerciseId={item.exerciseId ?? item.key}
        videoUrl={safeVideoUrl}
        exerciseName={item.name}
        exerciseType={item.targetHoldSec && !item.targetReps ? 'time' : 'reps'}
        isPaused={isPaused}
        hasAudio={false}
        fullTutorial={planExercise?.fullTutorial ?? null}
        tutorialPlacement={tutorialPlacement}
      />
    </div>
  );
}

'use client';

/**
 * PostWorkoutSmartClose — Block B (BLOCK_B_SMART_CLOSE_V1) HOST.
 *
 * Owns the flag-gated fetches/subscriptions so they NEVER run when the flag is off:
 * home renders this component ONLY behind BLOCK_B_SMART_CLOSE_V1, so an unmounted
 * component = zero fetch (recovery stretches) = byte-identical. Hooks can't be called
 * conditionally, so the gate MUST be the mount boundary — not an `if` inside a top-level
 * render.
 *
 * Stage 1: the message keeps its endMode title, but the framing subtitle is now the reused
 * summary-strip RING (strengthRingPct — the workout-moved daily-strength %, fixing the
 * stripRingPct 0-bug). Stage 2 replaces the stretch tiles + adds the hero-card next-step
 * options (walk / recovery / abs / complementary) via the full assembler.
 */

import React from 'react';
import PostWorkoutSuggestionCard from './PostWorkoutSuggestionCard';
import { buildPostWorkoutSuggestion, type PostWorkoutSuggestionInput } from '../utils/postWorkoutSuggestion';
import { useRecoveryStretches } from '../hooks/useRecoveryStretches';
import TutorialVideoPlayer from '@/features/content/exercises/client/components/ExerciseVideoPlayer';

export interface PostWorkoutSmartCloseProps
  extends Pick<PostWorkoutSuggestionInput, 'endMode' | 'intendedDurationMin' | 'domainsCompleted' | 'trainedCore'> {
  /** Stage 1 (#1): the STRENGTH daily-goal ring % (0-1) — the workout-moved value
   *  (dailyProgress.dailyStrengthPct captured at completion), replacing the framing subtitle
   *  and fixing the stripRingPct 0-bug (which hard-zeros on non-scheduled days). */
  strengthRingPct?: number;
}

export default function PostWorkoutSmartClose({ strengthRingPct, ...handoff }: PostWorkoutSmartCloseProps) {
  const suggestion = buildPostWorkoutSuggestion(handoff);
  // Hook is unconditional (rules of hooks); limit 0 short-circuits the fetch when there
  // are no stretches to show. The whole component is unmounted when the flag is off.
  const stretches = useRecoveryStretches(suggestion?.showStretches ? 2 : 0);

  if (!suggestion) return null;

  return (
    <PostWorkoutSuggestionCard suggestion={suggestion} ringPct={strengthRingPct}>
      {stretches.length > 0 && (
        <div className="flex gap-2">
          {stretches.map((s) => (
            <div key={s.id} className="flex-1 min-w-0">
              <div className="w-full aspect-video rounded-lg overflow-hidden bg-black/5">
                {s.videoUrl && (
                  <TutorialVideoPlayer legacyVideoUrl={s.videoUrl} mode="preview" lazyPlay objectFit="cover" />
                )}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-gray-600 truncate text-center">{s.name}</div>
            </div>
          ))}
        </div>
      )}
    </PostWorkoutSuggestionCard>
  );
}

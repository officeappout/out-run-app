'use client';

/**
 * PostWorkoutSmartClose — Block B (BLOCK_B_SMART_CLOSE_V1) wave-1 HOST.
 *
 * Owns the flag-gated fetches/subscriptions so they NEVER run when the flag is off:
 * home renders this component ONLY behind BLOCK_B_SMART_CLOSE_V1, so an unmounted
 * component = zero fetch (wave-1b recovery stretches) + zero subscription (wave-1c
 * useLiveDailyActivity steps) = byte-identical. Hooks can't be called conditionally, so
 * the gate MUST be the mount boundary — not an `if` inside a top-level render.
 *
 * Builds a post_workout `Suggestion` and renders it (message + next-step CTA + stretches).
 * The full assembler later replaces buildPostWorkoutSuggestion behind the same shape —
 * this host and the card stay.
 */

import React from 'react';
import PostWorkoutSuggestionCard from './PostWorkoutSuggestionCard';
import {
  buildPostWorkoutSuggestion,
  type PostWorkoutSuggestionInput,
  type NextStepKind,
} from '../utils/postWorkoutSuggestion';
import { useRecoveryStretches } from '../hooks/useRecoveryStretches';
import { useLiveDailyActivity } from '@/features/activity/hooks/useLiveDailyActivity';
import { DAILY_STEP_GOAL } from '@/config/health-goals';
import TutorialVideoPlayer from '@/features/content/exercises/client/components/ExerciseVideoPlayer';

export interface PostWorkoutSmartCloseProps
  extends Pick<PostWorkoutSuggestionInput, 'endMode' | 'intendedDurationMin' | 'domainsCompleted' | 'trainedCore'> {
  /** wave-1c: % (0-100) of the daily strength goal — the ring at the top. Frames the message. */
  dailyGoalPct?: number;
  /** wave-1c: tap handler for the next-step CTA (home wires it to the "suggest more" flow). */
  onNextStep?: (kind: NextStepKind) => void;
}

export default function PostWorkoutSmartClose({ dailyGoalPct, onNextStep, ...handoff }: PostWorkoutSmartCloseProps) {
  // wave-1c: the steps subscription lives HERE (flag-gated mount) → zero subscription when off.
  const { stepsToday, todayActivity } = useLiveDailyActivity();
  const stepGoal = todayActivity?.stepsGoal ?? DAILY_STEP_GOAL;
  const stepsRemaining = Math.max(0, stepGoal - stepsToday);

  const suggestion = buildPostWorkoutSuggestion({ ...handoff, stepsRemaining, dailyGoalPct });
  // Hook is unconditional (rules of hooks); limit 0 short-circuits the fetch when there
  // are no stretches to show. The whole component is unmounted when the flag is off.
  const stretches = useRecoveryStretches(suggestion?.showStretches ? 2 : 0);

  if (!suggestion) return null;

  return (
    <PostWorkoutSuggestionCard suggestion={suggestion} onNextStep={onNextStep}>
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

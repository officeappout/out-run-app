'use client';

/**
 * PostWorkoutCardRenderer — the post_workout carousel's per-suggestion card router
 * (home-generator-v2 follow-ups, Task 1, 16.08.2026).
 *
 * Branches by `suggestion.generatorId`, NOT a new `Suggestion.cardVariant` field —
 * `Suggestion` is deliberately generic/portable across every surface (suggestion.types.ts's
 * own header: "every surface constructs THIS type," and pick-map-suggestion.ts already
 * established the same principle for keeping surface-specific data OUT of it). `generatorId`
 * already exists and is exactly the discriminator needed.
 *
 * - `recovery-follow-up` → the SAME HeroWorkoutCard used for the real home-page rest-day
 *   hero (StatsOverview.tsx), fed the real cached GeneratedWorkout (getCachedRecoveryWorkout)
 *   through the existing generatedToHeroWorkout() adapter. No new visual language — recovery
 *   styling (the "🧘 התאוששות פעילה" metadata label) is already entirely data-driven off
 *   `workout.isRecovery`, not a special component mode (isRestDay is dead on this component).
 * - `partial-completion` → same HeroWorkoutCard treatment as recovery-follow-up, fed the
 *   real cached GeneratedWorkout (getCachedPartialCompletionWorkout). Falls back to the
 *   generic SuggestionCard on a cache miss.
 * - `complementary-short` / `safety-net` → unchanged, the generic SuggestionCard.
 * - `route` → the generic SuggestionCard, UNLESS `healthConnected===false`, in which case
 *   ConnectStepsCard replaces it (real-steps-connect plan, 02.09.2026, Part 2) — a route
 *   suggestion built off a never-connected user's fabricated 8000-step default would show a
 *   fake distance as if it were real.
 *
 * Sizing note: HeroWorkoutCard's `active` variant renders at a fixed 300x330 (CARD_VARIANTS,
 * HeroWorkoutCard.tsx) — wider than the carousel shell's own card-width ceiling
 * (SuggestionCarousel's CARD_MAX_W=260). Rather than touch the shared shell's sizing (out of
 * this task's scope) or fork HeroWorkoutCard's own dimensions (used elsewhere, unrelated),
 * this measures its actual slot at runtime and applies a uniform CSS scale so it renders at
 * its real proportions, just fit to whatever the shell hands it — never clipped, never
 * stretched/distorted.
 */

import { useRef, useState, useLayoutEffect } from 'react';
import HeroWorkoutCard from './HeroWorkoutCard';
import { generatedToHeroWorkout } from '../utils/generatedToHeroWorkout';
import { SuggestionCard } from '@/features/workout-engine/core/components/SuggestionCard';
import { getCachedRecoveryWorkout } from '@/features/workout-engine/core/generators/recovery-follow-up.generator';
import { getCachedPartialCompletionWorkout } from '@/features/workout-engine/core/generators/partial-completion.generator';
import { ConnectStepsCard } from './ConnectStepsCard';
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';

const HERO_CARD_NATURAL_WIDTH = 300;
const HERO_CARD_NATURAL_HEIGHT = 330;

interface PostWorkoutCardRendererProps {
  suggestion: Suggestion;
  onStart: () => void;
  isStarting?: boolean;
  userGender?: 'male' | 'female' | 'other' | null;
  /** Real-steps-connect plan (02.09.2026, Part 2) — see this file's own header. */
  healthConnected?: boolean | null;
  /** Opens the shared health-permission disclosure flow. Required together with
   *  `healthConnected` for the 'route' + not-connected branch to render ConnectStepsCard. */
  onConnectSteps?: () => void;
}

function ScaledHeroRecoveryCard({
  onStart,
  userGender,
  workout,
}: {
  onStart: () => void;
  userGender?: 'male' | 'female' | 'other' | null;
  // Generic GeneratedWorkout, not NonNullable<ReturnType<typeof getCachedRecoveryWorkout>> —
  // this component has no recovery-specific logic (recovery styling is entirely data-driven
  // off workout.isRecovery, per this file's own header), so it's already the right shape for
  // partial-completion's own getCachedPartialCompletionWorkout too, which returns the exact
  // same GeneratedWorkout | undefined.
  workout: GeneratedWorkout;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setScale(Math.min(1, width / HERO_CARD_NATURAL_WIDTH, height / HERO_CARD_NATURAL_HEIGHT));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={slotRef} className="h-full w-full flex items-center justify-center overflow-hidden">
      <div style={{ transform: `scale(${scale})` }}>
        <HeroWorkoutCard
          workout={generatedToHeroWorkout(workout)}
          exercises={workout.exercises}
          onStart={onStart}
          variant="active"
          userGender={userGender}
        />
      </div>
    </div>
  );
}

export function PostWorkoutCardRenderer({
  suggestion,
  onStart,
  isStarting,
  userGender,
  healthConnected,
  onConnectSteps,
}: PostWorkoutCardRendererProps) {
  if (suggestion.generatorId === 'recovery-follow-up') {
    const workout = getCachedRecoveryWorkout(suggestion.id);
    if (workout) {
      return <ScaledHeroRecoveryCard onStart={onStart} userGender={userGender} workout={workout} />;
    }
    // Defensive: cache miss (cap eviction, or a suggestion surviving a reload) — degrade
    // to the generic card rather than render nothing.
  }

  if (suggestion.generatorId === 'partial-completion') {
    const workout = getCachedPartialCompletionWorkout(suggestion.id);
    if (workout) {
      return <ScaledHeroRecoveryCard onStart={onStart} userGender={userGender} workout={workout} />;
    }
    // Defensive: cache miss — degrade to the generic card rather than render nothing.
  }

  if (suggestion.generatorId === 'route' && healthConnected === false && onConnectSteps) {
    return <ConnectStepsCard onConnect={onConnectSteps} />;
  }

  return <SuggestionCard suggestion={suggestion} onStart={onStart} isStarting={isStarting} />;
}

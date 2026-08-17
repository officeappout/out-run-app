'use client';

/**
 * ScaledHeroCard — measures its actual carousel slot at runtime and applies a uniform CSS
 * scale so HeroWorkoutCard (fixed 300x330 'active' variant, HeroWorkoutCard.tsx's
 * CARD_VARIANTS) renders at its real proportions inside a narrower carousel card slot
 * (SuggestionCarousel's CARD_MAX_W=260) — never clipped, never stretched/distorted.
 *
 * New, small support file (pre-workout hero carousel Stage 1, 17.08.2026) — generalizes the
 * fit-to-slot technique PostWorkoutCardRenderer.tsx's private ScaledHeroRecoveryCard already
 * proved for the post_workout recovery card, so StatsOverview.tsx's own trio-driven "hero"
 * slide and the new PreWorkoutCardRenderer's recovery-follow-up slide can share the identical
 * fix instead of two independent copies of the same non-trivial ResizeObserver logic.
 * Deliberately does NOT touch PostWorkoutCardRenderer.tsx itself (out of Stage 1's approved
 * scope) — that file keeps its own local implementation, unchanged.
 */

import { useRef, useState, useLayoutEffect } from 'react';
import HeroWorkoutCard from './HeroWorkoutCard';
import { generatedToHeroWorkout } from '../utils/generatedToHeroWorkout';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';

const HERO_CARD_NATURAL_WIDTH = 300;
const HERO_CARD_NATURAL_HEIGHT = 330;

interface ScaledHeroCardProps {
  workout: GeneratedWorkout;
  onStart: () => void;
  userGender?: 'male' | 'female' | 'other' | null;
  /** Current workout location (for resolving correct execution method media) — the trio
   *  hero slide passes this (currentWorkoutLocation); a bare Suggestion slide has no
   *  equivalent and omits it, matching HeroWorkoutCard's own optional prop. */
  workoutLocation?: string | null;
  /** Program template key — shows the program icon next to the title. Same omit-if-absent
   *  reasoning as workoutLocation. */
  programIconKey?: string | null;
}

export function ScaledHeroCard({
  workout,
  onStart,
  userGender,
  workoutLocation,
  programIconKey,
}: ScaledHeroCardProps) {
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
          workoutLocation={workoutLocation}
          programIconKey={programIconKey}
        />
      </div>
    </div>
  );
}

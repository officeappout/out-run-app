'use client';

/**
 * PreWorkoutCardRenderer — the home pre-workout carousel's per-suggestion card router
 * (17.8 build-plan, Section 1, commit 3/4, 26.08.2026). Same pattern as the already-shipped
 * PostWorkoutCardRenderer.tsx: branches on `suggestion.generatorId`, not a new
 * `Suggestion.cardVariant` field — `generatorId` is already the right discriminator
 * (suggestion.types.ts's own header: every surface constructs the SAME Suggestion shape).
 *
 * - `full-strength` → checks the generator's own Tier-2 cache
 *   (getCachedFullStrengthWorkout, full-strength.generator.ts). A cache hit renders the real
 *   HeroWorkoutCard (same card the live single-anchor home experience and post-workout's
 *   recovery-follow-up cards already use) via the existing generatedToHeroWorkout() adapter. A
 *   cache miss — Tier-2 hasn't resolved yet — renders HeroWorkoutCard's own already-exported
 *   HeroCardSkeleton (HeroWorkoutCard.tsx: "shown until dynamicWorkout is fully resolved"),
 *   explicitly NOT a fabricated preview (David's call, 26.08.2026).
 * - Every other generatorId (route/safety-net/recovery-follow-up when NOT yet Tier-2-split,
 *   etc.) → the generic SuggestionCard, unchanged — those either already carry their full,
 *   real content in generate() itself (no separate Tier-2 step to wait on) or have no richer
 *   surface to show yet.
 *
 * Sizing: HeroWorkoutCard's `active` variant is a fixed 300x330 — wider than the carousel
 * shell's own card-width ceiling (SuggestionCarousel's CARD_MAX_W=260), same mismatch
 * PostWorkoutCardRenderer's ScaledHeroRecoveryCard already solved for the recovery card.
 * Deliberately NOT reusing/genericizing that component here (touching an already-shipped, live
 * file for this): ScaledHeroSlot below is a small, separate copy of the identical
 * measure-and-scale idiom — a few duplicated lines, zero risk to the live post-workout carousel.
 */

import { useRef, useState, useLayoutEffect, type ReactNode } from 'react';
import HeroWorkoutCard, { HeroCardSkeleton } from './HeroWorkoutCard';
import { generatedToHeroWorkout } from '../utils/generatedToHeroWorkout';
import { SuggestionCard } from '@/features/workout-engine/core/components/SuggestionCard';
import { getCachedFullStrengthWorkout } from '@/features/workout-engine/core/generators/full-strength.generator';
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';

const HERO_CARD_NATURAL_WIDTH = 300;
const HERO_CARD_NATURAL_HEIGHT = 330;

interface PreWorkoutCardRendererProps {
  suggestion: Suggestion;
  onStart: () => void;
  isStarting?: boolean;
  userGender?: 'male' | 'female' | 'other' | null;
}

/** Measures its own slot and scales its (fixed-size, 300x330-natural) child to fit — same idiom
 *  as PostWorkoutCardRenderer.tsx's ScaledHeroRecoveryCard, kept as a separate copy here (see
 *  file header). Used for BOTH the real card and HeroCardSkeleton, since both share the exact
 *  same natural dimensions and need the identical fit-to-slot treatment. */
function ScaledHeroSlot({ children }: { children: ReactNode }) {
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
      <div style={{ transform: `scale(${scale})` }}>{children}</div>
    </div>
  );
}

export function PreWorkoutCardRenderer({
  suggestion,
  onStart,
  isStarting,
  userGender,
}: PreWorkoutCardRendererProps) {
  if (suggestion.generatorId === 'full-strength') {
    const workout = getCachedFullStrengthWorkout(suggestion.id);
    return (
      <ScaledHeroSlot>
        {workout ? (
          <HeroWorkoutCard
            workout={generatedToHeroWorkout(workout)}
            exercises={workout.exercises}
            onStart={onStart}
            variant="active"
            userGender={userGender}
          />
        ) : (
          <HeroCardSkeleton />
        )}
      </ScaledHeroSlot>
    );
  }

  return <SuggestionCard suggestion={suggestion} onStart={onStart} isStarting={isStarting} />;
}

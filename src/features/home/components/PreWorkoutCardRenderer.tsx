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
 *   HeroWorkoutCard via the existing generatedToHeroWorkout() adapter. A cache miss — Tier-2
 *   hasn't resolved yet — renders HeroWorkoutCard's own already-exported HeroCardSkeleton
 *   (HeroWorkoutCard.tsx: "shown until dynamicWorkout is fully resolved"), explicitly NOT a
 *   fabricated preview (David's call, 26.08.2026).
 * - `recovery-follow-up` → same HeroWorkoutCard treatment, but checks
 *   getCachedRecoveryWorkout (recovery-follow-up.generator.ts) instead — the SAME card
 *   PostWorkoutCardRenderer.tsx's own recovery-follow-up branch already uses. This generator
 *   has no Tier-2 split (its generate() always awaits the real trio call itself before
 *   returning a Suggestion at all — see that file's header), so this cache is expected to be
 *   populated by the time a Suggestion referencing it exists; HeroCardSkeleton on a miss is a
 *   defensive fallback (cap eviction / a suggestion surviving a reload), not the normal path.
 *   Fixed 26.08.2026 — this generator previously fell through to the generic SuggestionCard
 *   below by omission, losing its real video/equipment/title.
 * - Every other generatorId (route/safety-net, etc.) → the generic SuggestionCard, unchanged —
 *   no richer surface exists for them yet.
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
import { getCachedRecoveryWorkout } from '@/features/workout-engine/core/generators/recovery-follow-up.generator';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';

const HERO_CARD_NATURAL_WIDTH = 300;
const HERO_CARD_NATURAL_HEIGHT = 330;

interface PreWorkoutCardRendererProps {
  suggestion: Suggestion;
  onStart: () => void;
  isStarting?: boolean;
  userGender?: 'male' | 'female' | 'other' | null;
  /**
   * Parity fix (27.08.2026, verified against StatsOverview.tsx's own HeroWorkoutCard call
   * site, lines 1139-1141): both were previously never forwarded from here, silently
   * dropping the program icon next to the title and risking a location-mismatched
   * background/equipment pick (resolveHeroMedia/resolveEquipmentSvgPathList fall back to
   * "first method with any media" when location is undefined — not wrong, just not
   * location-aware). See home/page.tsx for how these are derived for the new carousel.
   */
  workoutLocation?: string | null;
  programIconKey?: string | null;
  /** Location-swap parity fix (27.08.2026) — home/page.tsx's own per-suggestion swap result
   *  (swappedWorkoutById), kept outside this generator's cache. Takes priority over the
   *  cache when present; see resolveHeroWorkout's own doc comment for why. */
  overrideWorkout?: GeneratedWorkout | null;
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

// generatorId -> its own Tier-2/real-content cache lookup. Both generators here already write
// this cache themselves (full-strength.generator.ts's resolveFullStrengthWorkout;
// recovery-follow-up.generator.ts's generate() itself) — this is read-only.
const HERO_CACHE_LOOKUP: Record<string, (suggestionId: string) => GeneratedWorkout | undefined> = {
  'full-strength': getCachedFullStrengthWorkout,
  'recovery-follow-up': getCachedRecoveryWorkout,
};

/** True for any generatorId this renderer gives the richer HeroWorkoutCard treatment —
 *  exported so home/page.tsx can tell whether a header/description/location-swap even
 *  applies to the currently-focused suggestion (safety-net/route have no such content). */
export function hasHeroCardTreatment(generatorId: string): boolean {
  return generatorId in HERO_CACHE_LOOKUP;
}

/**
 * Resolves the SAME real GeneratedWorkout this renderer would show for `suggestion` —
 * exported so home/page.tsx's header (title/description/location chip/program icon) reads
 * the identical content this card renders, instead of a second, independently-drifting copy.
 * `overrideWorkout` (27.08.2026, location-swap parity fix) takes priority over the generator's
 * own cache: the swap result is intentionally kept OUTSIDE that cache (home/page.tsx's own
 * local state, keyed by suggestion.id) rather than writing back into it, so this stays a
 * pure, additive rendering-layer change — no generator/cache-internals touched.
 */
export function resolveHeroWorkout(
  suggestion: Suggestion,
  overrideWorkout?: GeneratedWorkout | null,
): GeneratedWorkout | null {
  if (overrideWorkout) return overrideWorkout;
  const heroLookup = HERO_CACHE_LOOKUP[suggestion.generatorId];
  return heroLookup ? heroLookup(suggestion.id) ?? null : null;
}

export function PreWorkoutCardRenderer({
  suggestion,
  onStart,
  isStarting,
  userGender,
  workoutLocation,
  programIconKey,
  overrideWorkout,
}: PreWorkoutCardRendererProps) {
  if (hasHeroCardTreatment(suggestion.generatorId)) {
    const workout = resolveHeroWorkout(suggestion, overrideWorkout);
    return (
      <ScaledHeroSlot>
        {workout ? (
          <HeroWorkoutCard
            workout={generatedToHeroWorkout(workout)}
            exercises={workout.exercises}
            onStart={onStart}
            variant="active"
            userGender={userGender}
            workoutLocation={workoutLocation}
            programIconKey={programIconKey}
          />
        ) : (
          <HeroCardSkeleton />
        )}
      </ScaledHeroSlot>
    );
  }

  return <SuggestionCard suggestion={suggestion} onStart={onStart} isStarting={isStarting} />;
}

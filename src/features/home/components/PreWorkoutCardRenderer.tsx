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
 * - `safety-net` → 3-way branch depending on real-steps state (real-steps-connect plan,
 *   02.09.2026 Part 3, revised 04.09.2026 Fix 2):
 *     1. `healthConnected===false` → ConnectStepsCard (never connected — no fabricated number).
 *     2. A route already resolved and cached (route.generator.ts's own resolveRouteWorkout/
 *        getCachedRoute, unchanged — keyed by the safety-net suggestion's OWN id, a separate
 *        cache entry from route.generator's own suggestions, no collision) → the generic
 *        SuggestionCard with real name/distance/duration, ctaLabel="צפה במסלול" (tapping opens
 *        that exact Route via a sheet, not a workout — see home/page.tsx).
 *     3. Otherwise, `stepsRemaining>0` → the generic SuggestionCard with the REAL live
 *        steps-remaining number instead of the static "הליכה קלה" placeholder,
 *        ctaLabel="מצא לי מסלול" — tapping is what actually triggers the GPS soft-ask + resolve
 *        (home/page.tsx's handlePreWorkoutCardTap). This is the NORMAL state before a tap, not
 *        a rare timing gap: GPS lives entirely at tap-time now (Fix 2) — the old render-time
 *        useGPSStore.getState().coords read in resolveHomeTier2 was silently empty on any
 *        non-rest day, confirmed live.
 *   safety-net.generator.ts's own eligible()/generate() are untouched throughout — this is a
 *   render-layer + tap-time-resolve addition only.
 * - Every other generatorId (route, etc.) → the generic SuggestionCard, unchanged — no richer
 *   surface exists for them yet.
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
import { getCachedRoute } from '@/features/workout-engine/core/generators/route.generator';
import { ConnectStepsCard } from './ConnectStepsCard';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';
import type { Route } from '@/features/parks/core/types/route.types';

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
  /** Real-steps-connect plan (02.09.2026, Part 3) — see this file's own header, safety-net
   *  bullet. */
  healthConnected?: boolean | null;
  /** Opens the shared health-permission disclosure flow. Required together with
   *  `healthConnected` for the safety-net + not-connected branch to render ConnectStepsCard. */
  onConnectSteps?: () => void;
  /**
   * Live (reactive, not a resolve-time snapshot) stepsRemaining — real-steps-connect plan,
   * staleness fix, 04.09.2026. Used ONLY to compute the safety-net slot's own Tier-2 cache
   * key (buildSafetyNetRouteCacheKey below) so this renderer reads the SAME bucketed key
   * home/page.tsx's resolveHomeTier2 resolved into. Undefined/omitted falls into bucket 0,
   * same as today's cache-miss ("not resolved yet") behavior — never a crash.
   */
  stepsRemaining?: number;
}

const ROUTE_DIFFICULTY_MAP: Record<Route['difficulty'], 1 | 2 | 3> = { easy: 1, medium: 2, hard: 3 };

/**
 * Bucket width for the safety-net slot's own Tier-2 route cache key (real-steps-connect plan,
 * staleness fix, 04.09.2026). route.generator.ts's routeCache is keyed by whatever string it's
 * given and has no staleness/TTL logic of its own (LRU-cap only, see its own doc comment) —
 * folding a coarse steps-bucket into the key here, entirely on the caller side, makes a
 * materially-changed REAL step count (e.g. background HealthKit sync) produce a natural cache
 * miss — and therefore a fresh resolve — without touching route.generator.ts at all.
 */
export const STEPS_CACHE_BUCKET_SIZE = 500;

/**
 * The safety-net slot's own Tier-2 cache key: the suggestion's own id (unchanged from Part 3 —
 * still a separate cache entry from route.generator's own suggestions) plus a steps-bucket
 * suffix. MUST be computed identically on both sides — the resolve side (home/page.tsx's
 * resolveHomeTier2) and the read side (this file's own getCachedRoute call below) — hence one
 * canonical exported function instead of the bucket math duplicated in two places.
 */
export function buildSafetyNetRouteCacheKey(suggestionId: string, stepsRemaining: number): string {
  return `${suggestionId}:${Math.floor(stepsRemaining / STEPS_CACHE_BUCKET_SIZE)}`;
}

/** Overlays a resolved real Route's display fields onto a copy of the original safety-net
 *  Suggestion — same generic SuggestionCard, real content instead of the static placeholder.
 *  Ranking-relevant fields (id/generatorId/score/scoreBreakdown/goalTags/etc.) are left
 *  untouched: this is a display-layer swap only, not a new ranked candidate. */
function buildRouteSuggestionFromRoute(route: Route, base: Suggestion): Suggestion {
  return {
    ...base,
    title: route.name,
    subtitle: `${route.distance.toFixed(1)} ק״מ · ~${route.duration} דק׳`,
    difficulty: ROUTE_DIFFICULTY_MAP[route.difficulty],
    structure: { ...base.structure, durationMin: route.duration },
  };
}

/**
 * Real-steps-connect follow-up (04.09.2026, Fix 2) — the intermediate state, before a route
 * has been resolved yet: shows the REAL live steps-remaining number instead of the fully
 * generic "הליכה קלה" placeholder. Tapping it is what actually triggers the GPS soft-ask +
 * resolve (home/page.tsx's handlePreWorkoutCardTap) — this is display-only, same overlay
 * pattern as buildRouteSuggestionFromRoute above.
 */
function buildStepsRemainingSuggestion(base: Suggestion, stepsRemaining: number): Suggestion {
  return {
    ...base,
    title: 'עוד קצת ותשלימו את יעד הצעדים',
    subtitle: `${stepsRemaining.toLocaleString('he-IL')} צעדים נותרו היום`,
  };
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
  healthConnected,
  onConnectSteps,
  stepsRemaining,
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

  if (suggestion.generatorId === 'safety-net') {
    if (healthConnected === false && onConnectSteps) {
      return <ConnectStepsCard onConnect={onConnectSteps} />;
    }
    const route = getCachedRoute(buildSafetyNetRouteCacheKey(suggestion.id, stepsRemaining ?? 0));
    if (route) {
      return (
        <SuggestionCard
          suggestion={buildRouteSuggestionFromRoute(route, suggestion)}
          onStart={onStart}
          isStarting={isStarting}
          // Bug 1 fix (04.09.2026): tapping this card opens a route-preview sheet
          // (useMapStore.openGlobalRouteSheet, home/page.tsx's handlePreWorkoutCardTap), not a
          // workout — 'התחל' would misleadingly imply the workout starts immediately.
          ctaLabel="צפה במסלול"
        />
      );
    }
    // Fix 2 (04.09.2026): no route resolved yet — GPS now lives entirely at tap-time (see
    // home/page.tsx's handlePreWorkoutCardTap), so this is the normal/expected state on
    // every render before the user has tapped, not just a rare timing gap. Show the real
    // live steps-remaining number instead of the fully generic placeholder whenever there's
    // an actual gap to close; stepsRemaining<=0 (goal met, or no data) falls through to
    // today's exact generic card, unchanged.
    if ((stepsRemaining ?? 0) > 0) {
      return (
        <SuggestionCard
          suggestion={buildStepsRemainingSuggestion(suggestion, stepsRemaining ?? 0)}
          onStart={onStart}
          isStarting={isStarting}
          ctaLabel="מצא לי מסלול"
        />
      );
    }
  }

  return <SuggestionCard suggestion={suggestion} onStart={onStart} isStarting={isStarting} />;
}

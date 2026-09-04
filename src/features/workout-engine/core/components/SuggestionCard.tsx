'use client';

/**
 * SuggestionCard — the plain, generic card renderer for a bare `Suggestion` (home-generator-v2
 * plan, step 6). Nothing in the codebase rendered a bare Suggestion before this — every
 * existing generator's output was discarded past ranking (route.generator.ts's own header:
 * "dark until something calls generate()"). Deliberately simple: title/subtitle, a
 * duration+difficulty row (reusing the already-shared DifficultyBolts, not a new bolt icon
 * implementation), and a single start CTA — this is the first real consumer of the shared
 * SuggestionCarousel shell, not a full card design system.
 *
 * Device-test fix (16.08.2026, David): SuggestionCarousel's cardHeight was bumped 200->330 to
 * fit PostWorkoutCardRenderer's HeroWorkoutCard-based recovery card, which stretched THIS
 * card's visible white/shadowed box to the same 330px, leaving large empty whitespace inside
 * a bounded, drop-shadowed card — read as broken on device. Fix: the visible card no longer
 * forces h-full — it sizes to its own content and is centered inside a transparent h-full
 * w-full slot, mirroring the exact centering idiom PostWorkoutCardRenderer.tsx's
 * ScaledHeroRecoveryCard already uses for the same carousel. Chosen over resizing the shared
 * SuggestionCarousel shell itself (which has 3 separate cardHeight call sites, including the
 * shared drag-viewport's own clipping box sized for ALL visible cards at once, not per-item) —
 * this is the smaller, single-file, zero-shell-risk fix.
 */

import DifficultyBolts from '../../components/DifficultyBolts';
import type { Suggestion } from '../types/suggestion.types';

const BRAND = '#00ADEF';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onStart: () => void;
  isStarting?: boolean;
  /**
   * CTA button text, defaults to 'התחל' (real-steps-connect plan, Bug 1 fix, 04.09.2026) — every
   * existing caller jumps straight into a workout on tap, so 'התחל' stays byte-identical for
   * them. PreWorkoutCardRenderer's upgraded safety-net slot passes 'צפה במסלול' instead, since
   * that tap opens a route-preview sheet, not a workout.
   */
  ctaLabel?: string;
}

export function SuggestionCard({ suggestion, onStart, isStarting, ctaLabel = 'התחל' }: SuggestionCardProps) {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div
        dir="rtl"
        className="w-full bg-white rounded-3xl p-5 shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
      >
        <div>
          <h3 className="text-[15px] font-black text-gray-900 leading-tight">{suggestion.title}</h3>
          {suggestion.subtitle && (
            <p className="text-[13px] font-semibold text-gray-500 mt-1.5 leading-snug">
              {suggestion.subtitle}
            </p>
          )}
          <div className="mt-3">
            <DifficultyBolts difficulty={suggestion.difficulty} size="sm" />
          </div>
          <p className="text-[13px] font-normal text-gray-600 mt-1.5">
            {suggestion.structure.durationMin} דקות
          </p>
        </div>

        <button
          type="button"
          onClick={onStart}
          disabled={isStarting}
          className="mt-4 w-full rounded-full py-2.5 text-[14px] font-black text-white transition-opacity disabled:opacity-60"
          style={{ background: BRAND }}
        >
          {isStarting ? 'טוען…' : ctaLabel}
        </button>
      </div>
    </div>
  );
}

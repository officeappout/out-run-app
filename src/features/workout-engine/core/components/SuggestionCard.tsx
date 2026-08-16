'use client';

/**
 * SuggestionCard — the plain, generic card renderer for a bare `Suggestion` (home-generator-v2
 * plan, step 6). Nothing in the codebase rendered a bare Suggestion before this — every
 * existing generator's output was discarded past ranking (route.generator.ts's own header:
 * "dark until something calls generate()"). Deliberately simple: title/subtitle, a
 * duration+difficulty row (reusing the already-shared DifficultyBolts, not a new bolt icon
 * implementation), and a single start CTA — this is the first real consumer of the shared
 * SuggestionCarousel shell, not a full card design system.
 */

import DifficultyBolts from '../../components/DifficultyBolts';
import type { Suggestion } from '../types/suggestion.types';

const BRAND = '#00ADEF';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onStart: () => void;
  isStarting?: boolean;
}

export function SuggestionCard({ suggestion, onStart, isStarting }: SuggestionCardProps) {
  return (
    <div
      dir="rtl"
      className="h-full w-full bg-white rounded-3xl p-5 flex flex-col justify-between shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
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
        {isStarting ? 'טוען…' : 'התחל'}
      </button>
    </div>
  );
}

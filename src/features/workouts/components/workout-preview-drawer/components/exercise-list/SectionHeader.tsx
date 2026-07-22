'use client';

import React from 'react';
import { ArrowDownCircle, Link2 } from 'lucide-react';
import type { ExerciseSection } from '../../types';

export interface SectionHeaderProps {
  section: ExerciseSection;
  /** True when this section is the auto-generated warmup block. */
  isWarmup: boolean;
  /** True when this section is one half of a superset pair. */
  isSuperset: boolean;
  /** True when this section is a pyramid (renders step-count instead of rounds). */
  isPyramidSection: boolean;
  /** Warmup-only: whether the warmup actually runs (`false` = greyed/skip). */
  isWarmupActive: boolean;
  /** Warmup-only: whether the cards body is currently expanded. */
  isWarmupExpanded: boolean;
  /** Warmup-only: collapse / expand the cards body. */
  onToggleWarmupExpanded: () => void;
  /** Warmup-only: flip the active-vs-skip flag (also auto-collapses on skip). */
  onToggleWarmupActive: () => void;
  /**
   * Warmup-only: hide the expand/collapse chevron because an OUTER container owns
   * expand/collapse (the hybrid station super-collapse, point 20). The skip pill
   * stays — it's functional. Default false → standalone preview is unchanged.
   */
  hideExpandToggle?: boolean;
}

/**
 * Section header used across the GeneratedWorkoutExerciseList loop.
 *
 * Two render branches selected by `isWarmup`:
 *
 * • **Warmup branch** — interactive accordion: chevron toggles the cards
 *   body open/closed, and a pill on the opposite side toggles the
 *   "active / skip" flag.  Disabled state cascades visually when the
 *   warmup is skipped (text turns grey, chevron disabled, pill goes line-through).
 *
 * • **Standard branch** — static header for superset / pyramid / straight-set
 *   blocks.  Supersets pick up a cyan link icon + accent text.  Pyramids
 *   swap the rounds-count copy for a step-count copy.
 *
 * Wrapped in `React.memo` so it only re-renders when its props actually
 * shift — the orchestrator's stable `useCallback` toggles guarantee the
 * memo equality check stays effective.
 */
const SectionHeaderImpl: React.FC<SectionHeaderProps> = ({
  section,
  isWarmup,
  isSuperset,
  isPyramidSection,
  isWarmupActive,
  isWarmupExpanded,
  onToggleWarmupExpanded,
  onToggleWarmupActive,
  hideExpandToggle = false,
}) => {
  if (isWarmup) {
    const titleBlock = (
      <>
        <h3
          className={`text-[16px] font-semibold ${
            isWarmupActive
              ? 'text-slate-900 dark:text-white'
              : 'text-slate-400 dark:text-slate-500'
          }`}
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {section.title}
        </h3>
        <span className="text-xs text-slate-400">
          ({section.exercises.length} תרגילים)
        </span>
        {!hideExpandToggle && (
          <ArrowDownCircle
            size={16}
            className={`text-slate-400 transition-transform ${
              isWarmupExpanded ? 'rotate-180' : ''
            }`}
          />
        )}
      </>
    );
    return (
      <div className="w-full flex items-center justify-between mb-3" dir="rtl">
        {hideExpandToggle ? (
          <div className="flex items-center gap-2">{titleBlock}</div>
        ) : (
          <button
            type="button"
            onClick={onToggleWarmupExpanded}
            disabled={!isWarmupActive}
            className="flex items-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
            aria-expanded={isWarmupExpanded}
            aria-label={isWarmupExpanded ? 'כווץ חימום' : 'הרחב חימום'}
          >
            {titleBlock}
          </button>
        )}

        <button
          type="button"
          onClick={onToggleWarmupActive}
          className={`px-3 py-1 rounded-full text-xs font-bold border transition-all active:scale-[0.96] ${
            isWarmupActive
              ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 line-through'
          }`}
          aria-pressed={isWarmupActive}
        >
          {isWarmupActive ? 'פעיל' : 'דלג'}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex items-center justify-between mb-3" dir="rtl">
      <div className="flex items-center gap-2">
        {isSuperset && <Link2 size={14} className="text-cyan-500" />}
        <h3
          className={`text-[16px] font-semibold ${
            isSuperset
              ? 'text-cyan-600 dark:text-cyan-400'
              : 'text-slate-900 dark:text-white'
          }`}
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {section.title}
        </h3>
      </div>
      <span className="text-sm font-medium text-slate-400">
        {isPyramidSection ? `${section.rounds} שלבים` : `${section.rounds}x סבבים`}
      </span>
    </div>
  );
};

const SectionHeader = React.memo(SectionHeaderImpl);
SectionHeader.displayName = 'SectionHeader';

export default SectionHeader;

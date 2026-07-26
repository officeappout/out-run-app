'use client';

import React from 'react';
import { ArrowDownCircle, Link2 } from 'lucide-react';
import type { ExerciseSection } from '../../types';
import type { TabataProtocolConfig } from '@/features/workout-engine/core/types/protocol.types';

export interface SectionHeaderProps {
  section: ExerciseSection;
  /** True when this section is the auto-generated warmup block. */
  isWarmup: boolean;
  /** True when this section is one half of a superset pair. */
  isSuperset: boolean;
  /** True when this section is a pyramid (renders step-count instead of rounds). */
  isPyramidSection: boolean;
  /**
   * Tabata block config (Stage 3 UX) — presence switches the header to the
   * tabata badge + format line ("20 שנ' עבודה / 10 מנוחה × 8 סבבים · 4 דק'").
   * Undefined = every other section renders exactly as before.
   */
  tabataConfig?: TabataProtocolConfig;
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
  tabataConfig,
  isWarmupActive,
  isWarmupExpanded,
  onToggleWarmupExpanded,
  onToggleWarmupActive,
  hideExpandToggle = false,
}) => {
  // ── Tabata branch (Stage 3 UX, David's design 12.07) ────────────────────
  // Clean title + compact work/rest chip; the right-side meta reflects the
  // ACTUAL composition — the block varies (8 ex × 1 cycle / 4×2 / 2×4, all
  // = 8 intervals), so cycles are computed from rounds ÷ exercise count.
  // Non-divisible splits (e.g. 3 exercises × 8 intervals) fall back to an
  // honest interval count instead of lying about whole cycles.
  if (tabataConfig) {
    const n = section.exercises.length;
    // Weighted cycle cost: a unilateral member occupies TWO intervals
    // (right→left consecutive, David's rule 12.07.2026).
    const cycleCost = section.exercises.reduce(
      (s, ex) =>
        s +
        ((ex as { exercise?: { symmetry?: string } })?.exercise?.symmetry === 'unilateral' ? 2 : 1),
      0,
    );
    const cycles = cycleCost > 0 && tabataConfig.rounds % cycleCost === 0 ? tabataConfig.rounds / cycleCost : null;
    const cyclesLabel =
      cycles === null
        ? `${tabataConfig.rounds} אינטרוולים`
        : cycles === 1
          ? 'סבב אחד'
          : `${cycles} סבבים`;
    const exercisesLabel = n === 1 ? 'תרגיל אחד' : `${n} תרגילים`;
    return (
      <div className="w-full flex items-center justify-between mb-3" dir="rtl">
        <div className="flex items-center gap-2">
          <h3
            className="text-[16px] font-semibold text-orange-600 dark:text-orange-400"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            טבטה
          </h3>
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-300"
            style={{ fontVariantNumeric: 'tabular-nums' }}
            title={`${tabataConfig.workSec} שנ' עבודה / ${tabataConfig.restSec} שנ' מנוחה`}
          >
            {tabataConfig.workSec}/{tabataConfig.restSec}
          </span>
        </div>
        <span className="text-sm font-medium text-slate-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {cyclesLabel} · {exercisesLabel}
        </span>
      </div>
    );
  }

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

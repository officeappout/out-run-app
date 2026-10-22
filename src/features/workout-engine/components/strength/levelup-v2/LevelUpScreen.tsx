'use client';

/**
 * Level-up v2 (enable_levelup_v2) — the "% screen" after a strength workout,
 * per the approved design (canvas "7 · סיכום ושיתוף", LV-1…LV-4) with the
 * owner's changes: ring only (no bottom level bar); chips appear one after
 * another and each pushes the ring; a level-up fills to 100, celebrates and
 * shows the NEW level with the carried-over %.
 *
 * The result is on screen at once (computed on the device); the write runs in
 * the background ("שומר…" → "נשמר"). Buttons are active immediately.
 */
import React from 'react';
import { useReducedMotion } from 'framer-motion';
import { Share2, X } from 'lucide-react';
import type { LevelPoint, LevelUpOutcome } from '@/features/user/progression/services/levelup-preview';
import { useSafeAreaTop } from '@/lib/safe-area/useSafeAreaTop';
import { useT } from '@/hooks/useT';
import { player, type PlayerKey } from '@/messages/ns/player';
import LevelRing from './LevelRing';
import GainChipRow from './GainChipRow';
import SaveStatusPill, { type SaveState } from './SaveStatusPill';
import { useRingSequence } from './useRingSequence';
import { deltaText, formatPercent, pickVariant, visibleChips, type LevelUpVariant } from './levelup-view-model';

const EYEBROW: Record<LevelUpVariant, PlayerKey> = {
  gain: 'levelup.eyebrow.gain',
  levelup: 'levelup.eyebrow.levelup',
  first: 'levelup.eyebrow.first',
  recovery: 'levelup.eyebrow.recovery',
  zero: 'levelup.eyebrow.zero',
  unknown: 'levelup.eyebrow.unknown',
};
const HEADLINE: Record<'first' | 'recovery' | 'zero' | 'unknown', PlayerKey> = {
  first: 'levelup.headline.first',
  recovery: 'levelup.headline.recovery',
  zero: 'levelup.headline.zero',
  unknown: 'levelup.headline.unknown',
};
const SUB: Record<Exclude<LevelUpVariant, 'levelup'>, PlayerKey> = {
  gain: 'levelup.sub.gain',
  first: 'levelup.sub.first',
  recovery: 'levelup.sub.recovery',
  zero: 'levelup.sub.zero',
  unknown: 'levelup.sub.unknown',
};

export interface LevelUpScreenProps {
  /** null = no result (engine failure / skipped) → calm state. */
  outcome: LevelUpOutcome | null;
  /** The ring when there is no outcome (the pre-workout level/percent). */
  fallback: LevelPoint;
  isRecovery: boolean;
  /** Inputs still loading (≤ ~1s): ring + buttons show, the copy waits. */
  pending?: boolean;
  programName: string;
  saveState: SaveState;
  onLevelUp?: (newLevel: number) => void;
  /** Absent → the share button is hidden (no share sheet on this screen). */
  onShare?: () => void;
  onContinue: () => void;
}

export default function LevelUpScreen({
  outcome,
  fallback,
  isRecovery,
  pending = false,
  programName,
  saveState,
  onLevelUp,
  onShare,
  onContinue,
}: LevelUpScreenProps) {
  const t = useT(player);
  const safeTop = useSafeAreaTop();
  const reducedMotion = !!useReducedMotion();
  const shownOutcome = isRecovery ? null : outcome;
  const seq = useRingSequence(shownOutcome, fallback.percent, reducedMotion, onLevelUp);
  const variant = pickVariant(shownOutcome, isRecovery);

  const point = shownOutcome ? (seq.showNewLevel ? shownOutcome.after : shownOutcome.before) : fallback;
  const calm = variant === 'recovery' || variant === 'zero' || variant === 'unknown';
  const delta = (() => {
    if (pending) return null;
    if (calm) return { text: t('levelup.delta.same'), tone: 'calm' as const };
    if (!shownOutcome) return null;
    if (seq.showNewLevel && shownOutcome.kind === 'master') return { text: t('levelup.delta.newLevel'), tone: 'gain' as const };
    const d = deltaText(shownOutcome);
    return d ? { text: `${d}%`, tone: 'gain' as const } : null;
  })();

  const headline = (() => {
    switch (variant) {
      case 'levelup':
        return seq.showNewLevel
          ? t('levelup.headline.levelup', { level: String(shownOutcome!.after.level) })
          : t('levelup.headline.gain', { next: String(shownOutcome!.before.level + 1) });
      case 'gain':
        return t('levelup.headline.gain', { next: String(point.level + 1) });
      default:
        return t(HEADLINE[variant]);
    }
  })();
  const sub =
    variant === 'levelup'
      ? seq.showNewLevel
        ? t('levelup.sub.levelup', { percent: formatPercent(shownOutcome!.after.percent) })
        : t('levelup.sub.gain')
      : t(SUB[variant]);
  const eyebrow = variant === 'levelup' && !seq.showNewLevel ? t('levelup.eyebrow.gain') : t(EYEBROW[variant]);

  return (
    <div className="fixed inset-0 z-[100] w-full h-full bg-white dark:bg-card-dark flex flex-col overflow-hidden" dir="rtl">
      {seq.showNewLevel && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_50%_42%,rgba(0,186,247,0.16),transparent_62%)]"
        />
      )}

      {/* Top bar — clears the notch (JS-measured safeTop covers Android edge-to-edge). */}
      <div
        className="relative shrink-0 px-4 flex items-center gap-2.5"
        style={{ paddingTop: `max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.5rem), ${safeTop + 8}px)`, minHeight: 44 }}
      >
        <SaveStatusPill state={saveState} />
        <span className="flex-1 text-center text-sm font-extrabold text-slate-600 dark:text-slate-300 truncate">
          {programName}
        </span>
        <button
          type="button"
          onClick={onContinue}
          aria-label={t('levelup.close')}
          className="w-11 h-11 rounded-full bg-white dark:bg-slate-800 shadow-[0_0_0_1px_rgba(14,27,42,0.08)] grid place-items-center active:scale-95 transition-transform duration-150"
        >
          <X className="w-[18px] h-[18px] text-slate-900 dark:text-white" strokeWidth={2.4} />
        </button>
      </div>

      <div className="relative flex-1 overflow-y-auto px-6 pt-5 flex flex-col items-center">
        <div className={`transition-opacity duration-200 ${pending ? 'opacity-0' : 'opacity-100'} text-[15px] font-extrabold ${variant === 'levelup' && seq.showNewLevel ? 'text-sky-600' : 'text-slate-500 dark:text-slate-400'}`}>
          {eyebrow}
        </div>
        <div className="mt-3.5">
          <LevelRing
            base={seq.ringBase}
            percent={seq.ringPercent}
            label={seq.showNewLevel ? t('levelup.ring.levelOnly') : t('levelup.ring.level', { level: String(point.level) })}
            bigText={seq.showNewLevel ? String(point.level) : undefined}
            delta={delta}
            calm={calm}
            reducedMotion={reducedMotion}
          />
        </div>
        <h1 className={`transition-opacity duration-200 ${pending ? 'opacity-0' : 'opacity-100'} mt-[18px] text-[26px] leading-8 font-black text-center text-slate-900 dark:text-white`}>{headline}</h1>
        <p className={`transition-opacity duration-200 ${pending ? 'opacity-0' : 'opacity-100'} mt-1.5 text-[15px] leading-[22px] text-slate-600 dark:text-slate-400 text-center max-w-[320px]`}>{sub}</p>
        {shownOutcome && (
          <GainChipRow chips={visibleChips(shownOutcome.chips)} revealedIds={seq.revealedChipIds} reducedMotion={reducedMotion} />
        )}
        <div className="flex-1" />
      </div>

      <div
        className="shrink-0 px-5 pt-3 flex flex-col gap-2.5"
        style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 0.75rem))' }}
      >
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="h-[54px] rounded-full bg-gradient-to-l from-primary to-cyan-300 text-[#04222b] text-[16.5px] font-extrabold inline-flex items-center justify-center gap-2 active:scale-[0.97] transition-transform duration-150"
          >
            <Share2 className="w-[18px] h-[18px]" strokeWidth={2.4} />
            {t('levelup.share')}
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          className={`h-12 rounded-full text-[15px] font-extrabold active:scale-[0.97] transition-transform duration-150 ${
            onShare
              ? 'bg-white dark:bg-slate-800 shadow-[0_0_0_1px_rgba(14,27,42,0.1)] text-slate-900 dark:text-white'
              : 'bg-gradient-to-l from-primary to-cyan-300 text-[#04222b] h-[54px] text-[16.5px]'
          }`}
        >
          {t('levelup.toSummary')}
        </button>
      </div>
    </div>
  );
}

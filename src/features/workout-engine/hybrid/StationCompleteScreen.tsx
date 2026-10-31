'use client';

/**
 * StationCompleteScreen — short end-of-station screen for a NON-final hybrid station (G2.4,
 * Sderot field test: after a station the user was dropped straight back on the map).
 *
 * Shown by HybridStationLayer while useHybridRun.pendingStationComplete is set. The run clock
 * stays paused the whole time (paused since arrive()); "המשך במסלול" → continueAfterStation()
 * closes the station with its REAL end time and resumes the clock for the next leg. The final
 * station never reaches this screen (finishStationWork routes it to the existing finish path).
 *
 * Copy is gender-neutral by construction ("סיימת" is spelled the same for both forms).
 *
 * `sheet` (enable_combo_flow_v1, boards PlayerTransitionWalk step 1 / ParkStationDone): the same
 * screen as a bottom sheet over the dimmed map: a check, the sheet title, the station's minutes
 * and exercises, the "back to the route: N min walk" row and the keep-going CTA. The caller drops its
 * white backdrop so the map shows through.
 */
import { common } from '@/messages/ns/common';
import { player } from '@/messages/ns/player';
import { useT } from '@/hooks/useT';
import { withUnit } from '@/lib/i18n/units';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { BicepsFlexed, Check, Flag } from 'lucide-react';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { formatApproxWalkMinutes } from './hybrid-intro-format';
import type { PendingStationComplete } from './useHybridRun';
import type { StationContext } from './station-flow';

import { useUiDir } from '@/lib/i18n/useUiDir';
const ACCENT = '#00ADEF';
const CTA_GRADIENT = 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)';

interface Props {
  summary: PendingStationComplete;
  context: StationContext | null;
  onContinue: () => void;
  /** PR-B1: the one-time "כבר הבנת? לעבור למצב מהיר" offer (guided users, from the 2nd completed
   *  guided station). Omitted → not shown. `onAccept` turns the guided setting off. */
  fastPrompt?: { onAccept: () => void };
  /** enable_combo_flow_v1: the bottom-sheet look over the map. */
  sheet?: boolean;
  /** M25: the last station (summary.final) → "keep walking freely" next to "finish" (onContinue). */
  onFreeWalk?: () => void;
}

export default function StationCompleteScreen({ summary, context, onContinue, fastPrompt, sheet = false, onFreeWalk }: Props) {
  const { direction } = useUiDir();
  const tc = useT(common);
  const t = useT(player);
  const [fastPromptState, setFastPromptState] = useState<'open' | 'accepted' | 'dismissed'>('open');
  const hasNext = !!context && !context.isFinalStation && context.nextWalkSec != null;
  const fastPromptCard = fastPrompt && fastPromptState !== 'dismissed' ? (
        <div
          className="w-full max-w-sm rounded-2xl px-4 py-3 mb-4 text-center"
          style={{ border: '1px solid #E0E9FF', background: '#FFFFFF', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
        >
          {fastPromptState === 'accepted' ? (
            <div className="flex items-center justify-center gap-2 text-[14px] font-bold text-gray-700">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-v2-tint text-v2-deep shrink-0" aria-hidden>
                <Check size={13} strokeWidth={3} />
              </span>
              <span>{t('hybrid.complete.fastAccepted')}</span>
            </div>
          ) : (
            <>
              <div className="text-[15px] font-black text-gray-900 mb-2">{t('hybrid.complete.fastAsk')}</div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => { fastPrompt.onAccept(); setFastPromptState('accepted'); }}
                  className="rounded-full px-4 py-2 text-[13px] font-bold text-white active:scale-95 transition-transform"
                  style={{ background: ACCENT }}
                >
                  {t('hybrid.complete.fastYes')}
                </button>
                <button
                  type="button"
                  onClick={() => setFastPromptState('dismissed')}
                  className="rounded-full px-4 py-2 text-[13px] font-bold text-gray-500 border border-gray-200 active:scale-95 transition-transform"
                >
                  {t('hybrid.complete.fastNo')}
                </button>
              </div>
            </>
          )}
        </div>
  ) : null;

  if (sheet) {
    const kind = context?.nextLegKind ?? 'walking';
    return (
      <motion.div
        key="station-complete"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="absolute inset-0 flex flex-col justify-end bg-[rgba(14,20,25,0.45)]"
        dir={direction}
      >
        <motion.div
          initial={{ y: 40 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex flex-col gap-3 rounded-t-[28px] bg-v2-surface px-[18px] pt-3.5"
          style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom, 28px))', fontFamily: 'var(--font-simpler)' }}
        >
          <span className="mx-auto block h-[5px] w-10 rounded-full bg-v2-hairline" aria-hidden />
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-v2-accent text-white" aria-hidden>
            <Check size={30} strokeWidth={2.4} />
          </span>
          <h1 className="text-center text-[23px] font-black text-v2-ink">{t('hybrid.complete.sheetTitle')}</h1>
          {(summary.minutes > 0 || summary.exercises > 0) && (
            <div className="flex rounded-[16px] bg-white px-1 py-2.5 ring-1 ring-inset ring-v2-hairline">
              {summary.minutes > 0 && (
                <span className="flex flex-1 flex-col items-center">
                  <span dir="ltr" className="text-[20px] font-black tabular-nums text-v2-ink">{summary.minutes}</span>
                  <span className="text-[11.5px] font-bold text-v2-muted">{t('hybrid.complete.statMinutes')}</span>
                </span>
              )}
              {summary.exercises > 0 && (
                <span className="flex flex-1 flex-col items-center">
                  <span dir="ltr" className="text-[20px] font-black tabular-nums text-v2-ink">{summary.exercises}</span>
                  <span className="text-[11.5px] font-bold text-v2-muted">{t('hybrid.complete.statExercises', { n: summary.exercises })}</span>
                </span>
              )}
            </div>
          )}
          {hasNext && (
            <div className="flex items-center gap-2.5 rounded-[16px] bg-lime-500/[0.12] p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-lime-500/25 text-lime-700" aria-hidden>
                <ActivityGlyph kind="aerobic" subtype={kind} className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-black text-v2-ink">
                {t('hybrid.complete.backToRoute', { time: formatApproxWalkMinutes(context!.nextWalkSec!, context!.nextLegKind) })}
              </span>
            </div>
          )}
          {fastPromptCard}
          {summary.final && onFreeWalk ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onFreeWalk}
                className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-black text-[#04222b] active:scale-[0.98] transition-transform"
                style={{ background: CTA_GRADIENT }}
              >
                <ActivityGlyph kind="aerobic" subtype="walking" className="h-[18px] w-[18px]" />
                {t('hybrid.complete.freeWalk')}
              </button>
              <button
                type="button"
                onClick={onContinue}
                className="flex h-[52px] items-center justify-center gap-1.5 rounded-full bg-white px-5 text-[15px] font-black text-v2-ink ring-1 ring-inset ring-v2-hairline active:scale-[0.98] transition-transform"
              >
                <Flag size={16} strokeWidth={2.4} aria-hidden />
                {t('hybrid.complete.finish')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onContinue}
              className="h-[52px] w-full rounded-full text-[16px] font-black text-[#04222b] active:scale-[0.98] transition-transform"
              style={{ background: CTA_GRADIENT }}
            >
              {t('hybrid.complete.continueLeg', { kind })}
            </button>
          )}
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="station-complete"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="absolute inset-0 flex flex-col items-center justify-center bg-white px-6"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 24px))' }}
      dir={direction}
    >
      {/* Hero icon tile — IconTile's accent recipe (v2-tint / v2-deep, bold stroke) at hero size. */}
      <div className="w-20 h-20 mb-4 rounded-v2-card bg-v2-tint text-v2-deep flex items-center justify-center" aria-hidden>
        <BicepsFlexed size={40} strokeWidth={2.4} />
      </div>
      <h1 className="text-[28px] font-black text-gray-900 mb-2" style={{ fontFamily: 'var(--font-simpler)' }}>
        {t('hybrid.complete.title')}
      </h1>

      <div className="flex items-center gap-3 mb-8 text-[15px] font-bold text-gray-600">
        {summary.exercises > 0 && <span>{t('hybrid.complete.exercises', { n: summary.exercises })}</span>}
        {summary.exercises > 0 && summary.minutes > 0 && <span aria-hidden className="text-gray-300">·</span>}
        {summary.minutes > 0 && <span>{withUnit('min', summary.minutes, tc)}</span>}
      </div>

      {hasNext && (
        <div
          className="w-full max-w-sm rounded-2xl px-4 py-3 mb-6 text-center"
          style={{ border: '1px solid #E0E9FF', background: '#F5FBFF' }}
        >
          <div className="text-[12px] font-bold mb-0.5" style={{ color: ACCENT }}>{t('hybrid.complete.next')}</div>
          <div className="text-[16px] font-black text-gray-900">
            {context!.nextStationName ?? t('hybrid.parkFallback')}
          </div>
          <div className="text-[13px] font-bold text-gray-500 mt-0.5">
            {t('hybrid.complete.in', { time: formatApproxWalkMinutes(context!.nextWalkSec!, context!.nextLegKind) })}
          </div>
        </div>
      )}

      {fastPromptCard}

      <button
        type="button"
        onClick={onContinue}
        className="w-full max-w-sm h-14 rounded-full text-black text-[16px] font-bold active:scale-[0.98] transition-transform shadow-md shadow-cyan-400/25"
        style={{ background: CTA_GRADIENT, fontFamily: 'var(--font-simpler)' }}
      >
        {t('hybrid.complete.continue')}
      </button>
    </motion.div>
  );
}

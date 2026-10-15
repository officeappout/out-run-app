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
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatApproxWalkMinutes } from './hybrid-intro-format';
import type { PendingStationComplete } from './useHybridRun';
import type { StationContext } from './station-flow';

const ACCENT = '#00ADEF';
const CTA_GRADIENT = 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)';

interface Props {
  summary: PendingStationComplete;
  context: StationContext | null;
  onContinue: () => void;
  /** PR-B1: the one-time "כבר הבנת? לעבור למצב מהיר" offer (guided users, from the 2nd completed
   *  guided station). Omitted → not shown. `onAccept` turns the guided setting off. */
  fastPrompt?: { onAccept: () => void };
}

export default function StationCompleteScreen({ summary, context, onContinue, fastPrompt }: Props) {
  const [fastPromptState, setFastPromptState] = useState<'open' | 'accepted' | 'dismissed'>('open');
  const hasNext = !!context && !context.isFinalStation && context.nextWalkSec != null;
  return (
    <motion.div
      key="station-complete"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="absolute inset-0 flex flex-col items-center justify-center bg-white px-6"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 24px))' }}
      dir="rtl"
    >
      <div className="text-6xl mb-4" aria-hidden>💪</div>
      <h1 className="text-[28px] font-black text-gray-900 mb-2" style={{ fontFamily: 'var(--font-simpler)' }}>
        סיימת את התחנה!
      </h1>

      <div className="flex items-center gap-3 mb-8 text-[15px] font-bold text-gray-600">
        {summary.exercises > 0 && <span>{summary.exercises === 1 ? 'תרגיל אחד' : `${summary.exercises} תרגילים`}</span>}
        {summary.exercises > 0 && summary.minutes > 0 && <span aria-hidden className="text-gray-300">·</span>}
        {summary.minutes > 0 && <span>{summary.minutes} דק׳</span>}
      </div>

      {hasNext && (
        <div
          className="w-full max-w-sm rounded-2xl px-4 py-3 mb-6 text-center"
          style={{ border: '1px solid #E0E9FF', background: '#F5FBFF' }}
        >
          <div className="text-[12px] font-bold mb-0.5" style={{ color: ACCENT }}>התחנה הבאה</div>
          <div className="text-[16px] font-black text-gray-900">
            {context!.nextStationName ?? 'גינת כושר'}
          </div>
          <div className="text-[13px] font-bold text-gray-500 mt-0.5">
            בעוד {formatApproxWalkMinutes(context!.nextWalkSec!, context!.nextLegKind)}
          </div>
        </div>
      )}

      {fastPrompt && fastPromptState !== 'dismissed' && (
        <div
          className="w-full max-w-sm rounded-2xl px-4 py-3 mb-4 text-center"
          style={{ border: '1px solid #E0E9FF', background: '#FFFFFF', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
        >
          {fastPromptState === 'accepted' ? (
            <div className="text-[14px] font-bold text-gray-700">עברנו למצב מהיר ✓ אפשר לשנות בהגדרות</div>
          ) : (
            <>
              <div className="text-[15px] font-black text-gray-900 mb-2">כבר הבנת? לעבור למצב מהיר</div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => { fastPrompt.onAccept(); setFastPromptState('accepted'); }}
                  className="rounded-full px-4 py-2 text-[13px] font-bold text-white active:scale-95 transition-transform"
                  style={{ background: ACCENT }}
                >
                  כן, למצב מהיר
                </button>
                <button
                  type="button"
                  onClick={() => setFastPromptState('dismissed')}
                  className="rounded-full px-4 py-2 text-[13px] font-bold text-gray-500 border border-gray-200 active:scale-95 transition-transform"
                >
                  לא עכשיו
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onContinue}
        className="w-full max-w-sm h-14 rounded-full text-black text-[16px] font-bold active:scale-[0.98] transition-transform shadow-md shadow-cyan-400/25"
        style={{ background: CTA_GRADIENT, fontFamily: 'var(--font-simpler)' }}
      >
        המשך במסלול
      </button>
    </motion.div>
  );
}

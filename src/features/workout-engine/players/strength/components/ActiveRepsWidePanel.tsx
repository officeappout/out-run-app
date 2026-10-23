'use client';

/**
 * ActiveRepsWidePanel — the side panel of a reps set in the wide player
 * (enable_wide_player_v1): big name, big reps / target, the current set, the
 * primary "done" button, swap, and the next-up card. Presentational only —
 * the same FillingButton / callbacks as the portrait card.
 */

import React from 'react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import FillingButton from './FillingButton';
import WideNextUp from '../../shared/v2/WideNextUp';
import WideKeyHints from '../../shared/v2/WideKeyHints';

export interface ActiveRepsWidePanelProps {
  activeKey: string;
  exerciseName: string;
  repsOrDurationText: string;
  isUnilateral: boolean;
  targetValue: number;
  currentRound: number;
  totalRounds: number;
  isSupersetActive: boolean;
  supersetPartnerName: string | null;
  guidanceLine?: string;
  autoCompleteTime: number;
  isPaused: boolean;
  v2: boolean;
  nextUp?: { name: string; caption?: string | null; imageUrl?: string | null };
  onComplete: () => void;
  onSwap?: () => void;
}

export default function ActiveRepsWidePanel({
  activeKey, exerciseName, repsOrDurationText, isUnilateral, targetValue, currentRound, totalRounds,
  isSupersetActive, supersetPartnerName, guidanceLine, autoCompleteTime, isPaused, v2, nextUp, onComplete, onSwap,
}: ActiveRepsWidePanelProps) {
  const t = useT(player);
  return (
    <div data-wide-reps="" className="flex flex-col items-center text-center">
      {totalRounds > 1 && (
        <div className="mb-1 whitespace-nowrap text-[16px] font-extrabold tabular-nums text-v2-deep">
          {t('wide.set', { current: String(currentRound), total: String(totalRounds) })}
        </div>
      )}
      <h2 className="mb-2 text-[28px] font-black leading-tight !tracking-[-0.02em] text-v2-ink">{exerciseName}</h2>
      {repsOrDurationText && (
        <div className="mb-1 flex items-baseline justify-center gap-2">
          <span className="whitespace-nowrap text-[64px] font-black leading-none tabular-nums !tracking-[-0.03em] text-v2-ink">
            {repsOrDurationText}
          </span>
          {isUnilateral && <span className="whitespace-nowrap text-[18px] font-extrabold text-v2-deep">{t('wide.perSide')}</span>}
        </div>
      )}
      {targetValue > 0 && <div className="mb-2 text-[20px] font-extrabold tabular-nums text-v2-deep">{t('wide.target', { target: String(targetValue) })}</div>}
      {isSupersetActive && supersetPartnerName && (
        <div className="mb-2 rounded-full bg-violet-50 px-3 py-1 text-[15px] font-extrabold text-violet-600 ring-1 ring-inset ring-violet-200">
          {t('wide.superset', { partner: supersetPartnerName })}
        </div>
      )}
      {guidanceLine && <p className="mb-2 text-[16px] font-bold text-v2-deep">{guidanceLine}</p>}
      <div className="mt-2 w-full" data-coach="player-done">
        <FillingButton
          key={`fill-${activeKey}`}
          autoCompleteTime={autoCompleteTime}
          onClick={onComplete}
          label={t('wide.done')}
          isPaused={isPaused}
          v2={v2}
        />
      </div>
      {onSwap && (
        <button
          type="button"
          onClick={onSwap}
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-[15px] font-extrabold text-v2-ink-2 shadow-v2-ring"
        >
          {t('wide.swap')}
        </button>
      )}
      {nextUp && <div className="w-full text-start"><WideNextUp {...nextUp} /></div>}
      <WideKeyHints />
    </div>
  );
}

'use client';

/**
 * ImmersiveOverlay — the only chrome left in immersive mode (a landscape-filmed
 * clip on a landscape screen): a tap layer that shows / hides a slim top bar
 * (name, minimize, exit) and a bottom bar (target + the done button). Respects
 * the safe areas. Presentational; the card underneath stays mounted.
 */

import React, { useState } from 'react';
import { Check, Minimize2, Shrink } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

export interface ImmersiveOverlayProps {
  exerciseName: string;
  /** "8-10" / "30 שניות" — the reps or duration target line. */
  targetText: string;
  /** Reps sets only: the done button (a timed card has its own, floating). */
  onDone?: () => void;
  onMinimize?: () => void;
  /** Leave immersive (only offered when the user entered it by hand). */
  onExit?: () => void;
}

const BAR = 'pointer-events-auto flex items-center gap-3 rounded-2xl bg-black/60 px-4 py-2 text-white backdrop-blur-md';

export default function ImmersiveOverlay({ exerciseName, targetText, onDone, onMinimize, onExit }: ImmersiveOverlayProps) {
  const t = useT(player);
  const [shown, setShown] = useState(true);
  const toggle = () => setShown((v) => !v);
  return (
    <div data-immersive="" data-shown={shown ? 'true' : 'false'} className="absolute inset-0 z-30" style={{ fontFamily: 'var(--font-simpler)' }}>
      <button type="button" aria-label={t('wide.immersive.toggleAria')} onClick={toggle} className="absolute inset-0 h-full w-full cursor-default bg-transparent" />
      {shown && (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3"
            style={{ paddingInline: 'max(3vw, env(safe-area-inset-left, 0px))', paddingTop: 'max(2vh, env(safe-area-inset-top, 0px))' }}
          >
            <div className={`${BAR} min-w-0`}>
              <span className="truncate text-[17px] font-black">{exerciseName}</span>
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              {onExit && (
                <button type="button" onClick={onExit} aria-label={t('wide.immersive.exit')} className={BAR}>
                  <Shrink size={18} aria-hidden />
                  <span className="text-[14px] font-extrabold">{t('wide.immersive.exit')}</span>
                </button>
              )}
              {onMinimize && (
                <button type="button" onClick={onMinimize} aria-label={t('wide.immersive.minimize')} className={BAR}>
                  <Minimize2 size={18} aria-hidden />
                  <span className="text-[14px] font-extrabold">{t('wide.immersive.minimize')}</span>
                </button>
              )}
            </div>
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3"
            style={{ paddingInline: 'max(3vw, env(safe-area-inset-left, 0px))', paddingBottom: 'max(2vh, env(safe-area-inset-bottom, 0px))' }}
          >
            {targetText ? <div className={BAR}><span className="whitespace-nowrap text-[22px] font-black tabular-nums">{targetText}</span></div> : <span />}
            {onDone && (
              <button
                type="button"
                onClick={onDone}
                className="pointer-events-auto flex h-14 items-center gap-2 rounded-full bg-v2-cta px-7 text-[18px] font-black text-v2-on-cta shadow-v2-cta"
              >
                <Check size={22} strokeWidth={2.75} aria-hidden />
                {t('wide.done')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

'use client';

/**
 * The lemur under the level-up ring (canvas page 7, LV-1…LV-5): typing dots while the line is
 * on its way, then the funny line typed in (≤ 1.2s; reduced motion = instant). No line (flag
 * off, no Kelly AI, timeout, nothing safe to say) → renders nothing.
 */
import React from 'react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { useTypewriter } from './useTypewriter';

export const LEMUR_SRC = '/assets/lemur/king-lemur.png';

export interface LemurBubbleProps {
  /** A request is in flight or answered. */
  active: boolean;
  /** undefined = still loading; null = no line. */
  line: string | null | undefined;
  reducedMotion: boolean;
}

export default function LemurBubble({ active, line, reducedMotion }: LemurBubbleProps) {
  const t = useT(player);
  const text = typeof line === 'string' && line ? line : null;
  const shown = useTypewriter(text, reducedMotion);
  if (!active || line === null) return null;
  const typing = line === undefined;
  const caret = text != null && shown < text.length;
  return (
    <div className="mt-[18px] flex w-full max-w-[350px] items-end gap-1.5" data-testid="lemur-bubble">
      <img src={LEMUR_SRC} alt={t('insights.lemurAlt')} width={54} height={76} className="-mb-1 h-[76px] w-[54px] shrink-0 object-contain" />
      <div
        className="min-w-0 flex-1 rounded-[20px_20px_6px_20px] bg-white px-3.5 py-[11px] dark:bg-slate-800"
        style={{ boxShadow: '0 14px 30px -20px rgba(9,30,50,0.45), 0 0 0 1px rgba(0,186,247,0.35)' }}
        aria-live="polite"
      >
        {typing ? (
          <span className="inline-flex gap-1.5 py-[5px]" role="status" aria-label={t('insights.typing')}>
            <span className="h-2 w-2 rounded-full bg-[#00baf7] motion-safe:animate-pulse" />
            <span className="h-2 w-2 rounded-full bg-[#7dd3fc] motion-safe:animate-pulse [animation-delay:150ms]" />
            <span className="h-2 w-2 rounded-full bg-[#bae6fd] motion-safe:animate-pulse [animation-delay:300ms]" />
          </span>
        ) : (
          <span className="text-[15px] font-extrabold leading-[21px] text-slate-900 dark:text-white">
            <span className="sr-only">{text}</span>
            <span aria-hidden>
              {text!.slice(0, shown)}
              {caret && <span className="mr-0.5 inline-block h-4 w-0.5 bg-[#00baf7] align-[-2px]" />}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

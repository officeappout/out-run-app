'use client';

/**
 * ל1 (board SchedHome): the home's weekly strip lit up, the rest dimmed, and the lemur's bubble under
 * it: "עכשיו הלו״ז שלך" with "דלג" and "למילוי הלו״ז". Drawn in a body portal (no stacking context can
 * bury it), measured from the strip's data-coach target, re-measured on resize / scroll.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import { LEMUR_COACH_SRC } from './LemurNote';

interface Box { top: number; left: number; width: number; height: number }

const BUBBLE_ROOM = 190;

function measure(target: string): Box | null {
  const el = document.querySelector<HTMLElement>(`[data-coach="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
}

export default function SchedHomeCoach({ target, onStart, onSkip }: { target: string; onStart: () => void; onSkip: () => void }) {
  const t = useT(schedule);
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    document.querySelector<HTMLElement>(`[data-coach="${target}"]`)?.scrollIntoView({ block: 'center' });
    setBox(measure(target));
  }, [target]);

  useEffect(() => {
    const update = () => setBox(measure(target));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [target]);

  if (!box || typeof document === 'undefined') return null;
  const below = box.top + box.height + BUBBLE_ROOM < window.innerHeight;
  const bubbleTop = below ? box.top + box.height + 14 : undefined;
  const bubbleBottom = below ? undefined : window.innerHeight - box.top + 14;

  return createPortal(
    <div className="fixed inset-0 z-[130] font-simpler text-v2-ink" role="dialog" aria-modal="true" aria-labelledby="sched-coach-title">
      <div
        aria-hidden
        className="absolute rounded-[22px]"
        style={{
          top: box.top, left: box.left, width: box.width, height: box.height,
          boxShadow: '0 0 0 3px #00baf7, 0 0 0 9999px rgba(14,20,25,0.6)',
        }}
      />
      <div className="absolute inset-x-5 flex flex-col items-start" style={{ top: bubbleTop, bottom: bubbleBottom }}>
        {below && <span aria-hidden className="-mb-2 ms-10 h-4 w-4 rotate-45 bg-white" />}
        <div className="flex w-full items-start gap-2.5 rounded-[22px] bg-white p-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LEMUR_COACH_SRC} alt="" className="h-[52px] w-[52px] shrink-0 object-contain" />
          <span className="flex flex-grow flex-col gap-1">
            <span id="sched-coach-title" className="text-[16px] font-black">{t('tutorial.home.title')}</span>
            <span className="text-[14px] leading-[21px] text-v2-ink-2">{t('tutorial.home.text')}</span>
            <span className="mt-1.5 flex items-center justify-between">
              <span className="flex gap-1" aria-hidden>
                <span className="h-1.5 w-4 rounded-full bg-v2-accent" />
                <span className="h-1.5 w-1.5 rounded-full bg-v2-hairline" />
                <span className="h-1.5 w-1.5 rounded-full bg-v2-hairline" />
              </span>
              <span className="flex items-center gap-3">
                <button type="button" onClick={onSkip} className="text-[13px] font-extrabold text-v2-muted">
                  {t('tutorial.home.skip')}
                </button>
                <button
                  type="button"
                  onClick={onStart}
                  className="rounded-full bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] px-4 py-2 text-[14px] font-black text-[#04222b] transition-transform duration-150 ease-v2 active:scale-[0.97]"
                >
                  {t('tutorial.home.cta')}
                </button>
              </span>
            </span>
          </span>
        </div>
        {!below && <span aria-hidden className="-mt-2 ms-10 h-4 w-4 rotate-45 bg-white" />}
      </div>
    </div>,
    document.body,
  );
}

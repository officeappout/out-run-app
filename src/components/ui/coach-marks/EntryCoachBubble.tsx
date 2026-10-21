'use client';

/**
 * The entry-flow coach-mark bubble (enable_onboarding_tutorial_v1 / enable_entry_whatnow_v1):
 * a v2 card — short bold title + one line, progress dots, the pill "הבא" / "הבנתי" (+ a quiet
 * "דלג" text button beside it — never a floating pill over the screen's own controls) — with a
 * caret pointing at the spotlit element. Enters with a 240 ms ease-out (replays per step);
 * reduced motion → no movement. Rendered by CoachMarks for `variant="entry"`.
 */
import { useEffect, useState } from 'react';
import type { CoachPlacement } from './coach-placement';
import { COACH_MIN_DWELL_MS } from './coach-placement';

interface Props {
  stepKey: string | number;
  title?: string;
  text: string;
  index: number;
  total: number;
  placement: CoachPlacement;
  isLast: boolean;
  nextLabel: string;
  doneLabel: string;
  onNext: () => void;
  /** "דלג" as a secondary text button beside "הבא" (omitted → no skip on this step). */
  skipLabel?: string;
  onSkip?: () => void;
}

export default function EntryCoachBubble({
  stepKey, title, text, index, total, placement, isLast, nextLabel, doneLabel, onNext, skipLabel, onSkip,
}: Props) {
  // Read first: the button accepts a tap only after a short dwell (no accidental skip).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const t = setTimeout(() => setReady(true), COACH_MIN_DWELL_MS);
    return () => clearTimeout(t);
  }, [stepKey]);

  const pos =
    placement.side === 'above' ? { bottom: placement.bottom } : { top: placement.top };
  const caretAbove = placement.side === 'below';

  return (
    <div
      data-coach-anim
      className="absolute left-5 right-5 rounded-[22px] bg-white px-4 pb-3.5 pt-3.5 text-v2-ink shadow-v2-float"
      style={{ ...pos, animation: 'coachIn 240ms cubic-bezier(0.23, 1, 0.32, 1) both' }}
    >
      {placement.caretX != null && (
        <span
          aria-hidden
          className="absolute h-3.5 w-3.5 rotate-45 rounded-[3px] bg-white"
          style={{ left: placement.caretX - 7, ...(caretAbove ? { top: -6 } : { bottom: -6 }) }}
        />
      )}
      {title && <p className="relative text-[16px] font-bold leading-[22px] !tracking-[-0.01em]">{title}</p>}
      <p className={`relative text-[14px] leading-[20px] text-v2-ink-2 ${title ? 'mt-0.5' : 'font-semibold text-v2-ink'}`}>{text}</p>
      <div className="relative mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5" aria-label={`${index + 1}/${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ease-v2 ${
                i === index ? 'w-4 bg-v2-accent' : 'w-1.5 bg-slate-300'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="h-9 rounded-full px-3 text-[13px] font-bold text-v2-muted transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              {skipLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => { if (ready) onNext(); }}
            aria-disabled={!ready}
            className={`h-9 rounded-full bg-v2-cta px-5 text-[14px] font-bold text-v2-on-cta shadow-v2-cta transition-[opacity,transform] duration-200 ease-v2 active:scale-[0.97] ${
              ready ? 'opacity-100' : 'opacity-60'
            }`}
          >
            {isLast ? doneLabel : nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * CoachMarks — a small sequence of coach-mark bubbles over the current screen (PR-B4).
 *
 * Each step points at an element marked `data-coach="<target>"` (looked up in the document, so
 * a target may live in a sibling component). The target is spotlit (the rest dims), the bubble
 * sits above or below it, and an optional CSS tapping finger sits on it. "דלג" is always
 * visible (entry variant: inside the bubble, not on its last step); the last step's button finishes. Rendered as `absolute inset-0` inside the host
 * screen (no z-index of its own — it paints over the host's content by DOM order).
 *
 * Deliberately not a tutorial engine: no persistence, no routing. The caller decides whether to
 * show it and records the result in `onFinish`.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pointer, type LucideIcon } from 'lucide-react';
import { IconTile, type IconTileTone } from '@/components/ui/v2';
import EntryCoachBubble from './coach-marks/EntryCoachBubble';
import { clipCoachBox, coachSkipVisible, placeCoachBubble } from './coach-marks/coach-placement';
import { occluderBottomFor, scrollCoachTargetIntoView } from './coach-marks/coach-occluder';

export interface CoachMarkStep {
  /** `data-coach` value of the element to point at. Missing → the bubble is centered. */
  target: string;
  /** Short bold title above the text (the 'entry' bubble; ignored by the others). */
  title?: string;
  text: string;
  /** true = the tapping finger; 'swipe' = a finger sweeping sideways (a "swipe me" hint). */
  finger?: boolean | 'swipe';
  /** A pulsing ring around the spotlit target (e.g. "press here"). */
  ring?: boolean;
  /** Optional icon + text rows under the text (real icons — never emoji glyphs in copy). */
  legend?: { icon: LucideIcon; text: string; tone?: IconTileTone }[];
}

interface Props {
  steps: CoachMarkStep[];
  onFinish: (reason: 'done' | 'skip') => void;
  skipLabel?: string;
  nextLabel?: string;
  doneLabel?: string;
  /**
   * 'entry' — the first-launch bubble (owner note 21.10 #6): a v2 card with a title + one
   * line, progress dots, a caret pointing at the target, a short read-first dwell, and a
   * spotlight that follows a target still settling into place.
   * Omitted → today's white bubble, byte-identical.
   */
  variant?: 'light' | 'entry';
  /** Counter text (e.g. "1 מתוך 3", "טיפ אחד"). Omitted → today's "1/3". */
  counterLabel?: (index: number, total: number) => string;
}

interface Box { top: number; left: number; width: number; height: number }

const PAD = 6;

export default function CoachMarks({
  steps, onFinish, skipLabel = 'דלג', nextLabel = 'הבא', doneLabel = 'הבנתי', variant = 'light', counterLabel,
}: Props) {
  const entry = variant === 'entry';
  const rootRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps[idx];

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root || !step) return;
    const el = document.querySelector<HTMLElement>(`[data-coach="${step.target}"]`);
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    const padded = { top: r.top - o.top - PAD, left: r.left - o.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
    if (!entry) { setBox(padded); return; }
    // Entry tours: the hole hugs only the target — never reaches under a screen header.
    const occ = occluderBottomFor(el);
    setBox(clipCoachBox(padded, occ == null ? null : occ - o.top));
  }, [step, entry]);

  useLayoutEffect(() => {
    const el = step ? document.querySelector<HTMLElement>(`[data-coach="${step.target}"]`) : null;
    // Entry tours park the target in the clear area below an overlaying header (e.g. the
    // player's "סיימתי" after the how-to step scrolled the page down); others: as before.
    const restore = el && entry ? scrollCoachTargetIntoView(el) : undefined;
    if (!entry) el?.scrollIntoView?.({ block: 'nearest' });
    measure();
    return restore;
  }, [measure, step, entry]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    // The host may still be animating in — re-measure once it settles.
    const t = setTimeout(measure, 300);
    // Entry tours point at cards that are still sliding in (carousels, sheets): follow the
    // target for the first moments of each step so the spotlight never sits on empty map.
    const follow = entry ? setInterval(measure, 120) : undefined;
    const stop = entry ? setTimeout(() => clearInterval(follow), 1600) : undefined;
    return () => {
      window.removeEventListener('resize', measure);
      clearTimeout(t);
      if (follow) clearInterval(follow);
      if (stop) clearTimeout(stop);
    };
  }, [measure, entry]);

  if (!step) return null;
  const isLast = idx === steps.length - 1;
  const rootH = rootRef.current?.clientHeight ?? 0;
  const below = !box || box.top + box.height / 2 < rootH / 2;

  return (
    <div ref={rootRef} className="absolute inset-0" dir="rtl" role="dialog" aria-live="polite">
      <style>{`
        @keyframes coachTap { 0%,100% { transform: translate(-50%, 0) scale(1); } 50% { transform: translate(-50%, -10px) scale(0.92); } }
        @keyframes coachRipple { 0% { transform: translate(-50%, -50%) scale(0.4); opacity: .7; } 100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; } }
        @keyframes coachSwipe { 0% { transform: translate(30px, -50%); opacity: 0; } 15% { opacity: 1; } 60% { transform: translate(-70px, -50%); opacity: 1; } 75%,100% { transform: translate(-70px, -50%); opacity: 0; } }
        @keyframes coachRing { 0% { box-shadow: 0 0 0 0 rgba(91,194,242,.7); } 100% { box-shadow: 0 0 0 22px rgba(91,194,242,0); } }
        @keyframes coachIn { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { [data-coach-anim] { animation: none !important; } }
      `}</style>

      {/* Dim + spotlight: the hole's own shadow dims everything around it. */}
      {box ? (
        <div
          className={entry
            ? 'absolute rounded-2xl pointer-events-none transition-all duration-[240ms] ease-v2'
            : 'absolute rounded-2xl pointer-events-none transition-all duration-200'}
          style={{ ...box, boxShadow: '0 0 0 9999px rgba(15,23,42,0.6)' }}
        />
      ) : (
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(15,23,42,0.6)' }} />
      )}
      {/* Swallows taps on the dimmed screen while the tutorial is up. */}
      <div className="absolute inset-0" />

      {box && step.ring && (
        <div
          data-coach-anim
          className="absolute rounded-full pointer-events-none"
          style={{ ...box, animation: 'coachRing 1.6s ease-out infinite' }}
          aria-hidden
        />
      )}

      {box && step.finger === 'swipe' && (
        <span
          data-coach-anim
          className="absolute block w-9 h-9 rounded-full pointer-events-none"
          style={{
            top: box.top + box.height / 2,
            left: box.left + box.width / 2,
            background: 'rgba(255,255,255,0.55)',
            boxShadow: '0 0 0 8px rgba(255,255,255,0.22), 0 4px 14px rgba(0,0,0,0.25)',
            animation: 'coachSwipe 2.2s cubic-bezier(.4,0,.2,1) infinite',
          }}
          aria-hidden
        />
      )}

      {box && step.finger === true && (
        <div className="absolute pointer-events-none" style={{ top: box.top + box.height / 2, left: box.left + box.width / 2 }}>
          <span
            className="absolute block w-14 h-14 rounded-full border-2 border-white"
            style={{ animation: 'coachRipple 1.2s ease-out infinite' }}
          />
          <span
            className="absolute block"
            style={{ top: -10, animation: 'coachTap 1.2s ease-in-out infinite' }}
            aria-hidden
          >
            <IconTile icon={Pointer} tone="accent" size="md" className="shadow-v2-float" />
          </span>
        </div>
      )}

      {entry ? (
        <EntryCoachBubble
          key={idx}
          stepKey={idx}
          title={step.title}
          text={step.text}
          index={idx}
          total={steps.length}
          placement={placeCoachBubble({ box, rootW: rootRef.current?.clientWidth ?? 0, rootH, finger: step.finger })}
          isLast={isLast}
          nextLabel={nextLabel}
          doneLabel={doneLabel}
          onNext={() => (isLast ? onFinish('done') : setIdx(idx + 1))}
          skipLabel={skipLabel}
          onSkip={coachSkipVisible(idx, steps.length) ? () => onFinish('skip') : undefined}
        />
      ) : (
      <div
        className="absolute left-5 right-5 rounded-v2-card bg-white p-4 shadow-v2-float"
        style={
          !box
            ? { top: '40%' }
            : below
              ? { top: box.top + box.height + (step.finger === true ? 52 : 12) }
              : { bottom: rootH - box.top + 12 }
        }
      >
        <p className="text-[15px] font-bold text-v2-ink leading-snug">{step.text}</p>
        {step.legend && step.legend.length > 0 && (
          <ul className="mt-3 space-y-2">
            {step.legend.map((row) => (
              <li key={row.text} className="flex items-center gap-2.5">
                <IconTile icon={row.icon} tone={row.tone ?? 'accent'} size="sm" />
                <span className="text-[14px] font-bold text-v2-ink-2 leading-snug">{row.text}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[12px] font-bold text-v2-muted tabular-nums">
            {counterLabel ? counterLabel(idx, steps.length) : `${idx + 1}/${steps.length}`}
          </span>
          <button
            type="button"
            onClick={() => (isLast ? onFinish('done') : setIdx(idx + 1))}
            className="rounded-full bg-[#00ADEF] px-5 py-2 text-[14px] font-bold text-white active:scale-95 transition-transform"
          >
            {isLast ? doneLabel : nextLabel}
          </button>
        </div>
      </div>
      )}

      {/* "דלג" (light variant) — always visible, every step. Top-right (RTL start), clear of the
          station's own "דלג על התחנה" pill at top-left. The entry bubble carries its own
          "דלג" beside "הבא" instead (one rule for every tour — never over the screen's UI). */}
      {!entry && (
      <button
        type="button"
        onClick={() => onFinish('skip')}
        className="absolute right-4 rounded-full bg-white/95 px-4 py-1.5 text-[13px] font-bold text-gray-700 shadow-sm active:scale-95 transition-transform"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        {skipLabel}
      </button>
      )}
    </div>
  );
}

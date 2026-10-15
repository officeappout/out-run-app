'use client';

/**
 * CoachMarks — a small sequence of coach-mark bubbles over the current screen (PR-B4).
 *
 * Each step points at an element marked `data-coach="<target>"` (looked up in the document, so
 * a target may live in a sibling component). The target is spotlit (the rest dims), the bubble
 * sits above or below it, and an optional CSS tapping finger sits on it. "דלג" is always
 * visible; the last step's button finishes. Rendered as `absolute inset-0` inside the host
 * screen (no z-index of its own — it paints over the host's content by DOM order).
 *
 * Deliberately not a tutorial engine: no persistence, no routing. The caller decides whether to
 * show it and records the result in `onFinish`.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pointer, type LucideIcon } from 'lucide-react';
import { IconTile, type IconTileTone } from '@/components/ui/v2';

export interface CoachMarkStep {
  /** `data-coach` value of the element to point at. Missing → the bubble is centered. */
  target: string;
  text: string;
  finger?: boolean;
  /** Optional icon + text rows under the text (real icons — never emoji glyphs in copy). */
  legend?: { icon: LucideIcon; text: string; tone?: IconTileTone }[];
}

interface Props {
  steps: CoachMarkStep[];
  onFinish: (reason: 'done' | 'skip') => void;
  skipLabel?: string;
  nextLabel?: string;
  doneLabel?: string;
}

interface Box { top: number; left: number; width: number; height: number }

const PAD = 6;

export default function CoachMarks({
  steps, onFinish, skipLabel = 'דלג', nextLabel = 'הבא', doneLabel = 'הבנתי',
}: Props) {
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
    setBox({ top: r.top - o.top - PAD, left: r.left - o.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  useLayoutEffect(() => {
    const el = step ? document.querySelector<HTMLElement>(`[data-coach="${step.target}"]`) : null;
    el?.scrollIntoView?.({ block: 'nearest' });
    measure();
  }, [measure, step]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    // The host may still be animating in — re-measure once it settles.
    const t = setTimeout(measure, 300);
    return () => { window.removeEventListener('resize', measure); clearTimeout(t); };
  }, [measure]);

  if (!step) return null;
  const isLast = idx === steps.length - 1;
  const rootH = rootRef.current?.clientHeight ?? 0;
  const below = !box || box.top + box.height / 2 < rootH / 2;

  return (
    <div ref={rootRef} className="absolute inset-0" dir="rtl" role="dialog" aria-live="polite">
      <style>{`
        @keyframes coachTap { 0%,100% { transform: translate(-50%, 0) scale(1); } 50% { transform: translate(-50%, -10px) scale(0.92); } }
        @keyframes coachRipple { 0% { transform: translate(-50%, -50%) scale(0.4); opacity: .7; } 100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; } }
      `}</style>

      {/* Dim + spotlight: the hole's own shadow dims everything around it. */}
      {box ? (
        <div
          className="absolute rounded-2xl pointer-events-none transition-all duration-200"
          style={{ ...box, boxShadow: '0 0 0 9999px rgba(15,23,42,0.6)' }}
        />
      ) : (
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(15,23,42,0.6)' }} />
      )}
      {/* Swallows taps on the dimmed screen while the tutorial is up. */}
      <div className="absolute inset-0" />

      {box && step.finger && (
        <div className="absolute pointer-events-none" style={{ top: box.top + box.height / 2, left: box.left + box.width / 2 }}>
          <span
            className="absolute block w-14 h-14 rounded-full border-2 border-white"
            style={{ animation: 'coachRipple 1.2s ease-out infinite' }}
          />
          <span
            className="absolute block"
            style={{ top: 6, animation: 'coachTap 1.2s ease-in-out infinite' }}
            aria-hidden
          >
            <IconTile icon={Pointer} tone="accent" size="lg" className="shadow-v2-float" />
          </span>
        </div>
      )}

      <div
        className="absolute left-5 right-5 rounded-v2-card bg-white p-4 shadow-v2-float"
        style={
          !box
            ? { top: '40%' }
            : below
              ? { top: box.top + box.height + (step.finger ? 52 : 12) }
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
          <span className="text-[12px] font-bold text-v2-muted tabular-nums">{idx + 1}/{steps.length}</span>
          <button
            type="button"
            onClick={() => (isLast ? onFinish('done') : setIdx(idx + 1))}
            className="rounded-full bg-[#00ADEF] px-5 py-2 text-[14px] font-bold text-white active:scale-95 transition-transform"
          >
            {isLast ? doneLabel : nextLabel}
          </button>
        </div>
      </div>

      {/* "דלג" — always visible, every step. Top-right (RTL start), clear of the station's
          own "דלג על התחנה" pill at top-left. */}
      <button
        type="button"
        onClick={() => onFinish('skip')}
        className="absolute right-4 rounded-full bg-white/95 px-4 py-1.5 text-[13px] font-bold text-gray-700 shadow-sm active:scale-95 transition-transform"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        {skipLabel}
      </button>
    </div>
  );
}

'use client';

/**
 * ExplainerBubble — shared collapsed-pill → expanded-text bubble shell.
 *
 * First extraction of a pattern previously hand-built inline in 4 places
 * (e.g. the mascot speech bubble in `src/app/onboarding-new/profile/page.tsx`
 * lines 442-475). This shell is intentionally generic: it does not know
 * anything about Kelly, coach cues, or "Auto" — callers pass a trigger
 * (mascot or icon) and a text string. Two independent call sites in
 * WorkoutBuilderSheet.tsx use this same shell with two different content
 * sources (Kelly's dynamic reasoning vs. the info-icon's static copy).
 *
 * Default state is collapsed — a small pill showing only the trigger, no
 * text. Tapping expands a viewport-aware floating popover with a small
 * triangle tail (visually inspired by, not copied from, the onboarding
 * speech bubble — smaller padding/font to match the reduced 32px scale).
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ExplainerBubbleProps {
  /** Full explanation text shown once expanded. */
  text: string;
  /** Trigger rendered inside the collapsed pill (e.g. <LemurAvatar size="small" /> or <Info size={16} />). */
  trigger: React.ReactNode;
  /** Accessible label for the collapsed trigger button. */
  ariaLabel: string;
  /** Which side the tail + popover anchor to. Defaults to 'start' (right edge in RTL). */
  align?: 'start' | 'end';
  className?: string;
}

const POPOVER_WIDTH = 256; // px — matches w-64
const VIEWPORT_MARGIN = 8; // px — minimum gap kept from any viewport edge
const FALLBACK_POPOVER_HEIGHT = 120; // px — used only for the first measurement pass

interface Placement {
  top: number;
  left: number;
  /** Tail's horizontal offset from the popover's own left edge. */
  tailLeft: number;
  openUp: boolean;
}

export default function ExplainerBubble({
  text,
  trigger,
  ariaLabel,
  align = 'start',
  className = '',
}: ExplainerBubbleProps) {
  const [expanded, setExpanded] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  // ── Fix A: viewport-aware placement (04.08.2026) ─────────────────────────
  // Previously the popover used a fixed CSS direction (`top-full` — always
  // below the trigger) with no awareness of where the trigger actually sits
  // on screen. Near the top of the screen (e.g. the info icon next to the
  // page title) that left no general safeguard against the box overflowing
  // past a viewport edge and clipping its own text. This measures the LIVE
  // trigger position (getBoundingClientRect, viewport-relative) every time
  // the popover opens, picks whichever vertical direction has more room, and
  // clamps the horizontal position so the box never extends past either
  // viewport edge — general logic, not hardcoded to one usage. Uses
  // `position: fixed` with viewport coordinates rather than `absolute`
  // anchored to the trigger's own parent, so it works regardless of the
  // trigger's position in the layout.
  useLayoutEffect(() => {
    if (!expanded || !triggerRef.current) return;

    const recompute = () => {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(POPOVER_WIDTH, vw - VIEWPORT_MARGIN * 2);
      const popoverHeight = popoverRef.current?.offsetHeight || FALLBACK_POPOVER_HEIGHT;

      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      // Prefer opening downward (matches the tail visuals); flip upward only
      // when there isn't room below AND there is more room above.
      const openUp = spaceBelow < popoverHeight + VIEWPORT_MARGIN && spaceAbove > spaceBelow;
      const top = openUp
        ? Math.max(VIEWPORT_MARGIN, rect.top - popoverHeight - 8)
        : Math.min(rect.bottom + 8, vh - popoverHeight - VIEWPORT_MARGIN);

      // Anchor horizontally to the requested side, then clamp fully inside
      // the viewport so long text / narrow screens never push it off-edge.
      const rawLeft = align === 'start' ? rect.right - width : rect.left;
      const left = Math.min(Math.max(rawLeft, VIEWPORT_MARGIN), vw - width - VIEWPORT_MARGIN);

      // Tail points back at the trigger's horizontal center, clamped inside
      // the popover's own width so it never renders outside the box.
      const triggerCenter = rect.left + rect.width / 2;
      const tailLeft = Math.min(Math.max(triggerCenter - left - 6, 10), width - 22);

      setPlacement({ top, left, tailLeft, openUp });
    };

    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [expanded, align, text]);

  // Force a remeasure next time it opens (trigger may have moved while closed).
  useEffect(() => {
    if (!expanded) setPlacement(null);
  }, [expanded]);

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={expanded}
        className="flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm active:scale-95 transition-transform pe-1.5 ps-1 py-1"
      >
        <span className="flex-shrink-0">{trigger}</span>
        {!expanded && (
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 w-3 text-center leading-none">
            ?
          </span>
        )}
      </button>

      {expanded && (
        <div
          ref={popoverRef}
          role="dialog"
          className="fixed z-10 w-64 max-w-[calc(100vw-16px)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg px-3 py-2.5"
          dir="rtl"
          style={{
            top: placement?.top ?? 0,
            left: placement?.left ?? 0,
            // Hide until the first real measurement lands to avoid a
            // flash at the (0,0) fallback position.
            visibility: placement ? 'visible' : 'hidden',
          }}
        >
          {/* Tail — border layer */}
          <span
            aria-hidden="true"
            className="absolute w-0 h-0"
            style={
              placement?.openUp
                ? {
                    top: '100%',
                    left: placement.tailLeft,
                    borderLeft: '7px solid transparent',
                    borderRight: '7px solid transparent',
                    borderTop: '7px solid rgb(229 231 235)',
                  }
                : {
                    top: '-7px',
                    left: placement?.tailLeft ?? 12,
                    borderLeft: '7px solid transparent',
                    borderRight: '7px solid transparent',
                    borderBottom: '7px solid rgb(229 231 235)',
                  }
            }
          />
          {/* Tail — fill layer */}
          <span
            aria-hidden="true"
            className="absolute w-0 h-0"
            style={
              placement?.openUp
                ? {
                    top: 'calc(100% - 1px)',
                    left: (placement?.tailLeft ?? 12) + 1,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderTop: '6px solid white',
                  }
                : {
                    top: '-6px',
                    left: (placement?.tailLeft ?? 12) + 1,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderBottom: '6px solid white',
                  }
            }
          />
          <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-200">{text}</p>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 underline underline-offset-2"
          >
            סגור
          </button>
        </div>
      )}
    </div>
  );
}

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
 * text. Tapping expands an absolutely-positioned popover with a small
 * triangle tail (visually inspired by, not copied from, the onboarding
 * speech bubble — smaller padding/font to match the reduced 32px scale).
 */

import React, { useState } from 'react';

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

export default function ExplainerBubble({
  text,
  trigger,
  ariaLabel,
  align = 'start',
  className = '',
}: ExplainerBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const anchorClass = align === 'start' ? 'right-0' : 'left-0';
  const tailAnchorClass = align === 'start' ? 'right-3' : 'left-3';

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
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
          role="dialog"
          className={`absolute z-10 top-full mt-2 ${anchorClass} w-64 max-w-[80vw] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg px-3 py-2.5`}
          dir="rtl"
        >
          {/* Tail — border layer */}
          <span
            aria-hidden="true"
            className={`absolute -top-[7px] ${tailAnchorClass} w-0 h-0`}
            style={{
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderBottom: '7px solid rgb(229 231 235)',
            }}
          />
          {/* Tail — fill layer */}
          <span
            aria-hidden="true"
            className={`absolute -top-[6px] ${tailAnchorClass} w-0 h-0`}
            style={{
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: '6px solid white',
            }}
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

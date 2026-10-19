'use client';

/**
 * TimedCardShell — the white bottom card of the timed player (boards A-2b,
 * A-4b): grabber, an optional coloured eyebrow, the caller's content.
 */
import React from 'react';

export interface TimedCardShellProps {
  eyebrow?: string | null;
  /** Orange eyebrow (last seconds). */
  warn?: boolean;
  children: React.ReactNode;
}

export default function TimedCardShell({ eyebrow, warn = false, children }: TimedCardShellProps) {
  return (
    <div
      dir="rtl"
      className="absolute inset-x-0 bottom-0 z-10 rounded-t-[28px] bg-white px-5 pt-2 shadow-v2-sheet"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', fontFamily: 'var(--font-simpler)' }}
    >
      <div className="mb-1.5 flex justify-center">
        <div className="h-1.5 w-10 rounded-full bg-v2-pill-border" />
      </div>
      {eyebrow && (
        <div className="mb-1 flex justify-center">
          <span
            className={`truncate whitespace-nowrap text-[12.5px] font-extrabold tabular-nums ${warn ? 'text-[#ea580c]' : 'text-v2-deep'}`}
          >
            {eyebrow}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

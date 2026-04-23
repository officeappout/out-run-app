"use client";

/**
 * PlaceholderRow — dev-only labelled scaffold for not-yet-built dashboard rows.
 *
 * Rendered as a dashed box during development of the 4-PR dashboard
 * restructure. Returns null in production builds so users never see it
 * even if PR 1 ships before PR 3/4.
 */

import React from 'react';

interface PlaceholderRowProps {
  label: string;
  /** Approximate height of the future widget so the layout doesn't jump. */
  minHeight?: number;
}

export function PlaceholderRow({ label, minHeight = 140 }: PlaceholderRowProps) {
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div
      dir="rtl"
      className="w-full max-w-[358px] mx-auto rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-900/20 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-300 px-3 text-center"
      style={{ minHeight }}
    >
      {label}
    </div>
  );
}

export default PlaceholderRow;

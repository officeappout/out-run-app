"use client";

/**
 * SideBySideRow — shared two-column layout primitive for the new dashboard.
 *
 * Used by Rows 2, 4, and 5 to render two widgets next to each other with
 * matching heights (the "symmetrical UI" requirement). Heights are equalised
 * via `items-stretch` on the parent and `h-full` injected into each child
 * (children are responsible for filling the height — the wrapper just makes
 * them the same).
 *
 * Order: in RTL, the first DOM child appears on the RIGHT. Props are named
 * by their visual position (right / left) to match the spec, not DOM order.
 */

import React from 'react';

interface SideBySideRowProps {
  /** Visually-right widget (rendered first in DOM for RTL) */
  right: React.ReactNode;
  /** Visually-left widget (rendered second in DOM for RTL) */
  left: React.ReactNode;
  /** Hide the entire row when both halves are null/false. */
  hideWhenEmpty?: boolean;
  className?: string;
}

export function SideBySideRow({
  right,
  left,
  hideWhenEmpty = false,
  className = '',
}: SideBySideRowProps) {
  if (hideWhenEmpty && !right && !left) return null;

  return (
    <div
      className={`flex items-stretch gap-3 w-full max-w-[358px] mx-auto ${className}`}
      dir="rtl"
    >
      <div className="flex-1 min-w-0 flex">
        <div className="w-full flex flex-col">{right}</div>
      </div>
      <div className="flex-1 min-w-0 flex">
        <div className="w-full flex flex-col">{left}</div>
      </div>
    </div>
  );
}

export default SideBySideRow;

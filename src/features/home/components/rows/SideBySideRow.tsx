"use client";

/**
 * SideBySideRow — shared two-column layout primitive for the new dashboard.
 *
 * Used by Rows 4 and 5 to render two widgets next to each other with matching
 * heights (the "symmetrical UI" requirement). Heights are equalised by the
 * default `align-items: stretch` on the flex row — each column wrapper
 * stretches to the tallest sibling, and children use `h-full` to fill it.
 *
 * Layout engine: horizontal flex carousel with `flex-shrink-0` columns so
 * neither card ever compresses the other regardless of content length.
 * `snap-x snap-mandatory` adds a premium native swipe feel on overflow.
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
      className={`flex flex-row flex-nowrap overflow-x-auto scrollbar-hide snap-x snap-mandatory gap-4 px-4 w-full ${className}`}
      dir="rtl"
    >
      <div className="flex-shrink-0 snap-start flex flex-col w-[47%]">
        <div className="w-full h-full flex flex-col">{right}</div>
      </div>
      <div className="flex-shrink-0 snap-start flex flex-col w-[47%]">
        <div className="w-full h-full flex flex-col">{left}</div>
      </div>
    </div>
  );
}

export default SideBySideRow;

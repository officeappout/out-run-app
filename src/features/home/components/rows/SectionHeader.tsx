"use client";

/**
 * SectionHeader — small Hebrew title above a dashboard row.
 *
 * Used to label "מדדי בריאות" / "מדדי ביצועים" sections so the dashboard
 * scans as a single product with clear groupings (per spec, Apr 2026).
 * Visual weight matches `StrengthVolumeWidget`'s "התקדמות שבועית" title
 * for cross-row consistency.
 */

import React from 'react';

export interface SectionHeaderProps {
  title: string;
  className?: string;
}

export function SectionHeader({ title, className = '' }: SectionHeaderProps) {
  return (
    <div
      className={`w-full max-w-[358px] mx-auto px-1 ${className}`}
      dir="rtl"
    >
      <h3 className="text-[15px] font-bold text-gray-900 dark:text-white mb-1.5">
        {title}
      </h3>
    </div>
  );
}

export default SectionHeader;

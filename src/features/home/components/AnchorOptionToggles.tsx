'use client';

/**
 * AnchorOptionToggles (R Track 1) — the 3-option toggle row above the hero.
 *
 * Visual pattern reused from the home strength/health tabs
 * (`src/app/home/page.tsx` — `flex-1 py-2.5 text-sm font-bold`, active
 * `border-b-2 border-[#00C9F2] -mb-px`). Selecting a segment loads that trio
 * option into the hero; the recommended option (engine `meta.defaultFocusIndex`)
 * shows a "מומלץ" badge. Pure presentational — state lives in StatsOverview
 * (`selectedOptionIndex` + `handleTrioSelect`), the same source the carousel used.
 */

import React from 'react';

export interface AnchorOptionTogglesProps {
  labels: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Index of the engine-recommended option → shows a "מומלץ" badge. */
  recommendedIndex?: number;
}

export default function AnchorOptionToggles({
  labels,
  selectedIndex,
  onSelect,
  recommendedIndex,
}: AnchorOptionTogglesProps) {
  return (
    <div className="w-full max-w-[358px] mx-auto flex border-b border-gray-100" dir="rtl">
      {labels.map((label, i) => {
        const isActive = i === selectedIndex;
        const isRecommended = i === recommendedIndex;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={[
              'relative flex-1 py-2.5 text-sm font-bold transition-colors',
              isActive
                ? 'text-[#00C9F2] border-b-2 border-[#00C9F2] -mb-px'
                : 'text-gray-400',
            ].join(' ')}
          >
            <span className="inline-flex items-center gap-1 justify-center">
              {label}
              {isRecommended && (
                <span className="text-[9px] font-bold text-white bg-[#00C9F2] rounded-full px-1.5 py-0.5 leading-none">
                  מומלץ
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

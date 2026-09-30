'use client';

/**
 * SecondaryFiltersTrigger — the funnel/filter icon button that opens
 * SecondaryFiltersSheet, with an active-count badge.
 *
 * Moved here from /search's AppHeader (round 7, #4) to sit inline with the
 * muscle-chip row instead of the shared search bar above the tab strip —
 * this button is exercises-tab-only chrome, so it reads more naturally
 * next to the filter row it actually controls than floating in a header
 * shared with 3 unrelated tabs.
 *
 * Count/active-state now includes the muscle bar's own selection too
 * (round 8, #3) — was scoped to only the sheet's own dimensions (track,
 * level, מיקום, ציוד), so selecting a muscle chip left the funnel looking
 * "off" even though a real filter was active. This button sits right next
 * to the muscle bar now (round 7), so it reads as "is anything filtered"
 * to a user glancing at it, not "is the SHEET specifically populated".
 */

import { SlidersHorizontal } from 'lucide-react';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';

export default function SecondaryFiltersTrigger() {
  const setOpen = useExerciseLibraryStore((s) => s.setSecondaryFiltersOpen);
  const count = useExerciseLibraryStore((s) =>
    s.filters.muscles.length +
    Object.keys(s.filters.levelsByProgram).length +
    Object.values(s.filters.levelsByProgram).reduce((sum, levels) => sum + levels.length, 0) +
    (s.filters.location === 'home' || s.filters.location === 'park' ? 1 : 0) +
    s.filters.equipmentIds.length
  );

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="סינון מתקדם"
      className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
        count > 0 ? 'bg-[#00ADEF] text-white' : 'bg-gray-100 text-gray-600'
      }`}
    >
      <SlidersHorizontal className="w-4 h-4" />
      {count > 0 && (
        <span className="absolute -top-1 -start-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-white">
          {count}
        </span>
      )}
    </button>
  );
}

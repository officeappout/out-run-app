'use client';

/**
 * MuscleFilterBar — always-visible horizontal muscle-group bar (top of the
 * exercise library, above the results grid). Single-select: tapping a chip
 * replaces the current muscle selection; tapping the active chip again
 * clears it. Reuses the male muscle SVGs already shipped at
 * /public/icons/muscles/male/ — no new icon assets.
 *
 * Chip definitions live in muscle-bar.utils.ts, shared with
 * SecondaryFiltersSheet's own "שרירים" section — both read/write the same
 * `filters.muscles` store field, so showing the same chip set in both
 * places is what makes the two-way sync between them trivial (there's only
 * one source of truth to keep in sync with).
 */

import { useMemo } from 'react';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import { MUSCLE_BAR_CHIPS, sameMuscleSet } from '../utils/muscle-bar.utils';

export default function MuscleFilterBar() {
  const selected = useExerciseLibraryStore((s) => s.filters.muscles);
  const setMuscles = useExerciseLibraryStore((s) => s.setMuscles);

  const chips = useMemo(
    () =>
      MUSCLE_BAR_CHIPS.map((chip) => ({
        ...chip,
        isActive: sameMuscleSet(selected, chip.groups),
      })),
    [selected],
  );

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4" dir="rtl">
      <div className="flex gap-2.5 pb-1">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setMuscles(chip.isActive ? [] : chip.groups)}
            className="flex flex-col items-center gap-1 flex-shrink-0 w-[72px]"
            aria-pressed={chip.isActive}
          >
            <div
              className={`w-[64px] h-[64px] rounded-2xl border flex items-center justify-center transition-all ${
                chip.isActive
                  ? 'bg-cyan-50 border-primary shadow-sm'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={chip.icon}
                alt=""
                className="w-9 h-9 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            </div>
            <span
              className={`text-[10px] font-semibold whitespace-nowrap ${
                chip.isActive ? 'text-primary' : 'text-gray-600'
              }`}
            >
              {chip.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

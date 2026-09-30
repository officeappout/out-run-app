'use client';

/**
 * MuscleFilterBar — always-visible horizontal muscle-group bar (top of the
 * exercise library, above the results grid). Multi-select (round 3): tapping
 * a chip adds its group set to the union in filters.muscles; tapping an
 * active chip again removes just that set. Reuses existing icon assets —
 * no new icon files.
 *
 * Chip definitions live in muscle-bar.utils.ts, shared with
 * SecondaryFiltersSheet's own "שרירים" section — both read/write the same
 * `filters.muscles` store field, so showing the same chip set in both
 * places is what makes the two-way sync between them trivial (there's only
 * one source of truth to keep in sync with).
 *
 * Icon enlarged again in round 4 (#2) — chip square itself stays 76px,
 * only the icon within it grows.
 */

import { useMemo } from 'react';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import { MUSCLE_BAR_CHIPS, chipIsActive, toggleMuscleChip } from '../utils/muscle-bar.utils';

export default function MuscleFilterBar() {
  const selected = useExerciseLibraryStore((s) => s.filters.muscles);
  const setMuscles = useExerciseLibraryStore((s) => s.setMuscles);

  const chips = useMemo(
    () =>
      MUSCLE_BAR_CHIPS.map((chip) => ({
        ...chip,
        isActive: chipIsActive(selected, chip),
      })),
    [selected],
  );

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4" dir="rtl">
      <div className="flex gap-3 pb-1">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setMuscles(toggleMuscleChip(selected, chip))}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[84px]"
            aria-pressed={chip.isActive}
          >
            <div
              className={`w-[76px] h-[76px] rounded-2xl border flex items-center justify-center transition-all ${
                chip.isActive
                  ? 'bg-cyan-50 border-primary shadow-sm'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={chip.icon}
                alt=""
                className="w-14 h-14 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            </div>
            <span
              className={`text-[11px] font-semibold whitespace-nowrap ${
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

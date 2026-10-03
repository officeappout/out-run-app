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
 *
 * No longer bleeds to the viewport edge on its own (round 7, #4) — it now
 * shares its row with SecondaryFiltersTrigger (the funnel button), which
 * sits as a fixed sibling rather than scrolling away with the chips, so a
 * symmetric edge-to-edge bleed no longer has a consistent edge to bleed
 * from on the funnel's side. The caller (ExerciseLibraryPage) wraps this
 * in a `flex-1 min-w-0` cell of that row.
 *
 * Chip visual extracted to the shared MuscleFilterChip (workout builder UX
 * pass v2) so this bar and the home workout builder render from one
 * component instead of two independently-maintained copies — this file's
 * own behaviour/markup is unchanged, just delegated.
 */

import { useMemo } from 'react';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import { MUSCLE_BAR_CHIPS, chipIsActive, toggleMuscleChip } from '../utils/muscle-bar.utils';
import MuscleFilterChip from '@/components/ui/MuscleFilterChip';

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
    <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide" dir="rtl">
      <div className="flex gap-3 pb-1">
        {chips.map((chip) => (
          <MuscleFilterChip
            key={chip.key}
            icon={chip.icon}
            label={chip.label}
            selected={chip.isActive}
            onClick={() => setMuscles(toggleMuscleChip(selected, chip))}
          />
        ))}
      </div>
    </div>
  );
}

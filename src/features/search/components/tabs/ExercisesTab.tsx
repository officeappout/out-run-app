'use client';

/**
 * "תרגילים" — the exercise library EXACTLY as today (ExerciseLibraryContent: MuscleFilterBar,
 * SecondaryFiltersTrigger, ActiveFilterChipsRow, the ExerciseImageCard grid, the detail sheet).
 * The shared search field writes to the library store like today's search page does; a muscle
 * word ("בטן") selects that muscle chip instead, so the count matches the "הכל" preview.
 *
 * Effects order matters: the library resets its filters in its own mount effect, which runs
 * before this parent's effect — so the query / muscle applied here is never wiped. (That is why
 * the library is imported statically here and this whole tab is the lazy chunk.)
 */
import { useEffect, useRef } from 'react';
import { ExerciseLibraryContent } from '@/features/content/exercises/client/ExerciseLibraryPage';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';
import { muscleForQuery } from '../../providers/exercises';

export default function ExercisesTab({ query, muscle }: { query: string; muscle: MuscleGroup | null }) {
  // The muscle THIS tab selected (so typing something else later removes only that chip).
  const applied = useRef<MuscleGroup | null>(null);
  useEffect(() => {
    const st = useExerciseLibraryStore.getState();
    const m = query ? muscleForQuery(query) : muscle;
    if (m) {
      if (applied.current !== m) {
        st.setMuscles([m]);
        applied.current = m;
      }
      st.setQuery('');
    } else {
      if (applied.current) {
        const drop = applied.current;
        st.setMuscles(st.filters.muscles.filter((x) => x !== drop));
        applied.current = null;
      }
      st.setQuery(query);
    }
  }, [query, muscle]);

  // leaving the chip: no stale filter carries over (same as today's tab switch)
  useEffect(() => () => useExerciseLibraryStore.getState().setQuery(''), []);

  return <ExerciseLibraryContent />;
}

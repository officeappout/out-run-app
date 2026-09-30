'use client';

/**
 * Exercise Library Store — UI state for the /library route.
 *
 * Holds the active filter selections, the loaded exercise corpus, and the
 * currently selected exercise (for the detail bottom sheet).
 *
 * No persistence — filters reset on each navigation to keep the discovery
 * surface fresh.
 */

import { create } from 'zustand';
import type { Exercise, MuscleGroup } from '../../core/exercise.types';
import type { Program } from '@/features/content/programs/core/program.types';

/**
 * Sentinel ID added to `LibraryFilters.equipmentIds` when the user selects the
 * "Bodyweight" virtual chip. It is NOT a real Firestore gear ID — the filter
 * pipeline interprets its presence as "include exercises with no gear" so the
 * Home / Park presets can broaden the result set with calisthenics moves.
 *
 * Kept here (not in the sheet component) so the store, the filter hook and
 * the UI all read from a single source of truth.
 */
export const BODYWEIGHT_SENTINEL = '__bodyweight__';

export interface LibraryFilters {
  query: string;
  muscles: MuscleGroup[];
  /**
   * Selected track/skill program IDs — multi-select union (round 4, #6;
   * was a single `programId: string | null`). Each ID may be a domain
   * track, a skill program, or a master/hub program — useExerciseLibraryFilters'
   * resolveProgramMatchIds expands a master to itself + its subPrograms
   * when matching (round 4, #7), so selecting a master alone still returns
   * its children's exercises instead of 0 results.
   */
  programIds: string[];
  /**
   * Selected levels — multi-select union (round 4, #6; was a single
   * `level: number | null`). Only meaningful alongside `programIds`; reset
   * to `[]` whenever `programIds` becomes empty (a level has no meaning
   * with no program context).
   */
  levels: number[];
  /** Gear/equipment IDs the exercise must use (any-of). */
  equipmentIds: string[];
  /**
   * Location filter (בית / פארק / חדר כושר — 'gym' is coded but not offered
   * in the UI today). `null` = no location filter active.
   *
   * Two effects:
   *   1. Gates the result set (useExerciseLibraryFilters, #7 round 2): an
   *      exercise must have a genuine method for this location (exact
   *      `location` or `locationMapping` match) to appear.
   *   2. Feeds the grid card's image resolution AND seeds the initially-
   *      selected execution method in the detail sheet (round 3, #1 —
   *      corrects round 2's "always park" card fix, safe now that #7
   *      guarantees a real match exists whenever this is set).
   */
  location: 'home' | 'park' | 'gym' | null;
}

interface ExerciseLibraryState {
  // Data
  allExercises: Exercise[];
  isLoading: boolean;
  loadError: string | null;

  /**
   * Program catalog — loaded once (ExerciseLibraryPage's mount effect) and
   * stored here (not just passed as props to the sheet/chips-row) because
   * useExerciseLibraryFilters' actual FILTERING logic needs it too, to
   * resolve a selected master program to its children (round 4, #7) and to
   * classify domain-vs-skill programs for the card's level display (#10).
   */
  allPrograms: Program[];

  // Filters
  filters: LibraryFilters;

  // Detail sheet
  selectedExercise: Exercise | null;
  isDetailOpen: boolean;

  /**
   * Secondary-filters bottom sheet (מסלול/רמה/מיקום/ציוד — the funnel icon).
   * Tracked in the store, not local component state, because the trigger
   * button (next to the search bar, in /search's AppHeader) and the sheet
   * itself (inside the embedded exercises-tab body) live in different
   * subtrees with no shared parent to hold this as local state.
   */
  isSecondaryFiltersOpen: boolean;

  // Actions
  setAllExercises: (exercises: Exercise[]) => void;
  setLoading: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;
  setAllPrograms: (programs: Program[]) => void;
  setQuery: (query: string) => void;
  toggleMuscle: (muscle: MuscleGroup) => void;
  setMuscles: (muscles: MuscleGroup[]) => void;
  /** Full-replace setter — callers compute the toggled array (mirrors setMuscles/setEquipmentIds). */
  setProgramIds: (ids: string[]) => void;
  /** Full-replace setter. Callers are responsible for only offering levels while a program is selected. */
  setLevels: (levels: number[]) => void;
  setEquipmentIds: (ids: string[]) => void;
  /** Persist the location context derived from the active preset. */
  setFilterLocation: (location: 'home' | 'park' | 'gym' | null) => void;
  resetFilters: () => void;
  openDetail: (exercise: Exercise) => void;
  closeDetail: () => void;
  setSecondaryFiltersOpen: (open: boolean) => void;
}

const INITIAL_FILTERS: LibraryFilters = {
  query: '',
  muscles: [],
  programIds: [],
  levels: [],
  equipmentIds: [],
  location: null,
};

export const useExerciseLibraryStore = create<ExerciseLibraryState>((set) => ({
  allExercises: [],
  isLoading: false,
  loadError: null,
  allPrograms: [],

  filters: { ...INITIAL_FILTERS },

  selectedExercise: null,
  isDetailOpen: false,
  isSecondaryFiltersOpen: false,

  setAllExercises: (exercises) => set({ allExercises: exercises }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLoadError: (error) => set({ loadError: error }),
  setAllPrograms: (programs) => set({ allPrograms: programs }),

  setQuery: (query) =>
    set((s) => ({ filters: { ...s.filters, query } })),

  toggleMuscle: (muscle) =>
    set((s) => {
      const exists = s.filters.muscles.includes(muscle);
      const next = exists
        ? s.filters.muscles.filter((m) => m !== muscle)
        : [...s.filters.muscles, muscle];
      return { filters: { ...s.filters, muscles: next } };
    }),

  setMuscles: (muscles) =>
    set((s) => ({ filters: { ...s.filters, muscles } })),

  setProgramIds: (ids) =>
    set((s) => ({
      filters: {
        ...s.filters,
        programIds: ids,
        // Level only has meaning inside a program — drop it once every program clears.
        levels: ids.length > 0 ? s.filters.levels : [],
      },
    })),

  setLevels: (levels) =>
    set((s) => ({ filters: { ...s.filters, levels } })),

  setEquipmentIds: (ids) =>
    set((s) => ({ filters: { ...s.filters, equipmentIds: ids } })),

  setFilterLocation: (location) =>
    set((s) => ({ filters: { ...s.filters, location } })),

  resetFilters: () => set({ filters: { ...INITIAL_FILTERS } }),

  openDetail: (exercise) => set({ selectedExercise: exercise, isDetailOpen: true }),
  closeDetail: () => set({ isDetailOpen: false }),
  setSecondaryFiltersOpen: (open) => set({ isSecondaryFiltersOpen: open }),
}));

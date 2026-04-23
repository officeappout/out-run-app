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
   * Single program filter (a level only makes sense within a program context,
   * so the program acts as the parent of the level selection).
   * `null` = no program selected.
   */
  programId: string | null;
  /**
   * Specific level within the selected `programId`. `null` = "all levels of
   * this program". Always reset when `programId` changes.
   */
  level: number | null;
  /** Gear/equipment IDs the exercise must use (any-of). */
  equipmentIds: string[];
}

interface ExerciseLibraryState {
  // Data
  allExercises: Exercise[];
  isLoading: boolean;
  loadError: string | null;

  // Filters
  filters: LibraryFilters;

  // Detail sheet
  selectedExercise: Exercise | null;
  isDetailOpen: boolean;

  // Actions
  setAllExercises: (exercises: Exercise[]) => void;
  setLoading: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;
  setQuery: (query: string) => void;
  toggleMuscle: (muscle: MuscleGroup) => void;
  setMuscles: (muscles: MuscleGroup[]) => void;
  /**
   * Atomically commit a program + level pair from the unified progression
   * filter sheet. Pass `null` for either to clear that dimension.
   */
  setProgressionFilter: (programId: string | null, level: number | null) => void;
  setEquipmentIds: (ids: string[]) => void;
  resetFilters: () => void;
  openDetail: (exercise: Exercise) => void;
  closeDetail: () => void;
}

const INITIAL_FILTERS: LibraryFilters = {
  query: '',
  muscles: [],
  programId: null,
  level: null,
  equipmentIds: [],
};

export const useExerciseLibraryStore = create<ExerciseLibraryState>((set) => ({
  allExercises: [],
  isLoading: false,
  loadError: null,

  filters: { ...INITIAL_FILTERS },

  selectedExercise: null,
  isDetailOpen: false,

  setAllExercises: (exercises) => set({ allExercises: exercises }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLoadError: (error) => set({ loadError: error }),

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

  setProgressionFilter: (programId, level) =>
    set((s) => ({
      filters: {
        ...s.filters,
        programId,
        // Level only has meaning inside a program — drop it if program clears.
        level: programId ? level : null,
      },
    })),

  setEquipmentIds: (ids) =>
    set((s) => ({ filters: { ...s.filters, equipmentIds: ids } })),

  resetFilters: () => set({ filters: { ...INITIAL_FILTERS } }),

  openDetail: (exercise) => set({ selectedExercise: exercise, isDetailOpen: true }),
  closeDetail: () => set({ isDetailOpen: false }),
}));

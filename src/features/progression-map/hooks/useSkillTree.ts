'use client';

/**
 * useSkillTree — the Tree screen's data hook.
 *
 * Reuses the already-hydrated exercise corpus in useExerciseLibraryStore
 * (same store the exercise library / detail screens use) rather than issuing
 * a second Firestore read — a deliberate reuse decision, not just tidiness,
 * since a fresh full-collection read on every Tree open would double the
 * corpus fetch for users who navigate there from an exercise detail screen
 * (the only entry point today). Hydrates itself if the store is still empty
 * (e.g. a user who deep-links straight into a Tree route without ever
 * opening the library) — same dedup pattern useExerciseMasterData.ts already
 * uses (module-level in-flight flag so concurrent mounts don't double-fetch).
 */
import { useEffect, useMemo } from 'react';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import { getAllExercisesNoOrder } from '@/features/content/exercises/core/exercise.service';
import { buildSkillTree } from '../services/build-skill-tree.service';
import { useUserProgramLevel } from './useUserProgramLevel';
import type { SkillTreeData } from '../core/types';

let bgCorpusFetchStarted = false;

export interface UseSkillTreeResult {
  tree: SkillTreeData | null;
  currentLevel: number | null;
  isLoading: boolean;
}

export function useSkillTree(programId: string | null): UseSkillTreeResult {
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
  const setAllExercises = useExerciseLibraryStore((s) => s.setAllExercises);
  const { currentLevel, isLoading: levelLoading } = useUserProgramLevel(programId);

  useEffect(() => {
    if (allExercises.length > 0 || bgCorpusFetchStarted) return;
    bgCorpusFetchStarted = true;
    getAllExercisesNoOrder()
      .then((list) => {
        if (list.length > 0) setAllExercises(list);
      })
      .catch(() => {
        bgCorpusFetchStarted = false; // allow a retry on the next mount
      });
  }, [allExercises.length, setAllExercises]);

  const tree = useMemo(() => {
    if (!programId || allExercises.length === 0) return null;
    return buildSkillTree(allExercises, programId);
  }, [allExercises, programId]);

  return {
    tree,
    currentLevel,
    isLoading: levelLoading || allExercises.length === 0,
  };
}

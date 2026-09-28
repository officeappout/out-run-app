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
 *
 * Round 10: also fetches the set of COMPOSITE (Program.isMaster === true)
 * program IDs and passes it into buildSkillTree, which uses it to pick the
 * most beginner-appropriate representative at a multi-exercise level
 * instead of an arbitrary doc-ID tie-break — see build-skill-tree.service.ts
 * for the full reasoning. Reuses getCachedPrograms() (program-hierarchy.
 * utils.ts, 5-minute TTL) rather than a raw getAllPrograms() call, and the
 * SAME module-level shared-promise dedup shape as the corpus fetch above —
 * so N mounted callers (the Tree screen AND every progression-hub grid
 * card, all calling this hook) trigger exactly one programs read, not N.
 * `tree` is intentionally held back (folded into `isLoading`) until this
 * resolves too, not just the exercise corpus — otherwise the tree would
 * render once with the plain doc-ID pick and then visibly swap to the
 * beginner pick a moment later.
 */
import { useEffect, useMemo, useState } from 'react';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import { getAllExercisesNoOrder } from '@/features/content/exercises/core/exercise.service';
import { getCachedPrograms } from '@/features/workout-engine/services/program-hierarchy.utils';
import { buildSkillTree } from '../services/build-skill-tree.service';
import { useUserProgramLevel } from './useUserProgramLevel';
import type { SkillTreeData } from '../core/types';

let bgCorpusFetchStarted = false;

let compositeProgramIdsPromise: Promise<ReadonlySet<string>> | null = null;
function fetchCompositeProgramIds(): Promise<ReadonlySet<string>> {
  if (!compositeProgramIdsPromise) {
    compositeProgramIdsPromise = getCachedPrograms()
      .then((programs) => new Set(programs.filter((p) => p.isMaster).map((p) => p.id)))
      .catch(() => {
        compositeProgramIdsPromise = null; // allow a retry on the next call
        return new Set<string>();
      });
  }
  return compositeProgramIdsPromise;
}

export interface UseSkillTreeResult {
  tree: SkillTreeData | null;
  currentLevel: number | null;
  isLoading: boolean;
}

export function useSkillTree(programId: string | null): UseSkillTreeResult {
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
  const setAllExercises = useExerciseLibraryStore((s) => s.setAllExercises);
  const { currentLevel, isLoading: levelLoading } = useUserProgramLevel(programId);
  const [compositeProgramIds, setCompositeProgramIds] = useState<ReadonlySet<string> | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetchCompositeProgramIds().then((ids) => {
      if (!cancelled) setCompositeProgramIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tree = useMemo(() => {
    if (!programId || allExercises.length === 0 || compositeProgramIds === null) return null;
    return buildSkillTree(allExercises, programId, compositeProgramIds);
  }, [allExercises, programId, compositeProgramIds]);

  return {
    tree,
    currentLevel,
    isLoading: levelLoading || allExercises.length === 0 || compositeProgramIds === null,
  };
}

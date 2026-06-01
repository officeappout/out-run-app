'use client';

/**
 * useExerciseMasterData — single data source for MasterExerciseView.
 *
 * Consolidates everything the unified detail surface needs:
 *   • sheetData         — sync view-model (video, muscles, equipment, cues…)
 *   • trend             — async personal history from exercise-history.service
 *   • progressionChain  — prev / current / next variations sharing base_movement_id
 *   • userLevelInTrack  — the user's current level for this exercise's program
 *
 * All three data sources are read independently so a slow Firestore trend
 * fetch never blocks the synchronous sheetData / progression rendering.
 *
 * Hooks are always called unconditionally (React rules) — a null `exercise`
 * yields null/empty results rather than skipping hook calls.
 */

import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  getExerciseTrend,
  type ExerciseSessionEntry,
} from '@/features/workout-engine/services/exercise-history.service';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import type { Exercise } from '../../core/exercise.types';
import { getAllExercisesNoOrder } from '../../core/exercise.service';
import { getCachedPrograms } from '@/features/workout-engine/services/program-hierarchy.utils';
import { buildSheetData, type SheetData } from '../utils/sheet-data.utils';

/**
 * Module-level guard so the background corpus fetch fires at most once across
 * every mount of this hook (workout preview, library card, …). Reset to false
 * on failure so a later open can retry.
 */
let bgCorpusFetchStarted = false;

export interface ProgressionChain {
  prev: Exercise | null;
  current: Exercise | null;
  next: Exercise | null;
}

export interface ResolvedProgram {
  programId: string;
  label: string;
  level: number;
}

export interface ExerciseMasterData {
  sheetData: SheetData | null;
  /** null while loading; [] when the user has never performed the exercise. */
  trend: ExerciseSessionEntry[] | null;
  isLoadingTrend: boolean;
  progressionChain: ProgressionChain;
  /** The user's current level in this exercise's primary program, or null. */
  userLevelInTrack: number | null;
  /** Named programs the exercise belongs to — resolved even with no map passed. */
  programs: ResolvedProgram[];
}

/**
 * Static slug → Hebrew label fallback for the core tracks (and common
 * synonyms), so the "תוכניות" column resolves even when the parent context
 * supplies no `programLabels` map (e.g. the library sheet).
 */
const PROGRAM_LABEL_FALLBACK: Record<string, string> = {
  pull_progression: 'משיכה',
  push_progression: 'דחיפה',
  core_progression:  'ליבה',
  legs_progression:  'רגליים',
  pull: 'משיכה',   pulling: 'משיכה',
  push: 'דחיפה',   pushing: 'דחיפה',
  core: 'ליבה',    abs: 'ליבה',
  legs: 'רגליים',  lower_body: 'רגליים',
  full_body: 'כל הגוף', fullbody: 'כל הגוף',
  upper_body: 'פלג גוף עליון',
};

/** Last-resort heuristic from the programId tokens (e.g. "…_pull_…" → משיכה). */
function heuristicProgramLabel(id: string): string | null {
  const s = id.toLowerCase();
  if (s.includes('pull')) return 'משיכה';
  if (s.includes('push') || s.includes('dip')) return 'דחיפה';
  if (s.includes('core') || s.includes('abs')) return 'ליבה';
  if (s.includes('leg') || s.includes('squat')) return 'רגליים';
  return null;
}

/** Difficulty tier of an exercise within its primary program (lowest = easiest). */
export function getExerciseLevel(ex: Exercise | null | undefined): number {
  if (!ex) return 0;
  const fromTarget = ex.targetPrograms?.[0]?.level;
  if (typeof fromTarget === 'number') return fromTarget;
  if (typeof ex.recommendedLevel === 'number') return ex.recommendedLevel;
  return 0;
}

export function useExerciseMasterData(
  exercise: Exercise | null,
  /** Location string — used only when `methodIdx` is null (legacy / no switcher). */
  location: string | null = null,
  programLabels?: Record<string, string>,
  /**
   * Index into `exercise.execution_methods` selected by the switcher.
   * When provided it takes priority over `location` for resolving the active
   * method, guaranteeing that two methods at the same location remain distinct.
   */
  methodIdx: number | null = null,
): ExerciseMasterData {
  // ── Synchronous view-model ─────────────────────────────────────────────
  const sheetData = useMemo<SheetData | null>(() => {
    if (!exercise) return null;
    // Resolve the exact method when an index is known.
    const methods = exercise.execution_methods ?? exercise.executionMethods ?? [];
    const preResolved =
      methodIdx !== null && methodIdx >= 0 && methodIdx < methods.length
        ? methods[methodIdx]
        : undefined; // undefined = let buildSheetData use findMethodForLocation
    // eslint-disable-next-line no-console
    console.log(
      `⚙️ [Master Data Engine] Re-building sheet data`,
      `exercise="${exercise.id}" methodIdx=${methodIdx} location="${location}"`,
      `preResolved.location="${preResolved?.location ?? 'none'}"`,
      `preResolved.mainVideoUrl="${preResolved?.media?.mainVideoUrl ?? '–'}"`,
    );
    return buildSheetData(exercise, location, preResolved);
  // `methodIdx` is a primitive number — guaranteed stable dep, no ref churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, location, methodIdx]);

  // ── Personal history trend (async) ─────────────────────────────────────
  const [trend, setTrend] = useState<ExerciseSessionEntry[] | null>(null);
  const [isLoadingTrend, setIsLoadingTrend] = useState(false);

  const exerciseId = exercise?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    const uid = auth.currentUser?.uid;

    if (!exerciseId || !uid) {
      setTrend(exerciseId ? [] : null);
      setIsLoadingTrend(false);
      return;
    }

    setIsLoadingTrend(true);
    setTrend(null);

    getExerciseTrend(uid, exerciseId, 10)
      .then((sessions) => {
        if (cancelled) return;
        setTrend(sessions);
      })
      .catch(() => {
        if (cancelled) return;
        setTrend([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingTrend(false);
      });

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  // ── Progression chain (in-memory from already-loaded library) ──────────
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
  const setAllExercises = useExerciseLibraryStore((s) => s.setAllExercises);

  // Hydrate the library corpus in the background when this surface is opened
  // from a context that never mounted the library tab (e.g. the workout
  // preview drawer). Without it `allExercises` is [] and the progression
  // chain silently disappears. Fire-and-forget — the store update re-runs the
  // progressionChain memo below the moment the data lands.
  useEffect(() => {
    if (allExercises.length > 0 || bgCorpusFetchStarted) return;
    bgCorpusFetchStarted = true;
    getAllExercisesNoOrder()
      .then((list) => {
        if (list.length > 0) setAllExercises(list);
      })
      .catch(() => {
        bgCorpusFetchStarted = false; // allow a retry on the next open
      });
  }, [allExercises.length, setAllExercises]);

  const progressionChain = useMemo<ProgressionChain>(() => {
    if (!exercise) return { prev: null, current: null, next: null };

    const baseId = exercise.base_movement_id;
    if (!baseId) {
      // No family — the exercise stands alone as the current node.
      return { prev: null, current: exercise, next: null };
    }

    // All exercises in the same movement family, sorted easiest → hardest.
    const family = allExercises
      .filter((ex) => ex.base_movement_id === baseId)
      .sort((a, b) => getExerciseLevel(a) - getExerciseLevel(b));

    const currentIdx = family.findIndex((ex) => ex.id === exercise.id);
    if (currentIdx === -1) {
      return { prev: null, current: exercise, next: null };
    }

    return {
      prev: currentIdx > 0 ? family[currentIdx - 1] : null,
      current: family[currentIdx],
      next: currentIdx < family.length - 1 ? family[currentIdx + 1] : null,
    };
  }, [exercise, allExercises]);

  // ── User's current level in this exercise's program ────────────────────
  const domainProgress = useProgressionStore((s) => s.domainProgress);

  const userLevelInTrack = useMemo<number | null>(() => {
    const programId = exercise?.targetPrograms?.[0]?.programId;
    if (!programId) return null;
    const entry = domainProgress?.[programId];
    return typeof entry?.level === 'number' ? entry.level : null;
  }, [exercise, domainProgress]);

  // ── Resolved program labels (independent of any passed map) ────────────
  // Pull the cached program hierarchy once so real Firestore program names
  // are available; the static fallback + heuristic cover legacy slugs.
  const [cachedProgramMap, setCachedProgramMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    getCachedPrograms()
      .then((list) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const p of list) {
          if (p?.id && p?.name) map[p.id] = p.name;
        }
        setCachedProgramMap(map);
      })
      .catch(() => {
        /* fallback dictionary still covers the core tracks */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const programs = useMemo<ResolvedProgram[]>(() => {
    const out: ResolvedProgram[] = [];
    for (const tp of exercise?.targetPrograms ?? []) {
      const id = tp.programId;
      if (!id) continue;
      const lower = id.toLowerCase();
      const label =
        programLabels?.[id] ??
        programLabels?.[lower] ??
        cachedProgramMap[id] ??
        cachedProgramMap[lower] ??
        PROGRAM_LABEL_FALLBACK[id] ??
        PROGRAM_LABEL_FALLBACK[lower] ??
        heuristicProgramLabel(id);
      if (label) out.push({ programId: id, label, level: tp.level });
    }
    return out;
  }, [exercise, programLabels, cachedProgramMap]);

  return {
    sheetData,
    trend,
    isLoadingTrend,
    progressionChain,
    userLevelInTrack,
    programs,
  };
}

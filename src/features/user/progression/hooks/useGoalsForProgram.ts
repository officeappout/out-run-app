'use client';

/**
 * useGoalsForProgram
 *
 * Single source of truth for fetching `LevelGoal[]` for a single program at
 * a specific level. Handles master-program goal inheritance — when the program
 * is a master (e.g. `upper_body`, `full_body`), it expands to its child
 * programs and fetches each child's goals at the child's own track level.
 *
 * Consumed by:
 *   - useActiveProgramGoals (loops over all active programs, dedupes by exerciseId)
 *   - StatsOverview         (single primary program for the home progress card)
 *
 * Both the pure async `fetchGoalsForProgram` and the React hook
 * `useGoalsForProgram` are exported. Callers that need to fetch in a loop
 * should use the async function directly to avoid Rules-of-Hooks violations.
 *
 * Resolution strategy (full cascade):
 *
 *   PROGRAM IDENTITY
 *   ─────────────────
 *   getProgramByTemplateId(templateId) resolves the slug/hash to the real
 *   Firestore Program document. Its `id` is used for all level-settings lookups
 *   so docs are found even when the admin used addDoc (auto-generated hash IDs).
 *
 *   CHILD EXPANSION (master programs only)
 *   ──────────────────────────────────────
 *   1. `prog.subPrograms` — Firestore source of truth (may be hashes or slugs).
 *   2. `KNOWN_MASTER_PROGRAMS[templateId]` — hardcoded bulletproof fallback.
 *   3. Tracks-based discovery — only when `effectiveIsMaster` is true, so leaf
 *      programs (push, pull) never accidentally treat siblings as children.
 *
 *   Each child is also resolved via getProgramByTemplateId to get its real
 *   Firestore ID (for level-settings lookup) and movementPattern (for
 *   resolving its level from the tracks map when childId is a hash).
 *
 *   LEVEL SETTINGS
 *   ──────────────
 *   getProgramLevelSetting(firestoreId, level) — always uses the real doc ID.
 *   Last-resort: getProgramLevelSettingsByProgram(firestoreId) — same.
 */

import { useEffect, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import {
  getProgramLevelSetting,
  getProgramLevelSettingsByProgram,
} from '@/features/content/programs/core/programLevelSettings.service';
import { KNOWN_MASTER_PROGRAMS } from '@/features/user/progression/services/progression.service';
import type { LevelGoal } from '@/types/workout';

/** Minimal track shape — currentLevel may be undefined for some legacy users. */
export type TracksMap = Record<string, { currentLevel?: number } | undefined>;

interface ProgramTarget {
  templateId: string;
  currentLevel: number;
}

interface GoalsResult {
  goals: LevelGoal[];
  loading: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure async API — safe to call in loops
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch deduplicated goals for a single program at a specific level.
 * Resolves master programs to children using the cascade described above.
 *
 * Returns `[]` on any error (never throws — callers can rely on that).
 */
export async function fetchGoalsForProgram(
  target: ProgramTarget,
  tracks: TracksMap,
): Promise<LevelGoal[]> {
  const { templateId, currentLevel } = target;
  const collected: LevelGoal[] = [];

  // ── Resolve the primary program to its real Firestore document ─────────────
  // getProgramByTemplateId tries: direct doc ID → movementPattern field → name.
  // This ensures hash-ID programs created via the admin UI are found correctly.
  let primaryFirestoreId = templateId; // safe fallback if lookup fails
  let isMaster = false;
  let firestoreChildIds: string[] = []; // prog.subPrograms — may be hashes or slugs

  try {
    const prog = await getProgramByTemplateId(templateId);
    if (prog) {
      primaryFirestoreId = prog.id;
      isMaster = prog.isMaster;
      firestoreChildIds = prog.subPrograms ?? [];
    }
  } catch (err) {
    console.warn(`[useGoalsForProgram] program lookup failed for "${templateId}":`, err);
  }

  // ── Step 1: primary level settings ──────────────────────────────────────────
  try {
    const primary = await getProgramLevelSetting(primaryFirestoreId, currentLevel);
    if (primary?.targetGoals?.length) {
      collected.push(...(primary.targetGoals as LevelGoal[]));
    }
  } catch (err) {
    console.warn(`[useGoalsForProgram] primary fetch failed for ${primaryFirestoreId}_level_${currentLevel}:`, err);
  }

  // ── Step 2: master-program child expansion ───────────────────────────────────
  // Only expand when the program is a confirmed master — leaf programs (push, pull,
  // legs, core) must never expand, which prevents siblings being treated as children
  // when tracks-based discovery runs.
  const effectiveIsMaster = isMaster || !!KNOWN_MASTER_PROGRAMS[templateId];

  if (effectiveIsMaster) {
    // Child list priority:
    //   2a — subPrograms from Firestore (may be Firestore hashes or slugs)
    //   2b — KNOWN_MASTER_PROGRAMS hardcoded slugs
    //   2c — Tracks-based discovery (slugs that are not the primary)
    const childTemplateIds: string[] =
      firestoreChildIds.length > 0
        ? firestoreChildIds
        : KNOWN_MASTER_PROGRAMS[templateId]
        ? [...KNOWN_MASTER_PROGRAMS[templateId]]
        : Object.keys(tracks).filter((id) => id !== templateId);

    if (childTemplateIds.length > 0) {
      const childResults = await Promise.allSettled(
        childTemplateIds.map(async (childId) => {
          // Resolve the child to its real Firestore ID.
          // If childId is already a hash (from subPrograms), strategy 1 finds it
          // immediately (single getDoc). If childId is a slug (from
          // KNOWN_MASTER_PROGRAMS or tracks), strategy 2 (movementPattern) resolves it.
          let childFirestoreId = childId;
          let childMovementPattern: string | undefined;
          try {
            const childProg = await getProgramByTemplateId(childId);
            if (childProg) {
              childFirestoreId = childProg.id;
              childMovementPattern = childProg.movementPattern;
            }
          } catch {
            // keep childId as-is
          }

          // Resolve the child's current level from the tracks map.
          // tracks is keyed by slug/templateId, NOT necessarily by Firestore hash.
          //   tracks[childId]          — hit when childId is a slug ('push')
          //   tracks[movementPattern]  — hit when childId is a hash but the program
          //                             has movementPattern:'push' stored in Firestore
          //   currentLevel             — fallback (master's level; imprecise but safe)
          const childLevel =
            tracks[childId]?.currentLevel ??
            (childMovementPattern ? tracks[childMovementPattern]?.currentLevel : undefined) ??
            currentLevel;

          return getProgramLevelSetting(childFirestoreId, childLevel);
        }),
      );

      for (const result of childResults) {
        if (result.status === 'fulfilled' && result.value?.targetGoals?.length) {
          collected.push(...(result.value.targetGoals as LevelGoal[]));
        }
      }
    }
  }

  // ── Step 3: last-resort — scan all level docs for the primary program ────────
  if (collected.length === 0) {
    try {
      const all = await getProgramLevelSettingsByProgram(primaryFirestoreId);
      if (all.length > 0) {
        const closest =
          all.find((s) => s.levelNumber === currentLevel) ?? all[0];
        if (closest?.targetGoals?.length) {
          collected.push(...(closest.targetGoals as LevelGoal[]));
        }
      }
    } catch (err) {
      console.warn(`[useGoalsForProgram] last-resort scan failed for ${primaryFirestoreId}:`, err);
    }
  }

  // ── Dedupe by exerciseId (first occurrence wins) ──────────────────────────
  const seen = new Set<string>();
  const deduped: LevelGoal[] = [];
  for (const goal of collected) {
    if (!seen.has(goal.exerciseId)) {
      seen.add(goal.exerciseId);
      deduped.push(goal);
    }
  }

  return deduped;
}

// ─────────────────────────────────────────────────────────────────────────────
// React hook — thin wrapper around the async function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stable empty-object reference for the `tracks` fallback.
 *
 * Using a module-level constant prevents the selector from creating a
 * brand-new `{}` on every `getSnapshot` invocation.  Zustand compares the
 * previous snapshot to the new one with `Object.is`; an inline `?? {}` would
 * always fail that check (new reference every call), which triggers the
 * "The result of getSnapshot should be cached to avoid an infinite loop"
 * React warning and cascades into a "Maximum update depth exceeded" crash.
 */
const EMPTY_TRACKS: TracksMap = {};

/**
 * React hook variant. Pass `null` to skip the fetch (e.g. while target data
 * is still loading). Reads `progression.tracks` from `useUserStore`.
 */
export function useGoalsForProgram(target: ProgramTarget | null): GoalsResult {
  const tracks = useUserStore(
    (s) => (s.profile?.progression?.tracks as TracksMap | undefined) ?? EMPTY_TRACKS,
  );

  const [goals, setGoals] = useState<LevelGoal[]>([]);
  const [loading, setLoading] = useState<boolean>(target !== null);

  // Stable cache key — re-runs when target identity OR level changes.
  const targetKey = target ? `${target.templateId}:${target.currentLevel}` : '';

  useEffect(() => {
    if (!target) {
      setGoals([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchGoalsForProgram(target, tracks)
      .then((result) => {
        if (!cancelled) setGoals(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  return { goals, loading };
}

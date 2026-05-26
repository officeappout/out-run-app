'use client';

/**
 * useActiveProgramGoals
 *
 * Reads `LevelGoal[]` for ALL of the user's active programs at their current
 * domain levels. Goals from different programs are merged and deduplicated by
 * exerciseId so the same exercise never appears twice in the carousel.
 *
 * Goal fetching for each program is delegated to `fetchGoalsForProgram`,
 * which handles master-program expansion (e.g. `upper_body` → `push` + `pull`),
 * tracks-based child discovery, and last-resort level scanning.
 *
 * Effective program resolution:
 *   1. `progression.activePrograms` has entries → use as-is.
 *   2. `activePrograms` empty BUT `progression.tracks` has entries → derive a
 *      synthetic program list from those track keys. Covers old users,
 *      running-only users, and anyone who skipped the strength questionnaire.
 *   3. Both empty → returns empty goals (consumers can show a CTA).
 *
 * Note: the SUB_DOMAIN_IDS filter (push/pull/legs/core/…) is intentionally NOT
 * applied here — for goals, those leaf programs are exactly where the data
 * lives. The filter belongs in `ActiveProgramsCarousel` only, where it
 * suppresses children from the *program* list (not the goal list).
 */

import { useState, useEffect } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { fetchGoalsForProgram, type TracksMap } from './useGoalsForProgram';
import type { LevelGoal } from '@/types/workout';

interface ActiveProgramGoalsResult {
  goals: LevelGoal[];
  activeProgramId: string | null;
  currentLevel: number;
  loading: boolean;
}

/** Minimal shape the effect needs — templateId + resolved level. */
interface EffectiveProgram {
  templateId: string;
  currentLevel: number;
}

export function useActiveProgramGoals(): ActiveProgramGoalsResult {
  const profile = useUserStore((s) => s.profile);
  const [goals, setGoals] = useState<LevelGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const activePrograms = profile?.progression?.activePrograms ?? [];
  const tracks = (profile?.progression?.tracks ?? {}) as TracksMap;

  // ── Effective program list ────────────────────────────────────────────────
  // Priority 1: activePrograms → Priority 2: tracks keys.
  // No SUB_DOMAIN_IDS filter: goals can legitimately live on push/pull/legs/etc.
  const effectivePrograms: EffectiveProgram[] =
    activePrograms.length > 0
      ? activePrograms.map((ap) => ({
          templateId: ap.templateId,
          currentLevel: tracks[ap.templateId]?.currentLevel ?? 1,
        }))
      : Object.entries(tracks).map(([key, t]) => ({
          templateId: key,
          currentLevel: t?.currentLevel ?? 1,
        }));

  // Backward-compat: expose the first program's id / level.
  const primaryProgramId = effectivePrograms[0]?.templateId ?? null;
  const primaryLevel: number = effectivePrograms[0]?.currentLevel ?? 1;

  // Stable serialised key — includes level so the effect re-runs on level-up.
  const programKey = effectivePrograms
    .map((ep) => `${ep.templateId}:${ep.currentLevel}`)
    .join(',');

  useEffect(() => {
    if (effectivePrograms.length === 0) {
      setGoals([]);
      setLoading(false);
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      effectivePrograms.map((ep) => fetchGoalsForProgram(ep, tracks)),
    )
      .then((perProgramGoals) => {
        if (cancelled) return;
        // Merge + dedupe across programs (first occurrence wins).
        const seen = new Set<string>();
        const merged: LevelGoal[] = [];
        for (const list of perProgramGoals) {
          for (const goal of list) {
            if (!seen.has(goal.exerciseId)) {
              seen.add(goal.exerciseId);
              merged.push(goal);
            }
          }
        }
        setGoals(merged);
      })
      .catch(() => {
        if (!cancelled) setGoals([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programKey]);

  return {
    goals,
    activeProgramId: primaryProgramId,
    currentLevel: primaryLevel,
    loading,
  };
}

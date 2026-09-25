'use client';

/**
 * useUserProgramLevel — resolve the signed-in user's current level for one
 * program, robust to progression.tracks being keyed by either a Firestore
 * program document ID or a track slug (push/pull/legs/core/…) — real data is
 * genuinely mixed (Phase 0 audit).
 *
 * Reuses this codebase's existing, production-proven resolvers rather than
 * inventing a new one:
 *   - resolveToSlug / getIdToSlugMap (program-hierarchy.utils.ts) — the
 *     id↔slug bridge. Must be warmed (getIdToSlugMap()) before resolveToSlug
 *     is trustworthy; two existing call sites (ProgramsSection.tsx,
 *     useProgramProgress.ts) skip this and only work because they ride on an
 *     earlier navigation having warmed the module-level singleton — this
 *     hook can't assume that for a user who deep-links straight into a Tree.
 *   - resolveDataLevel (level-resolution.utils.ts) — the file's own stated
 *     "Single Source of Truth" for the `.currentLevel ?? .level ?? 0`
 *     normalization, replacing the confirmed-broken pattern in
 *     useProgressionStore.ts's domainProgress (hydrated from `.currentLevel`
 *     data into a field typed and read as `.level`) and
 *     useExerciseMasterData.ts's userLevelInTrack (same bug, independently).
 *
 * Deliberately NOT using resolveUserLevelFromMap (program-hierarchy.utils.ts)
 * despite its signature being the closest textual match — it's confirmed
 * dead code, zero call sites anywhere in the repo, never exercised against
 * real data.
 */
import { useEffect, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getIdToSlugMap, resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { resolveDataLevel } from '@/features/workout-engine/services/level-resolution.utils';

export interface UserProgramLevel {
  /** Null while resolving, or when the user has no data for this program. */
  currentLevel: number | null;
  isLoading: boolean;
}

export function useUserProgramLevel(programId: string | null): UserProgramLevel {
  const profile = useUserStore((s) => s.profile);
  const [slugMapReady, setSlugMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getIdToSlugMap().then(() => {
      if (!cancelled) setSlugMapReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!programId || !profile) {
    return { currentLevel: null, isLoading: !profile };
  }
  if (!slugMapReady) {
    return { currentLevel: null, isLoading: true };
  }

  const tracks = (profile.progression?.tracks ?? {}) as Record<string, unknown>;
  const slug = resolveToSlug(programId);
  const trackData = tracks[slug] ?? tracks[programId];
  const currentLevel = resolveDataLevel(trackData);

  return { currentLevel: currentLevel > 0 ? currentLevel : null, isLoading: false };
}

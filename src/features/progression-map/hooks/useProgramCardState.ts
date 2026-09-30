'use client';

/**
 * useProgramCardState — Progression System v2, Phase 4a.
 *
 * React/store-reading wrapper around program-card-state.service.ts's pure
 * resolveProgramCardState — gathers activePrograms/tracks from the user
 * profile, the already-hydrated exercise catalog (useExerciseLibraryStore,
 * same reuse useSkillTree.ts already does — no new Firestore fetch), and
 * warms the id<->slug map (getIdToSlugMap/resolveToSlug, the same
 * production-proven bridge useUserProgramLevel.ts already relies on) before
 * normalizing every key into one consistent slug space.
 *
 * Phase 4b round 3: for a MASTER program only (never a leaf skill — no
 * extra fetch on the common path), also fetches the master's own Program
 * doc (getProgramByTemplateId — the same cross-domain import
 * SkillTreeScreen.tsx already uses; content/programs is already crossed
 * from this domain, not a new violation) to read its real `subPrograms`
 * list and count how many resolve to a slug with a real track level. That
 * count feeds resolveProgramCardState's 'tracked' → not_started_master
 * fold — see that file's own header for the bug this closes.
 */
import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import { getIdToSlugMap, resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import { isProgressionMapLeafProgram } from '@/lib/progression-map-config';
import { resolveProgramCardState, type ProgramCardStateResult } from '../services/program-card-state.service';

export function useProgramCardState(programId: string): ProgramCardStateResult {
  const profile = useUserStore((s) => s.profile);
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
  const [slugMapReady, setSlugMapReady] = useState(false);
  const isLeafSkillProgram = isProgressionMapLeafProgram(programId);
  const [masterSubPrograms, setMasterSubPrograms] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getIdToSlugMap().then(() => {
      if (!cancelled) setSlugMapReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Master-only: fetch subPrograms to count real configured children.
  // Leaf skill programs never need this — skip the fetch entirely.
  useEffect(() => {
    if (isLeafSkillProgram) {
      setMasterSubPrograms(null);
      return;
    }
    let cancelled = false;
    getProgramByTemplateId(programId).then((p) => {
      if (!cancelled) setMasterSubPrograms(p?.subPrograms ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [programId, isLeafSkillProgram]);

  return useMemo<ProgramCardStateResult>(() => {
    // Safe, non-alarming default while the profile/slug-map are still
    // resolving — never flashes "locked" during a brief loading window.
    if (!slugMapReady || !profile) {
      return { state: 'available' };
    }

    const activePrograms = profile.progression?.activePrograms ?? [];
    const activeProgramSlugs = new Set(
      activePrograms
        .map((ap) => (ap?.templateId ? resolveToSlug(ap.templateId) : null))
        .filter((s): s is string => !!s),
    );

    const tracksRaw = (profile.progression?.tracks ?? {}) as Record<string, { currentLevel?: number } | undefined>;
    const flatTracksBySlug: Record<string, number> = {};
    for (const [key, value] of Object.entries(tracksRaw)) {
      const lvl = value?.currentLevel;
      if (typeof lvl === 'number' && lvl > 0) {
        flatTracksBySlug[resolveToSlug(key)] = lvl;
      }
    }

    const configuredMasterChildCount =
      !isLeafSkillProgram && masterSubPrograms != null
        ? new Set(masterSubPrograms.map(resolveToSlug).filter((slug) => flatTracksBySlug[slug] != null)).size
        : undefined;

    return resolveProgramCardState({
      programSlug: resolveToSlug(programId),
      isLeafSkillProgram,
      allExercises,
      rawSkillProgramId: programId,
      flatTracksBySlug,
      activeProgramSlugs,
      resolveDomainSlug: resolveToSlug,
      configuredMasterChildCount,
    });
  }, [slugMapReady, profile, allExercises, programId, isLeafSkillProgram, masterSubPrograms]);
}

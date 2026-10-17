'use client';

/**
 * useProgressHubBuckets — gathers the inputs for bucketForProgressHub
 * (progress-hub-bucketing.service.ts) from the user store, the exercise
 * catalog and the parents' Program docs, and returns the three ordered
 * lists the "התקדמות" tab renders. Read-only: no writes anywhere.
 *
 * Replaces the (deleted) useGatedProgramBuckets + bucketProgramsByRealState as the hub's
 * source (those split active/tracked by raw track presence and moved
 * under-populated parents to "גלה עוד"; the new structure puts every
 * non-active parent in "גלה עוד" and lists an active parent's children
 * under it).
 */
import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import { getIdToSlugMap, resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import { PROGRESSION_MAP_LEAF_PROGRAMS, resolveProgressionMapDestination } from '@/lib/progression-map-config';
import { isHiddenProgram } from '@/lib/hidden-programs';
import { derivePrerequisites } from '../services/prerequisite-derivation.service';
import { evaluateProgramGate, type ProgramGateResult } from '../services/program-gating.service';
import {
  bucketForProgressHub,
  buildHubLevelsBySlug,
  resolveParentChildSlugs,
  type ProgressHubBuckets,
} from '../services/progress-hub-bucketing.service';

/** Parents the engine knows by slug — a parent even before its Program doc loads. */
const KNOWN_PARENT_SLUGS: ReadonlySet<string> = new Set(['full_body', 'upper_body', 'lower_body', 'calisthenics_upper']);

/** The parent programs offered in "גלה עוד" (the leaf allow-list covers the rest). */
const DISCOVER_PARENT_IDS = ['full_body'] as const;

/** A parent program = no map of its own (not a leaf). */
export function isParentProgram(idOrSlug: string): boolean {
  return resolveProgressionMapDestination(idOrSlug) === null;
}

export interface ProgressHubState {
  /** False until the profile and the id→slug map are ready — render nothing yet. */
  ready: boolean;
  buckets: ProgressHubBuckets;
  hasAnyProgram: boolean;
}

const EMPTY: ProgressHubBuckets = { mine: [], needsAssessment: [], discover: [] };

export function useProgressHubBuckets(): ProgressHubState {
  const profile = useUserStore((s) => s.profile);
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
  const [slugMapReady, setSlugMapReady] = useState(false);
  const [subProgramsBySlug, setSubProgramsBySlug] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    getIdToSlugMap().then(() => {
      if (!cancelled) setSlugMapReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeIds = useMemo(
    () =>
      (profile?.progression?.activePrograms ?? [])
        .map((ap) => ap?.templateId)
        .filter((id): id is string => !!id),
    [profile],
  );
  const tracksRaw = useMemo(
    () => (profile?.progression?.tracks ?? {}) as Record<string, { currentLevel?: number } | undefined>,
    [profile],
  );
  const levelsBySlug = useMemo(
    () =>
      slugMapReady
        ? buildHubLevelsBySlug(
            tracksRaw,
            (profile?.progression?.domains ?? {}) as Record<string, { currentLevel?: number } | undefined>,
            resolveToSlug,
          )
        : {},
    [slugMapReady, tracksRaw, profile],
  );
  const skillFocusSlugs = useMemo(
    () => (profile?.progression?.skillFocusIds ?? []).map((id) => (slugMapReady ? resolveToSlug(id) : id)),
    [profile, slugMapReady],
  );

  // Non-leaf ids whose Program doc (subPrograms) we need.
  const parentCandidateIds = useMemo(() => {
    if (!slugMapReady) return [];
    const ids = [...activeIds, ...Object.keys(tracksRaw), ...DISCOVER_PARENT_IDS];
    return Array.from(new Set(ids)).filter(isParentProgram);
  }, [slugMapReady, activeIds, tracksRaw]);

  useEffect(() => {
    if (parentCandidateIds.length === 0) return;
    let cancelled = false;
    Promise.all(
      parentCandidateIds.map(async (id) => {
        const p = await getProgramByTemplateId(id).catch(() => null);
        return [resolveToSlug(id), (p?.subPrograms ?? []).map(resolveToSlug)] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setSubProgramsBySlug(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentCandidateIds.join(',')]);

  const buckets = useMemo<ProgressHubBuckets>(() => {
    if (!slugMapReady || !profile) return EMPTY;

    const childrenOf = (id: string): readonly string[] | undefined => {
      if (!isParentProgram(id)) return undefined;
      const slug = resolveToSlug(id);
      const children = resolveParentChildSlugs(slug, subProgramsBySlug[slug], skillFocusSlugs);
      return children.length > 0 || KNOWN_PARENT_SLUGS.has(slug) ? children : undefined;
    };

    // Gate per leaf catalog program — same pipeline as resolveProgramCardState.
    const gates: Record<string, ProgramGateResult> = {};
    for (const { programId } of PROGRESSION_MAP_LEAF_PROGRAMS) {
      const prereqs =
        allExercises.length > 0
          ? derivePrerequisites(allExercises, programId).map((p) => ({
              domainProgramId: resolveToSlug(p.domainProgramId),
              minLevel: p.minLevel,
            }))
          : [];
      gates[programId] = evaluateProgramGate({ tracks: levelsBySlug, tier: 1 }, {}, prereqs);
    }

    const trackLevels: Record<string, number | undefined> = {};
    for (const [k, v] of Object.entries(tracksRaw)) trackLevels[k] = v?.currentLevel;

    return bucketForProgressHub({
      activeIds,
      trackLevels,
      levelsBySlug,
      childrenOf,
      catalog: [...PROGRESSION_MAP_LEAF_PROGRAMS.map((p) => p.programId), ...DISCOVER_PARENT_IDS],
      gates,
      resolveSlug: resolveToSlug,
      isHidden: isHiddenProgram,
    });
  }, [slugMapReady, profile, allExercises, activeIds, tracksRaw, levelsBySlug, subProgramsBySlug, skillFocusSlugs]);

  return {
    ready: slugMapReady && !!profile,
    buckets,
    hasAnyProgram: buckets.mine.length > 0 || buckets.needsAssessment.length > 0,
  };
}

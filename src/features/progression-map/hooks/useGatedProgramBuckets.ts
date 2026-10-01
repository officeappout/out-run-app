'use client';

/**
 * useGatedProgramBuckets — Progression System v2, Phase 4b round 5.
 *
 * Fixes a real gap in round 3/4's "≥2 configured domains" master-visibility
 * gate: that gate lives entirely inside resolveProgramCardState/
 * useProgramCardState, which decides a card's VISUAL STATE — but
 * TrackedProgramsSection.tsx never calls it at all. It builds its "המפות
 * שלי" membership directly from bucketProgramsByRealState (raw track
 * presence, `tracksRaw[id].currentLevel > 0`) and passes a STATIC
 * `state="tracked"` prop straight through, so an under-populated master
 * kept rendering — correctly restyled wherever useProgramCardState WAS
 * consulted (e.g. DiscoverMoreSection, SkillTreeScreen's own banner), but
 * still physically listed under "המפות שלי" everywhere it wasn't. David's
 * own diagnosis, confirmed by tracing: "the gate changes the card STATE
 * but not the BUCKET placement."
 *
 * This hook is the shared source of truth for BOTH concerns: it runs
 * bucketProgramsByRealState for the raw split, then — masters only, same
 * domain-only child count as useProgramCardState.ts — removes any tracked
 * master failing the ≥2 gate from `trackedIds` and surfaces it separately
 * as `underPopulatedMasterIds`, so TrackedProgramsSection can stop
 * rendering it and DiscoverMoreSection can pick it up as a genuine "גלה
 * עוד" candidate instead. Scoped to 'tracked' only, never 'active' — same
 * round-3 rule (an active master reflects deliberate user intent).
 *
 * Each consumer calls this hook independently (not threaded via props) —
 * a small amount of duplicate master-Program-doc fetching across sibling
 * sections, same accepted tradeoff useProgramCardState.ts already made for
 * its own per-card master fetch, in exchange for keeping
 * TrackedProgramsSection/DiscoverMoreSection self-contained (no new
 * ProgressionScreen.tsx prop-threading).
 */
import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import { isProgressionMapLeafProgram } from '@/lib/progression-map-config';
import { bucketProgramsByRealState } from '../services/program-bucketing.service';
import { countConfiguredDomainChildren, buildFlatTracksBySlug } from '../services/program-card-state.service';

export interface GatedProgramBuckets {
  activeTemplateIds: string[];
  /** Gate-filtered — an under-populated tracked master is REMOVED from here. */
  trackedIds: string[];
  /** Tracked masters that failed the ≥2 canonical-domain-child gate — real "גלה עוד" candidates. */
  underPopulatedMasterIds: string[];
}

const EMPTY: GatedProgramBuckets = { activeTemplateIds: [], trackedIds: [], underPopulatedMasterIds: [] };

export function useGatedProgramBuckets(): GatedProgramBuckets {
  const profile = useUserStore((s) => s.profile);

  // Memoized on `profile` so downstream effects/memos below only re-run when
  // the profile itself actually changes, not on every render (these would
  // otherwise be fresh object/array literals every render).
  const activePrograms = useMemo(() => profile?.progression?.activePrograms ?? [], [profile]);
  const tracksRaw = useMemo(
    () => (profile?.progression?.tracks ?? {}) as Record<string, { currentLevel?: number } | undefined>,
    [profile],
  );

  const rawBuckets = useMemo(
    () => bucketProgramsByRealState(activePrograms, tracksRaw, resolveToSlug),
    [activePrograms, tracksRaw],
  );

  const masterTrackedIds = useMemo(
    () => rawBuckets.trackedIds.filter((id) => !isProgressionMapLeafProgram(id)),
    [rawBuckets.trackedIds],
  );

  const [masterChildCounts, setMasterChildCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (masterTrackedIds.length === 0) {
      setMasterChildCounts({});
      return;
    }
    let cancelled = false;
    const flatTracksBySlug = buildFlatTracksBySlug(tracksRaw, resolveToSlug);
    Promise.all(
      masterTrackedIds.map(async (id) => {
        const p = await getProgramByTemplateId(id);
        const subSlugs = (p?.subPrograms ?? []).map(resolveToSlug);
        return [id, countConfiguredDomainChildren(subSlugs, flatTracksBySlug)] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setMasterChildCounts(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // masterTrackedIds is derived fresh each render from rawBuckets — join() gives a stable dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterTrackedIds.join(','), tracksRaw]);

  return useMemo<GatedProgramBuckets>(() => {
    if (!profile) return EMPTY;

    const underPopulatedMasterIds = masterTrackedIds.filter((id) => (masterChildCounts[id] ?? 2) < 2);
    const underPopulatedSet = new Set(underPopulatedMasterIds);
    const trackedIds = rawBuckets.trackedIds.filter((id) => !underPopulatedSet.has(id));

    return { activeTemplateIds: rawBuckets.activeTemplateIds, trackedIds, underPopulatedMasterIds };
  }, [profile, rawBuckets, masterTrackedIds, masterChildCounts]);
}

"use client";

/**
 * useProgramProgress — derived program progress for the new dashboard rows.
 *
 * Slim version of the data resolution that lives inside `StatsOverview`
 * (lines 353–442). Centralised here so:
 *   - `ProgramProgressRow` (Row 2) can render the ring without owning the
 *     same logic.
 *   - `StatsOverview` will eventually delegate to this same hook in PR 4
 *     when we trim it down to just the Daily Workout Hero.
 *
 * Returns `null` when the user hasn't completed the strength survey
 * (no progression data + no personaId).
 */

import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/features/user';
import { getProgramByTemplateId } from '@/features/content/programs';
import { resolveIconKey } from '@/features/content/programs';
import { PROGRAM_NAME_HE } from '@/lib/utils/program-names';

/**
 * Emergency fallback only — used if both the user's seeded `progression.domains.{id}.maxLevel`
 * AND the live Firestore `programs/{id}.maxLevels` are unavailable. The CMS is the source of
 * truth; this constant should never surface in production unless Firestore is unreachable.
 */
const EMERGENCY_MAX_LEVEL_FALLBACK = 25;

/**
 * Master Program → child sub-domain mapping. Mirrors the server-side aggregation in
 * `progression.service.ts` (`EXCLUDED_FROM_AVG` / `MASTER_CAP`) and the engine helper
 * `MASTER_CHILD_TRACKS` in `level-resolution.utils.ts`.
 *
 * When the user's primary domain is a master program (e.g. `full_body`), the displayed
 * level is derived on-the-fly as `min(MASTER_LEVEL_CAP, round(avg(child levels)))` using
 * the children below — INSTEAD of reading the stale `progression.tracks.{master}.currentLevel`.
 * This avoids the "push/pull/legs are L3/L4 but full_body shows L1" desync that happens
 * when `recalculateMasterLevel` hasn't run since the children leveled up.
 */
const MASTER_PROGRAM_CHILDREN: Record<string, readonly string[]> = {
  full_body: ['push', 'pull', 'legs'],
};
const MASTER_LEVEL_CAP = 15;

export interface ProgramProgressData {
  /** Hebrew program name resolved from Firestore (or falls back to the ID alias). */
  programName: string;
  /** Icon key for `getProgramIcon` lookup. */
  iconKey: string | undefined;
  /** Current level (1-based). */
  currentLevel: number;
  /**
   * Maximum level for the program. Sourced from Firestore CMS (`programs/{id}.maxLevels`).
   * Falls back to `EMERGENCY_MAX_LEVEL_FALLBACK` only if CMS is completely unreachable.
   */
  maxLevel: number;
  /** Percent through the current level (0-100). */
  progressPercent: number;
  /** Number of active programs the user has — drives carousel mode in `ProgramProgressCard`. */
  programCount: number;
}

/** True if the user has completed the strength survey. */
export function hasStrengthSurvey(profile: ReturnType<typeof useUserStore>['profile']): boolean {
  if (!profile) return false;
  const hasPersona = !!profile.personaId;
  const hasDomains = !!(profile.progression?.domains && Object.keys(profile.progression.domains).length > 0);
  const hasTracks = !!(profile.progression?.tracks && Object.keys(profile.progression.tracks).length > 0);
  return hasPersona || hasDomains || hasTracks;
}

/** True if the user has completed the run survey. */
export function hasRunSurvey(profile: ReturnType<typeof useUserStore>['profile']): boolean {
  if (!profile) return false;
  return !!profile.running?.activeProgram || !!profile.running?.paceProfile?.basePace;
}

export function useProgramProgress(): ProgramProgressData | null {
  const { profile } = useUserStore();

  const activeProgram = profile?.progression?.activePrograms?.[0];
  const programCount = profile?.progression?.activePrograms?.length ?? 1;

  const primaryDomainId = useMemo(() => {
    if (activeProgram?.templateId) return activeProgram.templateId;
    const domainsKeys = profile?.progression?.domains ? Object.keys(profile.progression.domains) : [];
    if (domainsKeys.length > 0) return domainsKeys[0];
    const tracksKeys = profile?.progression?.tracks ? Object.keys(profile.progression.tracks) : [];
    return tracksKeys.length > 0 ? tracksKeys[0] : null;
  }, [activeProgram?.templateId, profile?.progression?.domains, profile?.progression?.tracks]);

  // Live CMS fetch for program metadata (Hebrew name + maxLevels). The CMS is the source
  // of truth for `maxLevels` — we use this whenever the seeded `domain.maxLevel` is missing
  // or stale (e.g. admin updated `programs/full_body.maxLevels` from 25 → 15 after onboarding).
  const [hebrewProgramName, setHebrewProgramName] = useState<string | null>(null);
  const [cmsMaxLevel, setCmsMaxLevel] = useState<number | null>(null);
  useEffect(() => {
    const programId = activeProgram?.templateId || primaryDomainId;
    if (!programId) return;
    let cancelled = false;
    getProgramByTemplateId(programId)
      .then((prog) => {
        if (cancelled || !prog) return;
        if (prog.name) setHebrewProgramName(prog.name);
        if (prog.maxLevels != null && prog.maxLevels > 0) {
          setCmsMaxLevel(prog.maxLevels);
        }
      })
      .catch(() => {/* fall back silently to alias map + seeded domain.maxLevel */});
    return () => { cancelled = true; };
  }, [activeProgram?.templateId, primaryDomainId]);

  const { currentLevel, progressPercent, maxLevel } = useMemo(() => {
    const tracks = profile?.progression?.tracks;
    const domains = profile?.progression?.domains;
    const track = primaryDomainId ? tracks?.[primaryDomainId] : undefined;
    const domain = primaryDomainId ? domains?.[primaryDomainId] : undefined;
    // maxLevel resolution priority:
    //   1. Live CMS fetch (`programs/{id}.maxLevels`) — most authoritative, always wins
    //      when admin has set it. Reflects post-onboarding edits in the CMS.
    //   2. Seeded `progression.domains.{id}.maxLevel` — written at onboarding-completion
    //      from the same CMS source.
    //   3. EMERGENCY_MAX_LEVEL_FALLBACK — only if both are missing (CMS unreachable +
    //      no seeded value). Should not happen in production.
    const resolvedMaxLevel =
      cmsMaxLevel ??
      domain?.maxLevel ??
      EMERGENCY_MAX_LEVEL_FALLBACK;

    // ── Master-Program Derivation (on-the-fly) ────────────────────────────
    // If the primary domain is a master (e.g. full_body), do NOT trust the
    // stored `tracks.{master}.currentLevel` — it may be stale because
    // `recalculateMasterLevel` runs server-side after workout completion and
    // can lag behind direct child-track edits. Instead, compute the level
    // here from the live child tracks using the SAME formula the server uses
    // (`progression.service.ts` lines 407–418): mean of child levels, rounded,
    // capped at MASTER_LEVEL_CAP. The child percent is averaged in lockstep
    // so the ring reflects intra-level progress that matches the displayed
    // level number — keeping the percent feed but feeding it consistent data.
    const masterChildren = primaryDomainId
      ? MASTER_PROGRAM_CHILDREN[primaryDomainId]
      : undefined;
    let derivedLevel: number | null = null;
    let derivedPercent: number | null = null;
    if (masterChildren && tracks) {
      const childData = masterChildren
        .map((id) => tracks[id])
        .filter((t): t is NonNullable<typeof t> =>
          !!t && typeof t.currentLevel === 'number' && t.currentLevel > 0,
        );
      if (childData.length > 0) {
        const avgLevel = childData.reduce((s, t) => s + t.currentLevel, 0) / childData.length;
        const avgPercent = childData.reduce((s, t) => s + (t.percent ?? 0), 0) / childData.length;
        derivedLevel = Math.min(MASTER_LEVEL_CAP, Math.round(avgLevel));
        derivedPercent = Math.round(avgPercent);
      }
    }

    const resolvedCurrentLevel =
      derivedLevel ??
      track?.currentLevel ??
      domain?.currentLevel ??
      1;
    const resolvedPercent =
      derivedPercent ??
      (track?.percent != null ? Math.round(track.percent) : 0);

    return {
      currentLevel: resolvedCurrentLevel,
      progressPercent: resolvedPercent,
      maxLevel: resolvedMaxLevel,
    };
  }, [primaryDomainId, profile?.progression?.tracks, profile?.progression?.domains, cmsMaxLevel]);

  if (!hasStrengthSurvey(profile)) return null;

  const programName = hebrewProgramName
    || (primaryDomainId ? PROGRAM_NAME_HE[primaryDomainId.toLowerCase()] : undefined)
    || activeProgram?.name
    || 'תוכנית אימון';

  const iconKey = resolveIconKey(undefined, primaryDomainId ?? undefined);

  return {
    programName,
    iconKey,
    currentLevel,
    maxLevel,
    progressPercent,
    programCount,
  };
}

export default useProgramProgress;

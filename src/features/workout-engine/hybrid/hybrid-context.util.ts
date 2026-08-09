/**
 * hybrid-context.util — shared per-domain user-level resolution for hybrid composers.
 *
 * Extracted VERBATIM from composeHybridPlan's inline prelude so every hybrid compose
 * path (budget-split, route-stops) reuses the SAME real per-domain levels — the fix for
 * the "empty domainLevels" bug where the pipeline treated the user as their global level
 * for every domain. buildUserProgramLevels(profile) yields the real push/pull/legs/core
 * levels — exactly what home-workout feeds the pipeline. Extend here, never duplicate.
 *
 * Does its own dynamic imports (heavy deps stay lazy, matching the composer's pattern).
 */

export interface HybridUserLevels {
  /** Real per-domain levels (push / pull / legs_core / skill slugs). */
  userProgramLevels: Map<string, number>;
  /** Global base level — the fallback when an exercise maps to no known domain at all
   *  (movementGroup unmapped AND no matching targetPrograms — see resolveUserLevelForExercise). */
  baseUserLevel: number;
  /**
   * Per-exercise level = the user's level in the exercise's domain (movementGroup →
   * domain, else targetPrograms → slug), mirroring home-workout's getUserLevelForExercise.
   * Returns `UNASSESSED_DOMAIN_LEVEL` (contextual-engine.types.ts) when the exercise's
   * domain IS known but the user hasn't assessed it — see that constant's doc comment.
   */
  resolveUserLevelForExercise: (exercise: any) => number;
}

/**
 * Resolve the user's per-domain levels + a per-exercise level resolver. `profile` may be
 * null (→ empty levels + base 5). `tag` is a log prefix (e.g. '[Hybrid]' / '[RouteStops]').
 */
export async function resolveHybridUserLevels(
  profile: any | null,
  tag = '[Hybrid]',
): Promise<HybridUserLevels> {
  const [
    { buildUserProgramLevels, getBaseUserLevel },
    { getAllPrograms },
    { resolveToSlug, buildIdToSlugMapFromPrograms },
    { MG_TO_DOMAIN },
    { UNASSESSED_DOMAIN_LEVEL },
  ] = await Promise.all([
    import('../services/level-resolution.utils'),
    import('@/features/content/programs/core/program.service'),
    import('../services/program-hierarchy.utils'),
    import('../shared/constants/domain-mapping.constants'),
    import('../logic/contextual-engine.types'),
  ]);

  const allPrograms = await getAllPrograms();
  // Warm the ID→slug map BEFORE level resolution — otherwise resolveToSlug can't map
  // hash program-ids and skill domains (muscle_up / handstand) silently fall to L1.
  buildIdToSlugMapFromPrograms(allPrograms);
  const masterProgramIds = new Set(allPrograms.filter((p: any) => p.isMaster).map((p: any) => p.id));
  const userProgramLevels = profile
    ? buildUserProgramLevels(profile, masterProgramIds, tag).levels
    : new Map<string, number>();
  const baseUserLevel = profile ? getBaseUserLevel(profile) : 5;
  const resolveUserLevelForExercise = (exercise: any): number => {
    const mgDomain = MG_TO_DOMAIN[exercise?.movementGroup ?? ''];
    if (mgDomain) {
      // absent=absent for partial assessment (09.08.2026): the domain IS known — if the
      // user hasn't assessed it, that's exactly the gap being fixed. UNASSESSED_DOMAIN_LEVEL
      // (not baseUserLevel) so the exercise is excluded by the existing numeric comparisons
      // in ContextualEngine.ts, not admitted at a guessed cross-domain level. This is IN
      // ADDITION to the existing full-block gate (hasAssessedStrengthDomain), not a
      // replacement — see that constant's doc comment.
      return userProgramLevels.has(mgDomain) ? userProgramLevels.get(mgDomain)! : UNASSESSED_DOMAIN_LEVEL;
    }
    for (const tp of exercise?.targetPrograms ?? []) {
      const slug = resolveToSlug(tp.programId);
      if (userProgramLevels.has(slug)) return userProgramLevels.get(slug)!;
      if (userProgramLevels.has(tp.programId)) return userProgramLevels.get(tp.programId)!;
    }
    // No domain signal could be derived at all (movementGroup unmapped AND no matching
    // targetPrograms entry) — a categorization gap, not an "unassessed domain" in the sense
    // above. Keeps the existing base-level fallback for this genuinely different case.
    return baseUserLevel;
  };

  return { userProgramLevels, baseUserLevel, resolveUserLevelForExercise };
}

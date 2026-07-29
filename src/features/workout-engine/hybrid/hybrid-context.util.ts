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
  /** Global base level — the fallback when an exercise maps to no known domain. */
  baseUserLevel: number;
  /**
   * Per-exercise level = the user's level in the exercise's domain (movementGroup →
   * domain, else targetPrograms → slug), mirroring home-workout's getUserLevelForExercise.
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
  ] = await Promise.all([
    import('../services/level-resolution.utils'),
    import('@/features/content/programs/core/program.service'),
    import('../services/program-hierarchy.utils'),
    import('../shared/constants/domain-mapping.constants'),
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
    if (mgDomain && userProgramLevels.has(mgDomain)) return userProgramLevels.get(mgDomain)!;
    for (const tp of exercise?.targetPrograms ?? []) {
      const slug = resolveToSlug(tp.programId);
      if (userProgramLevels.has(slug)) return userProgramLevels.get(slug)!;
      if (userProgramLevels.has(tp.programId)) return userProgramLevels.get(tp.programId)!;
    }
    return baseUserLevel;
  };

  return { userProgramLevels, baseUserLevel, resolveUserLevelForExercise };
}

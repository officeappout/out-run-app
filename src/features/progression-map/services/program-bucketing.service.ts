/**
 * program-bucketing.service.ts — Progression System v2, Phase 4a-fix.
 *
 * Pure "which section does this program belong in" logic — the exact rule
 * ActiveProgramsSection.tsx / TrackedProgramsSection.tsx both need: active
 * wins first (a program in activePrograms is 'active', full stop), tracked
 * is everything else with a real track entry. Extracted specifically so
 * the mutual-exclusivity guarantee (the reported bug this phase fixes —
 * the SAME program appearing in two sections at once) is independently
 * unit-tested, not just eyeballed in two separate component files.
 *
 * Slug-normalized throughout (a caller-supplied resolveSlug, e.g.
 * resolveToSlug) since real activePrograms/tracks data mixes raw
 * Firestore ids and slugs (same reasoning useUserProgramLevel.ts's own
 * header documents) — comparing raw strings directly would under-count
 * the exclusion and let a program leak into both buckets.
 */

export interface ProgramBuckets {
  /** activePrograms' own templateIds, in their original (priority) order — unfiltered, every entry IS active. */
  activeTemplateIds: string[];
  /** Raw track keys with a real level (>0) that are NOT also active. */
  trackedIds: string[];
}

export function bucketProgramsByRealState(
  activePrograms: readonly { templateId?: string | null }[],
  tracksRaw: Record<string, { currentLevel?: number } | undefined>,
  resolveSlug: (id: string) => string,
): ProgramBuckets {
  const activeTemplateIds = activePrograms
    .map((ap) => ap?.templateId)
    .filter((id): id is string => !!id);

  const activeSlugs = new Set(activeTemplateIds.map(resolveSlug));

  const trackedIds = Object.entries(tracksRaw)
    .filter(([id, v]) => (v?.currentLevel ?? 0) > 0 && !activeSlugs.has(resolveSlug(id)))
    .map(([id]) => id);

  return { activeTemplateIds, trackedIds };
}

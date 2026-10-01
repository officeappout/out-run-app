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
 *
 * Phase 4b round 3 fix: the ORIGINAL mutual-exclusivity fix above only
 * deduped ACROSS the two buckets (active wins over tracked) — it never
 * deduped WITHIN a single bucket. Because tracks/activePrograms genuinely
 * mix raw Firestore ids and slugs for the SAME logical program (see the
 * header comment above), two different keys resolving to the same slug —
 * e.g. 'calisthenics_upper' and its own raw doc id — could both
 * independently survive the per-bucket filter and render as two separate
 * cards for one program. dedupeBySlug closes that: first-seen id per
 * resolved slug wins, applied to both buckets (trackedIds was the
 * confirmed, reported case; activeTemplateIds gets the same treatment for
 * structural consistency even though activePrograms is less exposed to it
 * in practice today).
 */

/** First-seen id per resolved slug, order otherwise preserved. */
function dedupeBySlug(ids: string[], resolveSlug: (id: string) => string): string[] {
  const seenSlugs = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const slug = resolveSlug(id);
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    result.push(id);
  }
  return result;
}

export interface ProgramBuckets {
  /** activePrograms' own templateIds, in their original (priority) order, deduped by resolved slug — every entry IS active. */
  activeTemplateIds: string[];
  /** Raw track keys with a real level (>0) that are NOT also active, deduped by resolved slug. */
  trackedIds: string[];
}

export function bucketProgramsByRealState(
  activePrograms: readonly { templateId?: string | null }[],
  tracksRaw: Record<string, { currentLevel?: number } | undefined>,
  resolveSlug: (id: string) => string,
): ProgramBuckets {
  const rawActiveTemplateIds = activePrograms
    .map((ap) => ap?.templateId)
    .filter((id): id is string => !!id);
  const activeTemplateIds = dedupeBySlug(rawActiveTemplateIds, resolveSlug);

  const activeSlugs = new Set(activeTemplateIds.map(resolveSlug));

  const rawTrackedIds = Object.entries(tracksRaw)
    .filter(([id, v]) => (v?.currentLevel ?? 0) > 0 && !activeSlugs.has(resolveSlug(id)))
    .map(([id]) => id);
  const trackedIds = dedupeBySlug(rawTrackedIds, resolveSlug);

  return { activeTemplateIds, trackedIds };
}

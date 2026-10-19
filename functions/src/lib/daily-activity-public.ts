/**
 * dailyActivityPublic mirror rows — pure helpers for dailyActivityPublicSync
 * (no Firebase), so the "skip unchanged writes" rule is unit-tested.
 */

export interface PublicStepsRow {
  uid: string;
  displayName: string;
  steps: number;
  authorityId: string;
  date: string;
  ageGroup: 'minor' | 'adult';
}

/** The public row for one dailyActivity doc, or null when it must not be mirrored (no uid / no authorityId yet). */
export function publicRowOf(
  data: Record<string, unknown>,
  date: string,
  ageGroup: 'minor' | 'adult' | undefined,
): PublicStepsRow | null {
  const uid = typeof data.userId === 'string' ? data.userId : '';
  const authorityId = typeof data.authorityId === 'string' ? data.authorityId : '';
  if (!uid || !authorityId) return null;
  return {
    uid,
    displayName: typeof data.displayName === 'string' ? data.displayName : '???',
    steps: typeof data.steps === 'number' ? data.steps : 0,
    authorityId,
    date,
    // Fail closed: an unresolved age is 'minor'.
    ageGroup: ageGroup ?? 'minor',
  };
}

/**
 * Is the existing mirror doc already exactly this row? Then the sync skips
 * the write (19.10.2026) — the doc's updatedAt keeps the time of the last
 * real change. Every mirrored field is compared, including ageGroup, so a
 * changed age cohort is always rewritten.
 */
export function publicRowUnchanged(existing: Record<string, unknown> | undefined, next: PublicStepsRow): boolean {
  if (!existing) return false;
  return (
    existing.uid === next.uid &&
    existing.displayName === next.displayName &&
    existing.steps === next.steps &&
    existing.authorityId === next.authorityId &&
    existing.date === next.date &&
    existing.ageGroup === next.ageGroup
  );
}

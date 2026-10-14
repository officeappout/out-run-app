/**
 * Content moderation state for community groups / events.
 *
 * "Removing" reported content is a QUARANTINE, not a delete: the target doc gets
 * `moderationState: 'removed'` (+ removedBy / removedAt) AND `isActive: false`.
 * Every user-facing discovery query already filters `isActive == true`
 * (public groups, scope groups, events, park enrichment, partner data), so the
 * isActive flip removes it from those lists immediately; this predicate is for
 * the paths that do NOT filter isActive (arena listener, join-by-code preview,
 * the join engine) and must refuse a removed target explicitly.
 *
 * Keyed on the explicit flag only, so legacy docs with no moderationState (and
 * admin-deactivated ones, isActive:false without it) are unaffected.
 */
export const MODERATION_REMOVED = 'removed' as const;

export function isContentRemoved(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { moderationState?: unknown }).moderationState === MODERATION_REMOVED
  );
}

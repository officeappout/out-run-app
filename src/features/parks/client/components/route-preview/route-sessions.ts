/**
 * route-sessions — PURE: the route page's "מתאמנים כאן" list. Live sessions for the route, the
 * route prop's linked session, this sheet's optimistic arrivals and (enable_where_to_train_v1)
 * mutual partners' shares from /api/training-here/partners?routeId=, merged without duplicates.
 *
 * A row is a duplicate when its eventId is already listed, or — for personal arrivals — when the
 * same user already has an arrival at the same start time (an optimistic `local-…` row or a
 * partner share the live listener has since returned as `arrival_<id>`). Earlier sources win, so
 * the live row (with its privacy mode / workout title) is the one kept.
 */
import type { SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';

const arrivalKey = (s: SessionEnrichment): string | null =>
  s.isPersonalArrival ? `${s.avatars?.[0]?.uid ?? ''}_${s.nextStartTime}` : null;

/** Merge in priority order (first source wins on a duplicate), sorted by start time. */
export function mergeRouteSessions(...sources: readonly SessionEnrichment[][]): SessionEnrichment[] {
  const ids = new Set<string>();
  const arrivals = new Set<string>();
  const out: SessionEnrichment[] = [];
  for (const source of sources) {
    for (const s of source) {
      const key = arrivalKey(s);
      if (ids.has(s.eventId) || (key && arrivals.has(key))) continue;
      ids.add(s.eventId);
      if (key) arrivals.add(key);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.nextStartTime.localeCompare(b.nextStartTime));
}

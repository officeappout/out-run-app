/**
 * park-rating.utils — pure computation for a park's aggregate rating from
 * its `user_contributions` reviews (type:'review', linkedParkId===park.id).
 *
 * Framework-agnostic (no Firestore, no React) so the exact same formula is
 * shared by:
 *   - the client-side write-on-review-submit path (contribution.service.ts)
 *   - the one-time admin-SDK backfill script (scripts/backfill-park-ratings.ts)
 * One source of truth for "what does this park's rating mean" — no risk of
 * the live write path and the backfill computing different numbers.
 *
 * Mirrors the filter/reduce ParkDetailSheet's own `avgRating` memo already
 * used for its live in-sheet stars display, so the number shown when a
 * review is fresh (computed client-side, pre-write) matches the number
 * that ends up persisted.
 */

export interface ParkRatingSummary {
  /** Rounded to 1 decimal, matching the existing `.toFixed(1)` display precision. `null` = no rated reviews yet. */
  ratingAvg: number | null;
  reviewCount: number;
}

/** Minimal shape needed from a review doc — satisfied by both the client
 *  SDK's `UserContribution` and a raw admin-SDK doc snapshot's `data()`. */
export interface RatingSource {
  rating?: number | null;
}

/**
 * `ratingAvg: null` + `reviewCount: 0` means no rated reviews exist for this
 * park yet — render no stars, never a fabricated number. Deliberately does
 * NOT fall back to the legacy `Park.rating` field (a separate, admin-settable
 * field still used by /admin/locations) — this is the organic-review number
 * only.
 */
export function computeParkRatingSummary(reviews: RatingSource[]): ParkRatingSummary {
  const rated = reviews.filter(
    (r): r is { rating: number } => typeof r.rating === 'number' && !Number.isNaN(r.rating),
  );
  if (rated.length === 0) return { ratingAvg: null, reviewCount: 0 };
  const sum = rated.reduce((s, r) => s + r.rating, 0);
  return { ratingAvg: Math.round((sum / rated.length) * 10) / 10, reviewCount: rated.length };
}

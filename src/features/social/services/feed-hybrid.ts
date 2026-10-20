/**
 * feed-hybrid — the per-part data a combined (hybrid) workout's feed post
 * carries, and how points are worked out from it (owner, 20.10.2026: a
 * combined workout counts PER PART — run as run, walk as walk, stations as
 * strength — in the leagues too).
 *
 * One post per workout. Its activityCategory is 'cardio' when there was an
 * aerobic part (so the distance boards, which read cardio posts, get the km),
 * otherwise 'strength'. Its activityCredit is the per-part sum: aerobic
 * minutes × 1 + strength minutes × 2 (same weights as CREDIT_MULTIPLIER).
 *
 * Pure — no Firebase, unit-tested.
 */

export type FeedCreditCategory = 'strength' | 'cardio' | 'maintenance';

/** Stored as `hybridParts` on the post (not a home-v2 detail — never stripped). */
export interface FeedHybridParts {
  runKm: number;
  walkKm: number;
  runMinutes: number;
  walkMinutes: number;
  strengthMinutes: number;
  strengthSets: number;
}

export const FEED_CREDIT_MULTIPLIER: Record<FeedCreditCategory, number> = {
  strength: 2,
  cardio: 1,
  maintenance: 1,
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Points per category for a hybrid post (whole minutes × multiplier). */
export function hybridCreditByCategory(parts: Partial<FeedHybridParts> | null | undefined): { cardio: number; strength: number } {
  const aerobic = Math.round(num(parts?.runMinutes) + num(parts?.walkMinutes));
  const strength = Math.round(num(parts?.strengthMinutes));
  return {
    cardio: aerobic * FEED_CREDIT_MULTIPLIER.cardio,
    strength: strength * FEED_CREDIT_MULTIPLIER.strength,
  };
}

/** The post's activityCredit: per part for a hybrid post, else minutes × multiplier (unchanged). */
export function postActivityCredit(p: {
  activityCategory: FeedCreditCategory;
  durationMinutes: number;
  hybridParts?: Partial<FeedHybridParts> | null;
}): number {
  if (p.hybridParts) {
    const c = hybridCreditByCategory(p.hybridParts);
    return c.cardio + c.strength;
  }
  return p.durationMinutes * (FEED_CREDIT_MULTIPLIER[p.activityCategory] ?? 1);
}

/**
 * A post's points on a board filtered to one category. A hybrid post counts
 * only its part of that category (its cardio minutes on the cardio board);
 * every other post counts its activityCredit, exactly as before.
 */
export function postCreditForCategory(doc: { activityCredit?: unknown; hybridParts?: unknown }, category: string | null): number {
  const total = Number(doc.activityCredit) || 0;
  if (!category || category === 'overall') return total;
  const parts = doc.hybridParts as Partial<FeedHybridParts> | null | undefined;
  if (!parts || typeof parts !== 'object') return total;
  const c = hybridCreditByCategory(parts);
  if (category === 'cardio') return c.cardio;
  if (category === 'strength') return c.strength;
  return 0;
}

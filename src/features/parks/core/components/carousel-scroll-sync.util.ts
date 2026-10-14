/**
 * carousel-scroll-sync — pure geometry + bounded-retry-guard logic extracted
 * from BottomJourneyContainer.tsx (a .tsx file) so it's directly
 * unit-testable without a DOM/render harness (this project has no
 * React-Testing-Library / jsdom precedent — see vitest.config.ts).
 *
 * Fixes the route-marker-click crash (React error #185, confirmed live
 * 12.10.2026): clicking a route's map marker could trip the map error
 * boundary via an unbounded external-focus <-> read-back-refocus cycle
 * between two routes. Root cause: BottomJourneyContainer's carousel has two
 * independent readers of "where should this card sit" — scrollCardToCentre's
 * own target, and findCenteredIndex's read-back of where the container
 * actually ended up. For an interior card they always agree. For an EDGE
 * card (first or last), the geometric center can fall outside what the
 * container can ever actually scroll to — confirmed live: a container with
 * zero scrollable range made EVERY card's raw target unreachable, so
 * scrollTo silently clamped to 0 while the old read-back, computing an
 * unclamped "center" per card, settled on a different (interior) card than
 * the one actually requested — feeding a focus ping-pong that eventually
 * hit React's re-render depth limit.
 *
 * This module holds the two pieces that can be fixed/tested without a DOM:
 *  1. clampedScrollTarget — the ONE shared formula both the scroll-to call
 *     and the read-back must use, so they can't disagree about an edge card.
 *  2. registerCorrection — the mandatory bounded-retry backstop: even if (1)
 *     doesn't eliminate every possible mismatch, this guarantees the
 *     focus-correction cycle can never run away far enough to hit React's
 *     limit again.
 */

export interface ScrollBox {
  scrollWidth: number;
  clientWidth: number;
  offsetWidth: number;
}

export interface CardBox {
  offsetLeft: number;
  offsetWidth: number;
}

/**
 * The target scrollLeft to center `card` inside `container`, clamped to the
 * container's REAL scrollable range [0, maxScrollLeft]. Both the scroll-to
 * call (scrollCardToCentre) and the "which card is centered?" read-back
 * (findCenteredIndex) use this exact formula — if they diverge, an edge
 * card's ideal center (which can fall outside what the container can ever
 * actually reach) lets the two sides permanently disagree about which card
 * is "centered."
 */
export function clampedScrollTarget(
  container: ScrollBox,
  card: CardBox,
  opts: { reverse?: boolean } = {},
): number {
  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  const rawTarget = card.offsetLeft + card.offsetWidth / 2 - container.offsetWidth / 2;
  // A `flex-direction: row-reverse` (LTR) container scrolls in NEGATIVE space: scrollLeft runs from 0
  // (right edge = first card) down to -maxScroll, and the cards' offsetLeft are negative to match. Clamping
  // that to [0, +max] (what #234 did) collapses EVERY card's target to 0 — so the "which card is centered?"
  // read-back always answered card 0 and swiping never changed focus (and a marker-tap scrolled to card 0).
  const lo = opts.reverse ? -maxScroll : 0;
  const hi = opts.reverse ? 0 : maxScroll;
  return Math.min(Math.max(rawTarget, lo), hi);
}

export interface CorrectionPair {
  a: string;
  b: string;
  count: number;
}

export interface CorrectionGuardResult {
  /** false once this pair has corrected back and forth too many times — caller must NOT re-emit. */
  allowed: boolean;
  /** Next call's `prevPair` — thread this back through (e.g. via a ref), do not reconstruct it. */
  pair: CorrectionPair | null;
}

/**
 * Bounded-retry guard (MANDATORY backstop) — call once per PROPOSED
 * correction (fromId -> toId), BEFORE acting on it. Returns allowed:false
 * once the SAME unordered pair of route ids has corrected back and forth
 * more than `maxPerPair` times in a row — the caller is expected to log a
 * warning and skip the re-emit in that case (kept out of this function so
 * it stays pure and directly assertable in tests).
 *
 * Deliberately pure / stateless: `prevPair` is the guard's own state from
 * the previous call, threaded explicitly rather than held in a closure or
 * module-level variable, so a test can drive it through a scripted sequence
 * without any React/DOM setup.
 */
export function registerCorrection(
  prevPair: CorrectionPair | null,
  fromId: string | null,
  toId: string,
  maxPerPair: number,
): CorrectionGuardResult {
  if (!fromId || fromId === toId) {
    return { allowed: true, pair: null };
  }
  const [a, b] = [fromId, toId].sort();
  const existingCount = (prevPair && prevPair.a === a && prevPair.b === b) ? prevPair.count : 0;
  const pair: CorrectionPair = { a, b, count: existingCount + 1 };
  return { allowed: pair.count <= maxPerPair, pair };
}

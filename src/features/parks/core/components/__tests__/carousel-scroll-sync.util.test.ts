import { describe, it, expect } from 'vitest';
import { clampedScrollTarget, registerCorrection, type CorrectionPair } from '../carousel-scroll-sync.util';

/**
 * Regression — the route-marker-click crash (React error #185, confirmed
 * live 12.10.2026): clicking a route's map marker could trip the map error
 * boundary via an unbounded external-focus <-> read-back-refocus cycle
 * between two routes, rooted in an edge card's scroll target being
 * unreachable. See carousel-scroll-sync.util.ts's own header for the full
 * mechanism — these tests cover the two pure pieces of the fix.
 */

describe('clampedScrollTarget — both the scroll-to call and the read-back use this exact formula', () => {
  it('interior card: unchanged from the old unclamped formula (the clamp is a no-op)', () => {
    // Container 1200px wide holding 3×340px cards + gaps — real scroll range exists.
    const container = { scrollWidth: 2400, clientWidth: 1200, offsetWidth: 1200 };
    const card = { offsetLeft: 468, offsetWidth: 340 }; // middle card
    const rawTarget = card.offsetLeft + card.offsetWidth / 2 - container.offsetWidth / 2;
    expect(clampedScrollTarget(container, card)).toBe(rawTarget);
  });

  it('edge card whose ideal center is negative: clamped to 0, not the unreachable negative target', () => {
    const container = { scrollWidth: 2400, clientWidth: 1200, offsetWidth: 1200 };
    const card = { offsetLeft: 0, offsetWidth: 340 }; // last/leftmost card
    const target = clampedScrollTarget(container, card);
    expect(target).toBe(0);
    expect(target).toBeGreaterThanOrEqual(0);
  });

  it('edge card whose ideal center exceeds maxScrollLeft: clamped to maxScrollLeft', () => {
    const container = { scrollWidth: 2400, clientWidth: 1200, offsetWidth: 1200 };
    const maxScrollLeft = container.scrollWidth - container.clientWidth; // 1200
    const card = { offsetLeft: 2060, offsetWidth: 340 }; // first/rightmost card
    expect(clampedScrollTarget(container, card)).toBe(maxScrollLeft);
  });

  it('REGRESSION: zero scrollable range (confirmed live on the crashing build) — every card clamps to 0, never a negative or out-of-range value', () => {
    // The exact live DOM measurement that reproduced the crash:
    // scrollWidth===clientWidth===1200, maxScrollLeft=0.
    const container = { scrollWidth: 1200, clientWidth: 1200, offsetWidth: 1200 };
    const cards = [
      { offsetLeft: 820, offsetWidth: 340 }, // wanted 390 pre-fix
      { offsetLeft: 468, offsetWidth: 340 }, // wanted 38 pre-fix
      { offsetLeft: 116, offsetWidth: 340 }, // wanted -314 pre-fix
    ];
    for (const card of cards) {
      expect(clampedScrollTarget(container, card)).toBe(0);
    }
  });
});

describe('registerCorrection — MANDATORY bounded-retry backstop', () => {
  const MAX_PER_PAIR = 3;

  it('REGRESSION: forces the exact edge-card oscillation (route A <-> route B) and asserts it STOPS instead of looping', () => {
    // Simulates the live failure mode: the echo-guard effect focuses A, the
    // mismatched read-back corrects to B, the echo-guard refocuses A, ad
    // infinitum. Without this guard, nothing in the system bounds this.
    // Seeded with an explicit first focus (not null) so every step below is
    // a real A<->B correction — the null-fromId "nothing to compare against
    // yet" case is covered separately below, not mixed into this count.
    let pair: CorrectionPair | null = null;
    const results: boolean[] = [];
    let current: string = 'routeA';
    const next = (toId: string) => {
      const result = registerCorrection(pair, current, toId, MAX_PER_PAIR);
      pair = result.pair;
      results.push(result.allowed);
      current = toId;
    };

    // B -> A -> B -> A -> B -> A -> B -> A (8 oscillations, all real corrections)
    for (let i = 0; i < 8; i++) {
      next(i % 2 === 0 ? 'routeB' : 'routeA');
    }

    // The first MAX_PER_PAIR corrections for this pair are allowed...
    expect(results.slice(0, MAX_PER_PAIR)).toEqual([true, true, true]);
    // ...and every one after that is refused — the cycle is bounded, not infinite.
    expect(results.slice(MAX_PER_PAIR).every((r) => r === false)).toBe(true);
    // Never un-stuck on its own within this run — stays refused once tripped.
    expect(results[results.length - 1]).toBe(false);
  });

  it('a genuinely different route breaks the cycle and resets the counter', () => {
    let pair: CorrectionPair | null = null;
    const step = (fromId: string | null, toId: string) => {
      const result = registerCorrection(pair, fromId, toId, MAX_PER_PAIR);
      pair = result.pair;
      return result.allowed;
    };

    expect(step(null, 'routeA')).toBe(true);
    expect(step('routeA', 'routeB')).toBe(true);
    expect(step('routeB', 'routeA')).toBe(true);
    expect(step('routeA', 'routeB')).toBe(true);
    // 4th correction for the SAME A<->B pair — now refused.
    expect(step('routeB', 'routeA')).toBe(false);
    // A brand-new pair (B<->C) is unrelated — allowed again, fresh count.
    expect(step('routeB', 'routeC')).toBe(true);
  });

  it('fromId === toId (no actual correction) is always allowed and clears the pair', () => {
    const result = registerCorrection({ a: 'routeA', b: 'routeB', count: 99 }, 'routeX', 'routeX', MAX_PER_PAIR);
    expect(result.allowed).toBe(true);
    expect(result.pair).toBeNull();
  });

  it('fromId === null (first-ever correction, nothing to compare against) is always allowed', () => {
    const result = registerCorrection(null, null, 'routeA', MAX_PER_PAIR);
    expect(result.allowed).toBe(true);
    expect(result.pair).toBeNull();
  });

  it('pair identity is order-independent — A->B and B->A count toward the SAME pair', () => {
    let pair: CorrectionPair | null = null;
    let result = registerCorrection(pair, 'routeA', 'routeB', MAX_PER_PAIR);
    pair = result.pair;
    expect(pair).toEqual({ a: 'routeA', b: 'routeB', count: 1 });

    result = registerCorrection(pair, 'routeB', 'routeA', MAX_PER_PAIR);
    pair = result.pair;
    // Same unordered pair ['routeA','routeB'] — count continues, not reset.
    expect(pair).toEqual({ a: 'routeA', b: 'routeB', count: 2 });
  });
});

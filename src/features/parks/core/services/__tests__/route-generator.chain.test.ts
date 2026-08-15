import { describe, it, expect } from 'vitest';
import { selectNextChainEdge } from '../route-generator.service';

describe('selectNextChainEdge — Phase 2 greedy chain-discovery selection (15.08.2026)', () => {
  it('picks the smallest-gap edge among all visited corridors\' options', () => {
    const edges = new Map([
      ['A', [{ otherRouteId: 'B', gapMeters: 400 }, { otherRouteId: 'C', gapMeters: 150 }]],
    ]);
    const next = selectNextChainEdge(edges, ['A']);
    expect(next).toEqual({ fromRouteId: 'A', toRouteId: 'C', gapMeters: 150 });
  });

  it('ignores edges leading to an already-visited corridor', () => {
    const edges = new Map([
      ['A', [{ otherRouteId: 'B', gapMeters: 50 }]], // B already visited — must be skipped
      ['B', [{ otherRouteId: 'C', gapMeters: 200 }]],
    ]);
    const next = selectNextChainEdge(edges, ['A', 'B']);
    expect(next).toEqual({ fromRouteId: 'B', toRouteId: 'C', gapMeters: 200 });
  });

  it('considers edges from EVERY visited corridor, not just the most recent', () => {
    // Chain so far: A -> B. C is reachable from A (300m) AND from B (100m) —
    // the closer option (via B) must win even though A was visited first.
    const edges = new Map([
      ['A', [{ otherRouteId: 'C', gapMeters: 300 }]],
      ['B', [{ otherRouteId: 'C', gapMeters: 100 }]],
    ]);
    const next = selectNextChainEdge(edges, ['A', 'B']);
    expect(next).toEqual({ fromRouteId: 'B', toRouteId: 'C', gapMeters: 100 });
  });

  it('returns null when no visited corridor has an edge to anything new', () => {
    const edges = new Map([
      ['A', [{ otherRouteId: 'B', gapMeters: 50 }]],
    ]);
    expect(selectNextChainEdge(edges, ['A', 'B'])).toBeNull();
  });

  it('returns null for an empty edge map', () => {
    expect(selectNextChainEdge(new Map(), ['A'])).toBeNull();
  });
});

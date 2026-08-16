import { describe, it, expect } from 'vitest';
import { computeProximityFraction, qualifiesForCorridorFlow } from '../route-generator.service';

describe('computeProximityFraction / qualifiesForCorridorFlow — Stage B proximity-aware selection (16.08.2026)', () => {
  it('6km target with a 1.2km connector qualifies (David\'s own worked example)', () => {
    const f = computeProximityFraction(1200, 6000);
    expect(f).toBeCloseTo(0.4, 5);
    expect(qualifiesForCorridorFlow(1200, 6000)).toBe(true);
  });

  it('3km target with the SAME 1.2km connector does NOT qualify (a different, closer home is needed for a 3km trip)', () => {
    const f = computeProximityFraction(1200, 3000);
    expect(f).toBeCloseTo(0.8, 5);
    expect(qualifiesForCorridorFlow(1200, 3000)).toBe(false);
  });

  it('3km target with a genuinely close ~400m connector qualifies (David\'s confirmed reading of the 3km example)', () => {
    const f = computeProximityFraction(400, 3000);
    expect(f).toBeCloseTo(0.267, 2);
    expect(qualifiesForCorridorFlow(400, 3000)).toBe(true);
  });

  it('exactly at the threshold (f=0.5) qualifies — the rule is <=, not <', () => {
    expect(qualifiesForCorridorFlow(750, 3000)).toBe(true); // f = 1500/3000 = 0.5
  });

  it('just over the threshold does not qualify', () => {
    expect(qualifiesForCorridorFlow(751, 3000)).toBe(false); // f = 1502/3000 = 0.5006...
  });

  it('a zero-distance connector always qualifies (already at the corridor)', () => {
    expect(qualifiesForCorridorFlow(0, 3000)).toBe(true);
    expect(computeProximityFraction(0, 3000)).toBe(0);
  });

  it('targetMeters <= 0 never qualifies (Infinity, not a divide-by-zero crash)', () => {
    expect(computeProximityFraction(500, 0)).toBe(Infinity);
    expect(computeProximityFraction(500, -100)).toBe(Infinity);
    expect(qualifiesForCorridorFlow(500, 0)).toBe(false);
  });

  it('a far corridor relative to target never qualifies regardless of target size', () => {
    expect(qualifiesForCorridorFlow(5000, 3000)).toBe(false); // f = 10000/3000 = 3.33
  });
});

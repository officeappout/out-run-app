import { describe, it, expect } from 'vitest';
import { applyDynamicRepFloor, beginnerRest, restCompressionFloor } from '../rest-reps-rules';

describe('applyDynamicRepFloor', () => {
  it('regular exercise: never under 3 reps; true skill and holds untouched', () => {
    expect(applyDynamicRepFloor(false, false, 1, { min: 1, max: 3 })).toEqual({ reps: 3, repsRange: { min: 3, max: 3 } });
    expect(applyDynamicRepFloor(false, false, 5, { min: 3, max: 6 })).toBeNull();
    expect(applyDynamicRepFloor(true, false, 1, { min: 1, max: 3 })).toBeNull();
    expect(applyDynamicRepFloor(false, true, 1, { min: 1, max: 3 })).toBeNull();
  });
});

describe('beginnerRest', () => {
  it('level ≤5 at/below level: ×0.6, floor 45 s; above-level and level 6+ unchanged', () => {
    expect(beginnerRest(150, 'match', 3)).toBe(90);
    expect(beginnerRest(60, 'flow', 2)).toBe(45);
    expect(beginnerRest(160, 'hard', 3)).toBe(160);
    expect(beginnerRest(150, 'match', 6)).toBe(150);
    expect(beginnerRest(150, 'match', undefined)).toBe(150);
  });
});

describe('restCompressionFloor', () => {
  it('easier work to the session floor, at-level to 90 s, above-level never', () => {
    expect(restCompressionFloor('easy', 60)).toBe(60);
    expect(restCompressionFloor('flow', 40)).toBe(40);
    expect(restCompressionFloor('match', 60)).toBe(90);
    expect(restCompressionFloor('hard', 60)).toBeNull();
    expect(restCompressionFloor('elite', 60)).toBeNull();
    expect(restCompressionFloor('match', 45, 15)).toBe(45); // ≤20-min exception
    expect(restCompressionFloor('match', 75, 45)).toBe(90);
    expect(restCompressionFloor('hard', 45, 15)).toBeNull();
  });
});

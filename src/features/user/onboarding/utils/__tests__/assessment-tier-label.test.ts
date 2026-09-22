import { describe, it, expect } from 'vitest';
import { resolveTierLabel, stepProportion, levelProportion } from '../assessment-tier-label';

describe('resolveTierLabel', () => {
  it('boundaries: just under 1/3 is beginner, exactly 1/3 is intermediate', () => {
    expect(resolveTierLabel(0, false)).toBe('מתחיל');
    expect(resolveTierLabel(1 / 3 - 0.001, false)).toBe('מתחיל');
    expect(resolveTierLabel(1 / 3, false)).toBe('בינוני');
  });

  it('boundaries: just under 2/3 is intermediate, exactly 2/3 is advanced', () => {
    expect(resolveTierLabel(2 / 3 - 0.001, false)).toBe('בינוני');
    expect(resolveTierLabel(2 / 3, false)).toBe('מתקדם');
    expect(resolveTierLabel(1, false)).toBe('מתקדם');
  });

  it('gendered variants for beginner/advanced, בינוני unchanged', () => {
    expect(resolveTierLabel(0, true)).toBe('מתחילה');
    expect(resolveTierLabel(0.5, true)).toBe('בינוני');
    expect(resolveTierLabel(1, true)).toBe('מתקדמת');
  });

  it('out-of-range proportions clamp instead of throwing or misclassifying', () => {
    expect(resolveTierLabel(-5, false)).toBe('מתחיל');
    expect(resolveTierLabel(5, false)).toBe('מתקדם');
    expect(resolveTierLabel(NaN, false)).toBe('מתחיל');
  });
});

describe('stepProportion', () => {
  it('first step is 0, last step is 1, middle steps interpolate', () => {
    expect(stepProportion(0, 7)).toBe(0);
    expect(stepProportion(6, 7)).toBe(1);
    expect(stepProportion(3, 7)).toBeCloseTo(0.5, 5);
  });

  it('single-step list (totalSteps <= 1) never divides by zero', () => {
    expect(stepProportion(0, 1)).toBe(0);
    expect(stepProportion(0, 0)).toBe(0);
  });
});

describe('levelProportion', () => {
  it('interpolates between min and max', () => {
    expect(levelProportion(1, 1, 25)).toBe(0);
    expect(levelProportion(25, 1, 25)).toBe(1);
    expect(levelProportion(13, 1, 25)).toBeCloseTo(0.5, 2);
  });

  it('degenerate range (max <= min) never divides by zero', () => {
    expect(levelProportion(5, 10, 10)).toBe(0);
    expect(levelProportion(5, 10, 5)).toBe(0);
  });
});

describe('integration: coverflow vs degraded modes agree at the same relative position', () => {
  it('the middle step of a 7-step list and the middle level of a 1-25 range both resolve to בינוני', () => {
    const coverflowLabel = resolveTierLabel(stepProportion(3, 7), false);
    const degradedLabel = resolveTierLabel(levelProportion(13, 1, 25), false);
    expect(coverflowLabel).toBe('בינוני');
    expect(degradedLabel).toBe('בינוני');
  });
});

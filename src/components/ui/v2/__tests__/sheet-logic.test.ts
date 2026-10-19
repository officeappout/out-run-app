import { describe, it, expect } from 'vitest';
import {
  shouldDismissSheet,
  DEFAULT_SHEET_DISMISS,
  sheetBottomPadding,
  storyBarState,
  clampProgress,
} from '../logic';
import { SHEET_Z } from '../tokens';

describe('shouldDismissSheet', () => {
  it('closes past the distance or on a fast downward flick', () => {
    expect(shouldDismissSheet(121, 0)).toBe(true);
    expect(shouldDismissSheet(10, 501)).toBe(true);
    expect(shouldDismissSheet(120, 500)).toBe(false);
  });
  it('never closes on upward movement', () => {
    expect(shouldDismissSheet(-300, -2000)).toBe(false);
  });
  it('velocity 0 = distance only (EquipmentFilterSheet rule)', () => {
    expect(shouldDismissSheet(50, 5000, { distance: 120, velocity: 0 })).toBe(false);
    expect(shouldDismissSheet(121, 0, { distance: 120, velocity: 0 })).toBe(true);
  });
  it('custom rule (pick cards: 80 px / 300 px/s)', () => {
    const rule = { distance: 80, velocity: 300 };
    expect(shouldDismissSheet(81, 0, rule)).toBe(true);
    expect(shouldDismissSheet(0, 301, rule)).toBe(true);
    expect(shouldDismissSheet(79, 299, rule)).toBe(false);
  });
  it('treats non-finite input as no movement', () => {
    expect(shouldDismissSheet(NaN, Infinity)).toBe(false);
    expect(DEFAULT_SHEET_DISMISS).toEqual({ distance: 120, velocity: 500 });
  });
});

describe('sheetBottomPadding', () => {
  it('is the safe-area expression only (the keyboard moves the sheet via kb-* classes)', () => {
    expect(sheetBottomPadding('max(1.5rem, env(safe-area-inset-bottom))')).toBe('max(1.5rem, env(safe-area-inset-bottom))');
    expect(sheetBottomPadding(false)).toBeUndefined();
  });
});

describe('SHEET_Z', () => {
  it('only holds values from the documented .cursorrules budget', () => {
    expect(Object.values(SHEET_Z).sort((a, b) => a - b)).toEqual([48, 49, 60, 61, 70, 71, 80, 81, 88, 89, 90, 91, 92, 93, 95, 96, 98, 99, 100, 101, 102, 103, 104, 105, 120, 130, 131, 140, 150, 199, 200, 201, 300, 301]);
  });
});

describe('storyBarState / clampProgress', () => {
  it('done before, current at, upcoming after the index', () => {
    expect([0, 1, 2].map((i) => storyBarState(i, 1))).toEqual(['done', 'current', 'upcoming']);
    expect(storyBarState(2, 3)).toBe('done');
    expect(storyBarState(0, -1)).toBe('upcoming');
  });
  it('clamps progress to 0–1', () => {
    expect(clampProgress(1.4)).toBe(1);
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(NaN)).toBe(0);
    expect(clampProgress(0.3)).toBe(0.3);
  });
});

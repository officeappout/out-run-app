import { describe, it, expect } from 'vitest';
import { resolveEffectiveBoltTime } from '../../logic/bolt-time.utils';

/**
 * Stability fix א׳ (08.07.2026): the custom builder's requested duration is
 * honoured below the bolt ceiling; the dashboard trio (no manual intent)
 * keeps the historical 30/45/60 caps. Regression guard for the
 * "asked 20 min, got 45" bug.
 */
describe('resolveEffectiveBoltTime', () => {
  it('honours a manual builder request below the ceiling', () => {
    expect(resolveEffectiveBoltTime(20, true, 45)).toBe(20);
    expect(resolveEffectiveBoltTime(15, true, 30)).toBe(15);
  });

  it('never exceeds the bolt ceiling, even for manual requests', () => {
    expect(resolveEffectiveBoltTime(90, true, 60)).toBe(60);
    expect(resolveEffectiveBoltTime(45, true, 30)).toBe(30);
  });

  it('keeps the historical caps when there is no manual intent (dashboard trio)', () => {
    expect(resolveEffectiveBoltTime(20, false, 45)).toBe(45);
    expect(resolveEffectiveBoltTime(20, undefined, 45)).toBe(45);
  });

  it('falls back to the cap on missing/invalid requests', () => {
    expect(resolveEffectiveBoltTime(undefined, true, 45)).toBe(45);
    expect(resolveEffectiveBoltTime(0, true, 45)).toBe(45);
    expect(resolveEffectiveBoltTime(-5, true, 45)).toBe(45);
  });
});

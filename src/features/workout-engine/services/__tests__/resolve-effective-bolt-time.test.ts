import { describe, it, expect } from 'vitest';
import { resolveEffectiveBoltTime } from '../../logic/bolt-time.utils';

/**
 * CONTRACT, updated 27.10.2026: the per-bolt ceilings (30/45/60) no longer trim a
 * request. The requested minutes are honoured at every difficulty, automatic or
 * explicit; the cap is only the fallback when nothing valid was requested.
 */
describe('resolveEffectiveBoltTime — the requested duration is honoured in full', () => {
  it('honours a request below the old ceiling', () => {
    expect(resolveEffectiveBoltTime(15, 45)).toBe(15);
    expect(resolveEffectiveBoltTime(20, 30)).toBe(20);
    expect(resolveEffectiveBoltTime(10, 60)).toBe(10);
  });

  it('honours a request ABOVE the old ceiling (automatic and explicit alike)', () => {
    expect(resolveEffectiveBoltTime(90, 60)).toBe(90);
    expect(resolveEffectiveBoltTime(45, 30)).toBe(45);
    expect(resolveEffectiveBoltTime(45, 30, true)).toBe(45);
    expect(resolveEffectiveBoltTime(60, 30)).toBe(60);
  });

  it('the same minutes on every bolt', () => {
    for (const cap of [30, 45, 60]) expect(resolveEffectiveBoltTime(60, cap)).toBe(60);
  });

  it('LAW 11.2 late-night: input 15 → 15 on every bolt', () => {
    for (const cap of [30, 45, 60]) expect(resolveEffectiveBoltTime(15, cap)).toBe(15);
  });

  it('falls back to the cap on missing/invalid requests', () => {
    expect(resolveEffectiveBoltTime(undefined, 45)).toBe(45);
    expect(resolveEffectiveBoltTime(0, 45)).toBe(45);
    expect(resolveEffectiveBoltTime(-5, 45)).toBe(45);
  });
});

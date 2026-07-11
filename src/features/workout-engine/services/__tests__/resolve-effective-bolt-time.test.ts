import { describe, it, expect } from 'vitest';
import { resolveEffectiveBoltTime } from '../../logic/bolt-time.utils';

/**
 * CONTRACT (approved 10.07.2026): availableTime is a HARD user constraint —
 * honored whenever provided (>0), on every path, no flags. The bolt caps
 * {30/45/60} are a ceiling + the default when no time was provided.
 */
describe('resolveEffectiveBoltTime — availableTime is a hard constraint', () => {
  it('honours a provided request below the ceiling (no flag needed)', () => {
    expect(resolveEffectiveBoltTime(15, 45)).toBe(15);
    expect(resolveEffectiveBoltTime(20, 30)).toBe(20);
    expect(resolveEffectiveBoltTime(10, 60)).toBe(10);
  });

  it('never exceeds the bolt ceiling', () => {
    expect(resolveEffectiveBoltTime(90, 60)).toBe(60);
    expect(resolveEffectiveBoltTime(45, 30)).toBe(30);
  });

  it('DASHBOARD PARITY (mandatory guard א׳): input 60 → 30/45/60 bit-identical to the historical caps', () => {
    expect(resolveEffectiveBoltTime(60, 30)).toBe(30); // D1
    expect(resolveEffectiveBoltTime(60, 45)).toBe(45); // D2
    expect(resolveEffectiveBoltTime(60, 60)).toBe(60); // D3
  });

  it('LAW 11.2 late-night: input 15 → 15 on every bolt', () => {
    expect(resolveEffectiveBoltTime(15, 30)).toBe(15);
    expect(resolveEffectiveBoltTime(15, 45)).toBe(15);
    expect(resolveEffectiveBoltTime(15, 60)).toBe(15);
  });

  it('falls back to the cap on missing/invalid requests', () => {
    expect(resolveEffectiveBoltTime(undefined, 45)).toBe(45);
    expect(resolveEffectiveBoltTime(0, 45)).toBe(45);
    expect(resolveEffectiveBoltTime(-5, 45)).toBe(45);
  });
});

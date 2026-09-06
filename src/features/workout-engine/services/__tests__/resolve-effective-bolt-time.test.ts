import { describe, it, expect } from 'vitest';
import { resolveEffectiveBoltTime } from '../../logic/bolt-time.utils';

/**
 * CONTRACT, updated 06.09.2026 (docs/workout-engine/03-CHANGES.md Addendum
 * 15/19, F4; 00-PLAN.md §16): the tests below (no 3rd arg / isExplicitChoice
 * omitted or false) describe the AUTOMATIC-suggestion path — the ceiling
 * still applies there, unchanged since 10.07.2026. `isExplicitChoice=true`
 * (the slider and Custom Builder, both of which set targetDifficulty) is
 * a NEW bypass: the requested duration is delivered in full regardless of
 * difficulty — see the second describe block below.
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

describe('resolveEffectiveBoltTime — isExplicitChoice=true bypasses the ceiling entirely (F4)', () => {
  it('a 45min explicit request is honoured at EVERY bolt cap — the exact case David flagged (45min "easy" delivered as 14min)', () => {
    expect(resolveEffectiveBoltTime(45, 30, true)).toBe(45); // D1 — was capped to 30
    expect(resolveEffectiveBoltTime(45, 45, true)).toBe(45); // D2 — unaffected either way
    expect(resolveEffectiveBoltTime(45, 60, true)).toBe(45); // D3 — unaffected either way
  });

  it('a request ABOVE every cap (60min at D1) is still honoured in full when explicit', () => {
    expect(resolveEffectiveBoltTime(60, 30, true)).toBe(60);
  });

  it('isExplicitChoice=false (default) preserves the old automatic-suggestion ceiling behavior unchanged', () => {
    expect(resolveEffectiveBoltTime(45, 30, false)).toBe(30);
    expect(resolveEffectiveBoltTime(45, 30)).toBe(30); // omitted 3rd arg === false
  });

  it('isExplicitChoice=true with no request at all still falls back to the cap (nothing to honour)', () => {
    expect(resolveEffectiveBoltTime(undefined, 45, true)).toBe(45);
    expect(resolveEffectiveBoltTime(0, 45, true)).toBe(45);
  });
});

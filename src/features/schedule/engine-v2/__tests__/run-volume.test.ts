import { describe, expect, it } from 'vitest';
import { plannedWeeklyRunMinutes, splitRunVolume, type RunPiece } from '../runVolume';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

describe('weekly run volume split (owner 27.10.2026)', () => {
  it('no extra runs: planned minutes unchanged', () => {
    const p: RunPiece[] = [{ slot: 'quality_primary', extra: false }, { slot: 'long_run', extra: false }];
    expect(splitRunVolume(p, plannedWeeklyRunMinutes(p))).toEqual([40, 55]);
  });
  it('over-streak easy runs become short; what they free goes to the long run; the total is kept', () => {
    const p: RunPiece[] = [
      { slot: 'easy_run', extra: true },
      { slot: 'quality_primary', extra: false },
      { slot: 'easy_run', extra: true },
      { slot: 'quality_secondary', extra: false },
      { slot: 'long_run', extra: false },
    ];
    const out = splitRunVolume(p, 195);
    expect(out).toEqual([20, 40, 20, 40, 75]);
    expect(sum(out)).toBe(195);
  });
  it('added running days with no easy minutes: the long run gives up to a quarter, extras stay short', () => {
    const p: RunPiece[] = [
      { slot: 'quality_primary', extra: false },
      { slot: 'long_run', minutes: 80, extra: false },
      { slot: 'easy_run', extra: true },
      { slot: 'easy_run', extra: true },
    ];
    const out = splitRunVolume(p, 120);
    expect(sum(out)).toBe(120);
    expect(out[1]).toBeGreaterThanOrEqual(60);
    expect(out[2]).toBeLessThanOrEqual(20);
    expect(out[3]).toBeLessThanOrEqual(20);
  });
  it('regular easy runs share what the extras leave', () => {
    const p: RunPiece[] = [
      { slot: 'easy_run', minutes: 40, extra: false },
      { slot: 'easy_run', extra: true },
      { slot: 'long_run', extra: false },
    ];
    const out = splitRunVolume(p, 95);
    expect(out).toEqual([20, 20, 55]);
    expect(sum(out)).toBe(95);
  });
});

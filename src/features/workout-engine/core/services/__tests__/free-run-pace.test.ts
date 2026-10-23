/** Covered free runs feed the pace profile ONLY positively (owner 23.10.2026). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PACE_MAP_CONFIG as CONFIG } from '../../config/pace-map-config';
import { computeZones } from '../running-engine.service';
import {
  applyFreeRunPositive,
  freeRunPaceSample,
  summarizeFreeRun,
} from '../pace-self-correction.service';
import type { PaceProfile, QualityWorkoutRecord } from '../../types/running.types';

const NOW = new Date('2026-10-23T08:00:00');
const profile = (over: Partial<PaceProfile> = {}): PaceProfile => ({
  basePace: 300, profileType: 1, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null, ...over,
});
const easy = computeZones(300, 1, CONFIG).easy;
const session = { activeSeconds: 1500, wallSeconds: 1600, hadGoodGpsFix: true, isSimulated: false };

describe('freeRunPaceSample (player guards)', () => {
  it('a real 25-min run gives its pace', () => expect(freeRunPaceSample(1500, 5, session)).toEqual({ secPerKm: 300 }));
  it('no GPS fix / simulator / mostly paused / under 10 min → null', () => {
    expect(freeRunPaceSample(1500, 5, { ...session, hadGoodGpsFix: false })).toBeNull();
    expect(freeRunPaceSample(1500, 5, { ...session, isSimulated: true })).toBeNull();
    expect(freeRunPaceSample(1500, 5, { ...session, wallSeconds: 4000 })).toBeNull();
    expect(freeRunPaceSample(500, 2, session)).toBeNull();
  });
});

describe('summarizeFreeRun', () => {
  it('faster than the easy targets → ok, easy zone', () => {
    const r = summarizeFreeRun(easy.minPace - 5, profile(), CONFIG);
    expect(r).toMatchObject({ ok: true, targetZone: 'easy' });
  });
  it('inside or slower than the easy targets → not recorded (a free run never argues for slower targets)', () => {
    expect(summarizeFreeRun(Math.round((easy.minPace + easy.maxPace) / 2), profile(), CONFIG).ok).toBe(false);
    expect(summarizeFreeRun(easy.maxPace + 60, profile(), CONFIG).ok).toBe(false);
  });
  it('implausibly fast (GPS artefact) → not recorded', () => {
    expect(summarizeFreeRun(120, profile(), CONFIG)).toEqual({ ok: false, reason: 'implausible_pace' });
  });
});

describe('applyFreeRunPositive', () => {
  const ok = { ok: true as const, avgPaceSecPerKm: easy.minPace - 10, targetZone: 'easy' as const, qualitySeconds: 0, qualityMeters: 0 };
  const slow = (i: number): QualityWorkoutRecord => ({
    workoutId: `w${i}`, date: `2026-10-${10 + i}T08:00:00.000Z`, qualityExerciseAvgPace: 400, targetZone: 'tempo',
    performanceZone: 'below_low', impactOnBasePaceSeconds: 0,
  });

  it('records the run; a self-correction that would slow the targets is dropped', () => {
    // Two slow planned records already in the window: the 3rd (this free run) would trigger a penalty.
    const p = profile({ qualityWorkoutsHistory: [slow(1), slow(2)], qualityWorkoutCount: 2 });
    const res = applyFreeRunPositive(p, 'free1', ok, CONFIG, NOW);
    expect(res.applied).toBe(true);
    if (!res.applied) return;
    expect(res.updatedProfile.basePace).toBe(300);
    expect(res.updatedProfile.qualityWorkoutCount).toBe(3);
  });

  it('a window of fast runs may make the targets faster', () => {
    const fast = (i: number): QualityWorkoutRecord => ({ ...slow(i), qualityExerciseAvgPace: easy.minPace - 15, targetZone: 'easy', performanceZone: 'above_high' });
    const p = profile({ qualityWorkoutsHistory: [fast(1), fast(2)], qualityWorkoutCount: 2 });
    const res = applyFreeRunPositive(p, 'free1', ok, CONFIG, NOW);
    expect(res.applied && res.updatedProfile.basePace).toBeLessThan(300);
  });

  it('keeps the one-per-day cap', () => {
    const p = profile({ qualityWorkoutsHistory: [{ ...slow(1), date: NOW.toISOString() }], qualityWorkoutCount: 1 });
    expect(applyFreeRunPositive(p, 'free1', ok, CONFIG, NOW)).toEqual({ applied: false, reason: 'already_recorded_today' });
  });
});

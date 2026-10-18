import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  applyQualityRun,
  normalizePaceProfile,
  summarizeQualityRun,
  MAX_HISTORY_RECORDS,
  type PlannedBlockResult,
  type QualityRunSession,
} from '../pace-self-correction.service';
import { computeZones, processSelfCorrection } from '../running-engine.service';
import { DEFAULT_PACE_MAP_CONFIG as CONFIG } from '../../config/pace-map-config';
import type { PaceProfile, QualityWorkoutRecord } from '../../types/running.types';
import type { RunWorkout } from '../../../players/running/types/run-workout.type';
import { basePaceDaysAgo, selectRacePrediction } from '@/features/home/utils/race-prediction';

const PROFILE: PaceProfile = {
  basePace: 300, profileType: 1, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null,
};
const GOOD_SESSION: QualityRunSession = { activeSeconds: 1800, wallSeconds: 1900, hadGoodGpsFix: true, isSimulated: false };
const TEMPO = computeZones(300, 1, CONFIG).tempo; // 315–335 s/km

// warmup | tempo 600 s | rest | tempo 600 s | cooldown
const WORKOUT: RunWorkout = {
  id: 'tempo_2x10_w3',
  title: 'טמפו',
  isQualityWorkout: true,
  blocks: [
    { id: 'w', type: 'warmup', label: 'w', colorHex: '#000', durationSeconds: 600, isQualityExercise: false, zoneType: 'easy' },
    { id: 't1', type: 'run', label: 't1', colorHex: '#000', durationSeconds: 600, isQualityExercise: true, zoneType: 'tempo', blockMode: 'pace' },
    { id: 'r', type: 'recovery', label: 'r', colorHex: '#000', durationSeconds: 120, isQualityExercise: false, _isSynthesizedRest: true },
    { id: 't2', type: 'run', label: 't2', colorHex: '#000', durationSeconds: 600, isQualityExercise: true, zoneType: 'tempo', blockMode: 'pace' },
    { id: 'c', type: 'cooldown', label: 'c', colorHex: '#000', durationSeconds: 300, isQualityExercise: false, zoneType: 'easy' },
  ],
};
/** Tempo blocks at `pace` s/km. */
const results = (pace: number): PlannedBlockResult[] => [
  { blockIndex: 0, elapsedSeconds: 600, elapsedMeters: 1500 },
  { blockIndex: 1, elapsedSeconds: 600, elapsedMeters: (600 / pace) * 1000 },
  { blockIndex: 2, elapsedSeconds: 120, elapsedMeters: 100 },
  { blockIndex: 3, elapsedSeconds: 600, elapsedMeters: (600 / pace) * 1000 },
  { blockIndex: 4, elapsedSeconds: 300, elapsedMeters: 700 },
];

describe('summarizeQualityRun', () => {
  it('averages only the quality blocks of the run', () => {
    const s = summarizeQualityRun(WORKOUT, results(325), GOOD_SESSION, PROFILE, CONFIG);
    expect(s).toMatchObject({ ok: true, avgPaceSecPerKm: 325, targetZone: 'tempo', qualitySeconds: 1200 });
  });

  it.each([
    ['not a quality workout', { ...WORKOUT, isQualityWorkout: false }, GOOD_SESSION, 'not_quality_workout'],
    ['dev simulator', WORKOUT, { ...GOOD_SESSION, isSimulated: true }, 'simulated'],
    ['never a good GPS fix', WORKOUT, { ...GOOD_SESSION, hadGoodGpsFix: false }, 'no_good_gps'],
    ['paused most of the time', WORKOUT, { ...GOOD_SESSION, activeSeconds: 900, wallSeconds: 2000 }, 'mostly_paused'],
  ] as const)('ignores: %s', (_n, w, session, reason) => {
    expect(summarizeQualityRun(w as RunWorkout, results(325), session, PROFILE, CONFIG)).toEqual({ ok: false, reason });
  });

  it('ignores a run with too little quality running (blocks skipped early)', () => {
    const r = results(325).map((x) => (x.blockIndex === 1 || x.blockIndex === 3 ? { ...x, elapsedSeconds: 200, elapsedMeters: 615 } : x));
    expect(summarizeQualityRun(WORKOUT, r, GOOD_SESSION, PROFILE, CONFIG)).toEqual({ ok: false, reason: 'too_little_quality_running' });
  });

  it('ignores a GPS-artefact pace far outside the zone', () => {
    expect(summarizeQualityRun(WORKOUT, results(200), GOOD_SESSION, PROFILE, CONFIG)).toEqual({ ok: false, reason: 'implausible_pace' });
    expect(summarizeQualityRun(WORKOUT, results(500), GOOD_SESSION, PROFILE, CONFIG)).toEqual({ ok: false, reason: 'implausible_pace' });
  });

  it('a block jumped back to is counted once', () => {
    const r = [...results(325), { blockIndex: 1, elapsedSeconds: 600, elapsedMeters: 100 }];
    expect(summarizeQualityRun(WORKOUT, r, GOOD_SESSION, PROFILE, CONFIG)).toMatchObject({ ok: true, avgPaceSecPerKm: 325 });
  });
});

describe('applyQualityRun', () => {
  const day = (d: number) => new Date(2026, 9, d, 18, 0, 0);
  const summary = (pace: number) => {
    const s = summarizeQualityRun(WORKOUT, results(pace), GOOD_SESSION, PROFILE, CONFIG);
    if (!s.ok) throw new Error(s.reason);
    return s;
  };

  it('records a dated run; basePace waits for the 3rd quality run', () => {
    const r = applyQualityRun(PROFILE, WORKOUT.id, summary(318), CONFIG, day(1));
    expect(r.applied).toBe(true);
    if (!r.applied) return;
    expect(r.updatedProfile.basePace).toBe(300);
    expect(r.updatedProfile.qualityWorkoutCount).toBe(1);
    expect(r.updatedProfile.qualityWorkoutsHistory[0]).toMatchObject({
      workoutId: WORKOUT.id, date: day(1).toISOString(), qualityExerciseAvgPace: 318, targetZone: 'tempo', performanceZone: 'high',
    });
  });

  it('at most one recorded run per calendar day', () => {
    const r1 = applyQualityRun(PROFILE, WORKOUT.id, summary(318), CONFIG, day(1));
    if (!r1.applied) throw new Error();
    const r2 = applyQualityRun(r1.updatedProfile, WORKOUT.id, summary(318), CONFIG, new Date(2026, 9, 1, 21, 0, 0));
    expect(r2).toEqual({ applied: false, reason: 'already_recorded_today' });
  });

  it('3 runs in the fast 20 % of the zone → basePace −1.5 % (round 5), impacts dated, trend appears', () => {
    let p = PROFILE;
    for (const d of [1, 3, 5]) {
      const r = applyQualityRun(p, WORKOUT.id, summary(318), CONFIG, day(d));
      if (!r.applied) throw new Error(r.reason);
      p = r.updatedProfile;
    }
    expect(p.basePace).toBe(295);
    expect(p.qualityWorkoutCount).toBe(3);
    expect(p.lastSelfCorrectionDate).toBe(day(5).toISOString());
    const impacts = p.qualityWorkoutsHistory.map((h) => h.impactOnBasePaceSeconds);
    expect(impacts.reduce((a, b) => a + b, 0)).toBeCloseTo(-5, 9);

    expect(basePaceDaysAgo(p.basePace, p.qualityWorkoutsHistory, day(10))).toBeCloseTo(300, 9);
    const v = selectRacePrediction({
      basePace: p.basePace, targetDistance: '5k', history: p.qualityWorkoutsHistory,
      isRunner: true, runningProgramsEnabled: true, now: day(10),
    });
    expect(v.state === 'ready' && v.basedOnRuns).toBe(true);
    expect(v.state === 'ready' && v.trendSeconds).toBe(-25); // 5 s/km × 5 km faster
  });

  it('mid-zone runs leave basePace alone', () => {
    let p = PROFILE;
    for (const d of [1, 2, 3]) {
      const r = applyQualityRun(p, WORKOUT.id, summary(325), CONFIG, day(d));
      if (!r.applied) throw new Error(r.reason);
      p = r.updatedProfile;
    }
    expect(p.basePace).toBe(300);
    expect(p.lastSelfCorrectionDate).toBeNull();
  });

  it('trims stored history to the newest records, count keeps the total', () => {
    const old: QualityWorkoutRecord[] = Array.from({ length: MAX_HISTORY_RECORDS }, (_, i) => ({
      workoutId: `w${i}`, date: new Date(2026, 0, 1 + i).toISOString(), qualityExerciseAvgPace: 325,
      targetZone: 'tempo', performanceZone: 'mid', impactOnBasePaceSeconds: 0,
    }));
    const r = applyQualityRun({ ...PROFILE, qualityWorkoutsHistory: old, qualityWorkoutCount: 61 }, 'x', summary(325), CONFIG, day(1));
    if (!r.applied) throw new Error();
    expect(r.updatedProfile.qualityWorkoutsHistory).toHaveLength(MAX_HISTORY_RECORDS);
    expect(r.updatedProfile.qualityWorkoutsHistory.at(-1)?.workoutId).toBe('x');
    expect(r.updatedProfile.qualityWorkoutCount).toBe(62);
  });
});

describe('processSelfCorrection — snap branches in basePace terms', () => {
  const rec = (pace: number, zone: QualityWorkoutRecord['targetZone'] = 'tempo'): QualityWorkoutRecord => ({
    workoutId: 'w', date: '2026-10-01T00:00:00Z', qualityExerciseAvgPace: pace, targetZone: zone,
    performanceZone: 'mid', impactOnBasePaceSeconds: 0,
  });

  it('faster than the tempo zone makes basePace FASTER (it used to snap to the tempo pace = slower)', () => {
    expect(TEMPO.minPace).toBe(315);
    const r = processSelfCorrection([rec(305), rec(305), rec(305)], 300, CONFIG, 1);
    expect(r.aggregatePerformanceZone).toBe('above_high');
    expect(r.newBasePace).toBeLessThanOrEqual(295);
    // 305 / 1.085 (tempo mid ratio) × 0.985 ≈ 277 → 275
    expect(r.newBasePace).toBe(275);
  });

  it('slower than the zone makes basePace slower, at least by the 1.5 % step', () => {
    const r = processSelfCorrection([rec(345), rec(345), rec(345)], 300, CONFIG, 1);
    expect(r.aggregatePerformanceZone).toBe('below_low');
    expect(r.newBasePace).toBeGreaterThanOrEqual(305);
  });

  it('a mixed-zone window is compared on one scale', () => {
    // interval_short mid ≈ 95 % → 285 s/km is exactly "on basePace"
    const r = processSelfCorrection([rec(285, 'interval_short'), rec(325), rec(325)], 300, CONFIG, 1);
    expect(r.aggregatePerformanceZone).toBe('mid');
    expect(r.newBasePace).toBe(300);
  });
});

describe('normalizePaceProfile', () => {
  it('fills legacy gaps, rejects missing basePace', () => {
    expect(normalizePaceProfile({ basePace: 330 })).toEqual({
      basePace: 330, profileType: 2, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null,
    });
    expect(normalizePaceProfile({ basePace: 0 })).toBeNull();
    expect(normalizePaceProfile(undefined)).toBeNull();
  });
});

describe('wiring (source) — useRunningPlayer', () => {
  const src = readFileSync(fileURLToPath(new URL('../../../players/running/store/useRunningPlayer.ts', import.meta.url)), 'utf8');
  it('advanceBlock and jumpToBlock record the block being left', () => {
    expect(src.match(/plannedBlockResults: \[\.\.\.get\(\)\.plannedBlockResults, currentBlockResult\(get\(\)\)\]/g)).toHaveLength(2);
  });
  it('finishWorkout snapshots before stopGPSTracking and writes only after a successful save', () => {
    const snapAt = src.indexOf('const plannedRunSnapshot =');
    const stopAt = src.indexOf('stopGPSTracking();', snapAt);
    expect(snapAt).toBeGreaterThan(0);
    expect(stopAt).toBeGreaterThan(snapAt);
    expect(src).toContain('if (workoutSaved && plannedRunSnapshot) {');
    expect(src).toContain("if (st.runMode !== 'plan' || !st.currentWorkout || isCommute || activityType === 'walking') return null;");
  });
});

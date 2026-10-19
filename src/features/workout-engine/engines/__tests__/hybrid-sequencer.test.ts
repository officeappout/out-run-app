import { describe, it, expect } from 'vitest';
import type { HybridPlannedSegment } from '@/features/workout-engine/hybrid/compose-hybrid-session.service';
import { initSequencer, reduceSequencer, reduceSequencerAll } from '../hybrid/hybrid-sequencer';
import { sequencerView, legResults, finalizeSequencer } from '../hybrid/sequencer.selectors';
import { arrivalConfigFor, initArrival, stepArrival } from '../hybrid/arrival-detector';
import { sequencerStrip } from '../hybrid/sequencer.strip';
import { toCartItems } from '../strip-item';
import { hybridIntensityProfile, timedIntensityProfile } from '../intensity-profile';
import { hybridRings, hybridStationTables } from '@/features/workout-engine/summary/v2-summary.mapping';
import type { SequencerState } from '../hybrid/sequencer.types';

const PARK = { lat: 31.5, lng: 34.6 };
// ~1 m of latitude ≈ 1/111_320 deg
const north = (m: number) => ({ lat: PARK.lat + m / 111_320, lng: PARK.lng, accuracyM: 8 });

const content = {
  exercises: [
    { exercise: { id: 'pull' }, sets: 2, reps: 6, repsRange: { min: 5, max: 8 } },
    { exercise: { id: 'dip' }, sets: 2, reps: 8 },
  ],
  totalPlannedSets: 4,
  estimatedDurationSec: 540,
} as unknown as HybridPlannedSegment['content'];

const plan = (withCoords = true): HybridPlannedSegment[] => [
  { index: 0, kind: 'aerobic', aerobicType: 'running', zone: 'easy', distanceKm: 2, durationSec: 720, fromKm: 0, toKm: 2, estCalories: 0 },
  { index: 1, kind: 'strength', parkId: 'p1', content, estCalories: 0, ...(withCoords ? PARK : {}) },
  { index: 2, kind: 'aerobic', aerobicType: 'running', zone: 'recovery', distanceKm: 0.3, durationSec: 120, fromKm: 2, toKm: 2.3, estCalories: 0 },
];

const T0 = 5_000_000;
const tick = (s: SequencerState, sec: number, km: number, fix?: ReturnType<typeof north>) =>
  reduceSequencer(s, { type: 'RUN_TICK', atMs: T0 + sec * 1000, cumulativeKm: km, elapsedSec: sec, fix });

describe('arrival detector', () => {
  const cfg = arrivalConfigFor('running');
  it('needs arming outside the exit radius (park at the start never auto-arrives)', () => {
    let a = initArrival();
    for (let i = 0; i < 5; i++) a = stepArrival(a, 10, 5, cfg);
    expect(a.arrived).toBe(false);
  });
  it('hysteresis: jitter between enter and exit keeps the dwell; one fix is not enough', () => {
    let a = stepArrival(initArrival(), 300, 5, cfg);
    a = stepArrival(a, 35, 5, cfg);
    expect(a.arrived).toBe(false);
    a = stepArrival(a, 55, 5, cfg); // inside the exit radius → still inside
    expect(a.arrived).toBe(true);
  });
  it('a fix between enter and exit does not enter; inaccurate fixes are ignored', () => {
    let a = stepArrival(initArrival(), 300, 5, cfg);
    a = stepArrival(a, 55, 5, cfg);
    expect(a.inside).toBe(false);
    a = stepArrival(a, 10, 200, cfg);
    a = stepArrival(a, 10, 200, cfg);
    expect(a.arrived).toBe(false);
    expect(a.distanceM).toBe(10);
  });
});

describe('hybrid sequencer', () => {
  it('run → geofence arrival → transition auto-start → sets → cool-down → done', () => {
    let s = reduceSequencer(initSequencer(plan()), { type: 'START', atMs: T0 });
    expect(s.phase).toBe('run');
    s = tick(s, 300, 0.9, north(1100));
    expect(sequencerView(s, T0).distanceToStationM).toBeGreaterThan(1000);
    s = tick(s, 700, 1.95, north(30));
    expect(s.phase).toBe('run');
    s = tick(s, 705, 1.97, north(20));
    expect(s.phase).toBe('transition');
    expect(sequencerView(s, T0 + 715_000).transitionRemainingMs).toBe(10_000);
    s = reduceSequencer(s, { type: 'EXTEND_TRANSITION', atMs: T0 + 710_000 });
    s = reduceSequencer(s, { type: 'TICK', atMs: T0 + 900_000 }); // late tick (background)
    expect(s.phase).toBe('station');
    expect(s.inner.currentStartMs).toBe(T0 + 745_000);
    s = reduceSequencerAll(s, [
      { type: 'SET_DONE', atMs: T0 + 950_000, exerciseId: 'pull', exerciseName: 'מתח', reps: 6 },
      { type: 'SET_DONE', atMs: T0 + 1_000_000, exerciseId: 'pull', exerciseName: 'מתח', reps: 4, edited: true },
      { type: 'SET_DONE', atMs: T0 + 1_050_000, exerciseId: 'dip', exerciseName: 'מקבילים', reps: 8 },
      { type: 'STATION_DONE', atMs: T0 + 1_245_000 },
    ]);
    expect(s.phase).toBe('cooldown');
    expect(sequencerStrip(s).doneCount).toBe(4); // run + 3 sets
    s = tick(s, 780, 2.25);
    expect(sequencerView(s, 0).leg).toMatchObject({ coveredM: 280, showPace: false, avgPaceSecPerKm: null });
    s = reduceSequencer(s, { type: 'FINISH', atMs: T0 + 1_400_000, cumulativeKm: 2.29, elapsedSec: 800 });
    expect(s.phase).toBe('done');

    const legs = legResults(s);
    expect(legs[0]).toMatchObject({ kind: 'run', status: 'done', distanceM: 1970, paceSecPerKm: 358 });
    expect(legs[1]).toMatchObject({ kind: 'station', status: 'done', durationSec: 500, transitionSec: 40, arrivedBy: 'geofence', sets: 3 });
    expect(legs[2]).toMatchObject({ kind: 'cooldown', distanceM: 320, paceSecPerKm: null });

    const fin = finalizeSequencer(s);
    expect(fin.summary.bothHalvesCompleted).toBe(true);
    const tables = hybridStationTables(fin.segments);
    expect(tables[0].rows[0].tiles.map((t) => t.tone)).toEqual(['in', 'below']);
    expect(tables[0].rows[0].subtitle).toBe('יעד 5–8 חזרות');
    expect(hybridRings(fin).find((r) => r.key === 'sets')?.value).toBe('3/4');
  });

  it('manual "הגעתי" works without GPS; skip from the transition records a skipped station', () => {
    let s = reduceSequencer(initSequencer(plan()), { type: 'START', atMs: T0 });
    s = tick(s, 60, 0.2);
    expect(sequencerView(s, T0).canArriveManually).toBe(true);
    s = reduceSequencer(s, { type: 'ARRIVE_MANUAL', atMs: T0 + 61_000 });
    expect(s.phase).toBe('transition');
    s = reduceSequencer(s, { type: 'SKIP_STATION', atMs: T0 + 65_000 });
    expect(s.phase).toBe('cooldown');
    const legs = legResults(s);
    expect(legs[1]).toMatchObject({ status: 'skipped', arrivedBy: 'manual', durationSec: 0, transitionSec: 4 });
  });

  it('no coordinates → route-km threshold; pause holds the countdown', () => {
    let s = reduceSequencer(initSequencer(plan(false)), { type: 'START', atMs: T0 });
    s = tick(s, 700, 2.01);
    expect(s.phase).toBe('transition');
    s = reduceSequencer(s, { type: 'PAUSE', atMs: T0 + 705_000 });
    s = reduceSequencer(s, { type: 'TICK', atMs: T0 + 800_000 });
    expect(s.phase).toBe('transition');
    s = reduceSequencer(s, { type: 'RESUME', atMs: T0 + 800_000 });
    expect(sequencerView(s, T0 + 800_000).transitionRemainingMs).toBe(15_000);
  });

  it('finish inside a station keeps the logged sets', () => {
    let s = reduceSequencer(initSequencer(plan(), { transitionSec: 0 }), { type: 'START', atMs: T0 });
    s = reduceSequencer(s, { type: 'ARRIVE_MANUAL', atMs: T0 + 1000 });
    expect(s.phase).toBe('station');
    s = reduceSequencer(s, { type: 'SET_DONE', atMs: T0 + 2000, exerciseId: 'dip', reps: 8 });
    s = reduceSequencer(s, { type: 'FINISH', atMs: T0 + 3000 });
    expect(s.phase).toBe('done');
    expect(legResults(s)[1]).toMatchObject({ status: 'done', sets: 1 });
    expect(legResults(s)[2].status).toBe('not_reached');
  });

  it('strip and intensity profile from the plan', () => {
    const s = initSequencer(plan());
    expect(toCartItems(sequencerStrip(s))).toHaveLength(6); // run + 4 sets + run
    const prof = hybridIntensityProfile(plan());
    expect(prof.map((p) => [p.kind, p.level])).toEqual([['run', 'moderate'], ['transition', 'rest'], ['station', 'moderate'], ['run', 'low']]);
    expect(prof.reduce((a, p) => a + p.share, 0)).toBeCloseTo(1);
    const tab = timedIntensityProfile({ format: 'tabata', config: { workSec: 20, restSec: 10, rounds: 8 }, items: [{ kind: 'exercise', key: 'a', name: 'a' }] });
    expect(tab).toHaveLength(15);
  });
});

describe('preview strips (JourneyStrip / ProfileStrip props)', () => {
  it('maps the hybrid plan and a timed block', async () => {
    const { hybridJourneyItems, hybridProfileStrip, timedJourneyItem, timedProfileStrip } = await import('../preview-strips');
    expect(hybridJourneyItems(plan()).map((i) => i.kind)).toEqual(['aerobic', 'strength', 'aerobic']);
    const prof = hybridProfileStrip(plan());
    expect(prof[0]).toMatchObject({ color: '#84cc16', flex: 12, height: 65 });
    const amrap = { format: 'amrap' as const, config: { capSec: 600, roundItems: [] }, items: [{ kind: 'aerobic_leg' as const, key: 'run-1', name: 'ריצה', distanceM: 300 }] };
    expect(timedJourneyItem(amrap)).toEqual({ key: 'amrap', kind: 'repeat', subtype: 'running', label: 'AMRAP 10′' });
    expect(timedProfileStrip(amrap)).toHaveLength(1);
  });
});

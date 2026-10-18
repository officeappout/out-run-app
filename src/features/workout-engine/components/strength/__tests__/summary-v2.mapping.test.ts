import { describe, it, expect } from 'vitest';
import { buildPhaseSummary, type PlanSegment, type RawLogEntry } from '../utils/phase-summary';
import {
  exerciseRows,
  heroSetGroups,
  improvementItems,
  setTiles,
  stationRows,
  targetLabel,
} from '../utils/summary-v2.mapping';

const log = (exerciseId: string, segmentId: string, reps: number[], targetReps = reps[0] ?? 0): RawLogEntry => ({
  exerciseId,
  exerciseName: exerciseId,
  segmentId,
  confirmedReps: reps,
  targetReps,
});

const segments: PlanSegment[] = [
  {
    id: 'seg-main-1',
    title: 'סופרסט 1',
    exercises: [
      { id: 'pullup', name: 'מתח', reps: '8', sets: 3, imageUrl: 'https://x/pullup.jpg' },
      { id: 'plank', name: 'פלאנק', duration: '90', exerciseType: 'time', sets: 1 },
      { id: 'dip', name: 'מקבילים', reps: '10', sets: 2 },
      { id: 'pyr', name: 'פירמידה', sets: 3, repsSequence: [6, 8, 10] },
    ],
  },
];

const phases = buildPhaseSummary({
  completedExercises: [],
  rawLog: [
    log('pullup', 'seg-main-1', [8, 7, 9], 8),
    log('plank', 'seg-main-1', [95]),
    log('pyr', 'seg-main-1', [6, 8, 10]),
  ],
  segments,
  previousSets: { pullup: [7, 7, 6], plank: [100] },
});
const [pullup, plank, dip, pyr] = phases[0].blocks[0].exercises;

describe('setTiles', () => {
  it('in / below / missed with the performed value', () => {
    expect(setTiles(pullup)).toEqual([
      { value: '8', tone: 'in' },
      { value: '7', tone: 'below' },
      { value: '9', tone: 'in' },
    ]);
  });
  it('seconds print as m:ss', () => {
    expect(setTiles(plank)).toEqual([{ value: '1:35', tone: 'in' }]);
  });
  it('a planned exercise that was never done ⇒ dashed tiles', () => {
    expect(setTiles(dip)).toEqual([
      { value: '–', tone: 'missed' },
      { value: '–', tone: 'missed' },
    ]);
  });
});

describe('targetLabel', () => {
  it('single target, range, timed, skipped', () => {
    expect(targetLabel(pullup)).toBe('יעד 8 חזרות');
    expect(targetLabel(pyr)).toBe('יעד 6–10 חזרות');
    expect(targetLabel(plank)).toBe('יעד 90 שנ׳');
    expect(targetLabel(dip)).toBe('לא בוצע');
  });
});

describe('exerciseRows', () => {
  it('carries the plan image and mutes skipped rows', () => {
    const rows = exerciseRows([pullup, dip]);
    expect(rows[0].imageUrl).toBe('https://x/pullup.jpg');
    expect(rows[0].muted).toBe(false);
    expect(rows[1].imageUrl).toBeUndefined();
    expect(rows[1].muted).toBe(true);
  });
});

describe('heroSetGroups', () => {
  it('one group per exercise, one tone per planned set', () => {
    expect(heroSetGroups(phases).map((g) => g.map((t) => t.tone))).toEqual([
      ['in', 'below', 'in'],
      ['in'],
      ['missed', 'missed'],
      ['in', 'in', 'in'],
    ]);
  });
});

describe('improvementItems', () => {
  it('only exercises that beat their previous best set', () => {
    expect(improvementItems(phases)).toEqual([
      { key: 'seg-main-1:pullup', name: 'pullup', imageUrl: 'https://x/pullup.jpg', previous: '7', today: '9', delta: 2, unit: 'reps' },
    ]);
  });
  it('no previous data ⇒ nothing', () => {
    const p = buildPhaseSummary({ completedExercises: [], rawLog: [log('pullup', 'seg-main-1', [9])], segments });
    expect(improvementItems(p)).toEqual([]);
  });
});

describe('stationRows (hybrid exerciseLog)', () => {
  it('uses the prescribed range minimum as the in-target bar', () => {
    const rows = stationRows([
      { exerciseId: 'pu', exerciseName: 'מתח רחב', confirmedReps: [7, 5], targetReps: 8, prescribedRange: { min: 6, max: 8 } },
      { exerciseId: 'sq', exerciseName: 'סקוואט', confirmedReps: [10, 9], targetReps: 10 },
      { exerciseId: 'pl', exerciseName: 'פלאנק', confirmedReps: [30], targetReps: 30, repsSource: ['timer'] },
      { exerciseId: 'dp', exerciseName: 'מקבילים', confirmedReps: [], targetReps: 8 },
    ]);
    expect(rows[0].subtitle).toBe('יעד 6–8 חזרות');
    expect(rows[0].tiles.map((t) => t.tone)).toEqual(['in', 'below']);
    expect(rows[1].subtitle).toBe('יעד 10 חזרות');
    expect(rows[1].tiles.map((t) => t.tone)).toEqual(['in', 'below']);
    expect(rows[2].subtitle).toBe('יעד 30 שנ׳');
    expect(rows[3]).toMatchObject({ subtitle: 'לא בוצע', muted: true, tiles: [{ value: '–', tone: 'missed' }] });
  });
});

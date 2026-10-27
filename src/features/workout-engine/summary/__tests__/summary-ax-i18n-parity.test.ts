/**
 * i18n wave 2 batch ax (namespace `summary`): the v2 summary mappings (v2-summary.mapping, run-type.mapping)
 * move their labels to src/messages/he/summary.json. These file snapshots were recorded from the mappings
 * BEFORE the extraction (unmodified main); the extracted mappings must return the same labels, rows and
 * sublines for every fixture below.
 */
import { describe, expect, it } from 'vitest';
import type { PlannedBlockRecord, RunSummaryMeta, SessionSegmentRecord } from '@/features/workout-engine/core/services/storage.service';
import { aerobicRings, hybridRings, hybridStationTables, repTableModel, rideRings } from '../v2-summary.mapping';
import { courseItems, kmSplitModel, runHero, runPlanProgress, runTypeModel, runTypeRings } from '../run-type/run-type.mapping';

const snap = (name: string) => `./__snapshots__/summary-ax-i18n/${name}.json`;
const json = (v: unknown) => `${JSON.stringify(v, null, 1)}\n`;

const rep = (n: number, pace: number, inRange: boolean, extra: Partial<PlannedBlockRecord> = {}): PlannedBlockRecord => ({
  blockIndex: n * 2,
  rep: n,
  label: 'Rep',
  plannedDistanceMeters: 400,
  distanceMeters: 400,
  durationSeconds: Math.round(pace * 0.4),
  targetMinPaceSec: 285,
  targetMaxPaceSec: 295,
  avgPaceSec: pace,
  inRange,
  paceDeltaSec: inRange ? 0 : pace - 295,
  ...extra,
});
const reps = [rep(1, 288, true), rep(2, 292, true), rep(3, 298, false), rep(4, 290, true), rep(5, 293, true), rep(6, 291, true)];
const base = { distance: 6.5, duration: 2538, pace: 6.5, elevationGain: 0 };

const segments: SessionSegmentRecord[] = [
  { index: 0, kind: 'aerobic', planned: { distanceKm: 2 }, actual: { distanceKm: 1.9 } },
  {
    index: 1,
    kind: 'strength',
    planned: { sets: 8 },
    actual: { sets: 7, exerciseLog: [{ exerciseId: 'pu', exerciseName: 'מתח', confirmedReps: [7, 6], targetReps: 8, prescribedRange: { min: 6, max: 8 } }] },
  },
  { index: 2, kind: 'aerobic', planned: { distanceKm: 2 }, actual: { distanceKm: 1.8 } },
  {
    index: 3,
    kind: 'strength',
    planned: { sets: 4 },
    actual: { sets: 4, exerciseLog: [{ exerciseId: 'dip', exerciseName: 'מקבילים', confirmedReps: [8, 8], targetReps: 8 }] },
  },
];

describe('v2-summary.mapping — labels', () => {
  it('rings', async () => {
    await expect(json({
      aerobic: aerobicRings({ distance: 6.5, pace: 4.87, duration: 2538 }),
      aerobicEmpty: aerobicRings({}),
      ride: rideRings({ distance: 24, duration: 3600, elevationGain: 182.4 }),
      rideEmpty: rideRings({}),
    })).toMatchFileSnapshot(snap('rings'));
  });
  it('hybrid rings + station tables', async () => {
    await expect(json({
      planned: hybridRings({ segments, summary: { segmentCount: 4, completedAerobicSegments: 2, completedStrengthSegments: 2, totalActualDistanceKm: 3.7, totalStrengthSets: 11 } }),
      noPlan: hybridRings({ segments: [], summary: { segmentCount: 0, completedAerobicSegments: 0, completedStrengthSegments: 0, totalActualDistanceKm: 0, totalStrengthSets: 0 } }),
      tablesTwo: hybridStationTables(segments),
      tablesOne: hybridStationTables(segments.slice(0, 2)),
    })).toMatchFileSnapshot(snap('hybrid'));
  });
  it('rep table', async () => {
    const rec = (r: number, sec: number, pace?: number, inRange?: boolean, delta?: number) => ({
      blockIndex: r * 2 - 1, rep: r, label: 'אינטרוול', distanceMeters: 400, durationSeconds: sec,
      ...(pace ? { avgPaceSec: pace, targetMinPaceSec: 285, targetMaxPaceSec: 295 } : {}),
      ...(inRange !== undefined ? { inRange, paceDeltaSec: delta ?? 0 } : {}),
    });
    await expect(json({
      scored: repTableModel([rec(1, 115, 288, true), rec(2, 119, 298, false, 3), rec(3, 116, 290, true)]),
      unscored: repTableModel([rec(1, 40)]),
    })).toMatchFileSnapshot(snap('rep-table'));
  });
});

describe('run-type.mapping — labels', () => {
  const schedule = [
    { week: 1, day: 1, workoutId: 'a', status: 'pending' as const, category: 'easy_run' as const },
    { week: 1, day: 2, workoutId: 'b', status: 'pending' as const, category: 'short_intervals' as const },
    { week: 2, day: 1, workoutId: 'c', status: 'pending' as const, category: 'easy_run' as const },
    { week: 2, day: 2, workoutId: 'd', workoutName: 'ריצה חופשית', status: 'pending' as const },
  ];
  const meta: RunSummaryMeta = {
    category: 'short_intervals',
    plannedReps: 6,
    warmup: { durationSeconds: 720, distanceMeters: 1900 },
    cooldown: { durationSeconds: 480, distanceMeters: 1200 },
    plan: { week: 1, day: 2 },
  };
  it('models per kind', async () => {
    const easyMeta: RunSummaryMeta = { category: 'easy_run', zones: [{ minPaceSec: 380, maxPaceSec: 410 }], timeInZone: { inSec: 920, totalSec: 1000 }, kmSplits: [{ km: 1, sec: 384 }, { km: 2, sec: 372 }, { km: 2.6, sec: 230 }] };
    const longMeta: RunSummaryMeta = { category: 'long_run', zones: [{ minPaceSec: 380, maxPaceSec: 410 }], kmSplits: [{ km: 1, sec: 384 }, { km: 2, sec: 372 }, { km: 3, sec: 420 }, { km: 3.5, sec: 170 }] };
    await expect(json({
      intervals: runTypeModel({ ...base, blockResults: reps, runMeta: meta }, { program: { schedule }, programName: 'תוכנית 10 ק״מ' }),
      intervalsNoName: runTypeModel({ ...base, blockResults: reps, runMeta: { ...meta, plan: { week: 2, day: 2 } } }, { program: { schedule }, programName: ' ' }),
      easy: runTypeModel({ ...base, runMeta: easyMeta }),
      easyNoZone: runTypeModel({ ...base, runMeta: { category: 'easy_run', zones: [{ minPaceSec: 380, maxPaceSec: 410 }] } }),
      long: runTypeModel({ ...base, elevationGain: 182.4, runMeta: longMeta }),
      free: runTypeModel(base),
      freeSplits: runTypeModel({ ...base, runMeta: { kmSplits: [{ km: 1, sec: 384 }, { km: 2, sec: 372 }] } }),
      heroes: [
        runHero(base, 'intervals'), runHero(base, 'long'), runHero(base, 'easy'), runHero(base, 'free'),
        runHero({ ...base, runMeta: { title: 'ריצת בוקר' } }, 'free'),
      ],
      ringsIntervalsNoReps: runTypeRings(base, 'intervals'),
      course: courseItems({ ...base, blockResults: reps, runMeta: meta }),
      courseOne: courseItems({ ...base, blockResults: [rep(1, 288, true)] }),
      splits: kmSplitModel([{ km: 1, sec: 384 }, { km: 2, sec: 372 }, { km: 3, sec: 420 }, { km: 3.5, sec: 170 }], { min: 380, max: 410 }),
      planLast: runPlanProgress({ schedule }, { week: 2, day: 2 }, 'x'),
      planDefault: runPlanProgress({ schedule }, { week: 1, day: 1 }),
    })).toMatchFileSnapshot(snap('run-type'));
  });
});

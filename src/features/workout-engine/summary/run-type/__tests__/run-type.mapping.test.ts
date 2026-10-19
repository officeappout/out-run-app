import { describe, expect, it } from 'vitest';
import type { PlannedBlockRecord, RunSummaryMeta } from '@/features/workout-engine/core/services/storage.service';
import {
  courseItems,
  kmSplitModel,
  repsTitle,
  resolveKmSplits,
  runHero,
  runPlanProgress,
  runSummaryKind,
  runTypeModel,
  runTypeRings,
  timeInZonePct,
} from '../run-type.mapping';

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

describe('runSummaryKind', () => {
  it('reps ⇒ intervals, long_run ⇒ long, planned ⇒ easy, nothing ⇒ free', () => {
    expect(runSummaryKind({ ...base, blockResults: reps })).toBe('intervals');
    expect(runSummaryKind({ ...base, runMeta: { category: 'long_run' } })).toBe('long');
    expect(runSummaryKind({ ...base, runMeta: { slotType: 'long_run', category: 'easy_run' } })).toBe('long');
    expect(runSummaryKind({ ...base, runMeta: { category: 'easy_run' } })).toBe('easy');
    expect(runSummaryKind({ ...base, runMeta: { kmSplits: [{ km: 1, sec: 300 }] } })).toBe('free');
    expect(runSummaryKind(base)).toBe('free');
  });
});

describe('hero', () => {
  it('"6 × 400 מ׳" + the category label', () => {
    expect(runHero({ ...base, blockResults: reps, runMeta: { category: 'short_intervals' } }, 'intervals')).toEqual({
      label: 'אינטרוולים קצרים',
      repsTitle: '6 × 400 מ׳',
    });
    expect(runHero(base, 'free')).toEqual({ label: 'ריצה', repsTitle: null });
  });
  it('time reps and mixed reps', () => {
    const t = [rep(1, 290, true, { plannedDistanceMeters: undefined, plannedDurationSeconds: 180 }), rep(2, 290, true, { plannedDistanceMeters: undefined, plannedDurationSeconds: 180 })];
    expect(repsTitle(t, 5)).toBe('5 × 3 דק׳');
    expect(repsTitle([rep(1, 290, true), rep(2, 290, true, { plannedDistanceMeters: 800 })])).toBeNull();
  });
});

describe('runTypeRings', () => {
  it('intervals: reps done · rep pace (in range) · distance', () => {
    const r = runTypeRings({ ...base, blockResults: reps, runMeta: { plannedReps: 6 } }, 'intervals');
    expect(r.map((x) => [x.key, x.value, x.pct, x.sub])).toEqual([
      ['reps', '6/6', 100, '400 מ׳'],
      ['repPace', '4:52', 83, '5/6 בטווח'],
      ['distance', '6.50', 100, '42:18'],
    ]);
  });
  it('easy: band under the pace; time-in-zone only with the accumulator', () => {
    const meta: RunSummaryMeta = { category: 'easy_run', zones: [{ minPaceSec: 380, maxPaceSec: 410 }] };
    const r = runTypeRings({ ...base, runMeta: meta }, 'easy');
    expect(r[1].sub).toBe('טווח 6:20–6:50');
    expect(r[2].key).toBe('time');
    const z = runTypeRings({ ...base, runMeta: { ...meta, timeInZone: { inSec: 920, totalSec: 1000 } } }, 'easy');
    expect([z[2].key, z[2].value, z[2].pct]).toEqual(['zone', '92%', 92]);
    expect(timeInZonePct(undefined)).toBeNull();
  });
});

describe('km splits', () => {
  it('laps first, then saved trace splits', () => {
    const laps = [
      { id: '1', lapNumber: 1, distanceMeters: 1000, durationSeconds: 380, splitPace: 0, isActive: false },
      { id: '2', lapNumber: 2, distanceMeters: 1000, durationSeconds: 370, splitPace: 0, isActive: false },
    ];
    expect(resolveKmSplits({ ...base, laps })).toEqual([{ km: 1, sec: 380 }, { km: 2, sec: 370 }]);
    expect(resolveKmSplits({ ...base, runMeta: { kmSplits: [{ km: 1, sec: 380 }, { km: 1.6, sec: 230 }] } })).toHaveLength(2);
    expect(resolveKmSplits(base)).toBeNull();
  });
  it('fastest full km highlighted, band tones, last km', () => {
    const m = kmSplitModel(
      [
        { km: 1, sec: 384 },
        { km: 2, sec: 372 },
        { km: 3, sec: 420 },
        { km: 3.5, sec: 170 }, // partial at 5:40/km — faster, but never "fastest"
      ],
      { min: 380, max: 410 },
    )!;
    expect(m.rows.map((r) => [r.n, r.value, r.tone])).toEqual([
      [1, '6:24', 'in'],
      [2, '6:12', 'best'],
      [3, '7:00', 'off'],
      [3.5, '5:40', 'off'],
    ]);
    expect(m.fastestLabel).toBe('הכי מהיר: ק״מ 2');
    expect(m.lastKmPace).toBe('7:00');
    expect(kmSplitModel([{ km: 1, sec: 300 }], null)).toBeNull();
  });
});

describe('courseItems', () => {
  it('warm-up · reps in threes · cool-down', () => {
    const items = courseItems({
      ...base,
      blockResults: reps,
      runMeta: { warmup: { durationSeconds: 720, distanceMeters: 1900 }, cooldown: { durationSeconds: 480, distanceMeters: 1200 } },
    });
    expect(items.map((i) => `${i.label} · ${i.detail}`)).toEqual([
      'חימום · 12 דק׳ · 1.9 ק״מ',
      'חזרות 1–3 · 4:48 · 4:52 · 4:58',
      'חזרות 4–6 · 4:50 · 4:53 · 4:51',
      'שחרור · 8 דק׳ · 1.2 ק״מ',
    ]);
    expect(courseItems(base)).toEqual([]);
  });
});

describe('runPlanProgress', () => {
  const schedule = [
    { week: 1, day: 1, workoutId: 'a', status: 'pending' as const, category: 'easy_run' as const },
    { week: 1, day: 2, workoutId: 'b', status: 'pending' as const, category: 'short_intervals' as const },
    { week: 2, day: 1, workoutId: 'c', status: 'pending' as const, category: 'easy_run' as const },
    { week: 2, day: 2, workoutId: 'd', status: 'pending' as const, category: 'long_run' as const },
  ];
  it('position-based ring, week label and the next workout', () => {
    const p = runPlanProgress({ schedule }, { week: 2, day: 1 }, 'תוכנית 10 ק״מ')!;
    expect(p.weekLabel).toBe('שבוע 2/2');
    expect(p.positionLabel).toBe('אימון 1 מתוך 2 השבוע');
    expect(p.nextLabel).toBe('הבא: ריצה ארוכה');
    expect(p.ring).toEqual({ percent: 75, basePercent: 50, gainPercent: 25 });
    expect(p.name).toBe('תוכנית 10 ק״מ');
  });
  it('last workout has no next; unknown position ⇒ null', () => {
    expect(runPlanProgress({ schedule }, { week: 2, day: 2 })!.nextLabel).toBeNull();
    expect(runPlanProgress({ schedule }, { week: 9, day: 1 })).toBeNull();
    expect(runPlanProgress({ schedule }, null)).toBeNull();
    expect(runPlanProgress(null, { week: 1, day: 1 })).toBeNull();
  });
});

describe('runTypeModel', () => {
  it('long run: extras (ascent, last km) and splits with the band', () => {
    const m = runTypeModel({
      ...base,
      distance: 3,
      elevationGain: 58,
      runMeta: { category: 'long_run', zones: [{ minPaceSec: 370, maxPaceSec: 400 }], kmSplits: [{ km: 1, sec: 384 }, { km: 2, sec: 381 }, { km: 3, sec: 362 }] },
    });
    expect(m.kind).toBe('long');
    expect(m.extras).toEqual([
      { key: 'ascent', label: 'עלייה', value: '+58 מ׳' },
      { key: 'lastKm', label: 'ק״מ אחרון', value: '6:02' },
    ]);
    expect(m.splits?.band).toEqual({ min: 370, max: 400 });
    expect(m.course).toEqual([]);
    expect(m.plan).toBeNull();
  });
  it('intervals: no splits, a course rail', () => {
    const m = runTypeModel({ ...base, blockResults: reps });
    expect(m.kind).toBe('intervals');
    expect(m.splits).toBeNull();
    expect(m.course.length).toBe(2);
  });
});

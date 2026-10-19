import { describe, expect, it } from 'vitest';
import {
  buildPaceSplits,
  buildStrengthPostDetails,
  exerciseLine,
  formatSecPerKm,
  paceBarHeights,
  personalBestFrom,
  postDetailsForWrite,
  sanitizePostDetails,
  streakFor,
  topExerciseFrom,
  withoutPostDetails,
  type SummaryExerciseLike,
  type SummaryPhaseLike,
} from '../feed-post-details';

const ex = (over: Partial<SummaryExerciseLike> = {}): SummaryExerciseLike => ({
  name: 'מתח',
  unit: 'reps',
  plannedSets: 3,
  doneSets: 3,
  sets: [
    { done: 8, target: 8 },
    { done: 8, target: 8 },
    { done: 7, target: 8 },
  ],
  status: 'partial',
  improvedBy: null,
  ...over,
});

const phases = (main: SummaryExerciseLike[]): SummaryPhaseLike[] => [
  { phase: 'warmup', blocks: [{ exercises: [ex({ name: 'חימום' })] }] },
  { phase: 'main', blocks: [{ exercises: main }] },
];

describe('topExerciseFrom', () => {
  it('planned sets, sets done and the typical target', () => {
    expect(topExerciseFrom(ex())).toEqual({ name: 'מתח', sets: 3, setsDone: 3, value: 8, unit: 'reps' });
  });
  it('no target → the best set; no plan → the sets done', () => {
    const t = topExerciseFrom(ex({ plannedSets: null, doneSets: 2, sets: [{ done: 10, target: null }, { done: 12, target: null }] }));
    expect(t).toEqual({ name: 'מתח', sets: 2, setsDone: 2, value: 12, unit: 'reps' });
  });
  it('timed sets keep seconds; nothing performed → no value', () => {
    expect(topExerciseFrom(ex({ unit: 'seconds', sets: [{ done: 30, target: 30 }] })).unit).toBe('seconds');
    expect(topExerciseFrom(ex({ sets: [{ done: null, target: null }] })).value).toBeUndefined();
  });
});

describe('buildStrengthPostDetails', () => {
  it('main-phase exercises only, max 3 + the rest as a count', () => {
    const main = ['א', 'ב', 'ג', 'ד', 'ה'].map((name) => ex({ name }));
    const d = buildStrengthPostDetails({ phases: phases(main) });
    expect(d.topExercises?.map((e) => e.name)).toEqual(['א', 'ב', 'ג']);
    expect(d.moreExercises).toBe(2);
  });
  it('skipped exercises are left out', () => {
    const d = buildStrengthPostDetails({ phases: phases([ex({ name: 'א', status: 'skipped', doneSets: 0 }), ex({ name: 'ב' })]) });
    expect(d.topExercises?.map((e) => e.name)).toEqual(['ב']);
    expect(d.moreExercises).toBeUndefined();
  });
  it('level only when both are known and consistent', () => {
    expect(buildStrengthPostDetails({ phases: [], levelIndex: 4, levelCount: 12 })).toMatchObject({ levelIndex: 4, levelCount: 12 });
    expect(buildStrengthPostDetails({ phases: [], levelIndex: 4, levelCount: null })).toEqual({});
    expect(buildStrengthPostDetails({ phases: [], levelIndex: 14, levelCount: 12 })).toEqual({});
  });
  it('streak only from 2 days; program name trimmed', () => {
    expect(buildStrengthPostDetails({ phases: null, streakDays: 1 })).toEqual({});
    expect(buildStrengthPostDetails({ phases: null, streakDays: 6, programName: ' פלג גוף עליון ' })).toEqual({ streakDays: 6, programName: 'פלג גוף עליון' });
  });
  it('nothing known → an empty object (the card falls back)', () => {
    expect(buildStrengthPostDetails({ phases: undefined })).toEqual({});
  });
});

describe('personalBestFrom', () => {
  it('the biggest improvement wins, worded honestly', () => {
    const text = personalBestFrom([ex({ name: 'מקבילים', improvedBy: 1 }), ex({ name: 'מתח', improvedBy: 2 })]);
    expect(text).toBe('8 חזרות מתח (+2 מהפעם הקודמת)');
  });
  it('none → undefined', () => {
    expect(personalBestFrom([ex()])).toBeUndefined();
  });
});

describe('buildPaceSplits', () => {
  it('sec/km per completed lap, active and tiny laps skipped', () => {
    const laps = [
      { distanceMeters: 1000, durationSeconds: 330 },
      { distanceMeters: 50, durationSeconds: 20 },
      { distanceMeters: 1000, durationSeconds: 315 },
      { distanceMeters: 400, durationSeconds: 100, isActive: true },
    ];
    expect(buildPaceSplits(laps)).toEqual([330, 315]);
  });
  it('fewer than 2 → undefined; capped at 10', () => {
    expect(buildPaceSplits([{ distanceMeters: 1000, durationSeconds: 300 }])).toBeUndefined();
    expect(buildPaceSplits(Array.from({ length: 14 }, () => ({ distanceMeters: 1000, durationSeconds: 300 })))?.length).toBe(10);
    expect(buildPaceSplits(null)).toBeUndefined();
  });
});

describe('sanitizePostDetails', () => {
  it('keeps well-formed fields, drops junk', () => {
    const out = sanitizePostDetails({
      programName: 'משיכה',
      levelIndex: 3,
      levelCount: 2,
      topExercises: [{ name: 'מתח', sets: 3, setsDone: 9, value: 8, unit: 'reps' }, { name: '', sets: 3 }, 'x'],
      moreExercises: -1,
      paceSplits: [300, 'a', 310],
      streakDays: 5,
      photoUrl: 'http://insecure',
      photoPath: 'feed-photos/u/1.jpg',
    });
    expect(out).toEqual({
      programName: 'משיכה',
      topExercises: [{ name: 'מתח', sets: 3, setsDone: 3, value: 8, unit: 'reps' }],
      paceSplits: [300, 310],
      streakDays: 5,
      photoPath: 'feed-photos/u/1.jpg',
    });
  });
  it('an old post → nothing', () => {
    expect(sanitizePostDetails({ durationMinutes: 30 })).toEqual({});
  });
  it('activityType: only a ride (cycling) is kept', () => {
    expect(sanitizePostDetails({ activityType: 'cycling' })).toEqual({ activityType: 'cycling' });
    expect(sanitizePostDetails({ activityType: 'running' })).toEqual({});
    expect(sanitizePostDetails({ activityType: 42 })).toEqual({});
  });
});

describe('write helpers', () => {
  it('a ride\'s activityType is a detail key (dropped without home v2, written with it)', () => {
    expect(withoutPostDetails({ durationMinutes: 3, activityType: 'cycling' as const })).toEqual({ durationMinutes: 3 });
    expect(postDetailsForWrite({ activityType: 'cycling' })).toEqual({ activityType: 'cycling' });
  });
  it('withoutPostDetails drops only the detail keys', () => {
    expect(withoutPostDetails({ durationMinutes: 3, streakDays: 4, photoUrl: 'https://x', topExercises: [] })).toEqual({ durationMinutes: 3 });
  });
  it('postDetailsForWrite drops undefined / null and non-detail keys', () => {
    expect(postDetailsForWrite({ streakDays: undefined, paceSplits: [300, 310], ...({ title: 'x' } as object) })).toEqual({ paceSplits: [300, 310] });
  });
  it('streakFor', () => {
    expect(streakFor(1)).toBeUndefined();
    expect(streakFor(3)).toBe(3);
    expect(streakFor(undefined)).toBeUndefined();
  });
});

describe('display helpers', () => {
  it('formatSecPerKm', () => {
    expect(formatSecPerKm(348)).toBe('5:48');
    expect(formatSecPerKm(359.6)).toBe('6:00');
  });
  it('paceBarHeights: faster = taller, equal = mid', () => {
    expect(paceBarHeights([300, 360])).toEqual([1, 0.35]);
    expect(paceBarHeights([300, 300])).toEqual([0.75, 0.75]);
  });
  it('exerciseLine', () => {
    expect(exerciseLine({ name: 'מתח', sets: 3, setsDone: 3, value: 8, unit: 'reps' })).toBe('3 × 8');
    expect(exerciseLine({ name: 'פלאנק', sets: 2, setsDone: 2, value: 30, unit: 'seconds' })).toBe('2 × 30 שנ׳');
    expect(exerciseLine({ name: 'x', sets: 2, setsDone: 1, unit: 'reps' })).toBe('2 סטים');
  });
});

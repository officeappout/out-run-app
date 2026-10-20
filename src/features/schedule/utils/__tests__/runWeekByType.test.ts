import { describe, expect, it } from 'vitest';
import {
  mapRunWeek,
  mapRunWeekByOrdinal,
  mapRunWeekByType,
  mapRunWeekFromLetters,
  runDayIndices,
  runPlacementOf,
  slotsOfEntries,
} from '../runWeekByType';
import { recommendRunWeek } from '../runWeekRecommendation';
import type { RunSlot } from '../../engine-v2/types';
import { resolveRunningDayState } from '@/lib/running-day-resolution';
import { buildRunWeekRows } from '@/features/workout-engine/players/running/utils/run-preview/run-week';

// The generator's emit order (plan-generator buildWeekSlots): Q1 → L → Q2 → E.
const Q1: RunSlot = 'quality_primary';
const L: RunSlot = 'long_run';
const Q2: RunSlot = 'quality_secondary';
const E: RunSlot = 'easy_run';

const week = (slots: RunSlot[], w = 1) =>
  slots.map((slotType, i) => ({ week: w, day: i + 1, slotType, workoutId: `${slotType}_${i + 1}`, status: 'pending' as const }));

/** dow → slot, Sunday first. */
const layout = (m: Map<number, { slotType?: string }>) =>
  Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map(([dow, e]) => `${dow}:${e.slotType}`);

describe('mapRunWeekByType — the long run on its engine-v2 day, not the 2nd run day', () => {
  it('3 runs Sun/Tue/Thu: long run Thursday (ordinal put it on Tuesday)', () => {
    const entries = week([Q1, L, Q2]);
    expect(layout(mapRunWeekByOrdinal(entries, [0, 2, 4]))).toEqual(['0:quality_primary', '2:long_run', '4:quality_secondary']);
    expect(layout(mapRunWeekByType(entries, [0, 2, 4]))).toEqual(['0:quality_primary', '2:quality_secondary', '4:long_run']);
  });

  it('4 runs Mon/Wed/Fri/Sat: long run Saturday, quality runs 48h apart', () => {
    const m = mapRunWeekByType(week([Q1, L, Q2, E]), [1, 3, 5, 6]);
    expect(layout(m)).toEqual(['1:quality_primary', '3:quality_secondary', '5:easy_run', '6:long_run']);
  });

  it('4 runs Mon/Tue/Thu/Fri (the old default): no long run straight after a quality run on Tuesday', () => {
    const m = mapRunWeekByType(week([Q1, L, Q2, E]), [1, 2, 4, 5]);
    expect(m.get(5)?.slotType).toBe('long_run');
    expect(m.get(2)?.slotType).not.toBe('long_run');
    expect(m.size).toBe(4);
  });

  it('2 runs Sun/Wed: quality first, long run on the last day', () => {
    expect(layout(mapRunWeekByType(week([Q1, L]), [0, 3]))).toEqual(['0:quality_primary', '3:long_run']);
  });

  it('a preferred long-run day wins when it is a run day', () => {
    const m = mapRunWeekByType(week([Q1, L, Q2]), [0, 2, 5], { preferredLongRunDay: 0 });
    expect(m.get(0)?.slotType).toBe('long_run');
  });

  it('a taper week (no long run) still places every run', () => {
    const m = mapRunWeekByType(week([Q1, E, E, E]), [1, 3, 5, 6]);
    expect(m.size).toBe(4);
    expect(Array.from(m.values()).filter((e) => e.slotType === 'quality_primary')).toHaveLength(1);
  });

  it.each([
    ['Sun/Tue/Thu', [0, 2, 4], [Q1, L, Q2]],
    ['Mon/Wed/Fri/Sat', [1, 3, 5, 6], [Q1, L, Q2, E]],
    ['2-day', [0, 3], [Q1, L]],
    ['4-day Sun/Tue/Thu/Sat', [0, 2, 4, 6], [Q1, L, Q2, E]],
  ] as Array<[string, number[], RunSlot[]]>)('%s: the same week the signup recommendation / summary shows', (_n, days, slots) => {
    const rec = recommendRunWeek({ slots, days, level: 'intermediate', targetDistance: '5k' });
    const m = mapRunWeekByType(week(slots), days, { level: 'intermediate', targetDistance: '5k' });
    expect(layout(m)).toEqual(rec.days.map((d) => `${d.dow}:${d.slot}`));
  });

  it('every entry keeps its identity (same objects, each once)', () => {
    const entries = week([Q1, L, Q2, E]);
    const m = mapRunWeekByType(entries, [1, 3, 5, 6]);
    expect(new Set(m.values()).size).toBe(4);
    Array.from(m.values()).forEach((e) => expect(entries).toContain(e));
  });

  it('more runs than days: only as many runs as days are placed (like today)', () => {
    expect(mapRunWeekByType(week([Q1, L, Q2]), [0, 3]).size).toBe(2);
  });

  it('no days or no entries → empty', () => {
    expect(mapRunWeekByType(week([Q1, L]), []).size).toBe(0);
    expect(mapRunWeekByType([], [0, 3]).size).toBe(0);
  });
});

describe('slotsOfEntries — old entries without slotType', () => {
  it('long run by category; first quality primary, next secondary; the rest easy', () => {
    expect(
      slotsOfEntries([
        { day: 1, category: 'short_intervals' },
        { day: 2, category: 'long_run' },
        { day: 3, category: 'tempo' },
        { day: 4, category: 'easy_run' },
      ]),
    ).toEqual([Q1, L, Q2, E]);
  });

  it('a stored slotType wins over the category', () => {
    expect(slotsOfEntries([{ day: 1, category: 'fartlek_easy', slotType: 'quality_primary' }])).toEqual([Q1]);
  });

  it('category-only week is placed by type too (long run Thursday on Sun/Tue/Thu)', () => {
    const entries = [
      { day: 1, category: 'short_intervals' },
      { day: 2, category: 'long_run' },
      { day: 3, category: 'tempo' },
    ];
    expect(mapRunWeekByType(entries, [0, 2, 4]).get(4)?.category).toBe('long_run');
  });
});

describe('mapRunWeek — the flag switch', () => {
  it('byType off = the k-th run on the k-th chosen day (unchanged)', () => {
    const entries = week([Q1, L, Q2]);
    expect(layout(mapRunWeek(entries, [4, 0, 2]))).toEqual(layout(mapRunWeekByOrdinal(entries, [0, 2, 4])));
    expect(mapRunWeek(entries, [0, 2, 4]).get(2)?.slotType).toBe('long_run');
  });

  it('byType on goes through the engine', () => {
    expect(mapRunWeek(week([Q1, L, Q2]), [0, 2, 4], { byType: true }).get(4)?.slotType).toBe('long_run');
  });

  it('from Hebrew letters', () => {
    expect(runDayIndices(['ה', 'א', 'ג', '?'])).toEqual([0, 2, 4]);
    expect(mapRunWeekFromLetters(week([Q1, L, Q2]), ['א', 'ג', 'ה'], { byType: true }).get(4)?.slotType).toBe('long_run');
  });
});

describe('runPlacementOf', () => {
  it('level from the pace profile type, else the ability tier; the plan distance', () => {
    expect(runPlacementOf({ paceProfile: { profileType: 3 }, generatedProgramTemplate: { targetDistance: '10k' } })).toEqual({
      level: 'beginner',
      targetDistance: '10k',
      preferredLongRunDay: null,
    });
    expect(runPlacementOf({ paceProfile: { profileType: 1 } }).level).toBe('advanced');
    expect(runPlacementOf({ onboardingData: { currentAbility: { abilityTier: 'none' } } }).level).toBe('beginner');
    expect(runPlacementOf(undefined)).toEqual({ level: 'intermediate', targetDistance: null, preferredLongRunDay: null });
  });

  it('the stored long-run day (running.longRunDay) → preferredLongRunDay; invalid values ignored', () => {
    expect(runPlacementOf({ longRunDay: 5 }).preferredLongRunDay).toBe(5);
    expect(runPlacementOf({ longRunDay: 9 }).preferredLongRunDay).toBeNull();
    expect(runPlacementOf({ longRunDay: null }).preferredLongRunDay).toBeNull();
  });

  it('home places the long run on the signup choice: Sun/Tue/Fri with longRunDay Sunday', () => {
    const m = mapRunWeek(week([Q1, L, Q2]), [0, 2, 5], { byType: true, ...runPlacementOf({ longRunDay: 0 }) });
    const rec = recommendRunWeek({ slots: [Q1, L, Q2], days: [0, 2, 5], preferredLongRunDay: 0, level: 'intermediate', targetDistance: '5k' });
    expect(m.get(0)?.slotType).toBe('long_run');
    expect(layout(m)).toEqual(rec.days.map((d) => `${d.dow}:${d.slot}`));
  });
});

describe('consumers', () => {
  // Thursday 10.09.2026 (Sunday 06.09.2026 + 4).
  const THURSDAY = new Date('2026-09-10T09:00:00');
  const TUESDAY = new Date('2026-09-08T09:00:00');
  const entries = week([Q1, L, Q2]);
  const days = ['א', 'ג', 'ה'];

  it('resolveRunningDayState: flag off unchanged (Tuesday = long run), byType = Thursday', () => {
    expect(resolveRunningDayState(days, entries, 1, TUESDAY, undefined).todayEntry?.slotType).toBe('long_run');
    expect(resolveRunningDayState(days, entries, 1, TUESDAY, undefined, { byType: true }).todayEntry?.slotType).toBe('quality_secondary');
    const thu = resolveRunningDayState(days, entries, 1, THURSDAY, undefined, { byType: true });
    expect(thu.isRunDay).toBe(true);
    expect(thu.todayEntry?.slotType).toBe('long_run');
  });

  it('resolveRunningDayState byType: the next run is the entry on the next run weekday', () => {
    const tue = resolveRunningDayState(days, entries, 1, TUESDAY, undefined, { byType: true });
    expect(tue.nextEntry?.slotType).toBe('long_run');
    expect(tue.nextEntryDaysAway).toBe(2);
  });

  it('buildRunWeekRows byType: rows in weekday order with the right day letters', () => {
    const rows = buildRunWeekRows(entries, 1, days, { isRunDay: false, placement: { byType: true } });
    expect(rows.map((r) => `${r.dayLetter}${r.entry.slotType}`)).toEqual([
      'א׳quality_primary',
      'ג׳quality_secondary',
      'ה׳long_run',
    ]);
  });

  it('buildRunWeekRows without placement: unchanged slot order', () => {
    const rows = buildRunWeekRows(entries, 1, days, { isRunDay: false });
    expect(rows.map((r) => `${r.dayLetter}${r.entry.slotType}`)).toEqual([
      'א׳quality_primary',
      'ג׳long_run',
      'ה׳quality_secondary',
    ]);
  });
});

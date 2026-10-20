/**
 * enable_home_v2 (AdvisorInput.runsByType): Kelly / the schedule advisor read the run week
 * through the shared by-type mapper — the same run days and types home shows
 * (mapRunWeekByType + runPlacementOf). Off: the k-th run on the k-th day, unchanged.
 */
import { describe, expect, it } from 'vitest';
import { adviseToday, adviseWeek, detectMissed, materializePlanned, weekKeysOf } from '..';
import { mapRunWeekByOrdinal, mapRunWeekByType, runDayIndices, runPlacementOf } from '../../utils/runWeekByType';
import { isLongRunDay } from '../../engine/runningRules';
import type { AdvisorProfile } from '../types';
import { input, runningPart, strengthProfile, THU, w, type RunEntry } from './fixtures';

// Stored in the generator's emit order Q1 → L → Q2 (ordinal puts the long run on the 2nd run day).
function q1lq2Weeks(n: number): RunEntry[] {
  const out: RunEntry[] = [];
  for (let wk = 1; wk <= n; wk++) {
    out.push(
      { week: wk, day: 1, category: 'short_intervals', slotType: 'quality_primary', isQualityWorkout: true, workoutName: 'אינטרוולים' },
      { week: wk, day: 2, category: 'long_run', slotType: 'long_run', isQualityWorkout: false, workoutName: 'ריצה ארוכה' },
      { week: wk, day: 3, category: 'tempo', slotType: 'quality_secondary', isQualityWorkout: true, workoutName: 'טמפו' },
    );
  }
  return out;
}

const SUN_TUE_THU = ['א', 'ג', 'ה'];

function runner(longRunDay?: number): AdvisorProfile {
  const running = runningPart(SUN_TUE_THU, q1lq2Weeks(8));
  return strengthProfile({ ב: ['push'] }, { running: { ...running, ...(longRunDay !== undefined ? { longRunDay } : {}) } });
}

/** dow → slotType of the planned runs of the week of THU. */
function plannedRunLayout(profile: AdvisorProfile, runsByType: boolean): Record<number, string | undefined> {
  const planned = materializePlanned(profile, weekKeysOf(THU), null, undefined, runsByType ? { runsByType: true } : {});
  return Object.fromEntries(planned.filter((p) => p.kind === 'run').map((p) => [p.dayOfWeek, p.runDay?.slotType]));
}

function mapperLayout(profile: AdvisorProfile, byType: boolean): Record<number, string | undefined> {
  const entries = profile.running!.activeProgram!.schedule.filter((e) => e.week === 1);
  const days = runDayIndices(profile.running!.scheduleDays);
  const m = byType ? mapRunWeekByType(entries, days, runPlacementOf(profile.running)) : mapRunWeekByOrdinal(entries, days);
  return Object.fromEntries(Array.from(m.entries()).map(([dow, e]) => [dow, e.slotType]));
}

describe('materializePlanned — runsByType (enable_home_v2)', () => {
  it('on + running.longRunDay: the same run days / types as mapRunWeekByType (the long run on Sunday)', () => {
    const p = runner(0);
    const got = plannedRunLayout(p, true);
    expect(got).toEqual(mapperLayout(p, true));
    expect(got[0]).toBe('long_run');
  });

  it('on, no longRunDay: the engine default — the long run on the last run day (Thursday), like home', () => {
    const p = runner();
    const got = plannedRunLayout(p, true);
    expect(got).toEqual(mapperLayout(p, true));
    expect(got[4]).toBe('long_run');
  });

  it('off: unchanged — the k-th run on the k-th day (long run on Tuesday), longRunDay ignored', () => {
    const p = runner(0);
    expect(plannedRunLayout(p, false)).toEqual(mapperLayout(p, false));
    expect(plannedRunLayout(p, false)[2]).toBe('long_run');
    expect(materializePlanned(p, weekKeysOf(THU), null)).toEqual(materializePlanned(p, weekKeysOf(THU), null, undefined, {}));
  });

  it('on: the run ref is still the stored entry (week + ordinal day) — the player opens the right run', () => {
    const planned = materializePlanned(runner(0), weekKeysOf(THU), null, undefined, { runsByType: true });
    const sunday = planned.find((p) => p.kind === 'run' && p.dayOfWeek === 0)!;
    expect(sunday.runRef).toEqual({ week: 1, day: 2 });
    expect(sunday.runName).toBe('ריצה ארוכה');
  });

  it('on: a missed run is the run home showed that day', () => {
    const planned = materializePlanned(runner(0), weekKeysOf(THU), null, undefined, { runsByType: true });
    const missed = detectMissed(planned, [w('2026-10-13', 'run')], THU).filter((p) => p.status === 'missed' && p.kind === 'run');
    expect(missed.map((p) => [p.date, p.runDay?.slotType])).toEqual([['2026-10-11', 'long_run']]);
  });
});

describe('adviseWeek / adviseToday — runsByType', () => {
  const longDays = (p: AdvisorProfile, runsByType: boolean) =>
    adviseWeek(input(p, runsByType ? { runsByType: true } : {}))!.week.running.filter((d) => isLongRunDay(d)).map((d) => d.dayOfWeek);

  it('the advised week keeps the long run where home shows it (on) / the 2nd run day (off)', () => {
    expect(longDays(runner(0), true)).toEqual([0]);
    expect(longDays(runner(), true)).toEqual([4]);
    expect(longDays(runner(0), false)).toEqual([2]);
  });

  it('off: adviseToday is byte-identical with runsByType false and with the field absent', () => {
    const p = runner(0);
    expect(adviseToday(input(p, { runsByType: false }))).toEqual(adviseToday(input(p)));
  });

  it('on: the make-up of a missed run is the run home showed that day; off: the ordinal one', () => {
    // Runs Sun / Tue / Sat, long run Saturday (by type). Today Thursday: Sunday's run and Monday's
    // strength done, Tuesday's run missed.
    const workouts = [w('2026-10-11', 'run'), w('2026-10-12', 'strength')];
    const running = runningPart(['א', 'ג', 'ש'], q1lq2Weeks(8));
    const p = strengthProfile({ ב: ['push'] }, { running: { ...running, longRunDay: 6 } });
    const tuesdayByType = mapperLayout(p, true)[2];
    const entries = p.running!.activeProgram!.schedule.filter((e) => e.week === 1);
    const tuesdayEntry = mapRunWeekByType(entries, [0, 2, 6], runPlacementOf(p.running)).get(2)!;

    const on = adviseToday(input(p, { runsByType: true, workouts }));
    expect(on.mode).toBe('makeup');
    expect(on.makeup?.kind).toBe('run');
    expect(on.makeup?.date).toBe('2026-10-13');
    expect(on.makeup?.runDay?.slotType).toBe(tuesdayByType);
    expect(on.makeup?.runRef).toEqual({ week: 1, day: tuesdayEntry.day });
    expect(tuesdayByType).not.toBe('long_run');

    // Off: Tuesday is the 2nd run (the long run) — today's behaviour, and no make-up of a long run
    // is required here; whatever the advisor says, it is identical to omitting the field.
    const off = adviseToday(input(p, { runsByType: false, workouts }));
    expect(off).toEqual(adviseToday(input(p, { workouts })));
    expect(mapperLayout(p, false)[2]).toBe('long_run');
    if (off.makeup) expect(off.makeup.runRef).toEqual({ week: 1, day: 2 });
  });
});

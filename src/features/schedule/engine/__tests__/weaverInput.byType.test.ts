import { describe, expect, it } from 'vitest';
import { buildWeaverInput, type WeaverInputProfile } from '../weaverInput';
import { weaveWeek } from '../scheduleWeaver';
import { adviseWeek } from '../../advisor/advisor';
import { toAdvisorInputFromClient } from '../../advisor/adapters/client';
import { mapRunWeekFromLetters, runPlacementOf } from '../../utils/runWeekByType';

// enable_home_v2 (WeaverInputOptions.runsByType): the builder's running week = home's = signup's.
const ASOF = new Date('2026-09-10T00:00:00Z');
const START_DATE = new Date('2026-09-06T00:00:00Z'); // Sunday — week 1

const SUN_TUE_THU = ['א', 'ג', 'ה'];
const schedule = [
  { week: 1, day: 1, category: 'short_intervals' as const, slotType: 'quality_primary' as const },
  { week: 1, day: 2, category: 'long_run' as const, slotType: 'long_run' as const },
  { week: 1, day: 3, category: 'tempo' as const, slotType: 'quality_secondary' as const },
];

function profile(longRunDay?: number): WeaverInputProfile {
  return {
    progression: { domains: { PLANCHE: { currentLevel: 3 } }, activePrograms: [{ name: 'Upper Body', templateId: 'upper_body' }] },
    lifestyle: { recurringTemplate: { ב: ['PLANCHE'], ד: ['PLANCHE'] } },
    running: {
      isUnlocked: true,
      scheduleDays: SUN_TUE_THU,
      ...(longRunDay !== undefined ? { longRunDay } : {}),
      activeProgram: { startDate: START_DATE, schedule },
    },
  };
}

const longDay = (week: { dayOfWeek: number; slotType?: string; category: string | null }[]) =>
  week.find((d) => d.slotType === 'long_run')?.dayOfWeek;

describe('buildWeaverInput — runsByType', () => {
  it('off: today\'s ordinal mapping (long run on the 2nd run day, Tuesday)', () => {
    expect(longDay(buildWeaverInput(profile(), 'mixed', 50, 5, ASOF)!.running.existingWeek)).toBe(2);
  });

  it('on: long run Thursday, quality Sunday + Tuesday — the same days home shows', () => {
    const p = profile();
    const week = buildWeaverInput(p, 'mixed', 50, 5, ASOF, { runsByType: true })!.running.existingWeek;
    expect(longDay(week)).toBe(4);
    expect(week.find((d) => d.dayOfWeek === 0)?.slotType).toBe('quality_primary');
    expect(week.find((d) => d.dayOfWeek === 2)?.slotType).toBe('quality_secondary');
    const home = mapRunWeekFromLetters(schedule, SUN_TUE_THU, { byType: true, ...runPlacementOf(p.running) });
    for (const [dow, e] of Array.from(home.entries())) expect(week[dow].slotType).toBe(e.slotType);
  });

  it('on + running.longRunDay (the signup choice): the long run on that day', () => {
    expect(longDay(buildWeaverInput(profile(0), 'mixed', 50, 5, ASOF, { runsByType: true })!.running.existingWeek)).toBe(0);
  });

  it('on: the requested run count is unchanged', () => {
    expect(buildWeaverInput(profile(), 'mixed', 50, 5, ASOF, { runsByType: true })!.running.requestedCount).toBe(3);
  });
});

describe('builder long-run protection follows the real long-run day', () => {
  it('on: no strength on Thursday (R6) — the woven week keeps the long run there', () => {
    const woven = weaveWeek(buildWeaverInput(profile(), 'mixed', 50, 5, ASOF, { runsByType: true })!);
    const lr = longDay(woven.week.running);
    expect(lr).toBe(4);
    expect(woven.week.strength.find((d) => d.dayOfWeek === lr)?.sessions ?? []).toHaveLength(0);
  });

  it('adviseWeek through the client adapter: runsByType reaches the weaver', () => {
    const on = adviseWeek(toAdvisorInputFromClient({ profile: profile(), now: ASOF, controls: { mode: 'mixed' }, runsByType: true }));
    const off = adviseWeek(toAdvisorInputFromClient({ profile: profile(), now: ASOF, controls: { mode: 'mixed' } }));
    expect(on!.days.find((d) => d.run?.slotType === 'long_run')?.dayOfWeek).toBe(4);
    expect(off!.days.find((d) => d.run?.slotType === 'long_run')?.dayOfWeek).toBe(2);
  });
});

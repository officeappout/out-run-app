/**
 * Kelly's server advisor reads the run week by slot type when the user's enable_home_v2 is on
 * (ctx.runsByType, set by the chat route through runsByTypeFor) — the same run days / types
 * as home (mapRunWeekByType). Absent: the ordinal week, exactly as before.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/features/social/services/kelly-welcome-bot.service', () => ({ KELLY_UID: 'system_kelly_coach', KELLY_NAME: 'קלי' }));
vi.mock('firebase-admin/firestore', () => {
  class Timestamp {
    constructor(private ms: number) {}
    static fromMillis(ms: number) {
      return new Timestamp(ms);
    }
    toMillis() {
      return this.ms;
    }
    toDate() {
      return new Date(this.ms);
    }
  }
  return { FieldValue: { serverTimestamp: () => '__ts' }, Timestamp };
});

import { loadAdvisorInput, runAdvisor } from '../schedule-advisor.server';
import type { ServerToolContext } from '../server-tools.server';
import { isLongRunDay } from '@/features/schedule/engine/runningRules';
import { mapRunWeekByType, runDayIndices, runPlacementOf } from '@/features/schedule/utils/runWeekByType';

const NOW = new Date('2026-10-15T09:00:00Z'); // Thursday in Israel

function fakeDb() {
  const query = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = { where: () => q, orderBy: () => q, limit: () => q, get: async () => ({ docs: [] }) };
    return q;
  };
  return {
    collection: (c: string) => {
      if (c === 'workouts') return query();
      if (c === 'programs') return { get: async () => ({ docs: [] }) };
      return { doc: (id: string) => ({ id }) };
    },
    getAll: async (...refs: Array<{ id: string }>) => refs.map(() => ({ exists: false, data: () => ({}) })),
  };
}

const schedule = Array.from({ length: 8 }, (_, i) => i + 1).flatMap((week) => [
  { week, day: 1, category: 'short_intervals', slotType: 'quality_primary', isQualityWorkout: true },
  { week, day: 2, category: 'long_run', slotType: 'long_run', isQualityWorkout: false },
  { week, day: 3, category: 'tempo', slotType: 'quality_secondary', isQualityWorkout: true },
]);
const running = {
  isUnlocked: true,
  scheduleDays: ['א', 'ג', 'ה'],
  longRunDay: 0,
  activeProgram: { startDate: '2026-10-11T00:00:00', schedule },
  generatedProgramTemplate: { targetDistance: '10k', canonicalWeeks: 8 },
};

function ctx(runsByType?: boolean): ServerToolContext {
  return {
    db: fakeDb() as never,
    uid: 'u1',
    profile: {
      core: { name: 'דנה', gender: 'female' },
      progression: { domains: { push: { currentLevel: 4 } }, activePrograms: [{ templateId: 'push', startDate: '2026-10-11T00:00:00Z' }] },
      lifestyle: { recurringTemplate: { ב: ['push'] }, primaryTrack: 'strength' },
      running,
    },
    now: NOW,
    knownCards: new Map(),
    turn: { handoffDone: false },
    scheduleAdvisor: true,
    ...(runsByType !== undefined ? { runsByType } : {}),
  };
}

const longDays = (week: { running: Array<{ dayOfWeek: number; category: unknown }> }) =>
  week.running.filter((d) => isLongRunDay(d as never)).map((d) => d.dayOfWeek);

describe('Kelly server advisor — runsByType (enable_home_v2)', () => {
  it('ctx.runsByType → AdvisorInput.runsByType; absent / false → no field at all', async () => {
    expect((await loadAdvisorInput(ctx(true))).runsByType).toBe(true);
    expect('runsByType' in (await loadAdvisorInput(ctx()))).toBe(false);
    expect('runsByType' in (await loadAdvisorInput(ctx(false)))).toBe(false);
  });

  it('on: the advised week has the long run where home shows it (running.longRunDay, Sunday)', async () => {
    const turn = await runAdvisor(ctx(true));
    const home = mapRunWeekByType(schedule.filter((e) => e.week === 1), runDayIndices(running.scheduleDays), runPlacementOf(running));
    const homeLong = Array.from(home.entries()).filter(([, e]) => e.slotType === 'long_run').map(([dow]) => dow);
    expect(longDays(turn.week!.week)).toEqual(homeLong);
    expect(homeLong).toEqual([0]);
  });

  it('off: unchanged — the long run on the 2nd run day (Tuesday)', async () => {
    const off = await runAdvisor(ctx());
    expect(longDays(off.week!.week)).toEqual([2]);
    expect(await runAdvisor(ctx(false))).toEqual(off);
  });
});

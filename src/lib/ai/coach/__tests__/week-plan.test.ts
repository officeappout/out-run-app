/* eslint-disable @typescript-eslint/no-explicit-any -- Admin-SDK-shaped fakes */
/**
 * K0 F1 / F2 / F3 / F4 — Kelly's week is computed the way home shows it, without writing a
 * day doc: the template, home's training-day fallback (no template), the running plan's runs,
 * planned walks from the docs; a running bridge day is never a buildable strength workout;
 * an empty week is only "nothing planned" when the user truly has no plan.
 */
import { describe, expect, it, vi } from 'vitest';

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
  return { FieldValue: { serverTimestamp: () => '__ts', increment: (n: number) => ({ __inc: n }) }, Timestamp };
});

import { executeServerTool, loadUserContextSheet, type ServerToolContext } from '../server-tools.server';
import { plannedWeekEntries } from '../week-plan';
import { buildUserContextSheet, sheetScheduleEntry, weekKeys } from '../context-sheet';
import { renderSheet, weekHeadline } from '../persona';

// Sunday 18.10 … Saturday 24.10.2026; "now" = Sunday 18.10, 09:00 Israel.
const NOW = new Date('2026-10-18T06:00:00Z');
const WEEK = weekKeys('2026-10-18', 0);

/** The owner's own profile shape (diagnostic run 21.10.2026): health track, two training days, NO template. */
const OWNER: Record<string, any> = {
  core: { name: 'דוד', gender: 'male' },
  progression: { tracks: { push: { currentLevel: 21 }, pull: { currentLevel: 15 } } },
  lifestyle: { primaryTrack: 'health', scheduleDays: ['א', 'ג'], recurringTemplate: null, reminders: null },
};

const RUNNER: Record<string, any> = {
  core: { name: 'נועה', gender: 'female' },
  progression: { tracks: { push: { currentLevel: 3 } } },
  lifestyle: { recurringTemplate: { א: ['push'], ב: ['run-prog'], ה: ['run-prog'] }, reminders: { strengthTime: '18:00', runningTime: '06:30' } },
  running: {
    isUnlocked: true,
    scheduleDays: ['ב', 'ה'],
    activeProgram: {
      programId: 'run-prog',
      startDate: '2026-10-11T00:00:00Z',
      schedule: [1, 2, 3].flatMap((week) => [
        { week, day: 1, category: 'easy_run', workoutName: 'ריצה קלה של 25 דקות' },
        { week, day: 2, category: 'long_run' },
      ]),
    },
  },
};

function fakeDb(scheduleDocs: Record<string, unknown[]> = {}, opts: { failGetAll?: boolean } = {}) {
  const writes: unknown[] = [];
  const query = () => {
    const q: any = { where: () => q, orderBy: () => q, limit: () => q, get: async () => ({ docs: [] }) };
    return q;
  };
  return {
    writes,
    collection: (c: string) => {
      if (c === 'workouts') return query();
      if (c === 'programs') return { get: async () => ({ docs: [] }) };
      if (c === 'authorities') return { doc: () => ({ get: async () => ({ data: () => ({}) }) }) };
      return { doc: (id: string) => ({ id, set: async (v: unknown) => writes.push(v), update: async (v: unknown) => writes.push(v) }) };
    },
    getAll: async (...refs: Array<{ id: string }>) => {
      if (opts.failGetAll) throw new Error('unavailable');
      return refs.map((r) => {
        const entries = scheduleDocs[r.id.split('_').pop()!];
        return { exists: !!entries, data: () => ({ entries }) };
      });
    },
    runTransaction: async () => {
      throw new Error('no writes');
    },
  };
}

const ctx = (db: unknown, profile: Record<string, any>, extra: Partial<ServerToolContext> = {}): ServerToolContext => ({
  db: db as never,
  uid: 'u1',
  profile,
  now: NOW,
  knownCards: new Map(),
  turn: { handoffDone: false },
  ...extra,
});

const plan = (profile: Record<string, any>, docs: Record<string, unknown[]> = {}, runsByType = false) =>
  plannedWeekEntries({ dates: WEEK, docs: new Map(Object.entries(docs) as any), profile, advisorProfile: profile as any, runsByType }).map(sheetScheduleEntry);

describe('F1: the owner (no template, only scheduleDays) — Kelly sees the week home shows', () => {
  it('Sunday and Tuesday are strength days ("אימון כוח"), buildable, marked as computed', () => {
    const week = plan(OWNER);
    expect(week.map((e) => [e.weekday, e.kind, e.title, e.source])).toEqual([
      ['ראשון', 'strength', 'אימון כוח', 'schedule_days'],
      ['שלישי', 'strength', 'אימון כוח', 'schedule_days'],
    ]);
    expect(week[0].buildNow).toEqual({ durationMin: null, domains: [] });
  });

  it('the sheet and the persona week line list the two sessions (no "nothing planned"), with no write', async () => {
    const db = fakeDb();
    const sheet = await loadUserContextSheet(ctx(db, OWNER));
    expect(sheet.thisWeek).toHaveLength(2);
    expect(sheet.today[0]).toMatchObject({ date: '2026-10-18', kind: 'strength' });
    const text = renderSheet(sheet);
    expect(text).toContain('This week (Sunday to Saturday): 2 planned workouts:');
    expect(text).toContain('יום ראשון 2026-10-18, אימון כוח');
    expect(text).toContain('יום שלישי 2026-10-20, אימון כוח');
    expect(text).not.toContain('nothing planned');
    expect(db.writes).toEqual([]);
  });

  it('get_schedule answers from the same computed week', async () => {
    const r = JSON.parse((await executeServerTool(ctx(fakeDb(), OWNER), 'get_schedule', { from: '2026-10-18', to: '2026-10-24' })).content);
    expect(r.entries.map((e: any) => e.date)).toEqual(['2026-10-18', '2026-10-20']);
  });

  it('without an assessed strength program the training days are not strength sessions (home: hasStrengthProgram)', () => {
    expect(plan({ ...OWNER, progression: {} })).toEqual([]);
  });

  it('a saved day wins: an explicit rest override hides Tuesday; a saved session is not doubled', () => {
    const week = plan(OWNER, {
      '2026-10-18': [{ type: 'training', programIds: ['pull'], scheduledCategories: ['strength'], source: 'manual' }],
      '2026-10-20': [{ type: 'rest', override: true }],
    });
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({ date: '2026-10-18', programs: ['משיכה'] });
    expect(Object.prototype.hasOwnProperty.call(week[0], 'source')).toBe(false);
  });
});

describe('F1: template-only user (no day docs at all)', () => {
  it('lists the template sessions with the reminder time', () => {
    const profile = { ...OWNER, lifestyle: { recurringTemplate: { ב: ['push'], ד: ['pull'] }, reminders: { strengthTime: '19:00' } } };
    const week = plan(profile);
    expect(week.map((e) => [e.weekday, e.kind, e.startTime, e.source, e.programs])).toEqual([
      ['שני', 'strength', '19:00', 'template', ['דחיפה']],
      ['רביעי', 'strength', '19:00', 'template', ['משיכה']],
    ]);
    const sheet = buildUserContextSheet({ profile, workouts: [], weekSchedule: plannedWeekEntries({ dates: WEEK, docs: new Map(), profile, advisorProfile: profile as any }), todayKey: '2026-10-18', areaName: null, now: NOW });
    const text = renderSheet(sheet);
    expect(text).toContain('2 planned workouts:');
    expect(text).toContain('יום שני 2026-10-19 19:00, כוח, דחיפה');
    expect(text).toContain('יום רביעי 2026-10-21 19:00, כוח, משיכה');
  });
});

describe('F2 / F3: runs and walks', () => {
  it('runs come from the running plan (titles, no build), the bare bridge entry is replaced, strength stays', () => {
    const week = plan(RUNNER);
    expect(week.map((e) => [e.weekday, e.kind, e.title, e.startTime, e.source, !!e.buildNow])).toEqual([
      ['ראשון', 'strength', null, '18:00', 'template', true],
      ['שני', 'cardio', 'ריצה קלה של 25 דקות', '18:00', 'running_plan', false],
      ['חמישי', 'cardio', 'ריצה ארוכה', '18:00', 'running_plan', false],
    ]);
  });

  it('by slot type (enable_home_v2) the long run lands on the run day home shows', () => {
    const byType = plan(RUNNER, {}, true).filter((e) => e.kind === 'cardio');
    expect(byType).toHaveLength(2);
    expect(byType.map((e) => e.title).sort()).toEqual(['ריצה ארוכה', 'ריצה קלה של 25 דקות'].sort());
  });

  it('F3: a saved bridge day (only the running program id) is a run, never a buildable strength workout', () => {
    const noPlan = { ...RUNNER, running: { activeProgram: { programId: 'run-prog' } } };
    const week = plan(noPlan, { '2026-10-19': [{ type: 'training', programIds: ['run-prog'], source: 'recurring', startTime: '06:30' }] });
    const monday = week.find((e) => e.date === '2026-10-19')!;
    expect(monday).toMatchObject({ kind: 'cardio', buildNow: null });
    // and with the plan, the saved bridge day shows the plan's run (its completed flag kept)
    const withPlan = plan(RUNNER, { '2026-10-19': [{ type: 'training', programIds: ['run-prog'], source: 'recurring', completed: true }] });
    expect(withPlan.filter((e) => e.date === '2026-10-19')).toEqual([expect.objectContaining({ kind: 'cardio', title: 'ריצה קלה של 25 דקות', completed: true, buildNow: null })]);
  });

  it('a planned walk saved in a day doc stays a walk, next to the computed strength day', () => {
    const week = plan(OWNER, {
      '2026-10-22': [{ type: 'training', programIds: [], scheduledCategories: ['walking'], plannedRun: { goal: { type: 'time', value: 30 } }, source: 'manual', title: 'הליכה' }],
    });
    expect(week.map((e) => [e.weekday, e.kind, e.plannedMinutes ?? null])).toEqual([
      ['ראשון', 'strength', null],
      ['שלישי', 'strength', null],
      ['חמישי', 'walking', 30],
    ]);
  });
});

describe('F4: never "nothing planned" when the source is empty or unknown', () => {
  it('read failed → says it could not read, never "nothing planned"', async () => {
    const sheet = await loadUserContextSheet(ctx(fakeDb({}, { failGetAll: true }), OWNER));
    expect(sheet.weekUnavailable).toBe(true);
    const line = weekHeadline(sheet, 0);
    expect(line).toContain('could not be read');
    expect(line).not.toContain('nothing planned:');
  });

  it('a plan exists but nothing was found this week → says what Kelly knows (the training days)', () => {
    expect(weekHeadline({ hasRecurringPlan: true, trainingDays: ['ראשון', 'שלישי'] }, 0)).toContain("The user's training days: ראשון, שלישי");
    expect(weekHeadline({ hasRecurringPlan: true, trainingDays: [] }, 0)).toContain('Do not say with confidence that nothing is planned');
  });

  it('no plan at all → "nothing planned" (the only confident case)', () => {
    expect(weekHeadline({ hasRecurringPlan: false }, 0)).toContain('nothing planned (no recurring schedule and no running plan)');
    const sheet = buildUserContextSheet({ profile: { core: {} }, workouts: [], weekSchedule: [], todayKey: '2026-10-18', areaName: null, now: NOW });
    expect(sheet.hasRecurringPlan).toBe(false);
    expect(buildUserContextSheet({ profile: OWNER, workouts: [], weekSchedule: [], todayKey: '2026-10-18', areaName: null, now: NOW }).hasRecurringPlan).toBe(true);
  });
});

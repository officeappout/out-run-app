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
  return { FieldValue: { serverTimestamp: () => '__ts', increment: (n: number) => ({ __inc: n }) }, Timestamp };
});

import { executeServerTool, loadUserContextSheet, type ServerToolContext } from '../server-tools.server';
import { buildUserContextSheet } from '../context-sheet';
import { chipsForTurn, COACH_ACTIONS } from '../action-chips';
import { renderSheet, buildSessionContext } from '../persona';

const NOW = new Date('2026-10-15T09:00:00Z'); // Thursday in Israel
const ID_LIKE = /\b(UPPER_BODY|LOWER_BODY|FULL_BODY|R\d|RUN-\d|easy_run|long_run|quality_primary|run_plan)\b/;

/** Minimal Admin-SDK-shaped fake: workouts query, userSchedule getAll, programs index. Reads only. */
function fakeDb(workouts: Array<{ date: string; workoutType: string; duration?: number }>, scheduleDocs: Record<string, unknown[]> = {}) {
  const writes: unknown[] = [];
  const query = () => {
    const q: any = { where: () => q, orderBy: () => q, limit: () => q };
    q.get = async () => ({ docs: workouts.map((w) => ({ data: () => ({ ...w, date: { toDate: () => new Date(w.date) } }) })) });
    return q;
  };
  return {
    writes,
    collection: (c: string) => {
      if (c === 'workouts') return query();
      if (c === 'programs') return { get: async () => ({ docs: [] }) };
      if (c === 'authorities') return { doc: () => ({ get: async () => ({ data: () => ({}) }) }) };
      return { doc: (id: string) => ({ id, path: `${c}/${id}` }) };
    },
    getAll: async (...refs: Array<{ id: string }>) =>
      refs.map((r) => {
        const key = r.id.split('_').pop()!;
        const entries = scheduleDocs[key];
        return { exists: !!entries, data: () => ({ entries }) };
      }),
    runTransaction: async () => {
      throw new Error('no writes in these tests');
    },
  };
}

function ctx(db: unknown, scheduleAdvisor: boolean): ServerToolContext {
  return {
    db: db as never,
    uid: 'u1',
    profile: {
      core: { name: 'דנה', gender: 'female' },
      progression: { domains: { push: { currentLevel: 4 } }, activePrograms: [{ templateId: 'push', startDate: '2026-10-11T00:00:00Z' }], tracks: { push: { currentLevel: 4 } } },
      lifestyle: { recurringTemplate: { א: ['pull'], ג: ['push'], ה: ['legs'] }, primaryTrack: 'strength' },
    },
    now: NOW,
    knownCards: new Map(),
    turn: { handoffDone: false },
    scheduleAdvisor,
  };
}

describe('Kelly — recommend_today / recommend_week (read-only, flag ai_coach_schedule_advisor)', () => {
  it('flag off: the tools do not exist', async () => {
    const r = await executeServerTool(ctx(fakeDb([]), false), 'recommend_today', {});
    expect(r.isError).toBe(true);
  });

  it('recommend_today: strength already done today → doneToday, rest, no build — reason codes + Hebrew', async () => {
    const db = fakeDb([
      { date: '2026-10-15T07:00:00Z', workoutType: 'strength', duration: 1800 },
      { date: '2026-10-13T07:00:00Z', workoutType: 'strength', duration: 1800 },
      { date: '2026-10-11T07:00:00Z', workoutType: 'strength', duration: 1800 },
    ]);
    const r = JSON.parse((await executeServerTool(ctx(db, true), 'recommend_today', {})).content);
    expect(r.proposalOnly).toBe(true);
    expect(r.mode).toBe('on_track');
    expect(r.recommendation).toBe('rest');
    expect(r.doneToday).toEqual({ strength: true, run: false });
    expect(r.buildNow).toBeNull();
    expect(r.reasons).toEqual(['TODAY_DONE']);
    expect(r.text).toEqual(['אימון הכוח של היום כבר בוצע.']);
    expect(db.writes).toEqual([]);
  });

  it('recommend_today: planned legs today, not done → buildNow with domains Kelly can pass to generate_workout', async () => {
    const db = fakeDb([{ date: '2026-10-14T07:00:00Z', workoutType: 'walking', duration: 1200 }, { date: '2026-10-13T07:00:00Z', workoutType: 'strength', duration: 1800 }]);
    const r = JSON.parse((await executeServerTool(ctx(db, true), 'recommend_today', {})).content);
    expect(r.recommendation).toBe('strength');
    expect(r.buildNow).toMatchObject({ domains: ['legs'], areasHe: ['רגליים'] });
    expect(JSON.stringify(r.text)).not.toMatch(ID_LIKE);
  });

  it('recommend_today: after 10 days away → fresh_start, no counts, no guilt', async () => {
    const db = fakeDb([{ date: '2026-10-05T07:00:00Z', workoutType: 'strength', duration: 1800 }]);
    const r = JSON.parse((await executeServerTool(ctx(db, true), 'recommend_today', {})).content);
    expect(r.mode).toBe('fresh_start');
    expect(r.reasons).toEqual(['FRESH_START']);
    expect(r.text.join(' ')).not.toMatch(/\d+ ימים|פספס/);
  });

  it('recommend_week: Hebrew names per weekday, no ids, proposal only', async () => {
    const r = JSON.parse((await executeServerTool(ctx(fakeDb([]), true), 'recommend_week', {})).content);
    expect(r.proposalOnly).toBe(true);
    expect(r.days).toHaveLength(7);
    expect(r.days.filter((d: { strength: string[] }) => d.strength.length)).toHaveLength(3);
    expect(r.days.flatMap((d: { strength: string[] }) => d.strength)).toContain('פלג גוף תחתון');
    expect(JSON.stringify(r)).not.toMatch(ID_LIKE);
  });

  it('the sheet carries the plan section + the derived done (flag on), and nothing new with the flag off', async () => {
    const db = fakeDb([{ date: '2026-10-15T07:00:00Z', workoutType: 'strength', duration: 1800 }], {
      '2026-10-15': [{ type: 'training', programIds: ['legs'], scheduledCategories: ['strength'], completed: false }],
    });
    const on = await loadUserContextSheet(ctx(db, true));
    expect(on.plan).toMatchObject({ strengthDays: ['ראשון', 'שלישי', 'חמישי'], todayMode: 'on_track', makeup: null, doneToday: { strength: true, run: false } });
    expect(on.plan!.who).toMatchObject({ strengthTarget: 2, aerobicTarget: 150 });
    expect(on.today[0]).toMatchObject({ completed: true, buildNow: null });
    expect(renderSheet(on)).not.toContain("Today's planned session can be built now");

    const off = await loadUserContextSheet(ctx(db, false));
    expect(off.plan).toBeUndefined();
    expect(off.today[0]).toMatchObject({ completed: false });
  });
});

describe('Kelly — chips', () => {
  const today = [{ date: '2026-10-15', type: 'training', programs: [], startTime: null, completed: false, title: null, buildNow: { durationMin: null, domains: ['legs'] } }];

  it('flag on + recommend_week → open_schedule, build_today, open_builder', () => {
    expect(chipsForTurn({ userText: 'איך לסדר את השבוע', toolNames: ['recommend_week'], sheet: { today }, scheduleAdvisor: true })).toEqual(['open_schedule', 'build_today', 'open_builder']);
  });

  it('no "build today" once a strength workout was done today (bug #8)', () => {
    expect(chipsForTurn({ userText: 'מה בתוכנית השבוע?', toolNames: [], sheet: { today }, scheduleAdvisor: true, strengthDoneToday: true })).toEqual(['open_schedule']);
  });

  it('flag off: exactly the old chips (no open_builder)', () => {
    expect(chipsForTurn({ userText: 'איך לסדר את השבוע', toolNames: ['recommend_week'], sheet: { today } })).toEqual([]);
    expect(chipsForTurn({ userText: 'מה בתוכנית השבוע?', toolNames: [], sheet: { today } })).toEqual(['open_schedule', 'build_today']);
  });

  it('open_builder deep-links into the planner with the builder drawer', () => {
    expect(COACH_ACTIONS.open_builder).toEqual({ label: 'סדר לי את השבוע', href: '/home?openPlanner=true&openBuilder=true' });
  });

  it('the session note about the advisor appears only with the flag', () => {
    const base = { firstName: 'דנה', gender: 'female' as const, todayKey: '2026-10-15', israelDayOfWeek: 4, israelHour: 12 };
    expect(buildSessionContext(base)).not.toContain('recommend_week');
    expect(buildSessionContext({ ...base, scheduleAdvisor: true })).toContain('recommend_week');
  });
});

describe('context sheet derived done is opt-in', () => {
  it('without doneToday the sheet is built exactly as before', () => {
    const sheet = buildUserContextSheet({
      profile: {},
      workouts: [],
      weekSchedule: [{ date: '2026-10-15', type: 'training', programIds: ['legs'] }],
      todayKey: '2026-10-15',
      areaName: null,
      now: NOW,
    });
    expect(sheet.today[0].completed).toBe(false);
    expect(sheet.plan).toBeUndefined();
  });
});

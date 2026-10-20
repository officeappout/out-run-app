/**
 * Planned walks (enable_home_v2 walking signup, `walkplan_` entries) are walks, not runs:
 * their own 'walk' entry, never runFromDoc, done by a logged walk, made up as a walk.
 */
import { describe, it, expect } from 'vitest';
import { adviseToday, detectMissed, materializePlanned } from '..';
import { plannedActivityOf, walkGoalOf } from '../plannedActivity';
import { todayToolResult, sheetPlanOf } from '@/lib/ai/coach/schedule-tools';
import { buildUserContextSheet } from '@/lib/ai/coach/context-sheet';
import { THU, input, runningPart, strengthProfile, threeRunWeeks, w } from './fixtures';
import type { AdvisorProfile, AdvisorScheduleDay } from '../types';

const WED = '2026-10-14';
const TUE = '2026-10-13';

// What walkEntryFor (walking/walkSchedule.ts) writes.
const walkEntry = (date: string, over: Record<string, unknown> = {}) => ({
  entryId: `walkplan_${date}`,
  type: 'training',
  source: 'auto',
  completed: false,
  programIds: [],
  scheduledCategories: ['walking'],
  plannedRun: { goal: { type: 'time', value: 30 }, route: { includeStrength: false, surface: 'road' } },
  ...over,
});
const restOverride = { type: 'rest', override: true };
const strengthEntry = { type: 'training', source: 'manual', programIds: ['push'], scheduledCategories: ['strength'] };

// A walker: no strength template, no running plan.
const walker = (): AdvisorProfile => ({ lifestyle: { recurringTemplate: {} } });
// Hybrid: strength Sun / Tue / Thu, runs Mon / Wed / Sat (quality / easy / long).
const hybrid = (): AdvisorProfile => ({
  ...strengthProfile({ א: ['push'], ג: ['pull'], ה: ['legs'] }),
  running: runningPart(['ב', 'ד', 'ש'], threeRunWeeks(8)),
});

const days = (map: Record<string, unknown[]>): AdvisorScheduleDay[] =>
  Object.entries(map).map(([date, entries]) => ({ date, entries: entries as AdvisorScheduleDay['entries'] }));

describe('plannedActivityOf', () => {
  it('a walkplan_ entry is a walk; a cardio / plannedRun entry is still a run; strength is neither', () => {
    expect(plannedActivityOf(walkEntry(WED))).toBe('walk');
    expect(plannedActivityOf({ type: 'training', scheduledCategories: ['cardio'], plannedRun: { goal: { type: 'time', value: 30 } } })).toBe('run');
    expect(plannedActivityOf({ type: 'training', plannedRun: { goal: { type: 'distance', value: 5 } } })).toBe('run');
    expect(plannedActivityOf(strengthEntry)).toBeNull();
    // A community walking session is not the user's own planned walk.
    expect(plannedActivityOf(walkEntry(WED, { source: 'community' }))).toBe('run');
  });

  it('walkGoalOf reads the goal, null when unreadable', () => {
    expect(walkGoalOf({ goal: { type: 'distance', value: 3 } })).toEqual({ type: 'distance', value: 3 });
    expect(walkGoalOf({ goal: { type: 'pace', value: 3 } })).toBeNull();
    expect(walkGoalOf(undefined)).toBeNull();
  });
});

describe('materializePlanned — walks', () => {
  it('a day with a walkplan_ entry → one walk entry, no run', () => {
    const out = materializePlanned(walker(), [WED], days({ [WED]: [walkEntry(WED)] }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: WED,
      kind: 'walk',
      source: 'override',
      runRef: null,
      runDay: null,
      runName: 'הליכה של 30 דקות',
      walkGoal: { type: 'time', value: 30 },
      completedAtSource: false,
    });
  });

  it('walk + rest override (with a strength entry) on a running-plan day: no run — the walk no longer keeps the plan run', () => {
    const out = materializePlanned(hybrid(), [WED], days({ [WED]: [restOverride, strengthEntry, walkEntry(WED)] }));
    expect(out.map((p) => p.kind)).toEqual(['strength', 'walk']);
  });

  it('walk + rest override alone: the walk stays, no run', () => {
    const out = materializePlanned(hybrid(), [WED], days({ [WED]: [restOverride, walkEntry(WED)] }));
    expect(out.map((p) => p.kind)).toEqual(['walk']);
  });

  it('a real planned run in the doc still keeps the plan run on a rest-override day (unchanged)', () => {
    const runEntry = { type: 'training', source: 'manual', scheduledCategories: ['cardio'], plannedRun: { goal: { type: 'time', value: 30 } } };
    const out = materializePlanned(hybrid(), [WED], days({ [WED]: [restOverride, strengthEntry, runEntry] }));
    expect(out.map((p) => p.kind)).toEqual(['strength', 'run']);
  });

  it('a completed walk entry is done at its source', () => {
    const out = materializePlanned(walker(), [WED], days({ [WED]: [walkEntry(WED, { completed: true })] }));
    expect(out[0].completedAtSource).toBe(true);
  });
});

describe('detectMissed — walks', () => {
  const planned = () => materializePlanned(walker(), [WED], days({ [WED]: [walkEntry(WED)] }));

  it('a logged walk marks it done', () => {
    expect(detectMissed(planned(), [w(WED, 'walk', 30)], THU)[0].status).toBe('done');
  });

  it('a run or strength workout does not complete a walk; no walk → missed', () => {
    expect(detectMissed(planned(), [w(WED, 'run')], THU)[0].status).toBe('missed');
    expect(detectMissed(planned(), [w(WED, 'strength')], THU)[0].status).toBe('missed');
    expect(detectMissed(planned(), [], THU)[0].status).toBe('missed');
  });
});

describe('adviseToday — walks', () => {
  it('a missed walk is reported as a missed walk and made up as a walk, never as a run', () => {
    const advice = adviseToday(input(walker(), { workouts: [w(TUE, 'walk', 30)], scheduleDays: days({ [WED]: [walkEntry(WED)] }) }));
    expect(advice.mode).toBe('makeup');
    expect(advice.recommendation).toBe('walk');
    expect(advice.runEntryRef).toBeNull();
    expect(advice.makeup).toMatchObject({ kind: 'walk', date: WED, status: 'missed' });
    expect(advice.reasons).toContainEqual({ code: 'MAKEUP_MISSED', kind: 'walk', day: 3 });
    expect(advice.notes.some((n) => n.includes('ההליכה') && n.includes('רביעי'))).toBe(true);
    expect(advice.notes.some((n) => n.includes('ריצה'))).toBe(false);

    const tool = todayToolResult(advice, ['push', 'pull', 'legs', 'core']);
    expect(tool.run).toBeNull();
    expect(tool.walk).toEqual({ name: 'הליכה של 30 דקות' });
    expect(sheetPlanOf(advice, null, []).makeup).toEqual({ weekday: 'רביעי', kind: 'walk' });
  });

  it("today's planned walk is recommended as a walk; a logged walk marks it done", () => {
    const sched = days({ [THU]: [walkEntry(THU)] });
    const before = adviseToday(input(walker(), { workouts: [w(WED, 'walk', 30)], scheduleDays: sched }));
    expect(before.recommendation).toBe('walk');
    expect(before.reasons).toContainEqual({ code: 'TODAY_PLANNED', kind: 'walk' });
    expect(before.doneToday).toEqual({ strength: false, run: false, walk: false });
    expect(todayToolResult(before, []).walk).toEqual({ name: 'הליכה של 30 דקות' });

    const after = adviseToday(input(walker(), { workouts: [w(WED, 'walk', 30), w(THU, 'walk', 30)], scheduleDays: sched }));
    expect(after.recommendation).toBe('rest');
    expect(after.reasons).toContainEqual({ code: 'TODAY_DONE', kind: 'walk' });
    expect(after.notes).toContain('ההליכה של היום כבר בוצעה.');
    expect(after.doneToday).toEqual({ strength: false, run: false, walk: true });
    expect(after.today[0].status).toBe('done');
  });

  it("the context sheet marks today's walking entry done only after a logged walk", () => {
    const entry = { ...walkEntry(THU), date: THU };
    const sheet = (walk: boolean | undefined) =>
      buildUserContextSheet({
        profile: {},
        workouts: [],
        areaName: null,
        now: new Date('2026-10-15T09:00:00Z'),
        todayKey: THU,
        weekSchedule: [entry],
        doneToday: { strength: false, run: false, ...(walk === undefined ? {} : { walk }) },
      });
    const walkingOf = (s: ReturnType<typeof buildUserContextSheet>) => s.today[0];
    expect(walkingOf(sheet(true)).kind).toBe('walking');
    expect(walkingOf(sheet(true)).completed).toBe(true);
    expect(walkingOf(sheet(false)).completed).toBeFalsy();
    expect(walkingOf(sheet(undefined)).completed).toBeFalsy();
  });

  it('profiles without walk entries: no walk key, same shape as before', () => {
    const advice = adviseToday(input(hybrid(), { workouts: [w('2026-10-11', 'strength'), w('2026-10-12', 'run'), w(TUE, 'strength'), w(WED, 'run')] }));
    expect(Object.prototype.hasOwnProperty.call(advice.doneToday, 'walk')).toBe(false);
    expect(advice.today.every((t) => !Object.prototype.hasOwnProperty.call(t, 'walkGoal'))).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(todayToolResult(advice, []), 'walk')).toBe(false);
  });
});

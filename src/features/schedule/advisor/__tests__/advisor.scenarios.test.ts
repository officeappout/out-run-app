import { describe, it, expect } from 'vitest';
import { adviseToday, adviseWeek, detectMissed, materializePlanned, periodizationView, runningPhaseOf } from '..';
import { THU, input, runDaysOf, runningPart, strengthDaysOf, strengthProfile, threeRunWeeks, w } from './fixtures';
import { isLongRunDay, isQualityDay } from '../../engine/runningRules';

const CODE_OR_ID = /\b(R\d|RUN-\d|WARN_|UPPER_BODY|LOWER_BODY|FULL_BODY|easy_run|long_run|quality_primary)\b/;

describe('adviseWeek — strength-only, 3 days (push / pull / legs as real program slugs)', () => {
  const profile = strengthProfile({ א: ['push'], ג: ['pull'], ה: ['legs'] });
  const advice = adviseWeek(input(profile))!;

  it('defaults to the strength tab and keeps all 3 days, with the legs day intact', () => {
    expect(advice.controls.mode).toBe('strength');
    expect(strengthDaysOf(advice.week)).toHaveLength(3);
    expect(advice.days.flatMap((d) => d.strength)).toContain('LOWER_BODY');
    expect(runDaysOf(advice.week)).toEqual([]);
  });

  it('a week with room has nothing to explain (no reason that did not bind)', () => {
    expect(advice.reasons.filter((r) => r.code !== 'STRENGTH_DELOAD_WEEK' && r.code !== 'RUN_PEAK_WEEK')).toEqual([]);
  });
});

describe('adviseWeek — running-only, 3 days', () => {
  const profile = { running: runningPart(['ב', 'ד', 'ו'], threeRunWeeks(8)) };

  it('running tab by default, 3 runs, zero strength, never the "no valid week" fallback', () => {
    const advice = adviseWeek(input(profile))!;
    expect(advice.controls.mode).toBe('running');
    expect(runDaysOf(advice.week)).toHaveLength(3);
    expect(strengthDaysOf(advice.week)).toEqual([]);
    expect(advice.reasons.some((r) => r.code === 'NO_VALID_WEEK')).toBe(false);
  });

  it('bug #1: the same runner in the MIXED tab gets no invented strength days and keeps every run', () => {
    const advice = adviseWeek(input(profile, { controls: { mode: 'mixed', availableDayCount: 3 } }))!;
    expect(strengthDaysOf(advice.week)).toEqual([]);
    expect(advice.days.flatMap((d) => d.strength)).not.toContain('UPPER_BODY');
    expect(runDaysOf(advice.week)).toHaveLength(3);
    expect(advice.reasons.some((r) => r.code === 'NO_VALID_WEEK')).toBe(false);
  });
});

describe('adviseWeek — hybrid 3+3 with the long run on Saturday', () => {
  const profile = {
    ...strengthProfile({ א: ['push'], ג: ['pull'], ו: ['legs'] }),
    running: runningPart(['ב', 'ד', 'ש'], threeRunWeeks(8)),
  };
  profile.lifestyle = { ...profile.lifestyle, primaryTrack: 'hybrid' };

  for (const available of [6, 5, 4]) {
    it(`${available} days: every hard rule holds on the final week, and the notes are plain Hebrew`, () => {
      const advice = adviseWeek(input(profile, { controls: { mode: 'mixed', availableDayCount: available } }))!;
      const { strength, running } = advice.week;
      const distinct = new Set([...strengthDaysOf(advice.week), ...runDaysOf(advice.week)]);
      expect(distinct.size).toBeLessThanOrEqual(available);
      for (const day of running) {
        if (day.category === null) continue;
        const s = strength[day.dayOfWeek];
        // R6: no strength on the long-run day.
        if (isLongRunDay(day)) expect(s.sessions.length).toBe(0);
        // R4 / R6b: no LOWER_BODY the day before a quality / long run.
        if ((isLongRunDay(day) || isQualityDay(day)) && day.dayOfWeek > 0) {
          expect(strength[day.dayOfWeek - 1].sessions.map((x) => x.skillId)).not.toContain('LOWER_BODY');
        }
        // R3: a shared quality day is ordered running-first.
        if (isQualityDay(day) && s.sessions.length > 0) {
          expect(advice.sharedDays.find((d) => d.dayOfWeek === day.dayOfWeek)?.order).toBe('running-first');
        }
      }
      // R7: strength keeps at least 2 days.
      expect(strengthDaysOf(advice.week).length).toBeGreaterThanOrEqual(2);
      for (const note of advice.notes) expect(note).not.toMatch(CODE_OR_ID);
    });
  }

  it('6 days: nothing is cut', () => {
    const advice = adviseWeek(input(profile, { controls: { mode: 'mixed', availableDayCount: 6 } }))!;
    expect(strengthDaysOf(advice.week)).toHaveLength(3);
    expect(runDaysOf(advice.week)).toHaveLength(3);
    expect(advice.reductions).toEqual([]);
  });

  it('defaults: mixed tab, availability = questionnaire sum (3 + 3), focus 50 for hybrid', () => {
    const advice = adviseWeek(input(profile))!;
    expect(advice.controls).toEqual({ mode: 'mixed', focus: 50, availableDayCount: 6 });
  });
});

describe('detectMissed + adviseToday — missed Tuesday strength', () => {
  // Pull on Sunday (done), push on Tuesday (missed), a walk on Wednesday. Today = Thursday, nothing planned.
  const profile = strengthProfile({ א: ['pull'], ג: ['push'] });
  const workouts = [w('2026-10-11', 'strength'), w('2026-10-14', 'walk')];

  it('detectMissed: Sunday done (joined with the workout), Tuesday missed', () => {
    const planned = detectMissed(materializePlanned(profile, ['2026-10-11', '2026-10-13'], null), workouts, THU);
    expect(planned.map((p) => [p.date, p.status])).toEqual([
      ['2026-10-11', 'done'],
      ['2026-10-13', 'missed'],
    ]);
  });

  it('today: make up the push session (mode makeup), one reason, no backlog', () => {
    const today = adviseToday(input(profile, { workouts }));
    expect(today.mode).toBe('makeup');
    expect(today.recommendation).toBe('strength');
    expect(today.generateParams?.domains).toEqual(['push']);
    expect(today.makeup).toMatchObject({ date: '2026-10-13', kind: 'strength' });
    expect(today.reasons).toEqual([{ code: 'MAKEUP_MISSED', kind: 'strength', day: 2 }]);
    expect(today.notes.join(' ')).toContain('יום שלישי');
    for (const n of today.notes) expect(n).not.toMatch(CODE_OR_ID);
  });

  it('a userSchedule rest override on Tuesday means nothing was missed', () => {
    const today = adviseToday(
      input(profile, {
        workouts,
        scheduleDays: [{ date: '2026-10-13', entries: [{ type: 'rest', override: true }] }],
      }),
    );
    expect(today.reasons.some((r) => r.code === 'MAKEUP_MISSED')).toBe(false);
  });

  it('bug #8: a strength workout already done today → TODAY_DONE, no second build', () => {
    const p = strengthProfile({ ה: ['push'] }); // Thursday planned
    const today = adviseToday(input(p, { workouts: [w(THU, 'strength')] }));
    expect(today.recommendation).toBe('rest');
    expect(today.reasons[0]).toEqual({ code: 'TODAY_DONE', kind: 'strength' });
    expect(today.generateParams).toBeNull();
  });

  it('a planned legs day before a long run: today\'s workout drops legs (R6b for today)', () => {
    const p = {
      ...strengthProfile({ ה: ['legs', 'push'] }),
      running: runningPart(['ב', 'ד', 'ו'], threeRunWeeks(8)), // Fri = slot 3 = long run
    };
    const today = adviseToday(input(p, { workouts: [w('2026-10-14', 'walk')] }));
    expect(today.recommendation).toBe('strength');
    expect(today.generateParams?.domains).toEqual(['push']);
    expect(today.reasons).toContainEqual({ code: 'KEY_RUN_TOMORROW', run: 'long' });
  });

  it('a planned run today hands back the plan entry for the run player', () => {
    const p = { running: runningPart(['ב', 'ה', 'ש'], threeRunWeeks(8)) }; // Thu = slot 2 = easy
    const today = adviseToday(input(p, { workouts: [w('2026-10-12', 'run')] }));
    expect(today.recommendation).toBe('run');
    expect(today.runEntryRef).toMatchObject({ week: 1, day: 2 });
  });
});

describe('periodization — strength cycle vs running phase', () => {
  it('strength deload week (cycle week 5) + running peak week → both reasons, no hold', () => {
    // Strength started 4 weeks + 4 days before THU → cycle week 5. Running week 6 of 8 → peak.
    const profile = {
      ...strengthProfile({ א: ['push'], ג: ['pull'] }),
      running: runningPart(['ב', 'ד', 'ו'], threeRunWeeks(8), { start: '2026-09-06T00:00:00' }),
    };
    profile.progression!.activePrograms = [{ templateId: 'push', startDate: '2026-09-13T00:00:00' }];
    const view = periodizationView(input(profile));
    expect(view.strengthWeek).toBe(5);
    expect(view.runningWeek).toBe(6);
    expect(view.runningPhase).toBe('peak');
    expect(view.strengthAdjustment).toBe('none');
    const advice = adviseWeek(input(profile, { controls: { mode: 'mixed', availableDayCount: 5 } }))!;
    const codes = advice.reasons.map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['STRENGTH_DELOAD_WEEK', 'RUN_PEAK_WEEK']));
    // Deload → today's strength is easy.
    const p2 = { ...profile, lifestyle: { ...profile.lifestyle, recurringTemplate: { ה: ['push'] } } };
    expect(adviseToday(input(p2, { workouts: [w('2026-10-14', 'walk')] })).generateParams?.difficulty).toBe(1);
  });

  it('strength PEAK (week 4) inside a running peak week → hold strength at build, with its reason', () => {
    const profile = {
      ...strengthProfile({ א: ['push'], ג: ['pull'] }),
      running: runningPart(['ב', 'ד', 'ו'], threeRunWeeks(8), { start: '2026-09-06T00:00:00' }),
    };
    profile.progression!.activePrograms = [{ templateId: 'push', startDate: '2026-09-20T00:00:00' }];
    const view = periodizationView(input(profile));
    expect(view.strengthWeek).toBe(4);
    expect(view.strengthAdjustment).toBe('hold_build');
    const advice = adviseWeek(input(profile))!;
    expect(advice.reasons).toContainEqual({ code: 'STRENGTH_PEAK_IN_RUN_PEAK', strengthWeek: 4, runWeek: 6 });
  });

  it('runningPhaseOf: base → build → peak → taper; maintenance has no peak', () => {
    expect([1, 2, 3, 5, 6, 7, 8].map((wk) => runningPhaseOf(wk, 8, '10k'))).toEqual(['base', 'base', 'build', 'build', 'peak', 'peak', 'taper']);
    expect(runningPhaseOf(7, 8, 'maintenance')).toBe('maintenance');
  });
});

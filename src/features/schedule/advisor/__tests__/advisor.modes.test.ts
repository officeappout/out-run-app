/**
 * Owner policy (18.10.2026): missed workouts never pile up. adviseToday().mode ∈
 * on_track / makeup / welcome_back / fresh_start; at most ONE makeup, ≤2 days old.
 */
import { describe, it, expect } from 'vitest';
import { adviseToday, adviseWeek } from '..';
import { THU, input, runningPart, strengthProfile, threeRunWeeks, w } from './fixtures';

// Hybrid: strength Sun / Tue / Thu (push / pull / legs), runs Mon / Wed / Sat (quality / easy / long).
const hybrid = () => ({
  ...strengthProfile({ א: ['push'], ג: ['pull'], ה: ['legs'] }),
  running: runningPart(['ב', 'ד', 'ש'], threeRunWeeks(8)),
});
// Strength only Sun / Tue — Thursday (today) has nothing planned.
const twoDay = () => strengthProfile({ א: ['pull'], ג: ['push'] });

const NO_COUNTS = /\d+ (ימים|אימונים)|פספס|לא בוצע/;

describe('adviseToday().mode', () => {
  it('on_track: everything done, today\'s plan is offered', () => {
    const today = adviseToday(input(hybrid(), { workouts: [w('2026-10-11', 'strength'), w('2026-10-12', 'run'), w('2026-10-13', 'strength'), w('2026-10-14', 'run')] }));
    expect(today.mode).toBe('on_track');
    expect(today.recommendation).toBe('strength');
    expect(today.makeup).toBeNull();
    expect(today.replan).toEqual([]);
  });

  it('makeup: only the single most recent miss, ≤2 days old', () => {
    const today = adviseToday(input(twoDay(), { workouts: [w('2026-10-11', 'strength'), w('2026-10-14', 'walk')] }));
    expect(today.mode).toBe('makeup');
    expect(today.makeup?.date).toBe('2026-10-13');
    expect(today.reasons.filter((r) => r.code === 'MAKEUP_MISSED')).toHaveLength(1);
  });

  it('on_track (not makeup) when the only miss is older than 2 days — dropped silently, never counted', () => {
    // Pull planned Sun was missed; active Mon–Wed with walks. Today Thu: Sunday is 4 days old.
    const p = strengthProfile({ א: ['pull'] });
    const today = adviseToday(input(p, { workouts: [w('2026-10-12', 'walk'), w('2026-10-13', 'walk'), w('2026-10-14', 'walk')] }));
    expect(today.mode).toBe('on_track');
    expect(today.makeup).toBeNull();
    expect(today.reasons.some((r) => r.code === 'MAKEUP_MISSED')).toBe(false);
  });

  it('no makeup when it would break a recovery rule (strength yesterday)', () => {
    const today = adviseToday(input(twoDay(), { workouts: [w('2026-10-11', 'strength'), w('2026-10-14', 'strength')] }));
    expect(today.mode).toBe('on_track');
    expect(today.makeup).toBeNull();
  });

  it('welcome_back: 2+ planned sessions missed in a row (Tue strength + Wed run) — one light session, week re-planned from today', () => {
    const today = adviseToday(input(hybrid(), { workouts: [w('2026-10-11', 'strength'), w('2026-10-12', 'run')] }));
    expect(today.mode).toBe('welcome_back');
    expect(today.reasons).toEqual([{ code: 'WELCOME_BACK' }]);
    expect(today.recommendation).toBe('strength');
    expect(today.generateParams).toMatchObject({ difficulty: 1, durationMin: 20 });
    expect(today.replan.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(today.replan[0].light).toBe(true);
    expect(today.makeup).toBeNull();
    for (const n of today.notes) expect(n).not.toMatch(NO_COUNTS);
  });

  it('welcome_back: 4-6 days without any workout', () => {
    const today = adviseToday(input(twoDay(), { workouts: [w('2026-10-10', 'strength')] })); // 5 days
    expect(today.mode).toBe('welcome_back');
  });

  it('fresh_start: 7+ days absent — a new, lighter week starting today, no counts', () => {
    const today = adviseToday(input(hybrid(), { workouts: [w('2026-10-05', 'strength')] })); // 10 days
    expect(today.mode).toBe('fresh_start');
    expect(today.reasons).toEqual([{ code: 'FRESH_START' }]);
    expect(today.replan).toHaveLength(7);
    expect(today.replan[0].date).toBe(THU);
    expect(today.replan.every((d) => d.light)).toBe(true);
    for (const n of today.notes) expect(n).not.toMatch(NO_COUNTS);
  });

  it('fresh_start: nothing in the 14-day window while sessions were planned', () => {
    expect(adviseToday(input(hybrid())).mode).toBe('fresh_start');
  });

  it('a brand-new user with nothing planned yet is on_track, not "back"', () => {
    const p = strengthProfile({});
    expect(adviseToday(input(p)).mode).toBe('on_track');
  });
});

describe('adviseWeek — several active programs in one week', () => {
  it('upper-body program + legs program + a 5K plan: each placed by its weekly frequency, each session tagged with its program', () => {
    const profile = {
      ...strengthProfile({ א: ['upper_body'], ג: ['upper_body'], ה: ['legs'] }),
      running: { ...runningPart(['ב', 'ד', 'ש'], threeRunWeeks(8), { target: '5k' }), activeProgram: { ...runningPart(['ב', 'ד', 'ש'], threeRunWeeks(8))!.activeProgram!, programId: 'run_5k_plan' } },
    };
    profile.progression!.activePrograms = [{ templateId: 'upper_body' }, { templateId: 'legs' }];
    const advice = adviseWeek(input(profile, { controls: { mode: 'mixed', availableDayCount: 6 } }))!;
    const tags = advice.days.flatMap((d) => d.strengthProgramIds);
    expect(tags.filter((t) => t === 'upper_body')).toHaveLength(2);
    expect(tags.filter((t) => t === 'legs')).toHaveLength(1);
    const runs = advice.days.filter((d) => d.run);
    expect(runs).toHaveLength(3);
    expect(runs.every((d) => d.run!.programId === 'run_5k_plan')).toBe(true);
    // The legs day keeps its own program tag and never sits the day before a key run.
    const legsDay = advice.days.find((d) => d.strengthProgramIds.includes('legs'))!;
    const next = advice.days[legsDay.dayOfWeek + 1];
    expect(next?.run?.slotType === 'long_run' || next?.run?.slotType === 'quality_primary').toBe(false);
  });
});

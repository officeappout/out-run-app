/**
 * Priority (the "שאלון לו״ז" boards S-4a/b/c) and add-track diff (S-6b / S-6c).
 */
import { describe, expect, it } from 'vitest';
import { buildWeek } from '../buildWeek';
import { validateLayout } from '../validate';
import type { PlacedSession, ScheduleEngineInput, SchedulePriority, WeekPlan } from '../types';

const SUN_THU = { days: [0, 1, 2, 3, 4], windows: { '*': ['evening' as const] }, maxSessionsPerDay: 2 as const };

function boardInput(priority: SchedulePriority): ScheduleEngineInput {
  return {
    availability: SUN_THU,
    strength: [
      { slug: 'push', sessionsPerWeek: 1, priority: 1 },
      { slug: 'pull', sessionsPerWeek: 1, priority: 2 },
      { slug: 'legs', sessionsPerWeek: 1, priority: 3 },
    ],
    running: {
      level: 'intermediate',
      targetDistance: '10k',
      sessions: [{ slot: 'quality_primary' }, { slot: 'quality_secondary' }, { slot: 'long_run' }],
    },
    priority,
    levels: { strength: 'intermediate', running: 'intermediate' },
  };
}

const mains = (p: WeekPlan) => p.days.map((d) => d.sessions.filter((s) => !s.optional && (s.kind === 'run' || s.kind === 'strength')));
const count = (p: WeekPlan, pred: (s: PlacedSession) => boolean) => mains(p).flat().filter(pred).length;
const doubles = (p: WeekPlan) => mains(p).filter((ss) => ss.some((s) => s.kind === 'run') && ss.some((s) => s.kind === 'strength'));

function assertValid(p: WeekPlan, input: ScheduleEngineInput) {
  expect(p.hardViolations).toEqual([]);
  const v = validateLayout(mains(p), { open: p.days.map((d) => d.available), maxPerDay: input.availability.maxSessionsPerDay }, input.levels.running);
  expect(v).toEqual([]);
}

describe('priority', () => {
  it('balanced (S-4b): all six fit, one double on a quality day, run first', () => {
    const input = boardInput('balanced');
    const p = buildWeek(input);
    assertValid(p, input);
    expect(count(p, (s) => s.kind === 'strength')).toBe(3);
    expect(count(p, (s) => s.kind === 'run')).toBe(3);
    const dd = doubles(p);
    expect(dd).toHaveLength(1);
    expect(dd[0][0]).toMatchObject({ kind: 'run' });
    expect(['quality_primary', 'quality_secondary']).toContain(dd[0][0].slot);
    expect(p.days[4].sessions.map((s) => s.slot)).toEqual(['long_run']);
  });

  it('run first (S-4a): quality + long protected, strength down to the floor (2), no doubles', () => {
    const input = boardInput('run_first');
    const p = buildWeek(input);
    assertValid(p, input);
    expect(count(p, (s) => s.kind === 'run')).toBe(3);
    expect(count(p, (s) => s.kind === 'strength')).toBe(2);
    expect(doubles(p)).toHaveLength(0);
    expect(p.dropped).toEqual([{ kind: 'strength', slug: 'legs' }]);
  });

  it('strength first (S-4c): all strength kept, never after a quality run, Q2 gives way', () => {
    const input = boardInput('strength_first');
    const p = buildWeek(input);
    assertValid(p, input);
    expect(count(p, (s) => s.kind === 'strength')).toBe(3);
    expect(count(p, (s) => s.kind === 'run' && s.slot === 'quality_secondary')).toBe(0);
    expect(count(p, (s) => s.kind === 'run' && s.slot === 'long_run')).toBe(1);
    for (const ss of doubles(p)) expect(ss.some((s) => s.slot === 'quality_primary' || s.slot === 'long_run')).toBe(false);
    expect(p.warnings.map((w) => w.code)).toContain('Q2_TO_EASY');
  });

  it('skill: skills stay off run days when there is room', () => {
    const input: ScheduleEngineInput = {
      ...boardInput('skill'),
      availability: { ...SUN_THU, days: [0, 1, 2, 3, 4, 5] },
      strength: [
        { slug: 'planche', sessionsPerWeek: 2, priority: 1 },
        { slug: 'legs', sessionsPerWeek: 1, priority: 2 },
      ],
    };
    const p = buildWeek(input);
    assertValid(p, input);
    for (const ss of mains(p)) {
      if (ss.some((s) => s.slug === 'planche')) expect(ss.some((s) => s.kind === 'run')).toBe(false);
    }
    expect(count(p, (s) => s.slug === 'planche')).toBe(2);
  });

  it('places the long run by TYPE on the last free day — never on the 2nd run day', () => {
    const input = boardInput('balanced');
    const p = buildWeek(input);
    const runDays = mains(p).flatMap((ss, d) => (ss.some((s) => s.kind === 'run') ? [d] : []));
    expect(p.days[runDays[runDays.length - 1]].sessions.some((s) => s.slot === 'long_run')).toBe(true);
    expect(p.days[4].reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['LONG_RUN_PROTECTED', 'LONG_RUN_LAST_FREE_DAY']));
  });
});

describe('add track (existing week kept, minimal moves, diff)', () => {
  it('S-6b strength user adds running: strength stays, legs moves off the day before the long run', () => {
    const input: ScheduleEngineInput = {
      availability: { days: [0, 1, 2, 3, 4, 5], windows: { '*': ['evening'] }, maxSessionsPerDay: 2 },
      strength: [
        { slug: 'push', sessionsPerWeek: 1, priority: 1 },
        { slug: 'pull', sessionsPerWeek: 1, priority: 2 },
        { slug: 'legs', sessionsPerWeek: 1, priority: 3 },
      ],
      running: {
        level: 'beginner',
        targetDistance: '10k',
        sessions: [{ slot: 'quality_primary' }, { slot: 'easy_run' }, { slot: 'long_run' }],
      },
      priority: 'strength_first',
      levels: { strength: 'intermediate', running: 'beginner' },
      existing: {
        mode: 'add_track',
        days: { 0: [{ kind: 'strength', slug: 'push' }], 2: [{ kind: 'strength', slug: 'pull' }], 4: [{ kind: 'strength', slug: 'legs' }] },
      },
    };
    const p = buildWeek(input);
    assertValid(p, input);
    expect(p.days[5].sessions.map((s) => s.slot)).toEqual(['long_run']);
    const byStatus = (st: string) => p.diff.filter((x) => x.status === st);
    expect(byStatus('kept').map((x) => x.toDow)).toEqual([0, 2]);
    expect(byStatus('new')).toHaveLength(3);
    const moved = byStatus('moved');
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ session: { kind: 'strength', slug: 'legs' }, fromDow: 4 });
    expect(moved[0].labelHe).toMatch(/^הוזז: רגליים מחמישי ל.+ · כי לא לפני הארוכה$/);
    expect(byStatus('new').every((x) => x.labelHe === 'חדש')).toBe(true);
  });

  it('S-6c runner adds strength: runs never move, strength lands around them', () => {
    const input: ScheduleEngineInput = {
      availability: { days: [0, 1, 2, 3, 4, 5], windows: { '*': ['evening'] }, maxSessionsPerDay: 2 },
      strength: [{ slug: 'full_body', sessionsPerWeek: 2, priority: 1 }],
      running: {
        level: 'intermediate',
        targetDistance: '10k',
        sessions: [{ slot: 'quality_primary' }, { slot: 'easy_run' }, { slot: 'long_run' }],
      },
      priority: 'run_first',
      levels: { strength: 'beginner', running: 'intermediate' },
      existing: {
        mode: 'add_track',
        days: { 0: [{ kind: 'run', slot: 'quality_primary' }], 2: [{ kind: 'run', slot: 'easy_run' }], 5: [{ kind: 'run', slot: 'long_run' }] },
      },
    };
    const p = buildWeek(input);
    assertValid(p, input);
    expect(p.diff.filter((x) => x.session.kind === 'run').every((x) => x.status === 'kept')).toBe(true);
    expect(p.diff.filter((x) => x.status === 'new')).toHaveLength(2);
    expect(p.days[4].sessions.some((s) => s.kind === 'strength' && s.slug === 'full_body')).toBe(false);
  });

  it('frozen history: days before today keep their sessions and are not re-planned', () => {
    const input: ScheduleEngineInput = {
      ...boardInput('balanced'),
      existing: {
        mode: 'rebuild',
        days: { 0: [{ kind: 'run', slot: 'quality_primary' }, { kind: 'strength', slug: 'legs' }], 1: [{ kind: 'strength', slug: 'push' }] },
      },
      history: { todayDow: 2 },
    };
    const p = buildWeek(input);
    expect(p.days[0].sessions.map((s) => s.slot ?? s.slug)).toEqual(['quality_primary', 'legs']);
    expect(p.days[1].sessions.map((s) => s.slug)).toEqual(['push']);
    expect(count(p, (s) => s.slot === 'quality_primary')).toBe(1);
    expect(p.diff.every((x) => (x.toDow ?? 7) >= 2)).toBe(true);
  });
});

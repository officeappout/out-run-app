/**
 * add_only — "השאר כמו שהיה ורק הוסף בימים פנויים" (boards S-6b / S-6c secondary):
 * the existing week never moves; the new track goes only into free days.
 */
import { describe, expect, it } from 'vitest';
import { buildWeek } from '../buildWeek';
import type { ScheduleEngineInput } from '../types';

const STRENGTH_WEEK: ScheduleEngineInput = {
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
    mode: 'add_only',
    days: { 0: [{ kind: 'strength', slug: 'push' }], 2: [{ kind: 'strength', slug: 'pull' }], 4: [{ kind: 'strength', slug: 'legs' }] },
  },
};

describe('engine v2 · add_only', () => {
  it('keeps every existing session on its day and adds runs only on free days', () => {
    const p = buildWeek(STRENGTH_WEEK);
    expect(p.days[0].sessions.map((s) => s.slug)).toEqual(['push']);
    expect(p.days[2].sessions.map((s) => s.slug)).toEqual(['pull']);
    expect(p.days[4].sessions.map((s) => s.slug)).toEqual(['legs']);
    for (const d of [0, 2, 4]) expect(p.days[d].sessions.some((s) => s.kind === 'run')).toBe(false);
    expect(p.diff.some((x) => x.status === 'moved' || x.status === 'removed')).toBe(false);
    expect(p.diff.filter((x) => x.status === 'kept').map((x) => x.toDow)).toEqual([0, 2, 4]);
    const runDays = p.days.filter((d) => d.sessions.some((s) => s.kind === 'run')).map((d) => d.dow);
    for (const d of runDays) expect([1, 3, 5]).toContain(d);
  });

  it('the day after heavy legs is still not a key run day (hard rules see pinned sessions)', () => {
    const p = buildWeek(STRENGTH_WEEK);
    expect(p.days[5].sessions.some((s) => s.slot === 'long_run' || s.slot === 'quality_primary')).toBe(false);
    expect(p.hardViolations).toEqual([]);
  });

  it('drops what cannot fit instead of moving anything, and says so', () => {
    const p = buildWeek({ ...STRENGTH_WEEK, availability: { ...STRENGTH_WEEK.availability, days: [0, 1, 2, 4] } });
    expect(p.diff.some((x) => x.status === 'moved')).toBe(false);
    expect(p.dropped.length).toBeGreaterThan(0);
    expect(p.warnings.map((w) => w.code)).toContain('RUNNING_REDUCED');
  });

  it('add_track (default) may still move a session the hard rules force out', () => {
    const p = buildWeek({ ...STRENGTH_WEEK, existing: { ...STRENGTH_WEEK.existing!, mode: 'add_track' } });
    expect(p.diff.filter((x) => x.status === 'moved')).toHaveLength(1);
  });
});

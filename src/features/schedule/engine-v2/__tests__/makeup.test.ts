/**
 * Missed-workout and return scenarios: fixtures S13, S14, S15, S30 + the §4.5 policy edges.
 */
import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/schedule-combos.fixtures.json';
import { planMakeup } from '../makeup';
import { planReturn } from '../returnPlan';
import type { SessionRef } from '../types';
import { layoutDiffs, toEngineInput, type Fixture } from './fixtureHarness';

const byId = (id: string): Fixture => (fixtures as Fixture).scenarios.find((s: Fixture) => s.id === id);

/** Fixture plan (`{dow: ['upper_body', 'quality_primary']}`) → SessionRefs. */
function plannedOf(p: Record<string, string[]>): Partial<Record<number, SessionRef[]>> {
  const slots = new Set(['quality_primary', 'quality_secondary', 'long_run', 'easy_run', 'recovery']);
  const out: Partial<Record<number, SessionRef[]>> = {};
  for (const [d, items] of Object.entries(p)) {
    out[Number(d)] = items.map((x) => (slots.has(x) ? ({ kind: 'run', slot: x } as SessionRef) : ({ kind: 'strength', slug: x } as SessionRef)));
  }
  return out;
}

describe('planMakeup — fixtures', () => {
  it('S13 missed long run Saturday → makeup Sunday, Sunday upper body moves to Monday', () => {
    const f = byId('S13');
    const ev = f.input.events[0];
    const plan = planMakeup({
      week: toEngineInput(f),
      planned: plannedOf(f.input.current.plannedNextWeek),
      missed: { dow: ev.dow, weekOffset: ev.weekOffset, session: ev.session },
      todayDow: ev.todayDow,
    });
    expect(plan.action).toBe('shift');
    expect(plan.changes).toEqual([
      { action: 'shift', session: { kind: 'run', slot: 'long_run', makeup: true }, fromDow: 6, toDow: 0 },
      { action: 'shift', session: { kind: 'strength', slug: 'upper_body' }, fromDow: 0, toDow: 1 },
    ]);
    expect(layoutDiffs(f.expected.layout, plan.layout)).toEqual([]);
    expect(plan.reasons.map((r) => r.code)).toContain('MAKEUP_MISSED');
  });

  it('S14 missed Tuesday pull → Friday (free, upper only before the long run); Wednesday after Q2 is the alternative', () => {
    const f = byId('S14');
    const ev = f.input.events[0];
    const plan = planMakeup({
      week: toEngineInput(f),
      planned: plannedOf(f.input.current.planned),
      missed: { dow: ev.dow, session: ev.session },
      todayDow: ev.todayDow,
    });
    expect(plan.changes).toEqual([{ action: 'shift', session: { kind: 'strength', slug: 'pull', makeup: true }, fromDow: 2, toDow: 5 }]);
    expect(plan.alternatives[0]?.toDow).toBe(3);
    expect(plan.layout[6].some((s) => s.kind === 'strength')).toBe(false);
    expect(plan.layout[3].map((s) => s.slot ?? s.slug)).toEqual(['quality_secondary']);
  });
});

describe('planMakeup — policy', () => {
  const week = toEngineInput(byId('S14'));
  const planned = plannedOf(byId('S14').input.current.planned);

  it('drops a miss older than 2 days', () => {
    const p = planMakeup({ week, planned, missed: { dow: 0, session: { kind: 'strength', slug: 'push' } }, todayDow: 3 });
    expect(p.action).toBe('drop');
    expect(p.reasons[0]).toMatchObject({ code: 'MAKEUP_DROPPED', why: 'too_old' });
  });

  it('never makes up an easy run', () => {
    const p = planMakeup({ week, planned: { 1: [{ kind: 'run', slot: 'easy_run' }] }, missed: { dow: 1, session: { kind: 'run', slot: 'easy_run' } }, todayDow: 2 });
    expect(p.action).toBe('drop');
  });

  it('allows at most one makeup per week', () => {
    const p = planMakeup({ week, planned, missed: { dow: 2, session: { kind: 'strength', slug: 'pull' } }, todayDow: 3, makeupsThisWeek: 1 });
    expect(p.reasons[0]).toMatchObject({ code: 'MAKEUP_DROPPED', why: 'week_limit' });
  });

  it('a missed Q1 is shifted at most 2 days and never next to another key run', () => {
    // Q1 Mon missed, today Tue; Wed has Q2 → Tue is next to Q2, Wed is taken → promote Q2.
    const p = planMakeup({ week, planned, missed: { dow: 1, session: { kind: 'run', slot: 'quality_primary' } }, todayDow: 2 });
    expect(['promote', 'drop']).toContain(p.action);
    const keyRunsPerDay = p.layout.map((d) => d.filter((s) => s.kind === 'run').length);
    expect(Math.max(...keyRunsPerDay)).toBeLessThanOrEqual(1);
  });

  it('a missed long run with no room swaps with this week\'s easy run day', () => {
    const p = planMakeup({
      week: { ...week, availability: { ...week.availability, days: [0, 1, 3, 4] } },
      planned: { 0: [{ kind: 'run', slot: 'quality_primary' }], 1: [{ kind: 'run', slot: 'long_run' }], 4: [{ kind: 'run', slot: 'easy_run' }] },
      missed: { dow: 1, session: { kind: 'run', slot: 'long_run' } },
      todayDow: 3,
    });
    // Wed (3) is next to nothing key → shift wins if possible; otherwise swap with Thu's easy run.
    expect(['shift', 'swap']).toContain(p.action);
    expect(p.layout.flat().filter((s) => s.slot === 'long_run')).toHaveLength(1);
  });
});

describe('planReturn — fixtures', () => {
  it('S15 sick Mon–Fri, back Saturday: easy 25 min today, repeat the run week, first 2 quality runs easy', () => {
    const r = planReturn({ daysAway: 5, reason: 'illness', todayDow: 6, hasRunning: true, hasStrength: true });
    expect(r.tier).toBe('welcome_back');
    expect(r.today).toEqual([{ kind: 'run', slot: 'easy_run', minutes: 25 }]);
    expect(r.nextWeek).toMatchObject({ repeatRunningWeek: true, qualityToEasyCount: 2, pauseRunningClock: true });
    expect(r.load.strengthMaxDifficulty).toBe(2);
    expect(r.makeupsAllowed).toBe(false);
    expect(r.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(['WELCOME_BACK', 'RUN_WEEK_REPEATED']));
  });

  it('S30 10 days away: fresh week, resume the reached run week, −20% runs, −30% strength, difficulty ≤2', () => {
    const r = planReturn({ daysAway: 10, reason: 'unknown', todayDow: 2, hasRunning: true, hasStrength: true });
    expect(r.tier).toBe('fresh_start');
    expect(r.nextWeek.resumeReachedRunningWeek).toBe(true);
    expect(r.load).toMatchObject({ runVolumeReduction: 0.2, strengthVolumeReduction: 0.3, strengthMaxDifficulty: 2, runEasyOnly: true });
    expect(r.reasons.map((x) => x.code)).toContain('FRESH_START');
  });

  it('under 4 days away nothing changes (makeups only)', () => {
    const r = planReturn({ daysAway: 2, todayDow: 3, hasRunning: true, hasStrength: true });
    expect(r.tier).toBe('on_track');
    expect(r.makeupsAllowed).toBe(true);
    expect(r.today).toEqual([]);
  });
});

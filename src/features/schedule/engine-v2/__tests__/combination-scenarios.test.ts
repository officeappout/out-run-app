/**
 * engine-combination-rules.md §4 (S01-S15) encoded as engine tests, for the rules approved on
 * 27.10.2026: R26 focus, R27 upper = push + pull, R28 skill focus days, R29 legs on an easy-run
 * day, R30 quality runs alone or with upper body only, R31 core finisher. Expected week SHAPE,
 * not one exact layout (the engine may pick any day that keeps the rules).
 *
 * Not here: S10 (one-arm pull-up threshold, R22), S12 (health programs, R23-R25 are proposals),
 * S16 (mid-week level change, proposal). S13 (optional core card) is in
 * workout-engine/logic/protocols/__tests__/core-weekly-target.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { buildWeek } from '../buildWeek';
import { HEAVY_LEGS, MODERATE_LEGS, profileOf } from '../programProfiles';
import { breaksH11 } from '../rules';
import { makeRunUnit, makeStrengthUnit } from '../units';
import { validateLayout } from '../validate';
import { orderDay } from '../finalize';
import { renderV2ReasonHe } from '../reasonsV2';
import { planHybridWeek, planStructure } from '../structure';
import type { StrengthDay } from '../structure';
import type { PlacedSession, ScheduleEngineInput, WeekPlan } from '../types';

const isQuality = (s: PlacedSession) => s.kind === 'run' && (s.slot === 'quality_primary' || s.slot === 'quality_secondary');
const isEasy = (s: PlacedSession) => s.kind === 'run' && (s.slot === 'easy_run' || s.slot === 'recovery');
const isKey = (s: PlacedSession) => isQuality(s) || (s.kind === 'run' && s.slot === 'long_run');
const strengthOf = (ss: PlacedSession[]) => ss.filter((s) => s.kind === 'strength' && !s.optional);
const legsOf = (s: PlacedSession) => profileOf(s.slug ?? '').load.legs;
const compact = (p: WeekPlan) =>
  p.days.map((d) => d.sessions.filter((s) => !s.optional).map((s) => (s.kind === 'run' ? s.slot : s.slug)).join('+') || '-').join(' | ');

/** R29 + R30 + H2 + H3 over a finished week. */
function hybridRuleFailures(plan: WeekPlan): string[] {
  const out: string[] = [];
  const days = plan.days.map((d) => d.sessions.filter((s) => !s.optional));
  days.forEach((ss, d) => {
    const st = strengthOf(ss);
    const next = days[(d + 1) % 7];
    if (ss.some(isQuality) && st.some((s) => legsOf(s) >= MODERATE_LEGS)) out.push(`R30 day ${d}: legs next to a quality run`);
    if (ss.some((s) => s.kind === 'run' && s.slot === 'long_run') && st.length) out.push(`H2 day ${d}: strength on the long-run day`);
    if (st.some((s) => legsOf(s) >= HEAVY_LEGS) && next.some(isKey)) out.push(`R29 day ${d}: legs the day before a key run`);
    const legsAt = ss.findIndex((s) => s.kind === 'strength' && legsOf(s) >= HEAVY_LEGS);
    const easyAt = ss.findIndex(isEasy);
    if (legsAt >= 0 && easyAt >= 0 && legsAt < easyAt) out.push(`R29 day ${d}: legs before the easy run`);
  });
  if (plan.hardViolations.length) out.push(`hard: ${plan.hardViolations.join(',')}`);
  return out;
}

const legsOnEasyDay = (plan: WeekPlan) =>
  plan.days.some((d) => d.sessions.some(isEasy) && strengthOf(d.sessions).some((s) => legsOf(s) >= HEAVY_LEGS));

const SUN_THU = [0, 1, 2, 3, 4];

describe('H11 = R29 + R30 (hard)', () => {
  it('no leg load next to intervals / tempo; upper body is fine; easy days are fine', () => {
    const q = makeRunUnit('quality_primary');
    expect(breaksH11(makeStrengthUnit('legs'), q)).toBe(true);
    expect(breaksH11(makeStrengthUnit('full_body'), q)).toBe(true);
    expect(breaksH11(makeStrengthUnit('upper_body'), q)).toBe(false);
    expect(breaksH11(makeStrengthUnit('planche'), makeRunUnit('quality_secondary'))).toBe(false);
    expect(breaksH11(makeStrengthUnit('legs'), makeRunUnit('easy_run'))).toBe(false);
    expect(breaksH11(makeStrengthUnit('legs'), null)).toBe(false);
  });
  it('validateLayout reports a legs + quality day as H11', () => {
    const layout: PlacedSession[][] = [[{ kind: 'run', slot: 'quality_primary' }, { kind: 'strength', slug: 'legs' }], [], [], [], [], [], []];
    expect(validateLayout(layout, { open: Array(7).fill(true), maxPerDay: 2 }, 'intermediate').map((v) => v.rule)).toEqual(['H11']);
  });
  it('legs on an easy-run day go after the run, even with strength first', () => {
    const order = orderDay(makeRunUnit('easy_run'), makeStrengthUnit('legs'), 'strength_first');
    expect(order.map((s) => s.kind)).toEqual(['run', 'strength']);
    expect(orderDay(makeRunUnit('easy_run'), makeStrengthUnit('upper_body'), 'strength_first').map((s) => s.kind)).toEqual(['strength', 'run']);
  });
  it('the legs + easy run reason renders as Hebrew text', () => {
    const t = renderV2ReasonHe({ code: 'LEGS_AFTER_EASY_RUN', day: 1 });
    expect(t).toMatch(/[֐-׿]/);
    expect(t).not.toContain('engine.reason');
    expect(t).not.toContain('\u2014');
  });
});

describe('5-day hybrid templates through buildWeek (R26)', () => {
  const run = (focus: 'strength' | 'balanced' | 'run', days: number[], skills = false) => {
    const h = planHybridWeek({ focus, levels: { push: 18, pull: 18, legs: 12 }, skills: skills ? [{ id: 'planche' }, { id: 'front_lever' }] : [] });
    const input: ScheduleEngineInput = {
      availability: { days, maxSessionsPerDay: 2 },
      strength: h.strengthPrograms,
      running: { level: 'intermediate', targetDistance: '10k', sessions: h.runSessions },
      priority: h.priority,
      levels: { strength: 'advanced', running: 'intermediate' },
    };
    return buildWeek(input);
  };

  it('strength focus, Sun-Thu: the template itself (upper | legs + easy | upper | tempo | full body)', () => {
    const p = run('strength', SUN_THU, true);
    expect(compact(p)).toBe('upper_body | easy_run+legs | upper_body | quality_primary | full_body | - | -');
    expect(hybridRuleFailures(p)).toEqual([]);
    expect(p.dropped).toEqual([]);
  });

  it('half-half, Sun-Thu: everything placed, legs after the easy run, intervals alone, long run alone', () => {
    const p = run('balanced', SUN_THU);
    expect(hybridRuleFailures(p)).toEqual([]);
    expect(p.dropped).toEqual([]);
    expect(legsOnEasyDay(p)).toBe(true);
    // Template order puts legs the day before the intervals (H3); the engine swaps them.
    expect(compact(p)).toBe('upper_body | quality_primary | easy_run+legs | upper_body | long_run | - | -');
  });

  it('run focus needs room: 5 run days in a row break the run-streak cap (H8), so a full week spreads them', () => {
    const tight = run('run', SUN_THU);
    expect(tight.warnings.map((w) => w.code)).toContain('RUNNING_REDUCED');
    const p = run('run', [0, 1, 2, 3, 4, 5, 6]);
    expect(p.dropped).toEqual([]);
    expect(hybridRuleFailures(p)).toEqual([]);
    expect(p.days.flatMap((d) => strengthOf(d.sessions)).length).toBe(2);
  });
});

describe('§4 scenarios', () => {
  const s01 = (priority?: ScheduleEngineInput['priority']): ScheduleEngineInput => ({
    availability: { days: SUN_THU, maxSessionsPerDay: 2 },
    strength: [
      { slug: 'planche', sessionsPerWeek: 1, priority: 1 },
      { slug: 'front_lever', sessionsPerWeek: 1, priority: 2 },
      { slug: 'legs', sessionsPerWeek: 1, priority: 3 },
    ],
    running: {
      level: 'intermediate',
      targetDistance: '10k',
      sessions: [{ slot: 'quality_primary', workout: 'intervals' }, { slot: 'quality_secondary', workout: 'tempo' }, { slot: 'long_run' }],
    },
    priority,
    levels: { strength: 'advanced', running: 'intermediate' },
  });

  it('S01 half-half: quality runs 48h apart, planche and front lever on their own days, long run Thursday alone; legs never after the intervals (R30)', () => {
    const p = buildWeek(s01());
    expect(hybridRuleFailures(p)).toEqual([]);
    expect(compact(p)).toBe('quality_primary | planche | quality_secondary | front_lever | long_run | - | -');
    // CHANGED vs the canvas (legs after Sunday's intervals): no easy-run day exists, so legs is dropped and reported.
    expect(p.dropped).toEqual([{ kind: 'strength', slug: 'legs' }]);
    expect(p.warnings.map((w) => w.code)).toContain('STRENGTH_REDUCED_LONG_RUN_PROTECTED');
  });

  it('S01 strength focus: the tempo becomes an easy run and legs follow it (R26 + R29)', () => {
    const p = buildWeek(s01('strength_first'));
    expect(hybridRuleFailures(p)).toEqual([]);
    expect(p.dropped).toEqual([]);
    expect(legsOnEasyDay(p)).toBe(true);
    expect(p.warnings.map((w) => w.code)).toContain('Q2_TO_EASY');
  });

  it('S02 beginner, 3 days, no runs: full body x3 rotating push / pull / legs, never back to back', () => {
    const st = planStructure({ days: 3, levels: { push: 3, pull: 3, legs: 3 } });
    const s = st.sequence as StrengthDay[];
    expect(s.map((d) => d.kind)).toEqual(['full_body', 'full_body', 'full_body']);
    expect(s.map((d) => d.emphasis)).toEqual(['push', 'pull', 'legs']);
    const p = buildWeek({
      availability: { days: [0, 1, 2, 3, 4, 5], maxSessionsPerDay: 1 },
      strength: [{ slug: 'full_body', sessionsPerWeek: 3, priority: 1 }],
      running: null,
      levels: { strength: 'beginner', running: null },
    });
    const days = p.days.filter((d) => strengthOf(d.sessions).length).map((d) => d.dow);
    expect(days).toHaveLength(3);
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThan(1);
  });

  it('S03 beginner, 5 days: 3 full-body days + 2 movement days, every strength day ends with core (R31)', () => {
    const st = planStructure({ days: 5, levels: { push: 3, pull: 3, legs: 3 } });
    expect(st.strengthDays).toBe(3);
    expect(st.movementDays).toBe(2);
    expect(st.sequence.map((d) => d.type[0]).join('')).not.toContain('ss');
    expect(st.coreFinisher.gate).toBe('weekly_target');
  });

  it('S04 intermediate, 4 days: upper / lower x2, upper = push + pull together (R27)', () => {
    const st = planStructure({ days: 4, levels: { push: 9, pull: 9, legs: 9 }, sessionMinutes: 30 });
    const s = st.sequence as StrengthDay[];
    expect(s.map((d) => d.kind)).toEqual(['upper', 'lower', 'upper', 'lower']);
    expect(s.filter((d) => d.kind === 'upper').every((d) => d.pairing === 'push_pull_supersets')).toBe(true);
  });

  it('S05 intermediate, 5 days: upper / lower x2 + full body; every group at least twice', () => {
    const s = planStructure({ days: 5, levels: { push: 9, pull: 9, legs: 9 } }).sequence as StrengthDay[];
    expect(s.map((d) => d.kind).sort()).toEqual(['full_body', 'lower', 'lower', 'upper', 'upper']);
  });

  it('S06 advanced, 6 days, 30 min, high: PPL x2, EMOM / AMRAP / circuits first', () => {
    const s = planStructure({ days: 6, levels: { push: 16, pull: 16, legs: 16 }, sessionMinutes: 30, intensity: 'high' }).sequence as StrengthDay[];
    expect(s.map((d) => d.kind).sort()).toEqual(['legs', 'legs', 'pull', 'pull', 'push', 'push']);
    expect(s.every((d) => d.style && d.style.primary !== 'strength')).toBe(true);
  });

  it('S07 intermediate, 7 days: PPL x2 + one movement day', () => {
    const st = planStructure({ days: 7, levels: { push: 9, pull: 9, legs: 9 } });
    expect(st.strengthDays).toBe(6);
    expect(st.movementDays).toBe(1);
  });

  it('S08 full body x2 + quality, easy, long (Sun-Fri): long run Friday alone, no full body next to the quality run', () => {
    const p = buildWeek({
      availability: { days: [0, 1, 2, 3, 4, 5], maxSessionsPerDay: 2 },
      strength: [{ slug: 'full_body', sessionsPerWeek: 2, priority: 1 }],
      running: { level: 'intermediate', targetDistance: '10k', sessions: [{ slot: 'quality_primary' }, { slot: 'easy_run' }, { slot: 'long_run' }] },
      levels: { strength: 'intermediate', running: 'intermediate' },
    });
    expect(hybridRuleFailures(p)).toEqual([]);
    expect(p.days[5].sessions.map((s) => s.slot)).toEqual(['long_run']);
    const doubles = p.days.filter((d) => d.sessions.some((s) => s.kind === 'run') && strengthOf(d.sessions).length).length;
    expect(doubles).toBeLessThanOrEqual(1);
  });

  it('S09 front lever with an intermediate average, 3 days, 40 min: the skill leads a 12-15 min block each day + soft hint', () => {
    const st = planStructure({ days: 3, levels: { push: 12, pull: 15, legs: 10 }, skills: [{ id: 'front_lever' }], sessionMinutes: 40 });
    expect(st.band).toBe('intermediate');
    const s = st.sequence as StrengthDay[];
    expect(s.every((d) => d.kind === 'full_body' && d.skill?.lead === 'front_lever')).toBe(true);
    expect(s.every((d) => d.skill!.leadMinutes! >= 12 && d.skill!.leadMinutes! <= 15)).toBe(true);
    expect(st.notes.map((n) => n.code)).toEqual(expect.arrayContaining(['skill_leads_despite_week_band', 'skill_hint_add_day_or_pick_focus']));
  });

  it('S11 planche + front lever, 5 days: different upper days, each with a little of the other side, then a combined day (R28)', () => {
    const s = planStructure({ days: 5, levels: { push: 18, pull: 18, legs: 12 }, skills: [{ id: 'planche' }, { id: 'front_lever' }] })
      .sequence as StrengthDay[];
    const focus = s.filter((d) => d.skill);
    expect(focus.map((d) => [d.kind, d.skill!.lead, d.skill!.otherSide])).toEqual([
      ['upper', 'planche', 'pull'],
      ['upper', 'front_lever', 'push'],
    ]);
    expect(s.filter((d) => d.kind === 'full_body').every((d) => !d.skill)).toBe(true);
  });

  it('S14 intermediate, 4 runs + legs + core (Sun-Fri): legs after the easy run, long run Friday, run streak within the cap', () => {
    const p = buildWeek({
      availability: { days: [0, 1, 2, 3, 4, 5], maxSessionsPerDay: 2 },
      strength: [{ slug: 'legs', sessionsPerWeek: 1, priority: 1 }, { slug: 'core', sessionsPerWeek: 1, priority: 2 }],
      running: {
        level: 'intermediate',
        targetDistance: '10k',
        sessions: [{ slot: 'quality_primary' }, { slot: 'quality_secondary' }, { slot: 'easy_run' }, { slot: 'long_run' }],
      },
      levels: { strength: 'intermediate', running: 'intermediate' },
    });
    expect(hybridRuleFailures(p)).toEqual([]);
    expect(legsOnEasyDay(p)).toBe(true);
    expect(p.days[5].sessions.map((s) => s.slot)).toEqual(['long_run']);
    const legsDay = p.days.find((d) => strengthOf(d.sessions).some((s) => s.slug === 'legs'))!;
    expect(legsDay.reasons.map((r) => r.code)).toContain('LEGS_AFTER_EASY_RUN');
  });

  it('S15 advanced, no skills, 3 days, 60 min: full body x3, varied finishers, no skill tag', () => {
    const s = planStructure({ days: 3, levels: { push: 16, pull: 16, legs: 16 }, sessionMinutes: 60 }).sequence as StrengthDay[];
    expect(s.every((d) => d.kind === 'full_body' && !d.skill)).toBe(true);
    expect(new Set(s.map((d) => d.style!.finisher)).size).toBeGreaterThan(1);
  });
});

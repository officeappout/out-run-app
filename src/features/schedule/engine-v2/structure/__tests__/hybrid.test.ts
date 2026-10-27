import { describe, expect, it } from 'vitest';
import { CORE_FINISHER, FOCUS_PRIORITY, focusOfPriority, HYBRID_TEMPLATES, planHybridWeek, planStructure, runSlotOf } from '..';
import type { GroupLevels, HybridDay, StrengthDay } from '..';

const HI: GroupLevels = { push: 18, pull: 18, legs: 12 };
const TWO_SKILLS = [{ id: 'planche' as const }, { id: 'front_lever' as const }];
const strengthOf = (days: HybridDay[]) => days.map((d) => d.strength).filter((d): d is StrengthDay => !!d);

describe('R26: focus', () => {
  it('maps onto the existing priority both ways', () => {
    expect(FOCUS_PRIORITY).toEqual({ strength: 'strength_first', balanced: 'balanced', run: 'run_first' });
    expect(focusOfPriority('strength_first')).toBe('strength');
    expect(focusOfPriority('run_first')).toBe('run');
    expect(focusOfPriority('balanced')).toBe('balanced');
    expect(focusOfPriority('skill')).toBe('balanced');
  });
  it('the focus decides the hard days of each side', () => {
    const count = (f: 'strength' | 'balanced' | 'run') => {
      const h = planHybridWeek({ focus: f, levels: HI });
      return { strength: strengthOf(h.days).length, runs: h.runSessions.length };
    };
    expect(count('strength')).toEqual({ strength: 4, runs: 2 });
    expect(count('balanced')).toEqual({ strength: 3, runs: 3 });
    expect(count('run')).toEqual({ strength: 2, runs: 5 });
  });
});

describe('5-day templates (owner 27.10.2026)', () => {
  const shape = (f: 'strength' | 'balanced' | 'run') =>
    HYBRID_TEMPLATES[f].map((d) => [d.strength, d.run].filter(Boolean).join('+'));
  it('strength focus: upper A | legs + easy | upper B | tempo | combined', () => {
    expect(shape('strength')).toEqual(['upper', 'lower+easy', 'upper', 'tempo', 'full_body']);
  });
  it('half-half: upper | legs + easy | intervals | upper | long', () => {
    expect(shape('balanced')).toEqual(['upper', 'lower+easy', 'intervals', 'upper', 'long']);
  });
  it('run focus: easy + upper | intervals | legs + easy | tempo | long (strength twice)', () => {
    expect(shape('run')).toEqual(['upper+easy', 'intervals', 'lower+easy', 'tempo', 'long']);
  });
  it('R29 / R30 hold inside every template: legs only with an easy run, quality runs alone', () => {
    for (const f of ['strength', 'balanced', 'run'] as const) {
      for (const d of HYBRID_TEMPLATES[f]) {
        if (d.strength === 'lower') expect(d.run).toBe('easy');
        if (d.run === 'intervals' || d.run === 'tempo' || d.run === 'long') expect(d.strength).toBeUndefined();
      }
    }
  });
  it('run types map to engine slots (tempo is the primary quality run when there are no intervals)', () => {
    expect(planHybridWeek({ focus: 'strength', levels: HI }).runSessions).toEqual([
      { slot: 'easy_run', workout: 'easy' },
      { slot: 'quality_primary', workout: 'tempo' },
    ]);
    expect(planHybridWeek({ focus: 'run', levels: HI }).runSessions.map((r) => r.slot)).toEqual([
      'easy_run', 'quality_primary', 'easy_run', 'quality_secondary', 'long_run',
    ]);
    expect(runSlotOf('tempo', true)).toBe('quality_secondary');
  });
  it('strength programs for the engine', () => {
    expect(planHybridWeek({ focus: 'strength', levels: HI }).strengthPrograms).toEqual([
      { slug: 'upper_body', sessionsPerWeek: 2, priority: 1 },
      { slug: 'legs', sessionsPerWeek: 1, priority: 2 },
      { slug: 'full_body', sessionsPerWeek: 1, priority: 3 },
    ]);
  });
});

describe('R28: skills in a hybrid week', () => {
  it('strength focus: upper focus skill A, upper focus skill B, then a combined day; never a skill-only day', () => {
    const h = planHybridWeek({ focus: 'strength', levels: HI, skills: TWO_SKILLS });
    const s = strengthOf(h.days);
    expect(s.map((d) => d.kind)).toEqual(['upper', 'lower', 'upper', 'full_body']);
    expect(s[0].skill?.lead).toBe('planche');
    expect(s[2].skill?.lead).toBe('front_lever');
    expect(s[3].skill).toBeUndefined();
    expect(s[1].skill).toBeUndefined();
  });
  it('each focus day keeps a little of the other side', () => {
    const s = strengthOf(planHybridWeek({ focus: 'balanced', levels: HI, skills: TWO_SKILLS }).days);
    expect(s[0].skill).toMatchObject({ lead: 'planche', otherSide: 'pull' });
    expect(s[2].skill).toMatchObject({ lead: 'front_lever', otherSide: 'push' });
  });
  it('locked skills are not scheduled', () => {
    const h = planHybridWeek({ focus: 'strength', levels: { push: 10, pull: 10, legs: 10 }, skills: TWO_SKILLS });
    expect(h.unlockedSkills).toEqual([]);
    expect(strengthOf(h.days).some((d) => d.skill)).toBe(false);
  });
  it('5-day strength week (S11): planche and front lever on different upper days, the full-body day combined', () => {
    const s = planStructure({ days: 5, levels: HI, skills: TWO_SKILLS }).sequence.filter((d): d is StrengthDay => d.type === 'strength');
    const leads = s.filter((d) => d.skill).map((d) => d.skill!.lead);
    expect(leads).toEqual(['planche', 'front_lever']);
    expect(s.find((d) => d.kind === 'full_body')!.skill).toBeUndefined();
  });
  it('1-3 day full-body weeks keep alternating leads (decision 7)', () => {
    const s = planStructure({ days: 3, levels: HI, skills: TWO_SKILLS }).sequence.filter((d): d is StrengthDay => d.type === 'strength');
    expect(s.every((d) => d.skill)).toBe(true);
  });
});

describe('R27 / R31', () => {
  it('R27: a short upper day runs push + pull as supersets', () => {
    const short = strengthOf(planHybridWeek({ focus: 'balanced', levels: HI, sessionMinutes: 30 }).days);
    expect(short.filter((d) => d.kind === 'upper').every((d) => d.pairing === 'push_pull_supersets')).toBe(true);
    expect(short.find((d) => d.kind === 'lower')!.pairing).toBeUndefined();
    const long = strengthOf(planHybridWeek({ focus: 'balanced', levels: HI, sessionMinutes: 60 }).days);
    expect(long.some((d) => d.pairing)).toBe(false);
    const p = planStructure({ days: 4, levels: { push: 9, pull: 9, legs: 9 }, sessionMinutes: 30 });
    expect(p.sequence.filter((d) => d.type === 'strength' && d.kind === 'upper').every((d) => (d as StrengthDay).pairing)).toBe(true);
  });
  it('R31: core 5-10 minutes at the end of each strength day, gated by the weekly target', () => {
    expect(CORE_FINISHER).toEqual({ minMinutes: 5, maxMinutes: 10, gate: 'weekly_target' });
    expect(planStructure({ days: 3, levels: HI }).coreFinisher).toEqual(CORE_FINISHER);
    expect(planHybridWeek({ focus: 'run', levels: HI }).coreFinisher).toEqual(CORE_FINISHER);
  });
});

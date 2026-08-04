import { describe, it, expect } from 'vitest';
import { buildAssessedDomainBudgets, buildNeedsAssessmentResult } from '../home-workout.service';

describe('buildAssessedDomainBudgets — absent=absent (⑨) BUG 1 rework', () => {
  it('BEFORE (documented bug): `userProgramLevels.get(x) ?? baseUserLevel` used to invent a ' +
     'level for an absent domain. AFTER: an absent domain is excluded entirely — no entry at all, ' +
     'not even at a conservative/fallback level.', () => {
    const userProgramLevels = new Map<string, number>([['planche', 7]]);
    const entries = buildAssessedDomainBudgets(['planche', 'front_lever'], userProgramLevels, 3);
    expect(entries.map(e => e.domain)).toEqual(['planche']);
    expect(entries.find(e => e.domain === 'front_lever')).toBeUndefined();
  });

  it('an assessed domain keeps its REAL level (not baseUserLevel, not any fallback)', () => {
    const userProgramLevels = new Map<string, number>([['push', 14], ['pull', 22]]);
    const entries = buildAssessedDomainBudgets(['push', 'pull'], userProgramLevels, 4);
    const push = entries.find(e => e.domain === 'push');
    const pull = entries.find(e => e.domain === 'pull');
    expect(push?.level).toBe(14);
    expect(pull?.level).toBe(22);
  });

  it('all domains absent → empty array (not a fabricated single entry)', () => {
    const entries = buildAssessedDomainBudgets(['push', 'pull'], new Map(), 3);
    expect(entries).toEqual([]);
  });

  it('weekly/daily are derived only for the surviving (assessed) entries', () => {
    const userProgramLevels = new Map<string, number>([['legs', 10]]);
    const entries = buildAssessedDomainBudgets(['legs', 'core'], userProgramLevels, 3);
    expect(entries).toHaveLength(1);
    expect(entries[0].domain).toBe('legs');
    expect(entries[0].weekly).toBeGreaterThan(0);
    expect(entries[0].daily).toBeGreaterThanOrEqual(1);
  });
});

describe('buildNeedsAssessmentResult — all-domains-unassessed safety net (⑨)', () => {
  const meta = {
    daysInactive: 0,
    persona: null,
    location: 'park' as const,
    timeOfDay: 'morning' as const,
    injuryAreas: [],
    exercisesConsidered: 0,
    exercisesExcluded: 0,
  };

  it('BEFORE (documented gap): the only prior signal was a console.warn — HomeWorkoutResult ' +
     'carried no field distinguishing this case from a normal (broken/empty) plan, so a caller ' +
     'reading `workout.exercises.length === 0` could not tell "needs assessment" apart from ' +
     '"budget exhausted" or a real bug. AFTER: an explicit typed flag + domain list.', () => {
    const result = buildNeedsAssessmentResult(['legs', 'core'], meta);
    expect(result.workout.needsAssessment).toBe(true);
    expect(result.workout.assessmentDomains).toEqual(['legs', 'core']);
    expect(result.workout.isRecovery).toBe(false);
  });

  it('never crashes and never returns a non-empty invented exercise list', () => {
    const result = buildNeedsAssessmentResult([], meta);
    expect(result.workout.exercises).toEqual([]);
    expect(result.workout.estimatedDuration).toBe(0);
    expect(result.workout.needsAssessment).toBe(true);
  });

  it('title/description are human-readable (not blank) even with an empty domain list', () => {
    const result = buildNeedsAssessmentResult([], meta);
    expect(result.workout.title.length).toBeGreaterThan(0);
    expect(result.workout.description.length).toBeGreaterThan(0);
  });

  it('pipelineLog carries a why-logger entry naming the requested domains', () => {
    const result = buildNeedsAssessmentResult(['calisthenics_upper'], meta);
    expect(result.workout.pipelineLog?.[0]).toContain('needs_assessment');
    expect(result.workout.pipelineLog?.[0]).toContain('calisthenics_upper');
  });
});

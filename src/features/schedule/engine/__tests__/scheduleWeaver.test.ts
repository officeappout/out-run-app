import { describe, it, expect } from 'vitest';
import { weaveWeek, type WeaveWeekInput } from '../scheduleWeaver';
import { strengthRuleFamily, runningRuleFamily } from '../ruleFamily';
import { buildDefaultTemplate } from '../scheduleRules';
import { preferredRunningDays } from '../runningRules';
import type { PrioritizedSkill, ProgramId } from '../../types/smartSchedule.types';
import type { RunningWeekDay, RunningDayRole } from '../runningRules';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';

const CATEGORY_FOR_ROLE: Record<RunningDayRole, WorkoutCategory> = {
  quality_primary: 'tempo',
  quality_secondary: 'short_intervals',
  long_run: 'long_run',
  easy_run: 'easy_run',
  recovery: 'easy_run',
};

const STRENGTH_SKILLS: PrioritizedSkill[] = [
  { id: 'PLANCHE', priority: 1, movementType: 'PUSH', isFreeSlot: false, minRestHours: 48, countsTowardCap: true },
];
const STRENGTH_PROGRAMS: ProgramId[] = [];

function strengthWeekFor(count: number) {
  return buildDefaultTemplate(STRENGTH_PROGRAMS, STRENGTH_SKILLS, count);
}

function strengthDomain(requestedCount: number) {
  return {
    family: strengthRuleFamily,
    requestedCount,
    existingWeek: strengthWeekFor(requestedCount),
    validateContext: {},
    reduceContext: { programs: STRENGTH_PROGRAMS, skills: STRENGTH_SKILLS },
  };
}

function runningWeekFor(count: number, slotType: RunningDayRole = 'easy_run'): RunningWeekDay[] {
  const week: RunningWeekDay[] = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, category: null }));
  for (const d of preferredRunningDays(count)) {
    week[d] = { dayOfWeek: d, category: CATEGORY_FOR_ROLE[slotType], slotType };
  }
  return week;
}

function runningDomain(requestedCount: number, targetDistanceKm = 10) {
  return {
    family: runningRuleFamily,
    requestedCount,
    existingWeek: runningWeekFor(requestedCount),
    validateContext: { level: 'intermediate' as const },
    reduceContext: { targetDistanceKm },
  };
}

describe('weaveWeek — ת1: running exists first, strength added — no forced reduction when there is room', () => {
  it('both domains keep their full requested count when the day budget fits the sum', () => {
    const input: WeaveWeekInput = {
      dominant: runningDomain(3),
      secondary: strengthDomain(3),
      availableDayCount: 6,
    };
    const result = weaveWeek(input);

    expect(result.reductions).toEqual([]);
    expect(result.notes).toEqual([]);
    expect(result.week.running).toBeDefined();
    expect(result.week.strength).toBeDefined();

    const runningValidation = runningRuleFamily.validate(result.week.running as any, input.dominant.validateContext);
    const strengthValidation = strengthRuleFamily.validate(result.week.strength as any, input.secondary.validateContext);
    expect(runningValidation.valid).toBe(true);
    expect(strengthValidation.valid).toBe(true);
  });
});

describe('weaveWeek — ת2: strength exists first, running added — order does not change the outcome quality', () => {
  it('mirrors ת1 with the domains swapped: both keep their full requested count', () => {
    const input: WeaveWeekInput = {
      dominant: strengthDomain(3),
      secondary: runningDomain(3),
      availableDayCount: 6,
    };
    const result = weaveWeek(input);

    expect(result.reductions).toEqual([]);
    expect(result.notes).toEqual([]);
    expect(result.week.strength).toBeDefined();
    expect(result.week.running).toBeDefined();
  });
});

describe('weaveWeek — ת4: the weaver builds one combined result, never a partial single-domain state', () => {
  it('a single call returns both domains fully formed together, at the counts actually requested', () => {
    const input: WeaveWeekInput = {
      dominant: runningDomain(3),
      secondary: strengthDomain(3),
      availableDayCount: 6,
    };
    const result = weaveWeek(input);

    // Both present in the SAME return value — no call produced only one domain's week.
    expect(Object.keys(result.week).sort()).toEqual(['running', 'strength']);
    // No rule forced a cut, so the actual counts match what was requested.
    const runningTrainingDays = (result.week.running as RunningWeekDay[]).filter((d) => d.category !== null).length;
    expect(runningTrainingDays).toBe(3);
  });
});

describe('weaveWeek — ת10: dominance decides who gets reduced first, in both directions, plus a last resort', () => {
  it('א: running dominant — a conflict reduces strength (secondary), not running', () => {
    const input: WeaveWeekInput = {
      dominant: runningDomain(4),
      secondary: strengthDomain(4),
      availableDayCount: 5, // sum of 4+4=8 doesn't fit; 4+1 does
    };
    const result = weaveWeek(input);

    expect(result.reductions.length).toBe(1);
    expect(result.reductions[0].domainId).toBe('strength');
    const runningTrainingDays = (result.week.running as RunningWeekDay[]).filter((d) => d.category !== null).length;
    expect(runningTrainingDays).toBe(4); // dominant untouched
  });

  it('ב: strength dominant — the same conflict reduces running (secondary) instead', () => {
    const input: WeaveWeekInput = {
      dominant: strengthDomain(4),
      secondary: runningDomain(4),
      availableDayCount: 5,
    };
    const result = weaveWeek(input);

    expect(result.reductions.length).toBe(1);
    expect(result.reductions[0].domainId).toBe('running');
  });

  it('ג: last resort — no legal solution keeps the dominant fixed, so it moves too, with an explicit note naming it', () => {
    const input: WeaveWeekInput = {
      dominant: strengthDomain(4),
      secondary: runningDomain(4),
      availableDayCount: 3, // even secondary=0 leaves dominant alone at 4 > 3
    };
    const result = weaveWeek(input);

    const strengthTrainingDays = (result.week.strength as any[]).filter((d) => d.sessions.length > 0).length;
    expect(strengthTrainingDays).toBeLessThan(4); // the dominant really did move
    expect(result.reductions.some((r) => r.domainId === 'strength')).toBe(true);
    expect(result.notes.some((n) => n.includes('strength'))).toBe(true); // never silent about it
  });
});

describe('weaveWeek — ת11: shrinking the availability control produces an explained reduction', () => {
  it('the same request produces zero notes with room to spare, and a non-empty, explained reduction once room tightens', () => {
    const roomyInput: WeaveWeekInput = {
      dominant: runningDomain(3),
      secondary: strengthDomain(3),
      availableDayCount: 6,
    };
    const roomy = weaveWeek(roomyInput);
    expect(roomy.reductions).toEqual([]);

    const tightInput: WeaveWeekInput = { ...roomyInput, availableDayCount: 5 };
    const tight = weaveWeek(tightInput);
    expect(tight.reductions.length).toBeGreaterThan(0);
    expect(tight.notes.length).toBeGreaterThan(0);
  });
});

describe('weaveWeek — determinism', () => {
  it('the exact same input produces the exact same output on repeated calls', () => {
    const input: WeaveWeekInput = {
      dominant: strengthDomain(4),
      secondary: runningDomain(4),
      availableDayCount: 5,
    };
    const first = weaveWeek(input);
    const second = weaveWeek(input);
    expect(second).toEqual(first);
  });
});

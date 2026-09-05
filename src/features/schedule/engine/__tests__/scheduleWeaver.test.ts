import { describe, it, expect } from 'vitest';
import { weaveWeek, type WeaveWeekInput } from '../scheduleWeaver';
import { strengthRuleFamily, runningRuleFamily } from '../ruleFamily';
import { buildDefaultTemplate } from '../scheduleRules';
import type { PrioritizedSkill, ProgramId } from '../../types/smartSchedule.types';
import type { RunningWeekDay } from '../runningRules';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import type { CrossDomainValidateContext } from '../crossDomainRules';

const STRENGTH_SKILLS: PrioritizedSkill[] = [
  { id: 'PLANCHE', priority: 1, movementType: 'PUSH', isFreeSlot: false, minRestHours: 48, countsTowardCap: true },
];
const STRENGTH_PROGRAMS: ProgramId[] = [];
const CROSS_CONTEXT: CrossDomainValidateContext = { minStrengthDaysPerWeek: 2 };

function strengthDomain(requestedCount: number) {
  return {
    family: strengthRuleFamily,
    requestedCount,
    existingWeek: buildDefaultTemplate(STRENGTH_PROGRAMS, STRENGTH_SKILLS, requestedCount),
    validateContext: {},
    reduceContext: { programs: STRENGTH_PROGRAMS, skills: STRENGTH_SKILLS },
  };
}

/** `entries` is [dayOfWeek, category][] — lets a single day carry a distinct category (e.g. a long run) from the rest. */
function runningDomainOf(entries: Array<[number, WorkoutCategory]>, targetDistanceKm = 10) {
  const week: RunningWeekDay[] = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, category: null }));
  for (const [d, category] of entries) week[d] = { dayOfWeek: d, category };
  return {
    family: runningRuleFamily,
    requestedCount: entries.length,
    existingWeek: week,
    validateContext: { level: 'intermediate' as const },
    reduceContext: { targetDistanceKm },
  };
}

function runningDomain(days: number[], category: WorkoutCategory = 'easy_run', targetDistanceKm = 10) {
  return runningDomainOf(days.map((d): [number, WorkoutCategory] => [d, category]), targetDistanceKm);
}

function strengthOccupiedDays(week: { sessions: unknown[]; dayOfWeek: number }[]): number[] {
  return week.filter((d) => d.sessions.length > 0).map((d) => d.dayOfWeek);
}

function runningOccupiedDays(week: RunningWeekDay[]): number[] {
  return week.filter((d) => d.category !== null).map((d) => d.dayOfWeek);
}

describe('weaveWeek — ת1: day-set search avoids unnecessary overlap when there is room', () => {
  it('both domains start on the identical 3 days ([0,2,4]) but 6 days are available — the weaver spreads them onto 6 distinct days, no reduction, no sharing', () => {
    const input: WeaveWeekInput = {
      focus: 30,
      strength: strengthDomain(3), // buildDefaultTemplate(3) lands on [0,2,4] — same as running below, a real collision.
      running: runningDomain([0, 2, 4], 'easy_run'),
      availableDayCount: 6,
      crossDomainContext: CROSS_CONTEXT,
    };
    const result = weaveWeek(input);

    expect(result.reductions).toEqual([]);
    expect(result.sharedDays).toEqual([]);

    const strengthDays = strengthOccupiedDays(result.week.strength);
    const runningDays = runningOccupiedDays(result.week.running);
    expect(strengthDays.length).toBe(3);
    expect(runningDays.length).toBe(3);
    expect(new Set([...strengthDays, ...runningDays]).size).toBe(6);
  });
});

describe('weaveWeek — ת2: tightening availability to exactly the sum minus one forces exactly one shared day', () => {
  it('same input, 5 days available — no reduction, exactly one shared day', () => {
    const input: WeaveWeekInput = {
      focus: 30,
      strength: strengthDomain(3),
      running: runningDomain([0, 2, 4], 'easy_run'),
      availableDayCount: 5,
      crossDomainContext: CROSS_CONTEXT,
    };
    const result = weaveWeek(input);

    expect(result.reductions).toEqual([]);
    const strengthDays = strengthOccupiedDays(result.week.strength);
    const runningDays = runningOccupiedDays(result.week.running);
    expect(strengthDays.length).toBe(3);
    expect(runningDays.length).toBe(3);
    expect(result.sharedDays.length).toBe(1);
    expect(new Set([...strengthDays, ...runningDays]).size).toBe(5);
  });
});

describe('weaveWeek — ת3: R8 caps a candidate at one shared day, forcing a reduction with a note naming R8', () => {
  it('2+2 requested, only 2 days available — full overlap would be needed to fit, but R8 forbids more than one shared day at this total, so running is cut to 1 instead', () => {
    const input: WeaveWeekInput = {
      focus: 30,
      strength: strengthDomain(2), // canonical [0,3]
      running: runningDomain([1, 5], 'easy_run'), // placeOn relabels by order — original days don't matter beyond ordering.
      availableDayCount: 2,
      crossDomainContext: CROSS_CONTEXT,
    };
    const result = weaveWeek(input);

    // Fitting both full 2-day sets into 2 available days needs full (2-day) overlap —
    // but R8 caps sharing at 1 day whenever total workouts <= 4 (here 2+2=4) — so that
    // candidate is rejected and running must give up a day instead.
    expect(result.reductions).toEqual([{ domainId: 'running', removed: expect.any(Array) }]);
    const strengthDays = strengthOccupiedDays(result.week.strength);
    const runningDays = runningOccupiedDays(result.week.running);
    expect(strengthDays.length).toBe(2); // strength untouched
    expect(runningDays.length).toBe(1); // running cut from 2 to 1
    expect(result.sharedDays.length).toBe(1);
    expect(result.notes.some((n) => n.includes('R8'))).toBe(true);
  });
});

describe('weaveWeek — ת10 (revised): reduction always protects R7\'s floor, regardless of dominance', () => {
  /**
   * availableDayCount=1 means strength's own footprint at 3 or at the R7
   * floor (2) both already exceed it on their own (a family's day-set size
   * always lower-bounds the distinct-day count it contributes — see
   * searchDaySets). The reduction sweep is bounded at `sCount >= floor`, so
   * it never even tries sCount=1 (which WOULD have fit availableDayCount=1)
   * — it exhausts at the floor and falls through to the total-failure
   * fallback, which itself also stops at the floor rather than reducing
   * further. Running-dominant (focus=80) on purpose: the floor holds
   * regardless of which domain the focus favors.
   */
  it('running dominant, so little room nothing fits even at the floor — strength still never drops below 2, even though 1 would have fit', () => {
    const input: WeaveWeekInput = {
      focus: 80,
      strength: strengthDomain(3), // canonical [0,2,4]
      running: runningDomain([1, 3], 'easy_run'),
      availableDayCount: 1,
      crossDomainContext: CROSS_CONTEXT,
    };
    const result = weaveWeek(input);

    const strengthDays = strengthOccupiedDays(result.week.strength);
    expect(strengthDays.length).toBe(2); // floor reached, never below — even though dropping to 1 would have actually fit availableDayCount=1.
    expect(result.notes.some((n) => n.includes('R7'))).toBe(true);
  });
});

describe('weaveWeek — resolveDoubleDayOrder wiring: a shared day\'s order comes from the cross-domain family, not a weaver-local decision', () => {
  /**
   * R3 bans strength-BEFORE-quality, not sharing the day at all (fixed —
   * see crossDomainRules.ts's own doc for the earlier, too-strong version
   * and the proof it was wrong: R2/resolveDoubleDayOrder exists in the
   * source doc precisely to choose an order for a shared quality day,
   * which would be pointless if R3 banned the day outright). A quality run
   * CAN legally share a day with strength, ordered running-first — this is
   * a real, reachable state through weaveWeek's own search, not just at
   * the crossDomainRules.ts unit level.
   */
  it('a quality run shares a day with strength when the days are tight, ordered running-first — R2 exists precisely to make this legal', () => {
    const input: WeaveWeekInput = {
      focus: 30,
      strength: strengthDomain(2), // canonical [0,3]
      running: runningDomain([1, 5], 'tempo'),
      availableDayCount: 3,
      crossDomainContext: CROSS_CONTEXT,
    };
    const result = weaveWeek(input);
    expect(result.sharedDays.length).toBeGreaterThan(0);
    expect(result.sharedDays.every((d) => d.order === 'running-first')).toBe(true);
  });

  it('an easy run on the shared day recommends strength-first', () => {
    const input: WeaveWeekInput = {
      focus: 30,
      strength: strengthDomain(2),
      running: runningDomain([1, 5], 'easy_run'),
      availableDayCount: 3,
      crossDomainContext: CROSS_CONTEXT,
    };
    const result = weaveWeek(input);
    expect(result.sharedDays.length).toBeGreaterThan(0);
    expect(result.sharedDays.every((d) => d.order === 'strength-first')).toBe(true);
  });

  it('a runner with quality workouts and few available days gets a running-first shared day, not a lost strength workout — the R3 fix is what makes this the found solution instead of a forced reduction', () => {
    const input: WeaveWeekInput = {
      focus: 80, // running dominant, so the day-set search fixes running's days first — the harder direction to prove strength survives.
      strength: strengthDomain(2), // canonical [0,3]
      running: runningDomain([1, 5], 'tempo'),
      availableDayCount: 3,
      crossDomainContext: CROSS_CONTEXT,
    };
    const result = weaveWeek(input);

    expect(result.reductions).toEqual([]); // strength keeps its full 2 days — nothing was cut to make room.
    const strengthDays = strengthOccupiedDays(result.week.strength);
    expect(strengthDays.length).toBe(2);
    expect(result.sharedDays.length).toBeGreaterThan(0);
    expect(result.sharedDays.every((d) => d.order === 'running-first')).toBe(true);
  });
});

describe('weaveWeek — R6: the long run is never placed on a day strength also occupies', () => {
  it('a tight-but-not-impossible availability forces one shared day — the weaver finds an arrangement where the LONG run specifically lands on a day with no strength, sharing the easy day instead, with a note naming R6', () => {
    const input: WeaveWeekInput = {
      focus: 30,
      strength: strengthDomain(2), // canonical [0,3]
      running: runningDomainOf([
        [3, 'long_run'],
        [5, 'easy_run'],
      ]),
      availableDayCount: 3,
      crossDomainContext: CROSS_CONTEXT,
    };
    const result = weaveWeek(input);

    const strengthDays = strengthOccupiedDays(result.week.strength);
    const runningWeek = result.week.running;
    const longRunDay = runningWeek.find((d) => d.category === 'long_run')!.dayOfWeek;
    expect(strengthDays.includes(longRunDay)).toBe(false);
    expect(result.notes.some((n) => n.includes('R6'))).toBe(true);
  });
});

describe('weaveWeek — determinism', () => {
  it('the exact same input produces the exact same output on repeated calls', () => {
    const input: WeaveWeekInput = {
      focus: 30,
      strength: strengthDomain(3),
      running: runningDomain([0, 2, 4], 'easy_run'),
      availableDayCount: 5,
      crossDomainContext: CROSS_CONTEXT,
    };
    const first = weaveWeek(input);
    const second = weaveWeek(input);
    expect(second).toEqual(first);
  });
});

/**
 * Owner report 19.10.2026 — "הליכה + עצירות" (route_stops, walking) showed no strength at all.
 *
 * Root cause: with the weekly strength budget spent (useWeeklyVolumeStore is initialised from
 * home's StatsOverview, and an L1-5 budget is 8 sets — one strength workout spends it) every
 * strength stop was demoted to 'core'. For a user with neither core nor legs assessed the core
 * stop is a lock card (dispatchStopContent's domain gate), and runHybridPlan strips lock cards
 * from the run → a plain walk, no strength.
 *
 * Fix: applySpentBudgetCoreDefault keeps those stops 'strength' when a core stop could not run.
 */
import { describe, it, expect } from 'vitest';
import {
  applySpentBudgetCoreDefault,
  isCoreStopRunnable,
} from '../weekly-budget-gate';
import { dispatchStopContent, type HybridComposeInput, type HybridStopCandidate } from '../compose-hybrid-session.service';
import type { WorkoutGenerationContext } from '../../logic/workout-generator.types';
import type { ContextualFilterContext } from '../../logic/contextual-engine.types';

const SPENT = { weeklyBudget: 8, totalSetsCompleted: 12 };
const OPEN = { weeklyBudget: 16, totalSetsCompleted: 2 };
const PUSH_ONLY = new Map<string, number>([['push', 1]]);
const WITH_CORE = new Map<string, number>([['push', 3], ['core', 2]]);
const WITH_LEGS = new Map<string, number>([['push', 3], ['legs', 2]]);

function stop(id: string, activityType: HybridStopCandidate['activityType']): HybridStopCandidate {
  return { stopId: id, locationKind: 'open_area', lat: 0, lng: 0, waypointIndex: 0, availableEquipment: [], activityType };
}

function inputFor(levels: Map<string, number>): HybridComposeInput {
  const generationContext = {
    availableTime: 10, userLevel: 1, daysInactive: 1, intentMode: 'normal', persona: null,
    location: 'park', injuryCount: 0, userProgramLevels: levels,
  } as unknown as WorkoutGenerationContext;
  const filterContext = {
    location: 'park', lifestyles: [], injuryShield: [], intentMode: 'normal', availableEquipment: [],
    getUserLevelForExercise: () => 1,
  } as unknown as ContextualFilterContext;
  return {
    timeBudgetMin: 30, emphasis: 'balanced', aerobicKind: 'walking',
    paceProfile: { basePace: 420, profileType: 2 } as never,
    routePath: [] as never, stopCandidates: [], masterExercises: [],
    filterContext, generationContext, weeklyGaps: {} as never, userWeightKg: 70,
  };
}

describe('isCoreStopRunnable — mirrors the core stop domain gate', () => {
  it('needs core OR legs assessed', () => {
    expect(isCoreStopRunnable(PUSH_ONLY)).toBe(false);
    expect(isCoreStopRunnable(WITH_CORE)).toBe(true);
    expect(isCoreStopRunnable(WITH_LEGS)).toBe(true);
  });
  it('no level map = unknown → runnable (same `?? true` as the gate)', () => {
    expect(isCoreStopRunnable(undefined)).toBe(true);
    expect(isCoreStopRunnable(null)).toBe(true);
  });
});

describe('applySpentBudgetCoreDefault', () => {
  const stops = [stop('a', 'strength'), stop('b', 'stretch'), stop('c', 'strength')];

  it('budget not spent → stops untouched (same array)', () => {
    const r = applySpentBudgetCoreDefault(stops, OPEN, PUSH_ONLY);
    expect(r.reason).toBe('not_spent');
    expect(r.stops).toBe(stops);
  });

  it('cold store (budget 0) is unknown, not spent', () => {
    expect(applySpentBudgetCoreDefault(stops, { weeklyBudget: 0, totalSetsCompleted: 0 }, PUSH_ONLY).reason).toBe('not_spent');
  });

  it('REGRESSION: spent + core/legs unassessed → strength stops are KEPT (no lock card, no lost station)', () => {
    const r = applySpentBudgetCoreDefault(stops, SPENT, PUSH_ONLY);
    expect(r.reason).toBe('core_not_runnable');
    expect(r.stops.map((s) => s.activityType)).toEqual(['strength', 'stretch', 'strength']);
  });

  it('spent + core assessed → today’s default (strength → core, others untouched)', () => {
    const r = applySpentBudgetCoreDefault(stops, SPENT, WITH_CORE);
    expect(r.reason).toBe('defaulted_to_core');
    expect(r.stops.map((s) => s.activityType)).toEqual(['core', 'stretch', 'core']);
    expect(stops[0].activityType).toBe('strength'); // input not mutated
  });

  it('spent + only legs assessed → still defaults (the core stop runs on the legs field pool)', () => {
    expect(applySpentBudgetCoreDefault(stops, SPENT, WITH_LEGS).reason).toBe('defaulted_to_core');
  });
});

describe('why it matters — the real dispatch of a core stop for a push-only user', () => {
  it('a core stop is a lock card (needsAssessment, no exercises) — what the old default produced', () => {
    const block = dispatchStopContent(stop('poi:x', 'core'), 'full_body' as never, 8, inputFor(PUSH_ONLY), []);
    expect(block?.needsAssessment?.assessmentDomains).toEqual(["legs", "core"]);
    expect(block?.exercises ?? []).toHaveLength(0);
  });

  it('the stop the fix keeps (strength) is not gated as unassessed', () => {
    const [kept] = applySpentBudgetCoreDefault([stop('poi:x', 'strength')], SPENT, PUSH_ONLY).stops;
    const block = dispatchStopContent(kept, 'full_body' as never, 8, inputFor(PUSH_ONLY), []);
    // Empty catalog here → no exercises, but the stop is NOT the unassessed-domain lock card.
    expect(block?.needsAssessment).toBeFalsy();
  });
});

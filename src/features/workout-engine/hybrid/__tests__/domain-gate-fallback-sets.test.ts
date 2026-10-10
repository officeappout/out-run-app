import { describe, it, expect } from 'vitest';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import {
  dispatchStopContent,
  type HybridComposeInput,
  type HybridStopCandidate,
} from '../compose-hybrid-session.service';

/**
 * Regression — Sderot field test (10.10.2026): a combined-route user with NO
 * completed strength questionnaire (userProgramLevels empty) who hits an
 * equipped park station gets real machine-tabata content via
 * buildDomainGateFallback, but the summary showed "0 סטים" because
 * totalPlannedSets was hardcoded to 0 even though real, completed work
 * (tabataBlocks + exercises) was generated. Fixed by reporting the real
 * tabata round count instead of a flat 0 — see compose-hybrid-session.service.ts's
 * buildDomainGateFallback.
 */

function machine(overrides: Partial<GymEquipment> & { id: string }): GymEquipment {
  return {
    name: overrides.id,
    type: 'reps',
    recommendedLevel: 5,
    isFunctional: false,
    isCardio: false,
    muscleGroups: [],
    brands: [],
    ...overrides,
  } as GymEquipment;
}

const push1 = machine({ id: 'push1', movementPattern: 'horizontal_push' });
const push2 = machine({ id: 'push2', movementPattern: 'vertical_push' });

const baseCandidate: HybridStopCandidate = {
  stopId: 'stop-1',
  parkId: 'park-1',
  locationKind: 'gym',
  lat: 31.52, lng: 34.6,
  waypointIndex: 1,
  availableEquipment: [], // irrelevant here — the no-questionnaire gate fires before the pool is built
  activityType: 'strength',
  parkEquipment: [push1, push2],
};

function baseInput(userProgramLevels: Map<string, number>): HybridComposeInput {
  return {
    timeBudgetMin: 30,
    emphasis: 'balanced' as any,
    aerobicKind: 'walking',
    paceProfile: { basePace: 390, profileType: 2 } as any,
    routePath: [] as any,
    stopCandidates: [baseCandidate],
    masterExercises: [],
    filterContext: {
      location: 'park',
      lifestyles: [],
      injuryShield: [],
      intentMode: 'field',
      availableEquipment: [],
      getUserLevelForExercise: () => 5,
    } as any,
    generationContext: {
      availableTime: 30,
      userLevel: 5,
      daysInactive: 0,
      intentMode: 'field',
      persona: null,
      location: 'park',
      injuryCount: 0,
      difficulty: 2,
      userProgramLevels,
    } as any,
    weeklyGaps: {} as any,
    userWeightKg: 70,
  };
}

describe('buildDomainGateFallback (via dispatchStopContent) — no-questionnaire equipment-tabata sets', () => {
  it('reports real completed rounds as totalPlannedSets, not 0, when no domain is assessed', () => {
    const input = baseInput(new Map()); // empty = no questionnaire completed
    const log: string[] = [];
    const result = dispatchStopContent(baseCandidate, undefined, 10, input, log);

    expect(result).not.toBeNull();
    expect(result!.exercises.length).toBeGreaterThan(0);
    expect(result!.tabataBlocks).toBeDefined();
    expect(result!.tabataBlocks![0].config.rounds).toBeGreaterThan(0);
    // The bug: this used to always be 0 regardless of real completed content.
    expect(result!.totalPlannedSets).toBe(result!.tabataBlocks![0].config.rounds);
    expect(result!.totalPlannedSets).toBeGreaterThan(0);
  });

  it('still returns a genuine locked card (totalPlannedSets 0 is correct) when there is no equipment to fall back on', () => {
    const bodyweightCandidate: HybridStopCandidate = {
      ...baseCandidate,
      parkEquipment: [], // no machines at all — nothing was actually completed
    };
    const input = baseInput(new Map());
    input.stopCandidates = [bodyweightCandidate];
    const log: string[] = [];
    const result = dispatchStopContent(bodyweightCandidate, undefined, 10, input, log);

    expect(result).not.toBeNull();
    expect(result!.exercises.length).toBe(0);
    expect(result!.needsAssessment).toBeDefined();
    expect(result!.totalPlannedSets).toBe(0);
  });

  it('unaffected when the user HAS a completed questionnaire — unchanged existing behaviour', () => {
    const assessed = new Map([['push', 3], ['pull', 3], ['legs', 3], ['core', 3]]);
    const input = baseInput(assessed);
    const log: string[] = [];
    const result = dispatchStopContent(baseCandidate, undefined, 10, input, log);

    // With every domain assessed, the gate never fires — buildDomainGateFallback
    // is not called, so this exercises the normal pool-based path instead
    // (which may legitimately come back null/empty with masterExercises: []).
    // The only thing this test asserts is that the gate did NOT fire the
    // equipment-tabata fallback for an assessed user.
    expect(result?.tabataBlocks).toBeUndefined();
  });
});

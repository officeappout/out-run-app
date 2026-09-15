import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

// generateHomeWorkoutTrio is Firestore-backed — mocked so these tests exercise
// only composeParkWorkoutFromMachines's own domain-complement/selection logic,
// not the real generator pipeline.
const trioMock = vi.fn();
vi.mock('../home-workout.service', () => ({
  generateHomeWorkoutTrio: (...args: unknown[]) => trioMock(...args),
}));

import {
  selectBlockAMachines,
  computeCoveredDomains,
  buildMachinePseudoExercise,
  composeParkWorkoutFromMachines,
  isBlockAEligible,
  isDomainAssessed,
} from '../compose-park-strength-workout.service';

// Default isFunctional: false (hydraulic/self-limiting) so every existing
// fixture is Block-A-eligible regardless of the caller's assessed level —
// keeps the selection/domain tests below about SELECTION, not the isFunctional
// safety gate (which has its own dedicated describe block further down).
function machine(overrides: Partial<GymEquipment> & { id: string }): GymEquipment {
  return {
    name: overrides.id,
    type: 'reps',
    recommendedLevel: 5,
    isFunctional: false,
    muscleGroups: [],
    brands: [],
    ...overrides,
  } as GymEquipment;
}

const push1 = machine({ id: 'push1', movementPattern: 'horizontal_push' });
const push2 = machine({ id: 'push2', movementPattern: 'vertical_push' });
const pull1 = machine({ id: 'pull1', movementPattern: 'horizontal_pull' });
const legs1 = machine({ id: 'legs1', movementPattern: 'squat' });
const core1 = machine({ id: 'core1', movementPattern: 'core' });
const isolation1 = machine({ id: 'isolation1', movementPattern: 'isolation' });
const cardio1 = machine({ id: 'cardio1', movementPattern: 'horizontal_push', isCardio: true });

const unassessedProfile = { id: 'u1', progression: {} } as any;
const pushAssessedProfile = { id: 'u2', progression: { domains: { push: { currentLevel: 6 } } } } as any;
const pushAssessedViaTrackProfile = { id: 'u3', progression: { tracks: { push: 6 } } } as any;

describe('isDomainAssessed', () => {
  it('is false when the user has no progression data for the domain at all', () => {
    expect(isDomainAssessed(unassessedProfile, 'push')).toBe(false);
  });

  it('is true when profile.progression.domains has a real currentLevel for the domain', () => {
    expect(isDomainAssessed(pushAssessedProfile, 'push')).toBe(true);
  });

  it('is true when profile.progression.tracks has a real numeric level for the domain (checked independently of domains)', () => {
    expect(isDomainAssessed(pushAssessedViaTrackProfile, 'push')).toBe(true);
  });

  it('does not leak assessment across domains — assessed push does not make pull assessed', () => {
    expect(isDomainAssessed(pushAssessedProfile, 'pull')).toBe(false);
  });
});

describe('isBlockAEligible (isFunctional safety-gate handling, Q1 finding)', () => {
  it('a hydraulic (isFunctional=false) machine is eligible even for a fully unassessed user', () => {
    const hydraulic = machine({ id: 'h1', movementPattern: 'horizontal_push', isFunctional: false });
    expect(isBlockAEligible(hydraulic, unassessedProfile)).toBe(true);
  });

  it('real calisthenics gear (isFunctional=true) is NOT eligible for a user unassessed in that domain', () => {
    const realGear = machine({ id: 'r1', movementPattern: 'horizontal_push', isFunctional: true });
    expect(isBlockAEligible(realGear, unassessedProfile)).toBe(false);
  });

  it('real calisthenics gear IS eligible once the user has an assessed level in that domain', () => {
    const realGear = machine({ id: 'r2', movementPattern: 'horizontal_push', isFunctional: true });
    expect(isBlockAEligible(realGear, pushAssessedProfile)).toBe(true);
  });

  it('real calisthenics gear in a DIFFERENT (still-unassessed) domain stays ineligible even if push is assessed', () => {
    const realGearPull = machine({ id: 'r3', movementPattern: 'horizontal_pull', isFunctional: true });
    expect(isBlockAEligible(realGearPull, pushAssessedProfile)).toBe(false);
  });

  it('isCardio always excludes, regardless of isFunctional/assessment', () => {
    const cardioHydraulic = machine({ id: 'c1', movementPattern: 'horizontal_push', isFunctional: false, isCardio: true });
    expect(isBlockAEligible(cardioHydraulic, pushAssessedProfile)).toBe(false);
  });

  it('isolation/flexibility movementPattern is never eligible (no domain to gate on)', () => {
    const iso = machine({ id: 'i1', movementPattern: 'isolation', isFunctional: false });
    expect(isBlockAEligible(iso, pushAssessedProfile)).toBe(false);
  });
});

describe('computeCoveredDomains', () => {
  it('maps push/pull/legs/core movementPatterns to their domain, deduped and in fixed order', () => {
    expect(computeCoveredDomains([push1, push2, pull1, legs1, core1])).toEqual([
      'push', 'pull', 'legs', 'core',
    ]);
  });

  it('excludes isolation/flexibility — they are not counted', () => {
    expect(computeCoveredDomains([isolation1])).toEqual([]);
  });

  it('ignores machines with no movementPattern', () => {
    expect(computeCoveredDomains([machine({ id: 'untagged' })])).toEqual([]);
  });

  it('returns [] for an empty list', () => {
    expect(computeCoveredDomains([])).toEqual([]);
  });
});

describe('selectBlockAMachines', () => {
  it('returns all machines unchanged when there are fewer than the requested count', () => {
    const result = selectBlockAMachines([push1, pull1], 4);
    expect(result).toEqual([push1, pull1]);
  });

  it('prefers one machine per distinct domain first, in push>pull>legs>core order', () => {
    const result = selectBlockAMachines([core1, legs1, pull1, push1, push2], 4);
    const ids = result.map((m) => m.id);
    expect(ids).toEqual(['push1', 'pull1', 'legs1', 'core1']);
  });

  it('fills remaining slots from leftover machines once every domain has one', () => {
    // Only 2 distinct domains (push, pull) but 4 machines and count=4 — both
    // extra push/pull machines should still be picked to fill the block.
    const result = selectBlockAMachines([push1, push2, pull1, machine({ id: 'pull2', movementPattern: 'vertical_pull' })], 4);
    expect(result).toHaveLength(4);
  });

  it('never selects the same machine twice', () => {
    const result = selectBlockAMachines([push1, push2, pull1, legs1, core1], 4);
    const ids = result.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildMachinePseudoExercise', () => {
  const config = { workSec: 30, restSec: 30, rounds: 8 };

  it('produces a WorkoutExercise stamped exactly like a real tabata block member', () => {
    const withBrand = machine({
      id: 'm1',
      name: 'מתקן בדיקה',
      movementPattern: 'horizontal_push',
      recommendedLevel: 7,
      brands: [{ brandName: 'TestBrand', videoUrl: 'https://example.com/v.mp4' }],
    });
    const result = buildMachinePseudoExercise(withBrand, config);

    expect(result.exercise.id).toBe('m1');
    expect((result.exercise.name as any).he).toBe('מתקן בדיקה');
    expect((result.exercise as any).movementGroup).toBe('horizontal_push');
    expect((result.exercise as any).targetPrograms).toEqual([{ programId: 'push', level: 7 }]);
    expect(result.sets).toBe(1);
    expect(result.reps).toBe(30); // config.workSec
    expect(result.isTimeBased).toBe(true);
    expect(result.restSeconds).toBe(30); // config.restSec
    expect(result.protocolBlock).toBe('tabata');
    expect(result.exerciseRole).toBe('main');
    expect(result.mechanicalType).toBe('none');
    expect(result.method.equipmentIds).toEqual(['m1']);
    expect(result.method.media?.mainVideoUrl).toBe('https://example.com/v.mp4');
  });

  it('omits symmetry/injuryShield — both are optional on Exercise and safely absent for machines', () => {
    const result = buildMachinePseudoExercise(machine({ id: 'm2', movementPattern: 'core' }), config);
    expect((result.exercise as any).symmetry).toBeUndefined();
  });

  it('produces an empty targetPrograms when the machine has no movementPattern-derivable domain', () => {
    const result = buildMachinePseudoExercise(
      machine({ id: 'm3', movementPattern: 'isolation' }),
      config,
    );
    expect((result.exercise as any).targetPrograms).toEqual([]);
  });
});

describe('composeParkWorkoutFromMachines', () => {
  const fakeProfile = { id: 'u1' } as any;

  beforeEach(() => {
    trioMock.mockClear();
  });

  it('excludes isCardio machines from Block A even when movementPattern is set', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
    const result = await composeParkWorkoutFromMachines([cardio1, push1], fakeProfile, { difficulty: 'medium' });
    expect(result.blockAEligibleMachineCount).toBe(1); // only push1
    expect(result.blockASelectedMachineCount).toBe(1);
  });

  it('calls Block B with requiredDomains = the complement of what Block A covered, strictDomains true', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: 'Block B', description: '', needsAssessment: false } } }, null],
    });
    await composeParkWorkoutFromMachines([push1, pull1], fakeProfile, { difficulty: 'medium' });

    expect(trioMock).toHaveBeenCalledTimes(1);
    const callArgs = trioMock.mock.calls[0][0];
    expect(callArgs.location).toBe('park');
    expect(callArgs.strictDomains).toBe(true);
    expect(callArgs.skipCycleRestart).toBe(true);
    expect(new Set(callArgs.requiredDomains)).toEqual(new Set(['legs', 'core']));
    expect(callArgs.parkEquipmentIds).toBeUndefined();
  });

  it('skips the Block B call entirely when Block A already covers all 4 domains', async () => {
    await composeParkWorkoutFromMachines([push1, pull1, legs1, core1], fakeProfile, { difficulty: 'medium' });
    expect(trioMock).not.toHaveBeenCalled();
  });

  it('uses the correct work/rest ladder per difficulty, rounds always 8', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
    const easy = await composeParkWorkoutFromMachines([push1], fakeProfile, { difficulty: 'easy' });
    const hard = await composeParkWorkoutFromMachines([push1], fakeProfile, { difficulty: 'hard' });
    expect(easy.workout.tabataBlock?.config).toEqual({ workSec: 20, restSec: 40, rounds: 8 });
    expect(hard.workout.tabataBlock?.config).toEqual({ workSec: 40, restSec: 20, rounds: 8 });
  });

  it('merges Block A + Block B exercises into one combined workout, Block A first', async () => {
    const blockBExercise = { exercise: { id: 'bw1' } } as any;
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [blockBExercise], title: '', description: '', needsAssessment: false } } }, null],
    });
    const result = await composeParkWorkoutFromMachines([push1], fakeProfile, { difficulty: 'medium' });
    expect(result.workout.exercises).toHaveLength(2);
    expect(result.workout.exercises[0].exercise.id).toBe('push1');
    expect(result.workout.exercises[1]).toBe(blockBExercise);
  });

  it('produces no tabataBlock when there are zero eligible machines (pure bodyweight session)', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: 'BW only', description: '', needsAssessment: false } } }, null],
    });
    const result = await composeParkWorkoutFromMachines([], fakeProfile, { difficulty: 'medium' });
    expect(result.workout.tabataBlock).toBeUndefined();
    expect(result.blockACoveredDomains).toEqual([]);
  });

  it('does not use Block B content when it needsAssessment (falls back to Block A only)', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [{ id: 'should-not-appear' }], title: 'x', description: 'y', needsAssessment: true } } }, null],
    });
    const result = await composeParkWorkoutFromMachines([push1], fakeProfile, { difficulty: 'medium' });
    expect(result.workout.exercises).toHaveLength(1); // only the Block A machine
    expect(result.workout.exercises[0].exercise.id).toBe('push1');
  });
});

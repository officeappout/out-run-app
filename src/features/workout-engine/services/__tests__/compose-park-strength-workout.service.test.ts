import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { Park } from '@/features/parks/core/types/park.types';

// generateHomeWorkoutTrio is Firestore-backed — mocked so these tests exercise
// only composeParkWorkoutFromMachines's own domain-complement/selection logic,
// not the real generator pipeline.
const trioMock = vi.fn();
vi.mock('../home-workout.service', () => ({
  generateHomeWorkoutTrio: (...args: unknown[]) => trioMock(...args),
}));

// composeParkWorkout (the async wrapper)'s two Firestore-backed dependencies —
// mocked so the "canonical, not raw, ids reach Block B" tests below don't need
// a real Firestore connection or a real-warmed gear cache.
const getGymEquipmentMock = vi.fn();
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({
  getGymEquipment: (...args: unknown[]) => getGymEquipmentMock(...args),
}));

const resolveParkEquipmentIdsMock = vi.fn();
vi.mock('../park-equipment-resolver', () => ({
  resolveParkEquipmentIds: (...args: unknown[]) => resolveParkEquipmentIdsMock(...args),
}));

const ensureEquipmentCachesLoadedMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../shared/utils/gear-mapping.utils', () => ({
  ensureEquipmentCachesLoaded: (...args: unknown[]) => ensureEquipmentCachesLoadedMock(...args),
}));

import {
  selectBlockAMachines,
  computeCoveredDomains,
  buildMachinePseudoExercise,
  composeParkWorkoutFromMachines,
  composeParkWorkout,
  isBlockAEligible,
  isDomainAssessed,
  machineShareForLevel,
  resolveMachineShareLevel,
  resolveMachineCount,
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
      brands: [{ brandName: 'TestBrand', videoUrl: 'https://example.com/v.mp4', imageUrl: 'https://example.com/v.jpg' }],
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
    expect(result.method.media?.mainVideoUrl).toBe('https://example.com/v.mp4');
  });

  it('diagnosis item 3 fix: never lists the machine\'s own id as required gear (self-referential — the machine IS the exercise)', () => {
    const result = buildMachinePseudoExercise(machine({ id: 'm1', movementPattern: 'horizontal_push' }), config);
    expect(result.method.equipmentIds).toEqual([]);
  });

  it('diagnosis item 2 fix: carries the brand\'s imageUrl so the drawer tile renders instead of showing "?"', () => {
    const withImage = machine({
      id: 'm4',
      movementPattern: 'horizontal_push',
      brands: [{ brandName: 'TestBrand', videoUrl: 'https://example.com/v.mp4', imageUrl: 'https://example.com/v.jpg' }],
    });
    const result = buildMachinePseudoExercise(withImage, config);
    expect(result.method.media?.imageUrl).toBe('https://example.com/v.jpg');
  });

  it('imageUrl is undefined (not crashed on) when the machine has no brand image', () => {
    const noImage = machine({ id: 'm5', movementPattern: 'horizontal_push', brands: [] });
    const result = buildMachinePseudoExercise(noImage, config);
    expect(result.method.media?.imageUrl).toBeUndefined();
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

describe('machineShareForLevel', () => {
  it.each([
    [1, 0.75], [2, 0.75], [3, 0.75], [4, 0.75],
    [5, 0.60],
    [6, 0.45],
    [7, 0.30],
    [8, 0.20],
    [9, 0.15],
    [10, 0.00], [16, 0.00], [25, 0.00],
  ])('level %i → share %f', (level, expected) => {
    expect(machineShareForLevel(level)).toBe(expected);
  });
});

describe('resolveMachineShareLevel', () => {
  it('averages assessed push + pull when both are assessed', () => {
    const profile = { progression: { domains: { push: { currentLevel: 16 }, pull: { currentLevel: 14 } } } } as any;
    expect(resolveMachineShareLevel(profile)).toBe(15); // round((16+14)/2)
  });

  it('uses whichever of push/pull is assessed when only one is', () => {
    const profile = { progression: { domains: { push: { currentLevel: 6 } } } } as any;
    expect(resolveMachineShareLevel(profile)).toBe(6);
  });

  it('reads push/pull from tracks too, independent of domains', () => {
    const profile = { progression: { tracks: { push: 8, pull: 8 } } } as any;
    expect(resolveMachineShareLevel(profile)).toBe(8);
  });

  it('falls back to the derived base user level when neither push nor pull is assessed', () => {
    const profile = { progression: { domains: { legs: { currentLevel: 10 } } } } as any;
    expect(resolveMachineShareLevel(profile)).toBe(10); // getBaseUserLevel's max-across-domains fallback
  });

  it('falls back to 1 for a fully unassessed profile', () => {
    expect(resolveMachineShareLevel({ progression: {} } as any)).toBe(1);
  });
});

describe('resolveMachineCount', () => {
  it('level-16 user → 0 machines, no machine Tabata, regardless of park size or time', () => {
    const result = resolveMachineCount({
      strengthBudget: 5, level: 16, eligibleMachineCount: 6, availableTime: 20,
    });
    expect(result).toEqual({ machineCount: 0, rounds: 0 });
  });

  it('level-6 user → machines present, at least the 2-machine floor', () => {
    const result = resolveMachineCount({
      strengthBudget: 5, level: 6, eligibleMachineCount: 6, availableTime: 20,
    });
    expect(result.machineCount).toBeGreaterThanOrEqual(2);
    expect(result.rounds).toBe(result.machineCount * 2);
  });

  it('"no 1-machine Tabata" floor: a target of 1 bumps to 2 when the park + time can support it', () => {
    // level 9 → share 0.15; strengthBudget 7 → round(7*0.15) = 1 raw target.
    const result = resolveMachineCount({
      strengthBudget: 7, level: 9, eligibleMachineCount: 6, availableTime: 20,
    });
    expect(result.machineCount).toBe(2);
  });

  it('"no 1-machine Tabata" floor: drops to 0 when the park only has 1 eligible machine (can\'t bump to 2)', () => {
    const result = resolveMachineCount({
      strengthBudget: 7, level: 9, eligibleMachineCount: 1, availableTime: 20,
    });
    expect(result).toEqual({ machineCount: 0, rounds: 0 });
  });

  it('park cap: never selects more machines than the park actually has', () => {
    const result = resolveMachineCount({
      strengthBudget: 10, level: 1, eligibleMachineCount: 2, availableTime: 60,
    });
    expect(result.machineCount).toBeLessThanOrEqual(2);
  });

  it('time-budget cap: a very short session caps machine count even at a low (machine-heavy) level', () => {
    // availableTime 9 → timeBudgetMachines = floor((9-5)/2) = 2
    const result = resolveMachineCount({
      strengthBudget: 8, level: 1, eligibleMachineCount: 8, availableTime: 9,
    });
    expect(result.machineCount).toBeLessThanOrEqual(2);
  });

  it('bodyweight-reservation property: machineCount never leaves fewer than 2 of strengthBudget\'s slots for Block B', () => {
    for (const strengthBudget of [2, 3, 4, 5, 6, 8]) {
      for (const level of [1, 5, 6, 7, 8, 9]) {
        const { machineCount } = resolveMachineCount({
          strengthBudget, level, eligibleMachineCount: 8, availableTime: 60,
        });
        expect(strengthBudget - machineCount).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('returns 0 when the park has no eligible machines at all', () => {
    const result = resolveMachineCount({
      strengthBudget: 5, level: 1, eligibleMachineCount: 0, availableTime: 20,
    });
    expect(result).toEqual({ machineCount: 0, rounds: 0 });
  });
});

describe('composeParkWorkoutFromMachines', () => {
  const fakeProfile = { id: 'u1', progression: {} } as any;
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    trioMock.mockClear();
    // Pins getExerciseCountForDuration's internal Math.random() so strengthBudget
    // (and therefore machineCount) is deterministic across these tests —
    // DURATION_SCALING buckets always resolve to their `min`.
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('excludes isCardio machines from Block A even when movementPattern is set; a single eligible machine hits the "no 1-machine Tabata" floor and drops to 0', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
    const result = await composeParkWorkoutFromMachines([cardio1, push1], fakeProfile, { difficulty: 'medium' });
    expect(result.blockAEligibleMachineCount).toBe(1); // only push1
    expect(result.blockASelectedMachineCount).toBe(0); // can't bump a lone machine to the 2-machine floor
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
  });

  it('defaults parkEquipmentIds to [] when the caller omits it (no crash, same degraded ESSENTIAL_PARK_GEAR behavior as before this fix — not the bug)', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
    await composeParkWorkoutFromMachines([push1, pull1], fakeProfile, { difficulty: 'medium' });
    const callArgs = trioMock.mock.calls[0][0];
    expect(callArgs.parkEquipmentIds).toEqual([]);
  });

  it('BUG FIX: threads a real, non-empty parkEquipmentIds through to the Block B call unchanged', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
    const realParkGearIds = ['pullup_bar', 'leg_press', 'chest_press'];
    await composeParkWorkoutFromMachines([push1, pull1], fakeProfile, { difficulty: 'medium' }, realParkGearIds);
    const callArgs = trioMock.mock.calls[0][0];
    expect(callArgs.parkEquipmentIds).toEqual(realParkGearIds);
  });

  it('skips the Block B call entirely when Block A already covers all 4 domains (needs enough time budget for all 4 machines at level 1)', async () => {
    await composeParkWorkoutFromMachines(
      [push1, pull1, legs1, core1], fakeProfile, { difficulty: 'medium', availableTime: 45 },
    );
    expect(trioMock).not.toHaveBeenCalled();
  });

  it('uses the correct work/rest ladder per difficulty; rounds scale with the level-driven machine count (2 machines × 2 rounds each)', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
    const easy = await composeParkWorkoutFromMachines([push1, pull1], fakeProfile, { difficulty: 'easy' });
    const hard = await composeParkWorkoutFromMachines([push1, pull1], fakeProfile, { difficulty: 'hard' });
    expect(easy.workout.tabataBlock?.config).toEqual({ workSec: 20, restSec: 40, rounds: 4 });
    expect(hard.workout.tabataBlock?.config).toEqual({ workSec: 40, restSec: 20, rounds: 4 });
  });

  it('merges Block A + Block B exercises into one combined workout, Block B (bodyweight) FIRST — Part 1 bodyweight/skill while fresh, Part 2 machine Tabata at the end', async () => {
    const blockBExercise = { exercise: { id: 'bw1' } } as any;
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [blockBExercise], title: '', description: '', needsAssessment: false } } }, null],
    });
    const result = await composeParkWorkoutFromMachines([push1, pull1], fakeProfile, { difficulty: 'medium' });
    expect(result.workout.exercises).toHaveLength(3);
    expect(result.workout.exercises[0]).toBe(blockBExercise);
    expect(result.workout.exercises.slice(1).map((e) => e.exercise.id).sort()).toEqual(['pull1', 'push1']);
  });

  it('produces no tabataBlock when there are zero eligible machines (pure bodyweight session)', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: 'BW only', description: '', needsAssessment: false } } }, null],
    });
    const result = await composeParkWorkoutFromMachines([], fakeProfile, { difficulty: 'medium' });
    expect(result.workout.tabataBlock).toBeUndefined();
    expect(result.blockACoveredDomains).toEqual([]);
  });

  it('diagnosis item 1(b)/4 fix: merges Block B\'s own tabataBlock.exerciseIds (e.g. an independently-fired core-tabata) into the composed tabataBlock, under Block A\'s shared ladder config', async () => {
    const coreTabataMember = { exercise: { id: 'core-ex-1' } } as any;
    trioMock.mockResolvedValue({
      options: [null, {
        result: {
          workout: {
            exercises: [coreTabataMember],
            title: '', description: '', needsAssessment: false,
            tabataBlock: { config: { workSec: 20, restSec: 10, rounds: 8 }, exerciseIds: ['core-ex-1'] },
          },
        },
      }, null],
    });
    const result = await composeParkWorkoutFromMachines([push1, pull1], fakeProfile, { difficulty: 'medium' });
    // Block A's 2 machines + Block B's core-tabata member all share ONE tabataBlock.
    expect(new Set(result.workout.tabataBlock?.exerciseIds)).toEqual(new Set(['push1', 'pull1', 'core-ex-1']));
    // Under Block A's ladder config (NOT Block B's own TABATA_CLASSIC-shaped config) — one shared clock.
    expect(result.workout.tabataBlock?.config).toEqual({ workSec: 30, restSec: 30, rounds: 4 });
  });

  it('diagnosis item 1(b)/4 fix: a Block-B-only core-tabata (no Block A machines at all) still gets its own tabataBlock, using Block B\'s own config', async () => {
    const coreTabataMember = { exercise: { id: 'core-ex-2' } } as any;
    trioMock.mockResolvedValue({
      options: [null, {
        result: {
          workout: {
            exercises: [coreTabataMember],
            title: '', description: '', needsAssessment: false,
            tabataBlock: { config: { workSec: 20, restSec: 10, rounds: 8 }, exerciseIds: ['core-ex-2'] },
          },
        },
      }, null],
    });
    // level 16 profile → machineShareForLevel = 0 → no Block A machines at all.
    const level16Profile = { id: 'u16', progression: { domains: { push: { currentLevel: 16 }, pull: { currentLevel: 16 } } } } as any;
    const result = await composeParkWorkoutFromMachines([push1, pull1], level16Profile, { difficulty: 'medium' });
    expect(result.blockASelectedMachineCount).toBe(0);
    expect(result.workout.tabataBlock?.exerciseIds).toEqual(['core-ex-2']);
    expect(result.workout.tabataBlock?.config).toEqual({ workSec: 20, restSec: 10, rounds: 8 }); // Block B's own config, unmodified
  });

  it('requirement #1: level-16 user gets 0 machines and no machine Tabata block, even at a machine-rich park', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
    const level16Profile = { id: 'u16', progression: { domains: { push: { currentLevel: 16 }, pull: { currentLevel: 16 } } } } as any;
    const sixMachinePark = [push1, push2, pull1, legs1, core1, machine({ id: 'pull2', movementPattern: 'vertical_pull' })];
    const result = await composeParkWorkoutFromMachines(sixMachinePark, level16Profile, { difficulty: 'medium' });
    expect(result.blockASelectedMachineCount).toBe(0);
    expect(result.workout.tabataBlock).toBeUndefined();
  });

  it('requirement #1: level-6 user gets machines, at least the 2-machine floor, at the same machine-rich park', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
    const level6Profile = { id: 'u6', progression: { domains: { push: { currentLevel: 6 }, pull: { currentLevel: 6 } } } } as any;
    const sixMachinePark = [push1, push2, pull1, legs1, core1, machine({ id: 'pull2', movementPattern: 'vertical_pull' })];
    const result = await composeParkWorkoutFromMachines(sixMachinePark, level6Profile, { difficulty: 'medium' });
    expect(result.blockASelectedMachineCount).toBeGreaterThanOrEqual(2);
    expect(result.workout.tabataBlock?.exerciseIds.length).toBe(result.blockASelectedMachineCount);
  });

  it('does not use Block B content when it needsAssessment (falls back to Block A only)', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [{ id: 'should-not-appear' }], title: 'x', description: 'y', needsAssessment: true } } }, null],
    });
    const result = await composeParkWorkoutFromMachines([push1, pull1], fakeProfile, { difficulty: 'medium' });
    expect(result.workout.exercises).toHaveLength(2); // only the Block A machines
    expect(result.workout.exercises.map((e) => e.exercise.id).sort()).toEqual(['pull1', 'push1']);
  });
});

describe('composeParkWorkout (async wrapper — gear-inventory bug fix)', () => {
  const fakeProfile = { id: 'u1' } as any;
  // Raw Firestore doc-id shapes — 20-char random alphanumerics, exactly what
  // ParkGymEquipment.equipmentId / GymEquipment.id actually look like in
  // production. These must NEVER reach Block B's generateHomeWorkoutTrio call
  // directly — only resolveParkEquipmentIds's CANONICAL output should.
  const rawFirestoreId1 = 'aB3xK9mQ2pL7vN4tRzYw';
  const rawFirestoreId2 = 'hJ8wE2rT6yU1iO5pAsDf';
  const fakePark = {
    id: 'park1',
    name: 'Test Park',
    gymEquipment: [
      { equipmentId: rawFirestoreId1, brandName: 'X' },
      { equipmentId: rawFirestoreId2, brandName: 'Y' },
    ],
  } as unknown as Park;

  beforeEach(() => {
    trioMock.mockClear();
    getGymEquipmentMock.mockClear();
    resolveParkEquipmentIdsMock.mockClear();
    ensureEquipmentCachesLoadedMock.mockClear();

    getGymEquipmentMock.mockImplementation((id: string) =>
      Promise.resolve(machine({ id, movementPattern: 'horizontal_push' })),
    );
    // The realistic behavior being tested: resolveParkEquipmentIds returns
    // CANONICAL gear-id strings, never the raw Firestore ids it was given.
    resolveParkEquipmentIdsMock.mockResolvedValue(['pullup_bar', 'leg_press']);
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
  });

  it('THE GUARDRAIL: warms the equipment cache before resolving park gear, so normalizeGearId never silently degrades to raw-id passthrough', async () => {
    await composeParkWorkout(fakePark, fakeProfile, { difficulty: 'medium' });
    expect(ensureEquipmentCachesLoadedMock).toHaveBeenCalled();
  });

  it('calls resolveParkEquipmentIds with the exact park id (the previously-dead selectedParkId branch)', async () => {
    await composeParkWorkout(fakePark, fakeProfile, { difficulty: 'medium' });
    expect(resolveParkEquipmentIdsMock).toHaveBeenCalledWith(fakeProfile, { selectedParkId: 'park1' });
  });

  it('THE BUG-FIX ASSERTION: Block B receives CANONICAL gear ids, and NEITHER of the park\'s raw Firestore doc-ids ever reaches it', async () => {
    await composeParkWorkout(fakePark, fakeProfile, { difficulty: 'medium' });

    expect(trioMock).toHaveBeenCalledTimes(1);
    const callArgs = trioMock.mock.calls[0][0];

    // Positive: the canonical ids resolveParkEquipmentIds returned are exactly
    // what Block B receives.
    expect(callArgs.parkEquipmentIds).toEqual(['pullup_bar', 'leg_press']);

    // Negative: this is the assertion that would have caught the original bug
    // (parkEquipmentIds never passed at all) AND would catch a regression back
    // to passing raw ids directly instead of the resolved canonical ones.
    expect(callArgs.parkEquipmentIds).not.toContain(rawFirestoreId1);
    expect(callArgs.parkEquipmentIds).not.toContain(rawFirestoreId2);
    // Sanity: canonical ids look like canonical ids (short, snake_case,
    // human-readable) — not 20-char random Firestore doc-id shapes.
    for (const id of callArgs.parkEquipmentIds) {
      expect(id).not.toMatch(/^[a-zA-Z0-9]{20}$/);
    }
  });

  it('a park with NO gymEquipment still resolves (resolveParkEquipmentIds returns [], Block B falls back to ESSENTIAL_PARK_GEAR — InputSanitizerMiddleware\'s job, not this function\'s)', async () => {
    resolveParkEquipmentIdsMock.mockResolvedValue([]);
    const emptyPark = { id: 'park2', name: 'Empty Park', gymEquipment: [] } as unknown as Park;
    await composeParkWorkout(emptyPark, fakeProfile, { difficulty: 'medium' });
    const callArgs = trioMock.mock.calls[0][0];
    expect(callArgs.parkEquipmentIds).toEqual([]);
  });
});

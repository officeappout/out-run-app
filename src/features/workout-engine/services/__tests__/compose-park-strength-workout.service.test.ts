import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { Park } from '@/features/parks/core/types/park.types';
import { calculateEstimatedDuration } from '../../logic/workout-budgeting.utils';
import { calculateWeeklyBudget } from '../../core/store/useWeeklyVolumeStore';

// generateHomeWorkoutTrio is Firestore-backed — mocked so these tests exercise
// only composeParkWorkoutFromMachines's own domain-complement/selection logic,
// not the real generator pipeline. normalizeProgramId is kept REAL (via
// importOriginal) — the composer now calls it directly (16.09.2026 fix,
// "gate Block A by scheduled domains") to derive scheduledDomains identically
// to Block B, and the tests below need the genuine normalization behavior,
// not a stand-in, to actually prove the two blocks agree.
const trioMock = vi.fn();
vi.mock('../home-workout.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../home-workout.service')>();
  return {
    ...actual,
    generateHomeWorkoutTrio: (...args: unknown[]) => trioMock(...args),
  };
});

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
  machineShareForLevel,
  resolveMachineShareLevel,
  resolveMachineAllocation,
} from '../compose-park-strength-workout.service';

// Default isFunctional: false (real strength machine, not functional
// apparatus) so every existing fixture is Block-A-eligible by default —
// keeps the selection/domain tests below about SELECTION, not the
// isFunctional exclusion (which has its own dedicated describe block below).
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

describe('isBlockAEligible (Wave 1: functional apparatus routed to bodyweight, not Block A)', () => {
  it('a real strength machine (isFunctional=false) is eligible', () => {
    const realMachine = machine({ id: 'm1', movementPattern: 'horizontal_push', isFunctional: false });
    expect(isBlockAEligible(realMachine)).toBe(true);
  });

  it('functional apparatus (isFunctional=true) is NEVER eligible for Block A — routed to bodyweight instead', () => {
    const pullupBar = machine({ id: 'p1', movementPattern: 'vertical_pull', isFunctional: true });
    expect(isBlockAEligible(pullupBar)).toBe(false);
  });

  it('functional apparatus stays ineligible even with recommendedLevel/other fields set — there is no level-based override anymore', () => {
    const parallelBars = machine({ id: 'p2', movementPattern: 'vertical_push', isFunctional: true, recommendedLevel: 1 });
    expect(isBlockAEligible(parallelBars)).toBe(false);
  });

  it('isCardio always excludes, regardless of isFunctional', () => {
    const cardioHydraulic = machine({ id: 'c1', movementPattern: 'horizontal_push', isFunctional: false, isCardio: true });
    expect(isBlockAEligible(cardioHydraulic)).toBe(false);
  });

  it('isolation/flexibility movementPattern is never eligible (no domain to gate on)', () => {
    const iso = machine({ id: 'i1', movementPattern: 'isolation', isFunctional: false });
    expect(isBlockAEligible(iso)).toBe(false);
  });

  it('no movementPattern is never eligible', () => {
    const untagged = machine({ id: 'u1', isFunctional: false });
    expect(isBlockAEligible(untagged)).toBe(false);
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

  it('diagnosis item 4 fix: mainVideoUrl falls back to the brand image when the brand has no video — avoids the live player\'s black/unrelated-stock-video fallback', () => {
    const imageOnly = machine({
      id: 'm6',
      movementPattern: 'horizontal_push',
      brands: [{ brandName: 'TestBrand', imageUrl: 'https://example.com/v.jpg' }],
    });
    const result = buildMachinePseudoExercise(imageOnly, config);
    expect(result.method.media?.mainVideoUrl).toBe('https://example.com/v.jpg');
  });

  it('mainVideoUrl stays undefined (no fake asset) when the brand has neither video nor image', () => {
    const noAssets = machine({ id: 'm7', movementPattern: 'horizontal_push', brands: [] });
    const result = buildMachinePseudoExercise(noAssets, config);
    expect(result.method.media?.mainVideoUrl).toBeUndefined();
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

describe('machineShareForLevel (Wave 2: TIME share, reaches 0 by level 8)', () => {
  it.each([
    [1, 0.70], [2, 0.70], [3, 0.70], [4, 0.70],
    [5, 0.55],
    [6, 0.35],
    [7, 0.15],
    [8, 0.00], [9, 0.00], [16, 0.00], [25, 0.00],
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

describe('resolveMachineAllocation (Wave 2: time-based, not a count proxy)', () => {
  const secPerRound = 60; // medium ladder: 30+30

  it('level-16 user → 0 machines, no machine Tabata, regardless of park size or time', () => {
    const result = resolveMachineAllocation({
      level: 16, eligibleMachineCount: 6, strengthTimeBudget: 45, secPerRound,
    });
    expect(result).toEqual({ machineCount: 0, rounds: 0, machineTimeMinutes: 0 });
  });

  it('level-6 user → machines present, at least the 2-machine floor', () => {
    const result = resolveMachineAllocation({
      level: 6, eligibleMachineCount: 6, strengthTimeBudget: 45, secPerRound,
    });
    expect(result.machineCount).toBeGreaterThanOrEqual(2);
    expect(result.rounds).toBe(result.machineCount * 2);
    expect(result.machineTimeMinutes).toBe(result.rounds); // 1 round ≈ 1 minute
  });

  it('desiredMachineTime = share × T, capped by 2-rounds-per-machine norm — never inflated past it', () => {
    // level 1 → share 0.70. T=20 → desired=14min → floor(14/2)=7 machines by
    // time, but the park only has 3 → machineCount capped at 3, NOT inflated
    // to more rounds per machine to "use up" the desired 14min.
    const result = resolveMachineAllocation({
      level: 1, eligibleMachineCount: 3, strengthTimeBudget: 20, secPerRound,
    });
    expect(result.machineCount).toBe(3);
    expect(result.rounds).toBe(6); // 3 × 2, the norm — never more
    expect(result.machineTimeMinutes).toBe(6); // NOT 14 — the unfulfillable
    // remainder becomes bodyweight time in the composer, not absurd rounds.
  });

  it('"no 1-machine Tabata" floor: a target of 1 bumps to 2 when the park + time can support it', () => {
    // level 7 → share 0.15; T=14 → desired=2.1 → floor(2.1/2)=1 raw target.
    const result = resolveMachineAllocation({
      level: 7, eligibleMachineCount: 6, strengthTimeBudget: 14, secPerRound,
    });
    expect(result.machineCount).toBe(2);
  });

  it('"no 1-machine Tabata" floor: drops to 0 when the park only has 1 eligible machine (can\'t bump to 2)', () => {
    const result = resolveMachineAllocation({
      level: 7, eligibleMachineCount: 1, strengthTimeBudget: 14, secPerRound,
    });
    expect(result).toEqual({ machineCount: 0, rounds: 0, machineTimeMinutes: 0 });
  });

  it('park cap: never selects more machines than the park actually has', () => {
    const result = resolveMachineAllocation({
      level: 1, eligibleMachineCount: 2, strengthTimeBudget: 60, secPerRound,
    });
    expect(result.machineCount).toBeLessThanOrEqual(2);
  });

  it('bodyweight floor (#6): machines never size into MIN_BLOCK_B_MINUTES, even at a low (machine-heavy) level with a big park', () => {
    // T=9 → only 4min available before the 5min bodyweight floor → at most 2 machines.
    const result = resolveMachineAllocation({
      level: 1, eligibleMachineCount: 8, strengthTimeBudget: 9, secPerRound,
    });
    expect(result.machineCount).toBeLessThanOrEqual(2);
  });

  it('short-time priority (#6): T too small for the min machine block (~4min) AND the bodyweight floor (5min) → machines drop to 0 first', () => {
    const result = resolveMachineAllocation({
      level: 1, eligibleMachineCount: 8, strengthTimeBudget: 8, secPerRound,
    });
    expect(result).toEqual({ machineCount: 0, rounds: 0, machineTimeMinutes: 0 });
  });

  it('returns 0 when the park has no eligible machines at all', () => {
    const result = resolveMachineAllocation({
      level: 1, eligibleMachineCount: 0, strengthTimeBudget: 20, secPerRound,
    });
    expect(result).toEqual({ machineCount: 0, rounds: 0, machineTimeMinutes: 0 });
  });

  it('property: bodyweight always keeps ≥ MIN_BLOCK_B_MINUTES of strengthTimeBudget across a level × time grid', () => {
    for (const strengthTimeBudget of [15, 20, 30, 45, 60]) {
      for (const level of [1, 5, 6, 7]) {
        const result = resolveMachineAllocation({
          level, eligibleMachineCount: 10, strengthTimeBudget, secPerRound,
        });
        expect(strengthTimeBudget - result.machineTimeMinutes).toBeGreaterThanOrEqual(5);
      }
    }
  });
});

describe('composeParkWorkoutFromMachines', () => {
  const fakeProfile = { id: 'u1', progression: {} } as any;

  beforeEach(() => {
    trioMock.mockClear();
    // Wave 2 removed the last Math.random() dependency from this file
    // (strengthBudget/getExerciseCountForDuration) — machine allocation is
    // now fully deterministic given level/time/park size, no pinning needed.
    // Sensible default so tests that don't care about Block B's specific
    // response don't need to set it up themselves — Block B ALWAYS runs now
    // (Wave 2 #5), so every test needs SOME resolution.
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
  });

  it('excludes isCardio machines from Block A even when movementPattern is set; a single eligible machine hits the "no 1-machine Tabata" floor and drops to 0', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
    });
    const result = await composeParkWorkoutFromMachines([cardio1, push1], fakeProfile, { difficulty: 'medium' });
    expect(result.blockAEligibleMachineCount).toBe(1); // only push1
    expect(result.blockASelectedMachineCount).toBe(0); // can't bump a lone machine to the 2-machine floor
  });

  it('never forces Block A\'s uncovered domains onto Block B — requiredDomains is left undefined so Block B fills from the session\'s own scheduled program domains (16.09.2026 fix — "Block B under-delivery")', async () => {
    trioMock.mockResolvedValue({
      options: [null, { result: { workout: { exercises: [], title: 'Block B', description: '', needsAssessment: false } } }, null],
    });
    await composeParkWorkoutFromMachines([push1, pull1], fakeProfile, { difficulty: 'medium' });

    expect(trioMock).toHaveBeenCalledTimes(1);
    const callArgs = trioMock.mock.calls[0][0];
    expect(callArgs.location).toBe('park');
    expect(callArgs.strictDomains).toBe(false);
    expect(callArgs.skipCycleRestart).toBe(true);
    expect(callArgs.requiredDomains).toBeUndefined();
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

  it('Wave 2 #5 fix: Block B ALWAYS runs, even when Block A already covers all 4 domains — the direct fix for "0 bodyweight"', async () => {
    const result = await composeParkWorkoutFromMachines(
      [push1, pull1, legs1, core1], fakeProfile, { difficulty: 'medium', availableTime: 45 },
    );
    expect(result.blockACoveredDomains).toEqual(['push', 'pull', 'legs', 'core']); // sanity: all 4 covered
    expect(trioMock).toHaveBeenCalledTimes(1); // Block B still runs regardless of Block A's coverage
    const callArgs = trioMock.mock.calls[0][0];
    expect(callArgs.requiredDomains).toBeUndefined(); // Block B fills from its own scheduled program domains
    expect(callArgs.strictDomains).toBe(false);
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

  describe('Wave 2 #1/#2: V (calculateWeeklyBudget) — one shared budget, no double-spend', () => {
    it('reduces Block B\'s remainingWeeklyBudget by the machine rounds already spent', async () => {
      // level 1 → weeklyVolumeBudget = calculateWeeklyBudget(1) = max(4,2) = 4.
      // [push1,pull1] → machineCount=2, rounds=4 → remaining = max(2, 4-4) = 2.
      await composeParkWorkoutFromMachines([push1, pull1], fakeProfile, { difficulty: 'medium', availableTime: 20 });
      const callArgs = trioMock.mock.calls[0][0];
      expect(callArgs.remainingWeeklyBudget).toBe(Math.max(2, calculateWeeklyBudget(1) - 4));
    });

    it('no machines spent → Block B gets the FULL, undiminished weekly budget', async () => {
      await composeParkWorkoutFromMachines([], fakeProfile, { difficulty: 'medium', availableTime: 20 });
      const callArgs = trioMock.mock.calls[0][0];
      expect(callArgs.remainingWeeklyBudget).toBe(calculateWeeklyBudget(1));
    });

    it('floors at 2 — machine rounds spending more than the whole weekly budget never sends Block B a non-positive number', async () => {
      // level 1, 45min, 6 real machines → machineCount=6, rounds=12 — well
      // over weeklyVolumeBudget=4.
      const sixMachinePark = [push1, push2, pull1, legs1, core1, machine({ id: 'pull2', movementPattern: 'vertical_pull' })];
      const result = await composeParkWorkoutFromMachines(sixMachinePark, fakeProfile, { difficulty: 'medium', availableTime: 45 });
      expect(result.blockASelectedMachineCount).toBe(6);
      const callArgs = trioMock.mock.calls[0][0];
      expect(callArgs.remainingWeeklyBudget).toBe(2);
    });
  });

  describe('Wave 2 #7: honest estimatedDuration', () => {
    it('is computed from actual built content, not echoed back as availableTime', async () => {
      const blockBExercise = {
        exercise: { id: 'bw1', name: { he: 'bw1' }, movementGroup: 'horizontal_push', secondsPerRep: 3, symmetry: 'bilateral' },
        exerciseRole: 'main', sets: 2, reps: 8, restSeconds: 60, isTimeBased: false,
      } as any;
      trioMock.mockResolvedValue({
        options: [null, { result: { workout: { exercises: [blockBExercise], title: '', description: '', needsAssessment: false } } }, null],
      });
      const result = await composeParkWorkoutFromMachines([], fakeProfile, { difficulty: 'medium', availableTime: 20 });
      expect(result.workout.estimatedDuration).not.toBe(20); // NOT just echoed back
      expect(result.workout.estimatedDuration).toBe(calculateEstimatedDuration(result.workout.exercises));
    });

    it('corrects for calculateEstimatedDuration\'s fixed TABATA_BLOCK_SECONDS assumption when machine rounds ≠ TABATA_CLASSIC\'s 4-round equivalent', async () => {
      // 3 real machines → machineCount=3 → rounds=6 (NOT 4) — the shared
      // pricer would otherwise price this as a flat 240s (4min) block.
      const threeMachinePark = [push1, pull1, legs1];
      const result = await composeParkWorkoutFromMachines(threeMachinePark, fakeProfile, { difficulty: 'medium', availableTime: 20 });
      expect(result.blockASelectedMachineCount).toBe(3);
      expect(result.workout.tabataBlock?.config.rounds).toBe(6);
      // Real cost: 3 machines × 2 rounds × 60s = 360s = 6min.
      expect(result.workout.estimatedDuration).toBe(6);
    });
  });

  describe('Wave 1: functional apparatus never enters Block A', () => {
    const pullupBar = machine({ id: 'pullup-bar', movementPattern: 'vertical_pull', isFunctional: true });
    const parallelBars = machine({ id: 'parallel-bars', movementPattern: 'vertical_push', isFunctional: true });

    it('an all-functional park (only pull-up bar + parallel bars) produces 0 Block A machines and pure bodyweight', async () => {
      trioMock.mockResolvedValue({
        options: [null, { result: { workout: { exercises: [{ exercise: { id: 'bw-pullup' } }, { exercise: { id: 'bw-dip' } }], title: '', description: '', needsAssessment: false } } }, null],
      });
      const result = await composeParkWorkoutFromMachines([pullupBar, parallelBars], fakeProfile, { difficulty: 'medium' });
      expect(result.blockAEligibleMachineCount).toBe(0);
      expect(result.blockASelectedMachineCount).toBe(0);
      expect(result.workout.tabataBlock).toBeUndefined();
      expect(result.blockACoveredDomains).toEqual([]);
      // The functional apparatus's movements are NOT lost — Block B was called
      // regardless of Block A's (empty) coverage, filling from its own
      // scheduled program domains (requiredDomains left undefined — 16.09.2026
      // fix), and its exercises pass straight through into the composed workout.
      expect(trioMock).toHaveBeenCalledTimes(1);
      const callArgs = trioMock.mock.calls[0][0];
      expect(callArgs.requiredDomains).toBeUndefined();
      expect(result.workout.exercises.map((e) => e.exercise.id)).toEqual(
        expect.arrayContaining(['bw-pullup', 'bw-dip']),
      );
    });

    it('a mixed park (real machines + functional apparatus) counts only the real machines into Block A — functional ones are excluded, not merely deprioritized', async () => {
      trioMock.mockResolvedValue({
        options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
      });
      const mixedPark = [push1, pull1, pullupBar, parallelBars]; // 2 real machines + 2 functional
      const result = await composeParkWorkoutFromMachines(mixedPark, fakeProfile, { difficulty: 'medium' });
      expect(result.blockAEligibleMachineCount).toBe(2); // pullupBar/parallelBars excluded from eligibility entirely
      const selectedIds = result.workout.exercises
        .filter((e) => e.protocolBlock === 'tabata')
        .map((e) => e.exercise.id);
      expect(selectedIds).not.toContain('pullup-bar');
      expect(selectedIds).not.toContain('parallel-bars');
    });

    it('Block A domain coverage reflects only real machines — a domain covered ONLY by functional apparatus is NOT counted as covered', async () => {
      trioMock.mockResolvedValue({
        options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
      });
      // pull is covered ONLY by the (excluded) pull-up bar; push+legs by real
      // machines (2 real machines, clear of the "no 1-machine Tabata" floor).
      const result = await composeParkWorkoutFromMachines([push1, legs1, pullupBar], fakeProfile, { difficulty: 'medium' });
      expect(result.blockACoveredDomains).toEqual(['push', 'legs']);
      expect(trioMock).toHaveBeenCalledTimes(1);
      const callArgs = trioMock.mock.calls[0][0];
      expect(callArgs.requiredDomains).toBeUndefined();
    });
  });

  describe('16.09.2026 fix: Block A gated by scheduled domains (mirrors the Block B fix)', () => {
    it('push day + mixed push/pull park → Block A never selects a pull machine', async () => {
      trioMock.mockResolvedValue({
        options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
      });
      const pushProfile = { id: 'u1', progression: { activePrograms: [{ templateId: 'push' }] } } as any;
      const push3 = machine({ id: 'push3', movementPattern: 'vertical_push' });
      const result = await composeParkWorkoutFromMachines(
        [push1, push2, push3, pull1], pushProfile, { difficulty: 'medium' },
      );
      // pull1 excluded at the ELIGIBILITY layer (not just deprioritized) —
      // blockAEligibleMachineCount proves the gate fired before selection.
      expect(result.blockAEligibleMachineCount).toBe(3);
      const selectedIds = result.workout.exercises
        .filter((e) => e.protocolBlock === 'tabata')
        .map((e) => e.exercise.id);
      expect(selectedIds).not.toContain('pull1');
      expect(result.blockACoveredDomains).toEqual(['push']);
    });

    it('upper_body (full-body/combined) schedule round-robins Block A across push+pull, never reaching for legs/core', async () => {
      trioMock.mockResolvedValue({
        options: [null, { result: { workout: { exercises: [], title: '', description: '', needsAssessment: false } } }, null],
      });
      const upperBodyProfile = {
        id: 'u1',
        progression: {
          activePrograms: [{ templateId: 'upper_body' }],
          tracks: { push: 4, pull: 4 }, // both assessed — resolveChildDomainsForParent needs this to include them
        },
      } as any;
      const result = await composeParkWorkoutFromMachines(
        [push1, pull1, legs1, core1], upperBodyProfile, { difficulty: 'medium', availableTime: 45 },
      );
      expect(result.blockACoveredDomains).toEqual(['push', 'pull']);
    });

    it('push day + park with ONLY pull machines → Block A gates to 0 machines, Block B absorbs the full session time (graceful — no exception)', async () => {
      trioMock.mockResolvedValue({
        options: [null, { result: { workout: { exercises: [{ exercise: { id: 'bw-push' } }], title: '', description: '', needsAssessment: false } } }, null],
      });
      const pushProfile = { id: 'u1', progression: { activePrograms: [{ templateId: 'push' }] } } as any;
      const result = await composeParkWorkoutFromMachines(
        [pull1], pushProfile, { difficulty: 'medium', availableTime: 20 },
      );
      expect(result.blockAEligibleMachineCount).toBe(0); // pull1 gated out entirely — a push day never touches it
      expect(result.blockASelectedMachineCount).toBe(0);
      expect(result.workout.tabataBlock).toBeUndefined();
      expect(result.blockACoveredDomains).toEqual([]);
      // machineTimeMinutes=0 → bodyweightTimeMinutes = max(MIN_BLOCK_B_MINUTES, availableTime - 0) = the FULL session time.
      const trioCallArgs = trioMock.mock.calls[0][0];
      expect(trioCallArgs.availableTime).toBe(20);
      expect(result.workout.exercises.map((e) => e.exercise.id)).toContain('bw-push');
    });
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

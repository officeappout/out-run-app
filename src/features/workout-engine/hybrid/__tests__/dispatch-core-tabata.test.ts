/**
 * dispatchStopContent's 'core' branch — tabata-first wiring (22.09.2026,
 * David-approved, field-test docs 32/33). Against the REAL (unmocked)
 * dispatchStopContent + buildCoreTabataBlock/buildTabataFromPool chain —
 * proves David's requirement #3 (park/outdoor media, never home) end to
 * end, not just at the unit level already covered by station-core-tabata.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { dispatchStopContent, type HybridComposeInput, type HybridStopCandidate } from '../compose-hybrid-session.service';
import { strengthBlockToWorkoutPlan } from '../strength-block-to-plan';
import { computeAdvanceDecision } from '../../players/strength/protocols/compute-advance';
import { effectiveSetsForExercise } from '../../players/strength/logic/set-target.utils';
import type { AdvanceContext, AdvanceExercise } from '../../players/strength/protocols/advance-strategy.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutGenerationContext } from '../../logic/workout-generator.types';
import type { ContextualFilterContext } from '../../logic/contextual-engine.types';

/** A core exercise authored HOME-FIRST (matching the real Firestore
 *  convention this whole feature exists to work around) — home method has
 *  media, park method ALSO has media, but at a DIFFERENT url, so a test
 *  assertion on the url unambiguously proves which one won. */
function homeFirstCoreExercise(id: string, level = 1): Exercise {
  return {
    id,
    name: { he: id, en: '' },
    tags: ['hiit_friendly'],
    targetPrograms: [{ programId: 'core', level }],
    symmetry: 'bilateral',
    equipment: [],
    execution_methods: [
      { location: 'home', methodName: { he: `${id} home` }, media: { mainVideoUrl: 'https://x/HOME.mp4' } },
      { location: 'park', methodName: { he: `${id} park` }, media: { mainVideoUrl: 'https://x/PARK.mp4' } },
    ],
  } as unknown as Exercise;
}

function baseInput(overrides: Partial<HybridComposeInput> = {}): HybridComposeInput {
  const generationContext: WorkoutGenerationContext = {
    availableTime: 30,
    userLevel: 1,
    daysInactive: 1,
    intentMode: 'normal',
    persona: null,
    location: 'park',
    injuryCount: 0,
  };
  const filterContext: ContextualFilterContext = {
    location: 'park',
    lifestyles: [],
    injuryShield: [],
    intentMode: 'normal',
    availableEquipment: [],
    getUserLevelForExercise: () => 1,
  } as unknown as ContextualFilterContext;

  return {
    timeBudgetMin: 30,
    emphasis: 'balanced',
    aerobicKind: 'walking',
    paceProfile: { basePace: 420, profileType: 'default' } as any,
    routePath: [] as any,
    stopCandidates: [],
    masterExercises: [],
    filterContext,
    generationContext,
    weeklyGaps: {} as any,
    userWeightKg: 70,
    ...overrides,
  };
}

function candidate(over: Partial<HybridStopCandidate> = {}): HybridStopCandidate {
  return {
    stopId: 'stop-1', locationKind: 'open_area', lat: 0, lng: 0,
    waypointIndex: 0, availableEquipment: [], activityType: 'core',
    ...over,
  };
}

describe("dispatchStopContent 'core' — tabata-first, park media (requirement #3)", () => {
  it('a home-first exercise resolves to its PARK method media, never home — real buildTabataFromPool chain, no mocks', () => {
    const exercises = ['a', 'b', 'c', 'd'].map((id) => homeFirstCoreExercise(id));
    const input = baseInput({ masterExercises: exercises });
    const log: string[] = [];
    const block = dispatchStopContent(candidate(), 'legs_core', 14, input, log);

    expect(block).not.toBeNull();
    expect(block!.tabataBlocks?.length).toBeGreaterThan(0);
    expect(block!.exercises.length).toBeGreaterThan(0);
    for (const we of block!.exercises) {
      // The engine-selected method (we.method) must be the PARK one.
      expect((we.method as any)?.location).toBe('park');
      // And its own media must be the PARK url — never the home one, even
      // though the home method (authored first, per the real-data
      // convention) also has media of its own.
      expect((we.method as any)?.media?.mainVideoUrl).toBe('https://x/PARK.mp4');
    }
  });

  it('a station whose time budget cannot fit even one 4-minute block falls back to the pre-existing field/bodyweight path, unchanged', () => {
    const exercises = ['a', 'b'].map((id) => homeFirstCoreExercise(id));
    const input = baseInput({ masterExercises: exercises });
    const log: string[] = [];
    const block = dispatchStopContent(candidate(), 'legs_core', 3, input, log); // 3min < one 4min block

    // Falls through to generateStrengthBlock's normal field/bodyweight
    // pool — no tabataBlocks on the result.
    expect(block?.tabataBlocks).toBeUndefined();
  });

  it('an empty hiit_friendly pool (no core-tagged conditioning exercises at all) falls back the same way', () => {
    const nonHiit: Exercise = {
      id: 'x', name: { he: 'x', en: '' }, tags: [], targetPrograms: [{ programId: 'core', level: 1 }],
      equipment: [],
      execution_methods: [{ location: 'park', methodName: { he: 'x park' }, media: { mainVideoUrl: 'https://x/park.mp4' } }],
    } as unknown as Exercise;
    const input = baseInput({ masterExercises: [nonHiit] });
    const log: string[] = [];
    const block = dispatchStopContent(candidate(), 'legs_core', 14, input, log);
    expect(block?.tabataBlocks).toBeUndefined();
  });
});

// ── Requirement #4 (player) ─────────────────────────────────────────────────
// "הוכח שהטיימר (עבודה/מנוחה/סבבים) רץ נכון בתוך סשן היברידי" — closes the
// loop from the REAL dispatchStopContent output, through the REAL mapper
// (strengthBlockToWorkoutPlan), into the REAL, unmocked player advance engine
// (computeAdvanceDecision → resolveBlockStrategy → tabataAdvance), the exact
// same generic protocol/protocolConfig-driven dispatch already proven for the
// general ab-Tabata finisher in tabata-advance.test.ts. Nothing here is
// hybrid-specific in the advance engine — this test exists to prove the
// WIRING between the three pieces, not to re-test any one of them in
// isolation (each already has its own dedicated coverage).
describe('dispatchStopContent → strengthBlockToWorkoutPlan → tabataAdvance (requirement #4, timer)', () => {
  function advanceCtx(over: Partial<AdvanceContext>): AdvanceContext {
    return {
      segments: [], currentSegmentIndex: 0, prevExerciseIndex: 0, setIdx: 0, log: [],
      getExercises: (s) => ((s as { exercises?: AdvanceExercise[] })?.exercises ?? null),
      getSets: effectiveSetsForExercise,
      ...over,
    };
  }

  it('a real hybrid-dispatched core station runs a full 8-round cycle-major tabata sequence and exits cleanly', () => {
    const exercises = ['a', 'b', 'c', 'd'].map((id) => homeFirstCoreExercise(id));
    const input = baseInput({ masterExercises: exercises });
    const stopBlock = dispatchStopContent(candidate(), 'legs_core', 4, input, []); // one 4-min block
    expect(stopBlock?.tabataBlocks?.length).toBe(1);

    const plan = strengthBlockToWorkoutPlan(stopBlock!, { name: 'תחנת ליבה' });
    expect(plan.segments).toHaveLength(1);
    const seg = plan.segments[0];
    expect(seg.protocol).toBe('tabata');
    expect(seg.protocolConfig).toEqual({ workSec: 20, restSec: 10, rounds: 8 }); // TABATA_CLASSIC, untouched
    const memberCount = (seg.exercises ?? []).length;
    expect(memberCount).toBeGreaterThan(0);

    // Walk every interval of the real block, exactly as StrengthRunner's
    // moveToNext would via computeAdvanceDecision — asserting the whole
    // block reaches workoutComplete (single-segment plan) at EXACTLY the
    // rounds boundary declared in protocolConfig, never before/after.
    let exerciseIndex = 0;
    let setIdx = 0;
    let steps = 0;
    let finalDecision: ReturnType<typeof computeAdvanceDecision> | null = null;
    while (steps < 100) {
      steps++;
      const decision = computeAdvanceDecision(advanceCtx({
        segments: plan.segments, currentSegmentIndex: 0, prevExerciseIndex: exerciseIndex, setIdx,
      }));
      if (decision.kind === 'goToExercise') {
        exerciseIndex = decision.exerciseIndex;
        if (decision.nextSetIdx != null) setIdx = decision.nextSetIdx;
        continue;
      }
      finalDecision = decision;
      break;
    }
    expect(finalDecision).toEqual({ kind: 'workoutComplete' });
    // rounds boundary: bilateral-only members (this fixture), cycle-major →
    // exactly `rounds` intervals were walked before completion.
    expect(steps).toBe((seg.protocolConfig as { rounds: number }).rounds);
    void memberCount;
  });
});

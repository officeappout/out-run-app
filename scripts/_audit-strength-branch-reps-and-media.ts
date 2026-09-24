/**
 * scripts/_audit-strength-branch-reps-and-media.ts
 *
 * READ-ONLY mapping audit, item 2 (David, 23.09.2026): PROVE by execution
 * whether dispatchStopContent's 'strength' branch still gives 1-3 reps
 * (TIER_TABLE) and home media for a hybrid station. No writes, no test
 * data in production — pure synthetic exercises, no Firestore writes.
 */
import { dispatchStopContent } from '../src/features/workout-engine/hybrid/compose-hybrid-session.service';
import type { HybridComposeInput, HybridStopCandidate } from '../src/features/workout-engine/hybrid/compose-hybrid-session.service';
import type { Exercise } from '../src/features/content/exercises/core/exercise.types';
import type { WorkoutGenerationContext } from '../src/features/workout-engine/logic/workout-generator.types';
import type { ContextualFilterContext } from '../src/features/workout-engine/logic/contextual-engine.types';

// A home-first-authored PUSH exercise, level 3 (targetPrograms) — for a
// level-1 (unassessed-default) user this is levelDelta=+2 -> TIER_TABLE
// 'elite' tier -> reps {min:1,max:3} per the established core-engine rule.
function homeFirstPushExercise(id: string, level = 2): Exercise {
  return {
    id, name: { he: id, en: '' }, movementGroup: 'horizontal_push',
    targetPrograms: [{ programId: 'push', level }],
    symmetry: 'bilateral',
    execution_methods: [
      { location: 'home', methodName: { he: `${id} home` }, media: { mainVideoUrl: 'https://x/HOME.mp4' } },
      { location: 'park', methodName: { he: `${id} park` }, equipmentIds: [], media: { mainVideoUrl: 'https://x/PARK.mp4' } },
    ],
  } as unknown as Exercise;
}

function baseInput(overrides: Partial<HybridComposeInput> = {}): HybridComposeInput {
  const generationContext: WorkoutGenerationContext = {
    availableTime: 30, userLevel: 1, daysInactive: 1, intentMode: 'normal', persona: null,
    location: 'park', injuryCount: 0,
  } as any;
  const filterContext: ContextualFilterContext = {
    location: 'park', lifestyles: [], injuryShield: [], intentMode: 'normal', availableEquipment: [],
    getUserLevelForExercise: () => 1, // assessed at level 1 (not -Infinity) so the pool isn't empty
  } as any;
  return {
    timeBudgetMin: 30, emphasis: 'balanced', aerobicKind: 'walking',
    paceProfile: { basePace: 420, profileType: 2 } as any,
    routePath: [] as any, stopCandidates: [], masterExercises: [],
    filterContext, generationContext, weeklyGaps: {} as any, userWeightKg: 70,
    ...overrides,
  };
}

function candidate(over: Partial<HybridStopCandidate> = {}): HybridStopCandidate {
  return {
    stopId: 'stop-1', locationKind: 'gym', lat: 0, lng: 0,
    waypointIndex: 0, availableEquipment: [], activityType: 'strength',
    ...over,
  };
}

const exercises = ['a', 'b', 'c', 'd'].map((id) => homeFirstPushExercise(id));
const input = baseInput({ masterExercises: exercises });
const log: string[] = [];
const block = dispatchStopContent(candidate(), 'push', 10, input, log);

console.log('=== dispatchStopContent strength branch — real, unmocked call ===\n');
console.log('log:'); log.forEach((l) => console.log('  ' + l));
console.log(`\nblock isEmpty: ${block?.isEmpty}`);
console.log(`exercises: ${block?.exercises.length}\n`);
for (const we of block?.exercises ?? []) {
  console.log(`- ${(we.exercise as any).name?.he ?? we.exercise.id}: reps=${JSON.stringify((we as any).reps)} tier=${(we as any).tier} isTimeBased=${(we as any).isTimeBased}`);
  console.log(`  method.location=${(we.method as any)?.location} media=${(we.method as any)?.media?.mainVideoUrl}`);
}

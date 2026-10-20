/**
 * The single-station combined card's push-only bug, against the REAL dispatchStopContent
 * (enable_home_v2, owner bug 20.10.2026). An equipped park, the week's "neglected" order
 * starting with push: 'per_station' (today) → push only; 'multi' (flag ON) → mixed.
 */
import { describe, it, expect } from 'vitest';
import { dispatchStopContent, type HybridComposeInput, type HybridStopCandidate } from '../compose-hybrid-session.service';
import { strictDomainsOfExercise } from '../../logic/strict-focus.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutGenerationContext } from '../../logic/workout-generator.types';
import type { ContextualFilterContext } from '../../logic/contextual-engine.types';

const park = (gear: string[]) => ({ location: 'park', locationMapping: ['park'], requiredGearType: gear.length ? 'fixed_equipment' : 'bodyweight', gearIds: gear, equipmentIds: [], methodName: { he: 'm' }, media: { mainVideoUrl: 'https://x/v.mp4' } });
const ex = (id: string, mg: string, programId: string, gear: string[]): Exercise => ({
  id, name: { he: id, en: id }, movementGroup: mg, targetPrograms: [{ programId, level: 5 }], symmetry: 'bilateral',
  equipment: [], exerciseRole: 'main', execution_methods: [park(gear)],
} as unknown as Exercise);

const exercises: Exercise[] = [
  ex('dips', 'vertical_push', 'push', ['dip_station']), ex('pushup', 'horizontal_push', 'push', []),
  ex('pike', 'vertical_push', 'push', []), ex('decline_pushup', 'horizontal_push', 'push', []),
  ex('pullup', 'vertical_pull', 'pull', ['pullup_bar']), ex('chinup', 'vertical_pull', 'pull', ['pullup_bar']),
  ex('aus_row', 'horizontal_pull', 'pull', ['pullup_bar']),
  ex('squat', 'squat', 'legs', []), ex('lunge', 'lunge', 'legs', []), ex('plank', 'core', 'core', []),
];

function input(mode?: 'per_station' | 'multi'): HybridComposeInput {
  const levels = new Map([['push', 5], ['pull', 5], ['legs', 5], ['core', 5]]);
  return {
    timeBudgetMin: 30, emphasis: 'balanced', aerobicKind: 'walking',
    paceProfile: { basePace: 420, profileType: 'default' } as any, routePath: [] as any, stopCandidates: [],
    masterExercises: exercises,
    filterContext: { location: 'park', lifestyles: [], injuryShield: [], intentMode: 'normal', availableEquipment: [], getUserLevelForExercise: () => 5 } as unknown as ContextualFilterContext,
    generationContext: { availableTime: 10, userLevel: 5, daysInactive: 1, intentMode: 'normal', persona: null, location: 'park', injuryCount: 0, difficulty: 2, userProgramLevels: levels } as WorkoutGenerationContext,
    weeklyGaps: { neglectedDomains: ['push', 'pull', 'legs', 'core'] } as any,
    userWeightKg: 70,
    ...(mode ? { stationDomainMode: mode } : {}),
  };
}
const stop: HybridStopCandidate = { stopId: 'p', locationKind: 'park', lat: 0, lng: 0, waypointIndex: 0, availableEquipment: ['pullup_bar', 'dip_station'], activityType: 'strength' } as unknown as HybridStopCandidate;

const domainsOf = (r: ReturnType<typeof dispatchStopContent>) =>
  new Set<string>((r?.exercises ?? (r as any)?.workout?.exercises ?? []).flatMap((e: any) => strictDomainsOfExercise(e.exercise ?? e)));

describe('single-station combined card — push-only bug', () => {
  const RUNS = 12;
  it("today ('per_station', focus push from the push-first neglected order) → push only, every time (the bug)", () => {
    for (let k = 0; k < RUNS; k++) {
      expect(Array.from(domainsOf(dispatchStopContent(stop, 'push', 12, input(), [])))).toEqual(['push']);
    }
  });
  it("flag ON ('multi') → the station trains more than push", () => {
    let mixed = 0;
    for (let k = 0; k < RUNS; k++) {
      const d = domainsOf(dispatchStopContent(stop, 'push', 12, input('multi'), []));
      if (d.size > 1) mixed++;
    }
    expect(mixed).toBeGreaterThanOrEqual(RUNS - 1);
  });
});

import { describe, it, expect, vi } from 'vitest';

// 17.8 build-plan Section 1 (26.08.2026) — Tier-2 real-build resolver only (no Tier-1 preview:
// David's explicit call was a loading skeleton for non-focused cards, not a fabricated preview
// exercise — see full-strength.generator.ts's own header). generate() itself is untouched, so
// unlike an earlier version of this file, no firebase/firestore mock is needed here at all —
// only generateHomeWorkoutTrio, matching post-workout-generators.test.ts's own convention.
vi.mock('../../../services/home-workout.service', () => ({
  generateHomeWorkoutTrio: vi.fn(),
}));

import { generateHomeWorkoutTrio } from '../../../services/home-workout.service';
import {
  detectFullStrengthMethodsUsed,
  getCachedFullStrengthWorkout,
  resolveFullStrengthWorkout,
} from '../full-strength.generator';
import type { UserContext } from '../../types/user-context.types';
import type { GeneratedWorkout } from '../../../logic/WorkoutGenerator';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

function makeContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'u1',
    baseLevel: 1,
    domainLevels: {},
    weeklyPerformance: { trainedDomainsThisWeek: [], neglectedDomains: [], totalSetsCompleted: 0, weeklyBudget: 0 },
    recoveryState: { isDetrainingLocked: false, daysInactive: 0 },
    todayCompletedDomains: [],
    todayGoal: null,
    stepGoal: 8000,
    stepsToday: 0,
    stepsRemaining: 0,
    availableTimeMin: 30,
    preferences: {},
    questionnaires: {},
    location: null,
    timeOfDay: 'morning',
    surface: 'home',
    venue: null,
    transitState: null,
    workdayState: null,
    activitySignal: null,
    ...overrides,
  };
}

const assessedProfile = { progression: { domains: { push: 5 } } } as unknown as UserFullProfile;

const baseWorkout = {
  title: 'אימון כוח',
  exercises: [{ exercise: { id: 'ex1' } }],
} as unknown as GeneratedWorkout;

describe('detectFullStrengthMethodsUsed', () => {
  it('always includes "straight"', () => {
    expect(detectFullStrengthMethodsUsed(baseWorkout)).toEqual(['straight']);
  });

  it('detects superset via pairedWith', () => {
    const workout = { ...baseWorkout, exercises: [{ ...baseWorkout.exercises[0], pairedWith: 'ex2' }] };
    expect(detectFullStrengthMethodsUsed(workout)).toContain('superset');
  });

  it('detects pyramid via a non-empty pyramidSequence', () => {
    const pyramidStep = {} as unknown as NonNullable<GeneratedWorkout['exercises'][number]['pyramidSequence']>[number];
    const workout = { ...baseWorkout, exercises: [{ ...baseWorkout.exercises[0], pyramidSequence: [pyramidStep] }] };
    expect(detectFullStrengthMethodsUsed(workout)).toContain('pyramid');
  });

  it('detects tabata via tabataBlock', () => {
    const workout = { ...baseWorkout, tabataBlock: {} as unknown as GeneratedWorkout['tabataBlock'] };
    expect(detectFullStrengthMethodsUsed(workout)).toContain('tabata');
  });
});

describe('getCachedFullStrengthWorkout', () => {
  it('returns undefined for an id never resolved', () => {
    expect(getCachedFullStrengthWorkout('never-resolved-id')).toBeUndefined();
  });
});

describe('resolveFullStrengthWorkout — Tier-2 real build', () => {
  it('calls generateHomeWorkoutTrio with generateSingleOption/targetOptionIndex:1, caches by suggestion id', async () => {
    const realWorkout = { title: 'אימון כוח אמיתי', exercises: [], needsAssessment: false } as unknown as GeneratedWorkout;
    vi.mocked(generateHomeWorkoutTrio).mockResolvedValue({
      options: [null, { label: 'מאוזן', result: { workout: realWorkout } }, null],
    } as unknown as Awaited<ReturnType<typeof generateHomeWorkoutTrio>>);

    const resolved = await resolveFullStrengthWorkout('sug-1', assessedProfile, makeContext());

    expect(generateHomeWorkoutTrio).toHaveBeenCalledWith(
      expect.objectContaining({ generateSingleOption: true, targetOptionIndex: 1 }),
    );
    expect(resolved).toBe(realWorkout);
    expect(getCachedFullStrengthWorkout('sug-1')).toBe(realWorkout);
  });

  it('returns cached result on a second call without calling generateHomeWorkoutTrio again', async () => {
    vi.mocked(generateHomeWorkoutTrio).mockClear();
    const resolved = await resolveFullStrengthWorkout('sug-1', assessedProfile, makeContext());
    expect(resolved).toBeDefined();
    expect(generateHomeWorkoutTrio).not.toHaveBeenCalled();
  });

  it('returns null when the real build reports needsAssessment', async () => {
    vi.mocked(generateHomeWorkoutTrio).mockResolvedValue({
      options: [null, { label: 'מאוזן', result: { workout: { needsAssessment: true } } }, null],
    } as unknown as Awaited<ReturnType<typeof generateHomeWorkoutTrio>>);

    const resolved = await resolveFullStrengthWorkout('sug-needs-assessment', assessedProfile, makeContext());
    expect(resolved).toBeNull();
    expect(getCachedFullStrengthWorkout('sug-needs-assessment')).toBeUndefined();
  });

  it('de-dupes concurrent calls for the same not-yet-cached id to a single generateHomeWorkoutTrio call', async () => {
    vi.mocked(generateHomeWorkoutTrio).mockClear();
    let resolveTrio!: (v: Awaited<ReturnType<typeof generateHomeWorkoutTrio>>) => void;
    const pendingTrio = new Promise<Awaited<ReturnType<typeof generateHomeWorkoutTrio>>>((res) => { resolveTrio = res; });
    vi.mocked(generateHomeWorkoutTrio).mockReturnValue(pendingTrio);

    const realWorkout = { title: 'אימון כוח', exercises: [], needsAssessment: false } as unknown as GeneratedWorkout;
    const context = makeContext();
    // Two concurrent callers (streaming prefetch + carousel onSettle) racing for the same id.
    const call1 = resolveFullStrengthWorkout('sug-concurrent', assessedProfile, context);
    const call2 = resolveFullStrengthWorkout('sug-concurrent', assessedProfile, context);

    resolveTrio({ options: [null, { label: 'מאוזן', result: { workout: realWorkout } }, null] } as unknown as Awaited<ReturnType<typeof generateHomeWorkoutTrio>>);
    const [result1, result2] = await Promise.all([call1, call2]);

    expect(generateHomeWorkoutTrio).toHaveBeenCalledTimes(1);
    expect(result1).toBe(realWorkout);
    expect(result2).toBe(realWorkout);
  });
});

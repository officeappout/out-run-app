import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HybridStartIntent } from '../build-hybrid-input';
import type { HybridSessionContext } from '../start-hybrid-session';

/**
 * scenarios 5/6 regression: composeFullParkWorkout must NOT relabel a
 * generateHomeWorkoutTrio `needsAssessment` result (buildNeedsAssessmentResult,
 * home-workout.service.ts) as a generic rest day. It must surface the workout's
 * own assessment message instead — every OTHER exercises.length===0 cause
 * (isRecovery, a genuinely empty pool) must still read as "יום מנוחה".
 */

const routePath = [
  [34.0, 32.0],
  [34.01, 32.0],
  [34.0, 32.0],
];

const station = {
  name: 'Test Park', parkId: 'p1', lat: 32.0, lng: 34.01, waypointIndex: 1,
  availableEquipment: ['hydraulic_leg_press'],
};

vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ profile: { core: { weight: 70 }, progression: {} } }) },
}));
vi.mock('@/features/parks/core/services/parks.service', () => ({
  fetchRealParks: async () => [{ id: 'p1', gymEquipment: [{ equipmentId: 'eq1' }] }],
}));
vi.mock('../park-out-and-back', () => ({
  resolveParkOutAndBack: async () => ({ routePath, station }),
}));
vi.mock('../compose-park-workout.service', () => ({
  composeParkWorkoutPlan: (input: any) => ({
    segments: [],
    totals: { aerobicMin: 10, strengthMin: 0, distanceKm: 1, estCalories: 50, stations: input.workout.exercises.length > 0 ? 1 : 0 },
    meta: { emphasisResolved: 'balanced', whoGapNote: null, usedFieldFallback: false, insufficientHomeContent: false, log: [] },
  }),
}));
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({
  getAllGymEquipment: async () => [{ id: 'eq1', isFunctional: false, name: 'Hydraulic Leg Press' }],
}));

let trioMock: any;
vi.mock('@/features/workout-engine/services/home-workout.service', () => ({
  generateHomeWorkoutTrio: async () => trioMock,
}));
vi.mock('@/features/user/identity/services/access-control.service', () => ({
  hasAssessedStrengthDomain: () => false,
}));

const needsAssessmentWorkout = {
  title: 'נדרשת הערכת רמה',
  description: 'עדיין לא הערכנו את הרמה שלך. השלימו שאלון קצר כדי לקבל אימון מותאם אישית.',
  exercises: [],
  isRecovery: false,
  needsAssessment: true,
};

const realRestDayWorkout = {
  title: 'יום מנוחה',
  description: 'מנוחה היום',
  exercises: [],
  isRecovery: true,
  needsAssessment: false,
};

const trainingWorkout = {
  title: 'אימון',
  exercises: [{ sets: 3, reps: 8, isTimeBased: false, exerciseRole: 'main' }],
  isRecovery: false,
  needsAssessment: false,
};

function makeTrio(workout: any) {
  const opt = { result: { workout } };
  return { isRestDay: false, options: [opt, opt, opt] };
}

const baseIntent: HybridStartIntent = {
  timeBudgetMin: 30,
  aerobicShare: 0.4,
  emphasis: 'balanced' as any,
  aerobicKind: 'running' as any,
  mode: 'full_park_workout' as any,
};

const makeCtx = (): HybridSessionContext => ({
  userPosition: { lat: 32.0, lng: 34.0 },
  startRun: () => {},
});

describe('composeFullParkWorkout — needs-assessment vs real rest day (scenarios 5/6)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('shows the assessment message, not "יום מנוחה", when the bolt is needsAssessment', async () => {
    trioMock = makeTrio(needsAssessmentWorkout);
    const { composeHybridPlan } = await import('../start-hybrid-session');
    const composed = await composeHybridPlan(baseIntent, makeCtx());
    expect(composed).not.toBeNull();
    expect(composed!.fallbackHint).toBe(needsAssessmentWorkout.description);
    expect(composed!.fallbackHint).not.toBe('יום מנוחה — הליכה בלבד');
  });

  it('keeps "יום מנוחה — הליכה בלבד" for a real rest day (isRecovery, not needsAssessment)', async () => {
    trioMock = makeTrio(realRestDayWorkout);
    const { composeHybridPlan } = await import('../start-hybrid-session');
    const composed = await composeHybridPlan(baseIntent, makeCtx());
    expect(composed).not.toBeNull();
    expect(composed!.fallbackHint).toBe('יום מנוחה — הליכה בלבד');
  });

  it('keeps "יום מנוחה — הליכה בלבד" for a genuinely empty pool (not needsAssessment)', async () => {
    trioMock = makeTrio({ title: 'ריק', exercises: [], isRecovery: false, needsAssessment: false });
    const { composeHybridPlan } = await import('../start-hybrid-session');
    const composed = await composeHybridPlan(baseIntent, makeCtx());
    expect(composed).not.toBeNull();
    expect(composed!.fallbackHint).toBe('יום מנוחה — הליכה בלבד');
  });

  it('leaves a real training bolt with no fallbackHint at all', async () => {
    trioMock = makeTrio(trainingWorkout);
    const { composeHybridPlan } = await import('../start-hybrid-session');
    const composed = await composeHybridPlan(baseIntent, makeCtx());
    expect(composed).not.toBeNull();
    expect(composed!.fallbackHint).toBeUndefined();
  });
});

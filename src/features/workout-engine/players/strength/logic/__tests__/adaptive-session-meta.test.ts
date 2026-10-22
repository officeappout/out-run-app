import { describe, it, expect } from 'vitest';
import { buildAdaptiveSessionMeta } from '../adaptive-session-meta';
import type { ExerciseResultLog } from '../../hooks/useWorkoutStateMachine';

const entry = (p: Partial<ExerciseResultLog>): ExerciseResultLog => ({
  exerciseId: 'a', exerciseName: 'a', segmentId: 's', confirmedReps: [5, 5], targetReps: 5,
  prescribedRange: { min: 4, max: 6 }, role: 'main', ...p,
});

describe('buildAdaptiveSessionMeta (3a)', () => {
  it('a normal main exercise counts', () => {
    const m = buildAdaptiveSessionMeta([entry({ repsSource: ['edited', 'default'] })], null).get('a')!;
    expect(m).toMatchObject({ target: 5, range: { min: 4, max: 6 }, isHold: false, skip: false, sources: ['edited', 'default'] });
  });
  it.each([
    ['swapped', { wasSwapped: true as const }],
    ['warm-up', { role: 'warmup' }],
    ['cool-down', { role: 'cooldown' }],
    ['deload / heat stamp', { adaptiveSkip: true as const }],
    ['no prescribed range', { prescribedRange: undefined }],
  ])('%s is skipped', (_n, p) => {
    expect(buildAdaptiveSessionMeta([entry(p)], null).get('a')!.skip).toBe(true);
  });
  it('holds come from the plan (or a timer-measured set)', () => {
    const plan = { segments: [{ exercises: [{ id: 'a', isTimeBased: true }] }] };
    expect(buildAdaptiveSessionMeta([entry({})], plan).get('a')!.isHold).toBe(true);
    expect(buildAdaptiveSessionMeta([entry({ repsSource: ['timer'] })], null).get('a')!.isHold).toBe(true);
  });
});

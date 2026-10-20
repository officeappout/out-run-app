import { describe, expect, it } from 'vitest';
import {
  doneKindsOf, dropStepsDuplicate, nextHeaderHe, orderByNext, resolveNextRecommendation, suggestionKindOf,
  type NextRecommendationInput,
} from '../next-recommendation';

const base: NextRecommendationInput = {
  doneToday: ['strength'],
  plannedToday: ['strength'],
  stepsRemaining: 0,
  hasStrengthProgram: true,
  hasRunningPlan: true,
  week: { strengthDone: 1, strengthTarget: 3, runDone: 0, runTarget: 2 },
};

describe('resolveNextRecommendation', () => {
  it("today's plan still pending → that first (strength done, run still planned)", () => {
    expect(resolveNextRecommendation({ ...base, plannedToday: ['run', 'strength'] })).toEqual({ kind: 'run', why: 'planned' });
  });
  it('steps gap → a short walk', () => {
    expect(resolveNextRecommendation({ ...base, stepsRemaining: 3000 })).toEqual({ kind: 'walk', why: 'steps' });
  });
  it('a tiny gap is not worth a walk', () => {
    expect(resolveNextRecommendation({ ...base, stepsRemaining: 200 }).kind).toBe('run');
  });
  it('never the same kind again the same day: strength done → weekly run', () => {
    expect(resolveNextRecommendation(base)).toEqual({ kind: 'run', why: 'week' });
  });
  it('after a run, strength still due this week → strength', () => {
    expect(resolveNextRecommendation({ ...base, doneToday: ['run'], plannedToday: ['run'] })).toEqual({ kind: 'strength', why: 'week' });
  });
  it('all targets reached → rest', () => {
    expect(resolveNextRecommendation({ ...base, week: { strengthDone: 3, strengthTarget: 3, runDone: 2, runTarget: 2 } })).toEqual({ kind: 'rest', why: 'done' });
  });
  it('unknown steps are skipped, not treated as a gap', () => {
    expect(resolveNextRecommendation({ ...base, stepsRemaining: null, hasRunningPlan: false }).kind).toBe('rest');
  });
  it('walker: walk planned and not done → the walk', () => {
    expect(resolveNextRecommendation({ ...base, doneToday: [], plannedToday: ['walk'], hasStrengthProgram: false, hasRunningPlan: false })).toEqual({ kind: 'walk', why: 'planned' });
  });
});

describe('suggestion kinds + order', () => {
  const s = (generatorId: string, goalTags: string[] = []) => ({ id: generatorId, generatorId, goalTags });
  it('maps the engine generators', () => {
    expect(suggestionKindOf(s('recovery-follow-up'))).toBe('rest');
    expect(suggestionKindOf(s('safety-net'))).toBe('walk');
    expect(suggestionKindOf(s('complementary-short'))).toBe('strength');
    expect(suggestionKindOf(s('route', ['run']))).toBe('run');
    expect(suggestionKindOf(s('route', ['walk']))).toBe('walk');
  });
  it('orderByNext is stable and leads with the recommended kind', () => {
    const items = [s('recovery-follow-up'), s('complementary-short'), s('safety-net')];
    expect(orderByNext(items, suggestionKindOf, 'walk').map((x) => x.generatorId)).toEqual(['safety-net', 'recovery-follow-up', 'complementary-short']);
    expect(orderByNext(items, suggestionKindOf, 'run').map((x) => x.generatorId)).toEqual(['recovery-follow-up', 'complementary-short', 'safety-net']);
  });
  it('drops the generic steps card only when the short walk is shown', () => {
    const items = [s('full-strength'), s('safety-net')];
    expect(dropStepsDuplicate(items, true).map((x) => x.generatorId)).toEqual(['full-strength']);
    expect(dropStepsDuplicate(items, false)).toHaveLength(2);
  });
});

describe('doneKindsOf / nextHeaderHe', () => {
  it('reads workout docs', () => {
    expect(doneKindsOf([{ workoutType: 'walking' }, { workoutType: 'strength' }]).sort()).toEqual(['strength', 'walk']);
    expect(doneKindsOf([{ workoutType: 'hybrid', activityType: 'running' }]).sort()).toEqual(['run', 'strength']);
    expect(doneKindsOf(null)).toEqual([]);
  });
  it('rest header keeps the old copy', () => {
    expect(nextHeaderHe({ kind: 'rest', why: 'done' })).toBe('סיימת הכל, מגיע לך מנוחה');
  });
});

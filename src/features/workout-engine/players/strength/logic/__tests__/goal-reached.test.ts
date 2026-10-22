import { describe, it, expect } from 'vitest';
import { goalKey, newlyReachedGoals, type GoalTargetLite } from '../goal-reached';

const pullGoal: GoalTargetLite = { exerciseId: 'pu', exerciseName: 'מתח', targetValue: 10, unit: 'reps' };
const holdGoal: GoalTargetLite = { exerciseId: 'fl', exerciseName: 'פרונט לבר', targetValue: 10, unit: 'seconds' };
const e = (exerciseId: string, exerciseName: string, confirmedReps: number[]) => ({ exerciseId, exerciseName, confirmedReps });

describe('newlyReachedGoals (3e)', () => {
  it('one set at or above the target reaches it', () => {
    expect(newlyReachedGoals([e('pu', 'מתח', [8, 10])], [pullGoal], new Set())).toEqual([{ key: goalKey(pullGoal), goal: pullGoal, value: 10 }]);
    expect(newlyReachedGoals([e('pu', 'מתח', [9, 9])], [pullGoal], new Set())).toEqual([]);
  });
  it('matches by name when ids differ (same rule as the summary)', () => {
    expect(newlyReachedGoals([e('x', 'פרונט לבר בטאק', [12])], [holdGoal], new Set())).toHaveLength(1);
  });
  it('once per goal per session', () => {
    expect(newlyReachedGoals([e('pu', 'מתח', [11])], [pullGoal], new Set([goalKey(pullGoal)]))).toEqual([]);
  });
});

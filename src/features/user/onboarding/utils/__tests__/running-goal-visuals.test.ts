import { describe, it, expect } from 'vitest';
import {
  abilityCopy,
  abilityTierOf,
  ABILITY_LEVEL,
  resolveRunningGoalVisual,
  runningGoalPathOf,
  runningGoalSubtitle,
} from '../../constants/running-goal-visuals';
import { RUNNING_ANSWERS } from '../../data/running-improvement-branch.draft';

describe('running goal → photo mapping', () => {
  const goalAnswers = RUNNING_ANSWERS.filter((a) => a.questionId === 'q_run_goal');

  it('covers every real q_run_goal option', () => {
    expect(goalAnswers.length).toBe(3);
    for (const a of goalAnswers) {
      expect(runningGoalPathOf(a)).not.toBeNull();
      expect(runningGoalSubtitle(runningGoalPathOf(a), false)).toBeTruthy();
    }
  });

  it('improve → race start photo, maintain → park run photo, start → tint (no fake photo)', () => {
    expect(resolveRunningGoalVisual({ id: 'x', metadata: { goalPath: 'improve_time' } }).src).toBe('/images/gateway/card-running.png');
    expect(resolveRunningGoalVisual({ id: 'x', metadata: { goalPath: 'maintain_fitness' } }).src).toBe('/images/gateway/card-map.png');
    expect(resolveRunningGoalVisual({ id: 'x', metadata: { goalPath: 'start_running' } }).src).toBeNull();
  });

  it('metadata wins over id; known ids work without metadata', () => {
    expect(runningGoalPathOf({ id: 'a_run_goal_start', metadata: { goalPath: 'improve_time' } })).toBe('improve_time');
    expect(runningGoalPathOf({ id: 'a_run_goal_maintain' })).toBe('maintain_fitness');
  });

  it('unknown answer: its own imageUrl, else a neutral tint', () => {
    expect(resolveRunningGoalVisual({ id: 'zzz', imageUrl: 'https://x/y.jpg' }).src).toBe('https://x/y.jpg');
    const n = resolveRunningGoalVisual({ id: 'zzz' });
    expect(n.src).toBeNull();
    expect(n.goalPath).toBeNull();
  });

  it('gendered maintain subtitle', () => {
    expect(runningGoalSubtitle('maintain_fitness', true)).toContain('רצה');
    expect(runningGoalSubtitle('maintain_fitness', false)).toContain('רץ ');
  });
});

describe('ability answers', () => {
  const abilityAnswers = RUNNING_ANSWERS.filter((a) => a.questionId.endsWith('_ability'));
  it('every real ability option has a tier, a level and a sub line', () => {
    expect(abilityAnswers.length).toBe(6);
    for (const a of abilityAnswers) {
      const tier = abilityTierOf(a);
      expect(tier).not.toBeNull();
      expect(ABILITY_LEVEL[tier!]).toBeGreaterThanOrEqual(0);
      expect(abilityCopy(tier!, false).sub).toBeTruthy();
    }
  });
  it('levels rise with the time', () => {
    expect(ABILITY_LEVEL.none).toBeLessThan(ABILITY_LEVEL['5_15']);
    expect(ABILITY_LEVEL['15_30']).toBeLessThan(ABILITY_LEVEL['45_plus']);
  });
});

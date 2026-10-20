import { describe, expect, it } from 'vitest';
import { addTrackPolicyCounts, profileMarksSaturday } from '../add-track-policy';

const none = { goalIds: [], personaIds: [], age: null };

describe('add-track policy counts', () => {
  it('beginner strength user adding a beginner run plan: 2 + 2', () => {
    expect(addTrackPolicyCounts({ progression: { tracks: { push: { currentLevel: 3 } } } }, { abilityTier: 'none' }, none)).toEqual({ strength: 2, runs: 2 });
  });

  it('advanced lifter adding runs as an experienced runner: strength gives way, runs 4', () => {
    expect(addTrackPolicyCounts({ progression: { tracks: { push: { currentLevel: 16 } } } }, { goalPath: 'improve_time', targetDistance: '5k', paceInputSeconds: 1500 }, none)).toEqual({ strength: 2, runs: 4 });
  });

  it('runner adding strength reads the stored running level; seniors get 2 + 2', () => {
    const runner = { running: { isUnlocked: true, paceProfile: { profileType: 2 } } };
    expect(addTrackPolicyCounts(runner, null, none)).toEqual({ strength: 2, runs: 3 });
    expect(addTrackPolicyCounts(runner, null, { ...none, personaIds: ['vatikim'] })).toEqual({ strength: 2, runs: 2 });
  });

  it('Saturday counts as marked only when a stored day list holds ש', () => {
    expect(profileMarksSaturday({ lifestyle: { scheduleDays: ['א', 'ג'] } })).toBe(false);
    expect(profileMarksSaturday({ running: { scheduleDays: ['ב', 'ש'] } })).toBe(true);
    expect(profileMarksSaturday(null)).toBe(false);
  });
});

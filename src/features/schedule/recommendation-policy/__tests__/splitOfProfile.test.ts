import { describe, expect, it } from 'vitest';
import { hardSkillCountOf, recommendedSplitOfProfile } from '../splitOfProfile';

const lvl = (n: number) => ({ tracks: { push: { level: n }, pull: { level: n }, legs: { level: n } } });

describe('recommendedSplitOfProfile — the card\'s split from a saved profile', () => {
  it('intermediate: 3 days → full body, 4 days → upper / lower', () => {
    expect(recommendedSplitOfProfile({ progression: lvl(8) }, 3)).toBe('full_body_ab');
    expect(recommendedSplitOfProfile({ progression: lvl(8) }, 4)).toBe('upper_lower');
    expect(recommendedSplitOfProfile({ progression: lvl(8) }, 6)).toBe('upper_lower');
  });

  it('beginner: full body, even with 5 days', () => {
    expect(recommendedSplitOfProfile({ progression: lvl(3) }, 5)).toBe('full_body_ab');
  });

  it('health_cap: a health-goal intermediate stays 3 × full body', () => {
    expect(recommendedSplitOfProfile({ progression: lvl(8), selectedGoals: ['health'] }, 4)).toBe('full_body_ab');
  });

  it('level = the average of push / pull / legs (strong only in pull ≠ advanced)', () => {
    const p = { progression: { tracks: { push: { level: 4 }, pull: { level: 16 }, legs: { level: 4 } } } };
    expect(recommendedSplitOfProfile(p, 4)).toBe('upper_lower'); // avg 8 → intermediate
  });

  it('both tracks: strength gives way → full body', () => {
    expect(recommendedSplitOfProfile({ progression: lvl(8), running: { isUnlocked: true } }, 4)).toMatch(/^full_body/);
  });

  it('hard skills / no days / no profile → null', () => {
    expect(recommendedSplitOfProfile({ progression: { ...lvl(8), skillFocusIds: ['planche'] } }, 4)).toBeNull();
    expect(recommendedSplitOfProfile({ progression: lvl(8) }, 0)).toBeNull();
    expect(recommendedSplitOfProfile(null, 4)).toBeNull();
  });

  it('handstand is not a hard skill', () => {
    expect(hardSkillCountOf(['handstand', 'planche', 'front_lever'])).toBe(2);
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import { recordedAerobicMinutes } from '../completion-sync.service';

describe('recordedAerobicMinutes (enable_flame_tiers_v1)', () => {
  it('run / walk: the session; hybrid: run + walk legs; strength / cycling: 0', () => {
    expect(recordedAerobicMinutes({ workoutType: 'running', durationMinutes: 32 })).toBe(32);
    expect(recordedAerobicMinutes({ workoutType: 'walking', durationMinutes: 40 })).toBe(40);
    expect(recordedAerobicMinutes({
      workoutType: 'hybrid', durationMinutes: 50,
      hybridParts: { runMinutes: 12, runKm: 2, walkMinutes: 8, walkKm: 1, strengthMinutes: 30 },
    })).toBe(20);
    expect(recordedAerobicMinutes({ workoutType: 'hybrid', durationMinutes: 50 })).toBe(0);
    expect(recordedAerobicMinutes({ workoutType: 'strength', durationMinutes: 45 })).toBe(0);
    expect(recordedAerobicMinutes({ workoutType: 'cycling', durationMinutes: 45 })).toBe(0);
  });
});

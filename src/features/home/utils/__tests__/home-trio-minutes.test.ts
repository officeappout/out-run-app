import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { resolveEffectiveBoltTime } from '@/features/workout-engine/logic/bolt-time.utils';
import { homeTrioAvailableMinutes } from '../home-trio-minutes';

const NOW = new Date('2026-10-27T10:00:00');
const user = (level: number, minutes?: number, start = '2026-10-26T08:00:00.000Z') => ({
  lifestyle: minutes == null ? {} : { sessionMinutes: minutes },
  progression: { tracks: { push: { currentLevel: level } }, activePrograms: [{ startDate: start }] },
});

describe('homeTrioAvailableMinutes', () => {
  it('no saved length keeps the legacy 60', () => {
    expect(homeTrioAvailableMinutes(user(3), NOW, false)).toBe(60);
    expect(homeTrioAvailableMinutes(null, NOW, false)).toBe(60);
  });
  it('late night wins', () => {
    expect(homeTrioAvailableMinutes(user(3, 45), NOW, true)).toBe(15);
  });
  it('first-weeks ramp: 15 for levels 1-2, 20 for levels 3-5', () => {
    expect(homeTrioAvailableMinutes(user(1, 45), NOW, false)).toBe(15);
    expect(homeTrioAvailableMinutes(user(4, 45), NOW, false)).toBe(20);
  });
  it('level 6+ uses the chosen length', () => {
    expect(homeTrioAvailableMinutes(user(7, 40), NOW, false)).toBe(40);
  });
  it('the engine honours it below every bolt cap', () => {
    const m = homeTrioAvailableMinutes(user(4, 45), NOW, false);
    for (const cap of [30, 45, 60]) expect(resolveEffectiveBoltTime(m, cap, false)).toBe(m);
  });
});

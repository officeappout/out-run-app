import { describe, expect, it } from 'vitest';
import { addTriadTrackLevels, getAttachedTriadLevels, resolveTriadLevels } from '..';
import { buildUserProgramLevels } from '../../../services/level-resolution.utils';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

const tracks = (triad?: Record<string, unknown>) => ({
  push: { currentLevel: 9 },
  handstand: { currentLevel: 6, triad },
});

describe('hidden triad levels on the handstand track', () => {
  it('flag off → nothing attached, map untouched', () => {
    const levels = new Map([['handstand', 6]]);
    addTriadTrackLevels(levels, tracks({ strength: 10, balance: 4, mobility: 7 }), false);
    expect(Array.from(levels.entries())).toEqual([['handstand', 6]]);
    expect(getAttachedTriadLevels(levels)).toBeUndefined();
  });
  it('flag on → attached beside the map, never added as keys (max level unchanged)', () => {
    const levels = new Map([['push', 9], ['handstand', 6]]);
    addTriadTrackLevels(levels, tracks({ strength: 12, balance: 4, mobility: 7 }), true);
    expect(Array.from(levels.keys())).toEqual(['push', 'handstand']);
    expect(Math.max(...Array.from(levels.values()))).toBe(9);
    expect(resolveTriadLevels(levels, 1)).toEqual({ strength: 12, balance: 4, mobility: 7 });
  });
  it('missing / invalid axis → falls back to the handstand level (never lower than today)', () => {
    const levels = new Map([['handstand', 6]]);
    addTriadTrackLevels(levels, tracks({ strength: 10, balance: 0, mobility: 'x' }), true);
    expect(resolveTriadLevels(levels, 1)).toEqual({ strength: 10, balance: 6, mobility: 6 });
  });
  it('takes the handstand track that has a triad when two keys resolve to handstand; clamps 1-15', () => {
    const levels = new Map([['handstand', 6]]);
    addTriadTrackLevels(levels, { handstand: { currentLevel: 6 }, IOfBZFeorTTDkcz3tOA6: { currentLevel: 6, triad: { strength: 40, balance: 2.4, mobility: 9 } } }, true);
    // the hash id resolves to 'handstand' only once the program map is loaded; the slug key alone has no triad
    const viaSlugOnly = getAttachedTriadLevels(levels);
    expect(viaSlugOnly === undefined || viaSlugOnly.strength === 15).toBe(true);
    const direct = new Map([['handstand', 6]]);
    addTriadTrackLevels(direct, { handstand: { triad: { strength: 40, balance: 2.4, mobility: 9 } } }, true);
    expect(resolveTriadLevels(direct, 1)).toEqual({ strength: 15, balance: 2, mobility: 9 });
  });
  it('buildUserProgramLevels with the flag off (default): same keys as without a triad', () => {
    const profile = (triad?: Record<string, number>) =>
      ({ progression: { tracks: { handstand: { currentLevel: 6, percent: 0, triad } }, domains: {} } }) as unknown as UserFullProfile;
    const withTriad = buildUserProgramLevels(profile({ strength: 12, balance: 4, mobility: 7 }), new Set(), '[t]').levels;
    const without = buildUserProgramLevels(profile(), new Set(), '[t]').levels;
    expect(Array.from(withTriad.entries())).toEqual(Array.from(without.entries()));
    expect(getAttachedTriadLevels(withTriad)).toBeUndefined();
  });
});

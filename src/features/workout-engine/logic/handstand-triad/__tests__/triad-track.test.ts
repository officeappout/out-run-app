import { describe, expect, it } from 'vitest';
import { addTriadTrackLevels, resolveTriadLevels } from '..';

const tracks = (triad?: Record<string, unknown>) => ({
  push: { currentLevel: 9 },
  handstand: { currentLevel: 6, triad },
});

describe('hidden triad levels on the handstand track', () => {
  it('flag off → the level map is untouched', () => {
    const levels = new Map([['handstand', 6]]);
    addTriadTrackLevels(levels, tracks({ strength: 10, balance: 4, mobility: 7 }), false);
    expect([...levels.keys()]).toEqual(['handstand']);
  });
  it('flag on → copies the three axes; resolveTriadLevels reads them', () => {
    const levels = new Map([['handstand', 6]]);
    addTriadTrackLevels(levels, tracks({ strength: 10, balance: 4, mobility: 7 }), true);
    expect(resolveTriadLevels(levels, 1)).toEqual({ strength: 10, balance: 4, mobility: 7 });
  });
  it('missing / invalid axis → falls back to the handstand level (never lower than today)', () => {
    const levels = new Map([['handstand', 6]]);
    addTriadTrackLevels(levels, tracks({ strength: 10, balance: 0, mobility: 'x' }), true);
    expect(resolveTriadLevels(levels, 1)).toEqual({ strength: 10, balance: 6, mobility: 6 });
  });
  it('no triad on the track → nothing added; clamps to 1-15', () => {
    const none = new Map([['handstand', 6]]);
    addTriadTrackLevels(none, tracks(undefined), true);
    expect(none.size).toBe(1);
    const big = new Map<string, number>();
    addTriadTrackLevels(big, tracks({ strength: 40, balance: 2.4, mobility: 9 }), true);
    expect(resolveTriadLevels(big, 1)).toEqual({ strength: 15, balance: 2, mobility: 9 });
  });
});

import { describe, it, expect } from 'vitest';
import { createInitialProgression } from '../profile.service';

describe('createInitialProgression — absent=absent from init (⑨)', () => {
  it('seeds NO domain levels at profile creation (tier is not a per-domain assessment)', () => {
    for (const tier of [1, 2, 3] as const) {
      const p = createInitialProgression(tier);
      expect(Object.keys(p.domains)).toEqual([]); // no tier-seeded domains
      expect(p.tracks).toEqual({});               // no seeded tracks
    }
  });

  it('still returns a valid progression shell (globalLevel floors, no crash)', () => {
    const p = createInitialProgression(2);
    expect(p.globalLevel).toBe(1);
    expect(p.activePrograms).toEqual([]);
    expect(p.domains).toBeDefined();
  });
});

import { describe, it, expect } from 'vitest';
import { buildUnitDoc } from '../unit-doc';

describe('buildUnitDoc ASCII-id guard', () => {
  it('throws on a non-ASCII unitId — the exact class of bug that made 5 real battalions invisible in search with zero errors anywhere (05.09.2026)', () => {
    expect(() =>
      buildUnitDoc({
        unitId: 'bn_u_סיירת_גולני',
        name: 'סיירת גולני',
        parentUnitId: null,
        parentUnitPath: [],
        unitType: 'battalion',
      }),
    ).toThrow(/non-ASCII/);
  });

  it('accepts a plain ASCII unitId', () => {
    expect(() =>
      buildUnitDoc({
        unitId: 'bn_9307',
        name: 'גדוד 9307',
        parentUnitId: null,
        parentUnitPath: [],
        unitType: 'battalion',
      }),
    ).not.toThrow();
  });

  it('accepts a hash-based ASCII unitId (the actual output shape of computeUnitId for a nameless unit)', () => {
    expect(() =>
      buildUnitDoc({
        unitId: 'bn_bde_1_1a2b3c',
        name: 'סיירת גולני',
        parentUnitId: null,
        parentUnitPath: [],
        unitType: 'battalion',
      }),
    ).not.toThrow();
  });
});

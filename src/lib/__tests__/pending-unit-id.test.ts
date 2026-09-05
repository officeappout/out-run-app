import { describe, it, expect } from 'vitest';
import { computePendingUnitId } from '../pending-unit-id';

describe('computePendingUnitId', () => {
  it('matches the approved convention for a company under a battalion', () => {
    expect(computePendingUnitId({ level: 'company', orgId: '_810____cjo3', parentUnitId: 'bn_9307', name: 'פלוגה א' })).toBe(
      'co_bn_9307_פלוגה_א',
    );
  });

  it('scopes a battalion by its brigade orgId, not globally', () => {
    const a = computePendingUnitId({ level: 'battalion', orgId: 'bde_1', parentUnitId: null, name: 'סיירת בדיקה' });
    const b = computePendingUnitId({ level: 'battalion', orgId: 'bde_2', parentUnitId: null, name: 'סיירת בדיקה' });
    expect(a).not.toBe(b);
  });

  it('a brigade has no parent to scope by — mirrors Task 1s bde_u_ convention', () => {
    expect(computePendingUnitId({ level: 'brigade', orgId: null, parentUnitId: null, name: 'חטמ"ר בדיקה' })).toBe('bde_u_חטמר_בדיקה');
  });

  it('is deterministic — same input always produces the same id (idempotency requirement)', () => {
    const input = { level: 'company' as const, orgId: null, parentUnitId: 'bn_9307', name: 'פלוגה ב' };
    expect(computePendingUnitId(input)).toBe(computePendingUnitId({ ...input }));
  });

  it('throws rather than guessing when a required scoping parent is missing', () => {
    expect(() => computePendingUnitId({ level: 'company', orgId: null, parentUnitId: null, name: 'פלוגה ג' })).toThrow();
    expect(() => computePendingUnitId({ level: 'battalion', orgId: null, parentUnitId: null, name: 'סיירת' })).toThrow();
  });
});

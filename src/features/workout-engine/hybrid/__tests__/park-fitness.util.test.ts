import { describe, it, expect } from 'vitest';
import type { Park } from '@/features/parks/core/types/park.types';
import { isPrimaryFitness, hasUsableEquipment } from '../park-fitness.util';

// SPEC-07 production-bug fix: fetchRealParks() returns the lean catalog shape
// (hasUsableEquipment/isPrimaryFitness precomputed booleans, no raw
// gymEquipment/sportTypes). Both predicates must prefer the precomputed boolean
// when present and fall back to the raw-field check only when it's genuinely
// absent (a full-record Park without the booleans populated) — never the other
// way around, and never silently ignore the boolean.

describe('isPrimaryFitness', () => {
  it('trusts isPrimaryFitness: true even with no raw sportTypes/category at all', () => {
    const p = { id: 'p', isPrimaryFitness: true } as unknown as Park;
    expect(isPrimaryFitness(p)).toBe(true);
  });

  it('trusts isPrimaryFitness: false even if raw fields would otherwise qualify', () => {
    const p = { id: 'p', isPrimaryFitness: false, sportTypes: ['calisthenics'], category: 'gym_park' } as unknown as Park;
    expect(isPrimaryFitness(p)).toBe(false);
  });

  it('falls back to raw sportTypes when the boolean is absent', () => {
    const p = { id: 'p', sportTypes: ['functional'] } as unknown as Park;
    expect(isPrimaryFitness(p)).toBe(true);
  });

  it('falls back to raw category=gym_park when the boolean is absent', () => {
    const p = { id: 'p', category: 'gym_park' } as unknown as Park;
    expect(isPrimaryFitness(p)).toBe(true);
  });

  it('falls back to false when neither the boolean nor a qualifying raw field is present', () => {
    const p = { id: 'p' } as unknown as Park;
    expect(isPrimaryFitness(p)).toBe(false);
  });
});

describe('hasUsableEquipment', () => {
  it('trusts hasUsableEquipment: true even with no raw gymEquipment array at all', () => {
    const p = { id: 'p', hasUsableEquipment: true } as unknown as Park;
    expect(hasUsableEquipment(p)).toBe(true);
  });

  it('trusts hasUsableEquipment: false even if a raw gymEquipment array would otherwise qualify', () => {
    const p = { id: 'p', hasUsableEquipment: false, gymEquipment: [{ equipmentId: 'pullup_bar' }] } as unknown as Park;
    expect(hasUsableEquipment(p)).toBe(false);
  });

  it('falls back to raw gymEquipment.length > 0 when the boolean is absent', () => {
    const p = { id: 'p', gymEquipment: [{ equipmentId: 'pullup_bar' }] } as unknown as Park;
    expect(hasUsableEquipment(p)).toBe(true);
  });

  it('falls back to false when the boolean is absent and gymEquipment is empty/missing', () => {
    expect(hasUsableEquipment({ id: 'p', gymEquipment: [] } as unknown as Park)).toBe(false);
    expect(hasUsableEquipment({ id: 'p' } as unknown as Park)).toBe(false);
  });
});

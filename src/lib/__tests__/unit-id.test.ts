import { describe, it, expect } from 'vitest';
import { computeUnitId } from '../unit-id';

const ASCII_ID = /^[a-z0-9_]+$/;

describe('computeUnitId', () => {
  it('a numbered unit keeps the existing prefix_number convention verbatim', () => {
    expect(computeUnitId({ level: 'battalion', displayNumber: 9307 })).toBe('bn_9307');
    expect(computeUnitId({ level: 'brigade', displayNumber: 810 })).toBe('bde_810');
  });

  it('a nameless unit is ASCII-only — the exact regression this fixes: bn_u_<hebrew-slug> silently never triggered onUnitWrite (Eventarc doesn\'t fire for non-ASCII document ids)', () => {
    const id = computeUnitId({ level: 'battalion', parentScope: 'bde_1', name: 'סיירת גולני' });
    expect(id).toMatch(ASCII_ID);
  });

  it('company is scoped by its real parent battalion, not global', () => {
    const a = computeUnitId({ level: 'company', parentScope: 'bn_9307', name: 'פלוגה א' });
    const b = computeUnitId({ level: 'company', parentScope: 'bn_223', name: 'פלוגה א' });
    expect(a).toMatch(ASCII_ID);
    expect(a).not.toBe(b);
  });

  it('battalion is scoped by its brigade orgId, not global — a live submission is unreviewed, unlike Task 1s manually-checked numbers', () => {
    const a = computeUnitId({ level: 'battalion', parentScope: 'bde_1', name: 'סיירת בדיקה' });
    const b = computeUnitId({ level: 'battalion', parentScope: 'bde_2', name: 'סיירת בדיקה' });
    expect(a).not.toBe(b);
  });

  it('brigade has no parent to scope by', () => {
    const id = computeUnitId({ level: 'brigade', name: 'חטמ"ר בדיקה' });
    expect(id).toMatch(ASCII_ID);
    expect(id.startsWith('bde_u_')).toBe(true);
  });

  it('is deterministic — same input always produces the same id (idempotency + dedup-key requirement)', () => {
    const input = { level: 'company' as const, parentScope: 'bn_9307', name: 'פלוגה ב' };
    expect(computeUnitId(input)).toBe(computeUnitId({ ...input }));
  });

  it('throws rather than guessing when a required scoping parent is missing', () => {
    expect(() => computeUnitId({ level: 'company', name: 'פלוגה ג' })).toThrow();
    expect(() => computeUnitId({ level: 'battalion', name: 'סיירת' })).toThrow();
  });

  it('throws rather than guessing when neither displayNumber nor name is given', () => {
    expect(() => computeUnitId({ level: 'battalion', parentScope: 'bde_1' })).toThrow();
  });
});

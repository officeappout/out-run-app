import { describe, it, expect, vi } from 'vitest';
import { countExcludingTestAndMock } from '../testAccountFilterAdmin';

/**
 * Mocks a Firestore Query whose .count().get() and .where(...).count().get()
 * resolve to fixed numbers — verifies the subtraction arithmetic, and that
 * the two exclusion filters are each queried with a POSITIVE `== true`
 * clause (never `!=`, which would wrongly exclude every doc missing the
 * field — see this file's own header comment for why).
 */
function makeFakeQuery(counts: { total: number; mock: number; test: number }) {
  const whereCalls: Array<[string, string, unknown]> = [];
  const query: any = {
    count: () => ({ get: async () => ({ data: () => ({ count: counts.total }) }) }),
    where: (field: string, op: string, value: unknown) => {
      whereCalls.push([field, op, value]);
      const subCount = field === 'core.isMockData' ? counts.mock : counts.test;
      return {
        count: () => ({ get: async () => ({ data: () => ({ count: subCount }) }) }),
      };
    },
  };
  return { query, whereCalls };
}

describe('countExcludingTestAndMock', () => {
  it('subtracts both mock and test counts from the total', async () => {
    const { query } = makeFakeQuery({ total: 100, mock: 10, test: 20 });
    await expect(countExcludingTestAndMock(query)).resolves.toBe(70);
  });

  it('returns the full total when neither flag is present on any doc', async () => {
    const { query } = makeFakeQuery({ total: 50, mock: 0, test: 0 });
    await expect(countExcludingTestAndMock(query)).resolves.toBe(50);
  });

  it('queries both exclusion sets with a positive `== true` filter, never `!=`', async () => {
    const { query, whereCalls } = makeFakeQuery({ total: 10, mock: 1, test: 2 });
    await countExcludingTestAndMock(query);
    expect(whereCalls).toContainEqual(['core.isMockData', '==', true]);
    expect(whereCalls).toContainEqual(['core.isTestData', '==', true]);
    expect(whereCalls.every(([, op]) => op === '==')).toBe(true);
  });
});

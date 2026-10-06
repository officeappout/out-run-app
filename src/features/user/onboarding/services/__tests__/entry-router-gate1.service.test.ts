import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Proves the Gate-1 "has trained" conscious choice (06.10.2026 tutorial
 * entry-mechanism slice): trust `progression.workoutCount > 0` without a
 * read, but never trust a 0/absent reading as "never trained" — fall back
 * to the real `workouts` collection via `isRealWorkoutCompletion`
 * (PR #155's canonical predicate) instead.
 */

const mocks = vi.hoisted(() => ({
  docs: [] as { data: () => Record<string, unknown> }[],
  getDocsImpl: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __col: name })),
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ __type: 'where', field, op, value })),
  orderBy: vi.fn((field: string, dir: string) => ({ __type: 'orderBy', field, dir })),
  limit: vi.fn((n: number) => ({ __type: 'limit', value: n })),
  getDocs: (...args: unknown[]) => mocks.getDocsImpl(...args),
}));

import { hasEverTrained } from '../entry-router-gate1.service';

function docOf(data: Record<string, unknown>) {
  return { data: () => data };
}

beforeEach(() => {
  mocks.docs = [];
  mocks.getDocsImpl.mockReset();
  mocks.getDocsImpl.mockImplementation(async () => ({ docs: mocks.docs }));
});

describe('hasEverTrained — Gate 1 conscious signal choice', () => {
  it('trusts workoutCount > 0 immediately, without ever querying workouts', async () => {
    const result = await hasEverTrained('u1', 3);
    expect(result).toBe(true);
    expect(mocks.getDocsImpl).not.toHaveBeenCalled();
  });

  it('falls back to a real workouts query when workoutCount is 0', async () => {
    mocks.docs = [docOf({ workoutType: 'running' })];
    const result = await hasEverTrained('u1', 0);
    expect(result).toBe(true);
    expect(mocks.getDocsImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to a real workouts query when workoutCount is undefined', async () => {
    mocks.docs = [docOf({ workoutType: 'strength', setsCompleted: 2 })];
    const result = await hasEverTrained('u1', undefined);
    expect(result).toBe(true);
  });

  it('does not count recovery-only or empty-strength docs as having trained', async () => {
    mocks.docs = [
      docOf({ workoutType: 'recovery' }),
      docOf({ workoutType: 'strength', setsCompleted: 0 }),
    ];
    const result = await hasEverTrained('u1', 0);
    expect(result).toBe(false);
  });

  it('fails closed (false) rather than throwing when the fallback query itself fails', async () => {
    mocks.getDocsImpl.mockRejectedValueOnce(new Error('permission-denied'));
    const result = await hasEverTrained('u1', 0);
    expect(result).toBe(false);
  });

  it('never fabricates "trained" from an undercounted-but-genuinely-empty history', async () => {
    mocks.docs = [];
    const result = await hasEverTrained('u1', 0);
    expect(result).toBe(false);
  });
});

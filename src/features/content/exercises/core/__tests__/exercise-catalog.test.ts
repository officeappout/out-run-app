import { describe, it, expect, vi, beforeEach } from 'vitest';

const reads = vi.hoisted(() => ({
  readAllExercisesOrdered: vi.fn(),
  readAllExercisesUnordered: vi.fn(),
}));
vi.mock('../exercise-collection.reads', () => reads);
// Node test env: no IndexedDB → the store is a no-op; keep it explicit anyway.
vi.mock('@/lib/idbRecordStore', () => ({
  createIdbRecordStore: () => ({ read: async () => null, write: async () => {}, clear: async () => {} }),
}));

import { getExerciseCatalog, invalidateExerciseCatalog } from '../exercise-catalog';

describe('exercise catalog accessor', () => {
  beforeEach(() => {
    invalidateExerciseCatalog();
    reads.readAllExercisesOrdered.mockReset();
    reads.readAllExercisesUnordered.mockReset();
  });

  it('N concurrent callers → one Firestore read; later calls served from cache', async () => {
    reads.readAllExercisesOrdered.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const results = await Promise.all(Array.from({ length: 18 }, () => getExerciseCatalog()));
    expect(results.every((r) => r.length === 2)).toBe(true);
    await getExerciseCatalog();
    expect(reads.readAllExercisesOrdered).toHaveBeenCalledTimes(1);
  });

  it('keeps getAllExercises order (ordered read) and returns independent copies', async () => {
    reads.readAllExercisesOrdered.mockResolvedValue([{ id: 'b' }, { id: 'a' }]);
    const r1 = await getExerciseCatalog();
    r1.reverse();
    expect((await getExerciseCatalog()).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('falls back to the unordered read when the ordered query fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    reads.readAllExercisesOrdered.mockRejectedValue(new Error('failed-precondition'));
    reads.readAllExercisesUnordered.mockResolvedValue([{ id: 'x' }]);
    expect((await getExerciseCatalog()).map((e) => e.id)).toEqual(['x']);
  });

  it('invalidateExerciseCatalog() (admin save) forces the next read', async () => {
    reads.readAllExercisesOrdered
      .mockResolvedValueOnce([{ id: 'old' }])
      .mockResolvedValueOnce([{ id: 'edited' }]);
    expect((await getExerciseCatalog())[0].id).toBe('old');
    invalidateExerciseCatalog();
    expect((await getExerciseCatalog())[0].id).toBe('edited');
  });
});

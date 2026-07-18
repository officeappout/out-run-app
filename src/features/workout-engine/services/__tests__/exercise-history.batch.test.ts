import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Shared, hoisted test state the firestore mock can reach.
const state = vi.hoisted(() => ({
  HISTORY: {} as Record<string, { reps?: number[]; exerciseId?: string }>,
  getDocsCalls: [] as string[][], // one entry per query = the chunk it was asked for
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (..._a: unknown[]) => ({ __col: true }),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: async (q: { __inValues?: string[] }) => {
    const ids = q?.__inValues ?? [];
    state.getDocsCalls.push(ids);
    return {
      docs: ids
        .filter((id) => id in state.HISTORY)
        .map((id) => ({ id, data: () => state.HISTORY[id] })),
    };
  },
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  query: (_col: unknown, whereClause: { __inValues?: string[] }) => ({ __inValues: whereClause.__inValues }),
  where: (_field: unknown, _op: string, values: string[]) => ({ __inValues: values }),
  documentId: () => '__documentId__',
  orderBy: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: () => 'TS',
}));

import { getHistoryMapForExercises } from '../exercise-history.service';

beforeEach(() => {
  for (const k of Object.keys(state.HISTORY)) delete state.HISTORY[k];
  state.getDocsCalls = [];
  // Node's global `navigator` has no `onLine` → the offline guard would early-return.
  // In a real WebView navigator.onLine is a real boolean; stub it as online here.
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getHistoryMapForExercises — chunked in-query (#7)', () => {
  it('chunks ~65 ids into 3 `in` queries of ≤30 (was 65 getDocs)', async () => {
    const ids = Array.from({ length: 65 }, (_, i) => `ex${i}`);
    ids.forEach((id) => { state.HISTORY[id] = { reps: [5] }; });

    const map = await getHistoryMapForExercises('u1', ids);

    expect(state.getDocsCalls.length).toBe(3);           // 30 + 30 + 5
    expect(state.getDocsCalls.map((c: string[]) => c.length)).toEqual([30, 30, 5]);
    expect(Object.keys(map)).toHaveLength(65);
    expect(map['ex0']).toEqual([5]);
    expect(map['ex64']).toEqual([5]);
  });

  it('output parity: same filtering as the fan-out (misses, empty reps, id-mismatch all excluded)', async () => {
    state.HISTORY['a'] = { reps: [5, 6] };            // kept
    state.HISTORY['b'] = { reps: [] };                // excluded — empty reps
    // 'c' absent                                     // excluded — missing doc
    state.HISTORY['d'] = { reps: [7], exerciseId: 'WRONG' }; // excluded — key/field mismatch

    const map = await getHistoryMapForExercises('u1', ['a', 'b', 'c', 'd']);

    expect(map).toEqual({ a: [5, 6] });
    expect(state.getDocsCalls.length).toBe(1);           // one chunk of 4
    expect(state.getDocsCalls[0]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('dedups input ids before chunking', async () => {
    state.HISTORY['x'] = { reps: [1] };
    const map = await getHistoryMapForExercises('u1', ['x', 'x', 'x']);
    expect(state.getDocsCalls).toEqual([['x']]);         // one query, one unique id
    expect(map).toEqual({ x: [1] });
  });

  it('empty input short-circuits — no query issued', async () => {
    const map = await getHistoryMapForExercises('u1', []);
    expect(map).toEqual({});
    expect(state.getDocsCalls.length).toBe(0);
  });

  it('keeps the id-field mismatch guard (no cross-exercise contamination)', async () => {
    state.HISTORY['pushup'] = { reps: [10], exerciseId: 'wall_handstand_pushup' };
    const map = await getHistoryMapForExercises('u1', ['pushup']);
    expect(map).toEqual({}); // mismatched entry skipped
  });
});

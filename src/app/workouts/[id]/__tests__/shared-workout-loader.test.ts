import { describe, it, expect, vi, beforeEach } from 'vitest';

// The loader must read through the Admin SDK (data-exposure plan 0.2), never the
// tokenless Firestore REST API that only worked while sharedWorkouts was world-readable.
const S = vi.hoisted(() => ({ docs: {} as Record<string, Record<string, unknown> | undefined>, paths: [] as string[] }));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => ({
    collection: (c: string) => ({
      doc: (id: string) => ({
        get: async () => {
          S.paths.push(`${c}/${id}`);
          const data = S.docs[id];
          return { exists: data !== undefined, data: () => data };
        },
      }),
    }),
  }),
}));

import { fetchSharedWorkoutMeta } from '../shared-workout-loader';

describe('fetchSharedWorkoutMeta', () => {
  beforeEach(() => {
    S.docs = {};
    S.paths = [];
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REST must not be called'); }));
  });

  it('reads sharedWorkouts/{id} via the Admin SDK and keeps the old field defaults', async () => {
    S.docs.w1 = { title: 'T', difficulty: 3, muscles: ['chest', 7], estimatedDuration: 20 };
    const meta = await fetchSharedWorkoutMeta('w1');
    expect(S.paths).toEqual(['sharedWorkouts/w1']);
    expect(meta).toEqual({
      title: 'T', description: '', difficulty: 3, estimatedDuration: 20,
      exerciseCount: 0, muscles: ['chest'], equipment: [], structure: 'standard',
    });
  });

  it('returns null for a missing doc or a path-like id', async () => {
    expect(await fetchSharedWorkoutMeta('nope')).toBeNull();
    expect(await fetchSharedWorkoutMeta('a/b')).toBeNull();
    expect(S.paths).toEqual(['sharedWorkouts/nope']);
  });
});

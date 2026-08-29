import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pins the fix/schedule-entry-per-item change: hydrateFromTemplate used to write
// ONE UserScheduleEntry per day, with the whole template array on `programIds`.
// AgendaDayCard draws one card per entry and reads title/icon from `programIds[0]`
// only, so a day with 2+ strength items silently showed just the first — the
// second existed in the data and was invisible everywhere. Fixed to write one
// entry per id, in template order, each with its own stable entryId.
//
// Mocks firebase/firestore by hand (vi.hoisted mutable state + inline vi.mock
// factories), matching the established convention in
// onboarding-sync.service.test.ts — no shared Firestore test-utils helper
// exists in this repo. `runTransaction` is mocked as a thin real-transaction
// stand-in: it just invokes the callback with a `tx` backed by the same
// in-memory doc state `getDoc`/`setDoc` would use.

const state = vi.hoisted(() => ({
  EXISTING_DOC: null as Record<string, unknown> | null,
}));

const txSetMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-uid-1' } },
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  documentId: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: () => 'SERVER_TS',
  runTransaction: async (_db: unknown, callback: (tx: unknown) => unknown) => {
    const tx = {
      get: async (ref: { id: string }) => ({
        exists: () => state.EXISTING_DOC !== null,
        data: () => state.EXISTING_DOC ?? undefined,
        id: ref.id,
      }),
      set: (ref: { id: string }, data: Record<string, unknown>) => {
        txSetMock(ref, data);
        state.EXISTING_DOC = data;
      },
    };
    return callback(tx);
  },
}));

import { hydrateFromTemplate } from '../userSchedule.service';

beforeEach(() => {
  state.EXISTING_DOC = null;
  txSetMock.mockClear();
});

describe('hydrateFromTemplate — one entry per id, not one entry per day', () => {
  it('a day with 2 items writes 2 entries, in template order, each with its own entryId', async () => {
    const result = await hydrateFromTemplate('test-uid-1', '2026-09-02', {
      'ד': ['FULL_BODY', 'PLANCHE'],
    });

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.programIds)).toEqual([['FULL_BODY'], ['PLANCHE']]);
    expect(result[0].type).toBe('training');
    expect(result[1].type).toBe('training');
    expect(result[0].entryId).toBeTruthy();
    expect(result[1].entryId).toBeTruthy();
    expect(result[0].entryId).not.toBe(result[1].entryId);

    // What actually got written to Firestore matches what was returned.
    const written = txSetMock.mock.calls[0][1] as { entries: unknown[] };
    expect(written.entries).toHaveLength(2);
  });

  it('a rest day (empty array) still writes exactly one rest entry', async () => {
    const result = await hydrateFromTemplate('test-uid-1', '2026-09-03', { 'ה': [] });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('rest');
    expect(result[0].programIds).toEqual([]);
  });

  it('a day with no template entry for that letter returns an empty array (no-op)', async () => {
    const result = await hydrateFromTemplate('test-uid-1', '2026-09-04', { 'ד': ['FULL_BODY'] });
    expect(result).toEqual([]);
    expect(txSetMock).not.toHaveBeenCalled();
  });

  it('idempotency guard: a day already hydrated (2 recurring entries present) returns them as-is, does not write again', async () => {
    state.EXISTING_DOC = {
      userId: 'test-uid-1',
      date: '2026-09-02',
      entries: [
        { entryId: 'e1', userId: 'test-uid-1', date: '2026-09-02', programIds: ['FULL_BODY'], type: 'training', source: 'recurring', completed: false },
        { entryId: 'e2', userId: 'test-uid-1', date: '2026-09-02', programIds: ['PLANCHE'], type: 'training', source: 'recurring', completed: false },
      ],
    };

    const result = await hydrateFromTemplate('test-uid-1', '2026-09-02', {
      'ד': ['FULL_BODY', 'PLANCHE'],
    });

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.entryId)).toEqual(['e1', 'e2']);
    expect(txSetMock).not.toHaveBeenCalled();
  });

  it('zombie-loop guard: a tombstone (override=true) blocks hydration and is returned alone', async () => {
    state.EXISTING_DOC = {
      userId: 'test-uid-1',
      date: '2026-09-02',
      entries: [
        { entryId: 'tomb1', userId: 'test-uid-1', date: '2026-09-02', programIds: [], type: 'rest', source: 'manual', completed: false, override: true },
      ],
    };

    const result = await hydrateFromTemplate('test-uid-1', '2026-09-02', {
      'ד': ['FULL_BODY', 'PLANCHE'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].entryId).toBe('tomb1');
    expect(txSetMock).not.toHaveBeenCalled();
  });

  it('non-blocking entries (e.g. a community session) get the new recurring entries added alongside them', async () => {
    state.EXISTING_DOC = {
      userId: 'test-uid-1',
      date: '2026-09-02',
      entries: [
        { entryId: 'community1', userId: 'test-uid-1', date: '2026-09-02', programIds: [], type: 'training', source: 'community', completed: false },
      ],
    };

    const result = await hydrateFromTemplate('test-uid-1', '2026-09-02', {
      'ד': ['FULL_BODY', 'PLANCHE'],
    });

    expect(result).toHaveLength(2);
    const written = txSetMock.mock.calls[0][1] as { entries: Array<{ source: string }> };
    expect(written.entries).toHaveLength(3);
    expect(written.entries.filter((e) => e.source === 'community')).toHaveLength(1);
    expect(written.entries.filter((e) => e.source === 'recurring')).toHaveLength(2);
  });
});

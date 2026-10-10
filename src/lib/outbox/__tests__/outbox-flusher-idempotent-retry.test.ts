import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression — Sderot field test (10.10.2026): a queued aerobic/free-run
 * workout that fails AFTER its Firestore write succeeds (awardWorkoutXP
 * throws) used to stay queued and get re-written on the next flush via
 * `addDoc` — a fresh auto-generated doc every retry, so 2-3 reconnect
 * cycles on a flaky field connection produced ~3 duplicate `workouts` docs
 * for one real session. Fixed by writing to a deterministic doc ref keyed
 * on the outbox's own stable `localWorkoutId`, so a retried flush of the
 * SAME queued item overwrites one doc instead of creating another.
 *
 * `window`/`navigator` are stubbed as plain globals (not jsdom) purely to
 * satisfy OutboxFlusher's browser-only guard clauses — this repo's vitest
 * config is node-only, no DOM is needed for this test.
 */

const docMock = vi.fn((_db: unknown, collection: string, id: string) => ({ __ref: true, collection, id }));
const setDocMock = vi.fn(async (_ref: unknown, _data: unknown) => undefined);
vi.mock('firebase/firestore', () => ({
  doc: docMock,
  setDoc: setDocMock,
  serverTimestamp: () => 'SERVER_TS',
}));

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'u1' }, onAuthStateChanged: vi.fn() },
  db: {},
}));

const awardWorkoutXPMock = vi.fn();
vi.mock('@/lib/awardWorkoutXP', () => ({
  awardWorkoutXP: awardWorkoutXPMock,
}));

vi.mock('@/lib/healthBridge/debugState', () => ({
  recordFlushed: vi.fn(),
  recordFlushError: vi.fn(),
}));
vi.mock('@/lib/ingestHealthSamples', () => ({ ingestHealthSamples: vi.fn() }));

const deleteWorkoutMock = vi.fn(async (_localWorkoutId: string) => undefined);
const bumpWorkoutAttemptsMock = vi.fn(async (_localWorkoutId: string) => undefined);
// Same queued item returned on every call — this test asserts what happens
// when a retry re-reads a still-queued (not-yet-deleted) record.
const getQueuedWorkoutsMock = vi.fn(async (_uid: string) => [
  { localWorkoutId: 'lw_1', uid: 'u1', payload: { foo: 'bar' }, award: { xpDelta: 10, source: 'test' }, enqueuedAt: 1, attempts: 0 },
]);
vi.mock('../outbox-db', () => ({
  countHealthSamples: vi.fn(async () => 0),
  countWorkouts: vi.fn(async () => 0),
  getQueuedHealthSamples: vi.fn(async () => []),
  getQueuedWorkouts: getQueuedWorkoutsMock,
  deleteHealthSamples: vi.fn(),
  deleteWorkout: deleteWorkoutMock,
  bumpHealthSampleAttempts: vi.fn(),
  bumpHealthSampleSoftFailure: vi.fn(),
  bumpWorkoutAttempts: bumpWorkoutAttemptsMock,
  MAX_ATTEMPTS: 8,
}));

describe('OutboxFlusher — idempotent workout retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retrying a still-queued item (write succeeded, award failed) overwrites the SAME doc instead of creating a new one', async () => {
    const { OutboxFlusher } = await import('../OutboxFlusher');

    // Flush 1: the Firestore write succeeds, but awardWorkoutXP throws —
    // the item must NOT be deleted (still queued for retry).
    awardWorkoutXPMock.mockRejectedValueOnce(new Error('transient award failure'));
    await OutboxFlusher.flushNow('manual');

    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(docMock).toHaveBeenNthCalledWith(1, expect.anything(), 'workouts', 'lw_1');
    expect(deleteWorkoutMock).not.toHaveBeenCalled();
    expect(bumpWorkoutAttemptsMock).toHaveBeenCalledWith('lw_1');

    // Flush 2 (e.g. next reconnect): getQueuedWorkouts still returns the SAME
    // item (it was never deleted) — this time the award succeeds too.
    awardWorkoutXPMock.mockResolvedValueOnce({ ok: true } as any);
    await OutboxFlusher.flushNow('manual');

    // The bug: this used to be a brand-new addDoc call with a fresh auto-ID,
    // i.e. a genuine duplicate `workouts` document for the same real session.
    expect(setDocMock).toHaveBeenCalledTimes(2);
    expect(docMock).toHaveBeenNthCalledWith(2, expect.anything(), 'workouts', 'lw_1');
    expect(deleteWorkoutMock).toHaveBeenCalledWith('lw_1');
  });
});

/**
 * Smoke — the atomic multi-category activity write used by the hybrid-finish fix.
 *
 * Verifies the two data-integrity risks called out for the hybrid dailyActivity
 * sync fix (fix/hybrid-daily-activity-sync):
 *   1. NO CLOBBER — cardio.minutes AND strength.minutes both survive in ONE
 *      Firestore write (a single setDoc carrying both categories), so there is
 *      no two-write race that could zero one category.
 *   2. Streak crosses the daily threshold exactly ONCE, derived from the
 *      combined GLOBAL total (not per category).
 *
 * Double-finish idempotency lives one layer up (useHybridRun.finishHybrid guards
 * `saving` + controllerRef=null; useRunningPlayer `_finishInFlight`) and is
 * verified by inspection, not here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks: keep firebase + user store out of the unit ────────────────────────
const setDocSpy = vi.fn(() => Promise.resolve());
const updateDocSpy = vi.fn(() => Promise.resolve());

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  getDocs: () => Promise.resolve({ docs: [] }),
  onSnapshot: () => () => {},
  getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
  setDoc: (...args: unknown[]) => setDocSpy(...args),
  updateDoc: (...args: unknown[]) => updateDocSpy(...args),
  serverTimestamp: () => 'server-ts',
  Timestamp: { now: () => ({}) },
}));
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ profile: { id: 'u1', core: {} } }) },
}));

import { useActivityStore } from '../useActivityStore';

// The dailyActivity doc is the FIRST setDoc call in syncToServer; the streak doc
// is the second. We identify the dailyActivity write by its `categories` field.
function dailyActivityWrites(): Array<Record<string, unknown>> {
  return setDocSpy.mock.calls
    .map((c: unknown[]) => c[1] as Record<string, unknown>)
    .filter((payload: Record<string, unknown> | undefined): payload is Record<string, unknown> =>
      payload != null && 'categories' in payload);
}

describe('logMultiCategoryWorkout — hybrid atomic activity write', () => {
  beforeEach(() => {
    setDocSpy.mockClear();
    updateDocSpy.mockClear();
    useActivityStore.getState().initialize('u1');
    useActivityStore.setState({ currentStreak: 0, longestStreak: 0, lastStreakDate: '' });
  });

  it('writes BOTH cardio and strength minutes in a single sync (no clobber)', async () => {
    useActivityStore.getState().logMultiCategoryWorkout([
      { category: 'cardio', durationMinutes: 12, calories: 120 },
      { category: 'strength', durationMinutes: 15, calories: 150 },
    ]);

    // In-memory state: both categories present, calories summed, 1 session each.
    const cats = useActivityStore.getState().today!.categories;
    expect(cats.cardio.minutes).toBe(12);
    expect(cats.strength.minutes).toBe(15);
    expect(cats.cardio.sessions).toBe(1);
    expect(cats.strength.sessions).toBe(1);
    expect(useActivityStore.getState().today!.calories).toBe(270);

    // Persisted write: exactly ONE dailyActivity setDoc, carrying BOTH categories.
    await vi.waitFor(() => expect(dailyActivityWrites().length).toBeGreaterThan(0));
    const writes = dailyActivityWrites();
    expect(writes.length).toBe(1); // single atomic write — not one-per-category
    const written = writes[0].categories as Record<string, { minutes: number }>;
    expect(written.cardio.minutes).toBe(12);
    expect(written.strength.minutes).toBe(15); // strength NOT clobbered to 0
  });

  it('crosses the streak threshold exactly once on the combined global total', () => {
    // Neither leg alone reaches 10 min; together (7+6=13) they cross once.
    useActivityStore.getState().logMultiCategoryWorkout([
      { category: 'cardio', durationMinutes: 7, calories: 70 },
      { category: 'strength', durationMinutes: 6, calories: 60 },
    ]);
    expect(useActivityStore.getState().currentStreak).toBe(1);
    expect(useActivityStore.getState().longestStreak).toBe(1);
  });

  it('does not advance the streak when the combined total stays under threshold', () => {
    useActivityStore.getState().logMultiCategoryWorkout([
      { category: 'cardio', durationMinutes: 3, calories: 30 },
      { category: 'strength', durationMinutes: 4, calories: 40 },
    ]);
    expect(useActivityStore.getState().currentStreak).toBe(0);
  });
});

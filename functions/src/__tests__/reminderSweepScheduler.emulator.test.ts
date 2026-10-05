/**
 * reminderSweepScheduler — REAL emulator integration suite.
 *
 * Unlike trainingReminderScheduler.test.ts (full fake-db + fake-messaging
 * mock, same style as push.service.daily-cap.test.ts), this exercises the
 * genuine Admin SDK Firestore against a REAL (emulated) Firestore for the
 * one piece that matters most here: `array-contains` matching against an
 * OBJECT value ({day, time}) has never been used elsewhere in this
 * codebase, and a fake in-memory db can't prove it actually works the way
 * real Firestore does (axiom §31's exact lesson — a fake db structurally
 * cannot catch a real query-shape bug). Only `admin.messaging()` is faked
 * (no real FCM network calls); `admin.firestore()`/`admin.app()` resolve
 * to a REAL emulator-backed instance throughout, including inside
 * push.service.ts and push-events.service.ts (both imported, not mocked)
 * — so the idempotency marker, the channel-preference filter, and the
 * push_events measurement write are all exercised for real too.
 *
 * Runs on an ISOLATED port (127.0.0.1:8089), deliberately NOT the
 * project's default 8080 — another concurrent session may already have a
 * Firestore emulator live on 8080 for its own work, and this suite's
 * clearEmulator() is destructive (wipes the whole project). Start a
 * SEPARATE emulator for this file specifically:
 *   firebase emulators:start --only firestore \
 *     --project appout-1-reminder-sweep-emulator-test
 *   (with firebase.json's emulators.firestore.port temporarily set to 8089,
 *   or FIRESTORE_EMULATOR_HOST pointed at wherever you bind it instead)
 *
 * beforeAll throws immediately if it isn't reachable, and vitest shows
 * every case below as skipped (not failed) when that happens — same
 * established behavior as the readiness module's own emulator suites.
 *
 * Run this file ALONE (never globbed with other emulator tests) — per
 * this repo's own convention, emulator tests sharing one DB each wipe it
 * all via clearEmulator().
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const PROJECT_ID = 'appout-1-reminder-sweep-emulator-test';
const EMULATOR_HOST = '127.0.0.1:8089';

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

let testApp: App;
let testDb: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${EMULATOR_HOST}?`);
}

const fakeMessaging = {
  sendEachForMulticast: vi.fn(async ({ tokens }: { tokens: string[] }) => ({
    responses: tokens.map(() => ({ success: true })),
  })),
};

// Partial mock — real firestore/app (routed to the emulator above via
// testDb), fake messaging only (no live FCM calls). `apps` reports
// non-empty so reminderSweepScheduler.ts's own `if (!admin.apps.length)`
// guard never calls the real (credential-requiring) initializeApp() again.
vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => testDb, { FieldValue, Timestamp }),
  messaging: () => fakeMessaging,
}));

vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => unknown) => handler,
}));

import { reminderSweepScheduler } from '../reminderSweepScheduler';

/** Set wall-clock time to a given Israel-local hour:minute on Sunday 2026-10-04 (DST, UTC+3). */
function setIsraelTime(hour: number, minute = 0) {
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 4, hour - 3, minute, 0)));
}

async function seedUser(uid: string, opts: {
  scheduleSlots: Array<{ day: string; time: string }>;
  trainingReminderEnabled?: boolean; // default true
  hasToken?: boolean; // default true
}) {
  await testDb.collection('users').doc(uid).set({
    fcmTokens: opts.hasToken === false ? [] : [`tok-${uid}`],
    settings: {
      pushEnabled: true,
      notificationPrefs: { training_reminder: opts.trainingReminderEnabled !== false },
    },
    lifestyle: { reminders: { schedule: opts.scheduleSlots } },
  });
}

async function enableFlag() {
  await testDb.doc('app_config/feature_flags').set({ enableReminderSweepPush: true }, { merge: true });
}

describe('reminderSweepScheduler — REAL emulator integration', () => {
  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
    testApp = initializeApp({ projectId: PROJECT_ID }, `reminder-sweep-emulator-test-${Date.now()}`);
    testDb = getFirestore(testApp);
    await clearEmulator(); // throws (→ suite shows as skipped) if the emulator isn't reachable
  });

  afterAll(async () => {
    await deleteApp(testApp);
  });

  beforeEach(async () => {
    await clearEmulator();
    fakeMessaging.sendEachForMulticast.mockClear();
    // Fake ONLY Date — real setTimeout/setInterval must keep running for the
    // actual gRPC/HTTP calls to the Firestore emulator to resolve at all;
    // a full vi.useFakeTimers() here hangs every test (confirmed empirically).
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the array-contains match really fires: a user with a matching {day, time} slot gets pushed', async () => {
    await enableFlag();
    await seedUser('user-match', { scheduleSlots: [{ day: 'sunday', time: '18:00' }] });
    setIsraelTime(18, 2); // floors to the 18:00 slot

    await (reminderSweepScheduler as any)();

    expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ['tok-user-match'] }),
    );
  });

  it('a slot for a different day/time does not match — the query is genuinely scoped, not matching everything', async () => {
    await enableFlag();
    await seedUser('user-nomatch', { scheduleSlots: [{ day: 'monday', time: '18:00' }] });
    setIsraelTime(18, 2); // Sunday 18:00-18:04 — this user's slot is Monday

    await (reminderSweepScheduler as any)();

    expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('the idempotency marker blocks a double-fire: running twice for the same slot sends only once', async () => {
    await enableFlag();
    await seedUser('user-twice', { scheduleSlots: [{ day: 'sunday', time: '18:00' }] });
    setIsraelTime(18, 1);

    await (reminderSweepScheduler as any)();
    await (reminderSweepScheduler as any)(); // simulates an overlapping/retried run for the same 5-min tick

    expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledTimes(1);

    const marker = await testDb.collection('reminder_fired').doc('user-twice_2026-10-04_1800').get();
    expect(marker.exists).toBe(true);
  });

  it('a disabled training_reminder channel is skipped — real push.service.ts filtering, not re-implemented here', async () => {
    await enableFlag();
    await seedUser('user-enabled', { scheduleSlots: [{ day: 'sunday', time: '18:00' }] }, );
    await seedUser('user-disabled', { scheduleSlots: [{ day: 'sunday', time: '18:00' }], trainingReminderEnabled: false });
    setIsraelTime(18, 0);

    await (reminderSweepScheduler as any)();

    const call = fakeMessaging.sendEachForMulticast.mock.calls[0]?.[0] as { tokens: string[] } | undefined;
    expect(call?.tokens).toContain('tok-user-enabled');
    expect(call?.tokens).not.toContain('tok-user-disabled');

    // Both still get an idempotency marker — claimed the moment the slot is
    // evaluated, regardless of eventual delivery outcome (matches
    // trainingReminderScheduler's own documented once-per-day philosophy).
    const enabledMarker = await testDb.collection('reminder_fired').doc('user-enabled_2026-10-04_1800').get();
    const disabledMarker = await testDb.collection('reminder_fired').doc('user-disabled_2026-10-04_1800').get();
    expect(enabledMarker.exists).toBe(true);
    expect(disabledMarker.exists).toBe(true);
  });

  it('the flag gate fails closed: a real match exists but enableReminderSweepPush is not true — nothing sends', async () => {
    // Deliberately NOT calling enableFlag() — app_config/feature_flags is absent entirely.
    await seedUser('user-flagged-off', { scheduleSlots: [{ day: 'sunday', time: '18:00' }] });
    setIsraelTime(18, 0);

    await (reminderSweepScheduler as any)();

    expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    const marker = await testDb.collection('reminder_fired').doc('user-flagged-off_2026-10-04_1800').get();
    expect(marker.exists).toBe(false); // no claim either — the function returns before even querying users
  });

  it('tags the send with the distinct ReminderSweep funnel category (not de-duped against ScheduledWorkout)', async () => {
    await enableFlag();
    await seedUser('user-measured', { scheduleSlots: [{ day: 'sunday', time: '18:00' }] });
    setIsraelTime(18, 0);

    await (reminderSweepScheduler as any)();

    const eventsSnap = await testDb.collection('push_events').where('eventType', '==', 'push_sent').get();
    expect(eventsSnap.size).toBeGreaterThan(0);
    expect(eventsSnap.docs[0].data().category).toBe('ReminderSweep');
  });
});

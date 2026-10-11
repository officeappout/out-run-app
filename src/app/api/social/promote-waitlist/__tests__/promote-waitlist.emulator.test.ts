/**
 * POST /api/social/promote-waitlist — REAL Firestore-emulator suite for
 * computePromoteWaitlist's write shape (10.10.2026, write-layer-2 batch B
 * follow-up). Moved out of cancelBooking's own client-SDK write because
 * the new attendance self-toggle contract (firestore.rules) correctly
 * denies a canceling member's write from also touching a DIFFERENT uid's
 * entries — this is now an Admin SDK, server-side operation instead.
 *
 * Uses the isolated emulator on 127.0.0.1:8089 (NOT the shared 8080
 * instance another concurrent session may be using), a dedicated project
 * id so it can never collide with the rules-unit-testing suites that also
 * run against that same isolated emulator process.
 *
 * Start the emulator first:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// route.ts imports '@/lib/firebase-admin' at module scope for its POST
// handler, and that file does `import 'server-only'` — which THROWS
// outside Next's server-component bundler context (confirmed: plain
// `index.js`, unconditional throw, no env check). computePromoteWaitlist
// itself never calls getAdminDb()/getAdminAuth() (db is always injected,
// same DI discipline as computeCreateUnit for /api/units/create) — this
// mock exists purely so importing route.ts at all doesn't crash vitest.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from computePromoteWaitlist — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from computePromoteWaitlist'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { computePromoteWaitlist } from '../route';

const PROJECT_ID = 'appout-1-promotion-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8089';
const GROUP_ID = 'promoGroup';

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${FIRESTORE_HOST}?`);
  }
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `promote-waitlist-emulator-test-${Date.now()}`);
  db = getFirestore(app);
}, 20000);

beforeEach(async () => {
  await clearEmulator();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

async function seedSession(sessionId: string, doc: Record<string, unknown>) {
  await db.collection('community_groups').doc(GROUP_ID).collection('attendance').doc(sessionId).set(doc);
}

describe('computePromoteWaitlist — write shape (real Firestore)', () => {
  it('waitlist non-empty: promotes the front uid into attendees, removes it from waitlist, increments currentCount, moves the profile map entry (read back, not assumed)', async () => {
    await seedSession('2026-11-10_18-00', {
      groupId: GROUP_ID, date: '2026-11-10', time: '18:00',
      attendees: ['memberA'], currentCount: 1, maxParticipants: 2,
      waitlist: ['memberB', 'memberC'],
      waitlistProfiles: { memberB: { name: 'B', photoURL: null }, memberC: { name: 'C', photoURL: null } },
    });

    const result = await computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-10', time: '18:00' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.promoted).toBe('memberB');

    const snap = await db.collection('community_groups').doc(GROUP_ID).collection('attendance').doc('2026-11-10_18-00').get();
    const data = snap.data()!;
    expect(data.attendees).toEqual(['memberA', 'memberB']);
    expect(data.currentCount).toBe(2);
    expect(data.waitlist).toEqual(['memberC']);
    expect(data.waitlistProfiles.memberB).toBeNull();
    expect(data.attendeeProfiles.memberB).toEqual({ name: 'B', photoURL: null });
    // The untouched second-in-line entry is proof this didn't just wipe the whole map.
    expect(data.waitlistProfiles.memberC).toEqual({ name: 'C', photoURL: null });
  });

  it('waitlisted uid has no stored profile: falls back to the same {name:"User",photoURL:null} default cancelBooking\'s old code used', async () => {
    await seedSession('2026-11-11_09-00', {
      groupId: GROUP_ID, date: '2026-11-11', time: '09:00',
      attendees: [], currentCount: 0, waitlist: ['memberX'],
    });

    const result = await computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-11', time: '09:00' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.promoted).toBe('memberX');

    const snap = await db.collection('community_groups').doc(GROUP_ID).collection('attendance').doc('2026-11-11_09-00').get();
    expect(snap.data()!.attendeeProfiles.memberX).toEqual({ name: 'User', photoURL: null });
  });

  it('at capacity (currentCount == maxParticipants) with a non-empty waitlist: NO promotion — no-op, waitlist unchanged (the capacity check this review added)', async () => {
    await seedSession('2026-11-11_10-00', {
      groupId: GROUP_ID, date: '2026-11-11', time: '10:00',
      attendees: ['memberA', 'memberB'], currentCount: 2, maxParticipants: 2,
      waitlist: ['memberC'], waitlistProfiles: { memberC: { name: 'C', photoURL: null } },
    });

    const result = await computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-11', time: '10:00' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.promoted).toBeNull();

    const snap = await db.collection('community_groups').doc(GROUP_ID).collection('attendance').doc('2026-11-11_10-00').get();
    expect(snap.data()!.attendees).toEqual(['memberA', 'memberB']);
    expect(snap.data()!.waitlist).toEqual(['memberC']);
    expect(snap.data()!.currentCount).toBe(2);
  });

  it('room available (currentCount < maxParticipants): promotes normally', async () => {
    await seedSession('2026-11-11_11-00', {
      groupId: GROUP_ID, date: '2026-11-11', time: '11:00',
      attendees: ['memberA'], currentCount: 1, maxParticipants: 2,
      waitlist: ['memberB'], waitlistProfiles: { memberB: { name: 'B', photoURL: null } },
    });

    const result = await computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-11', time: '11:00' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.promoted).toBe('memberB');
  });

  it('no maxParticipants set at all (uncapped session): always promotes regardless of currentCount', async () => {
    await seedSession('2026-11-11_12-00', {
      groupId: GROUP_ID, date: '2026-11-11', time: '12:00',
      attendees: ['memberA', 'memberB', 'memberC'], currentCount: 3,
      waitlist: ['memberD'], waitlistProfiles: { memberD: { name: 'D', photoURL: null } },
    });

    const result = await computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-11', time: '12:00' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.promoted).toBe('memberD');
  });

  it('FIFO, single call: a 3-person waitlist promotes EXACTLY the front entry, never the 2nd or 3rd', async () => {
    await seedSession('2026-11-11_13-00', {
      groupId: GROUP_ID, date: '2026-11-11', time: '13:00',
      attendees: [], currentCount: 0, maxParticipants: 5,
      waitlist: ['memberFirst', 'memberSecond', 'memberThird'],
      waitlistProfiles: {
        memberFirst: { name: 'First', photoURL: null },
        memberSecond: { name: 'Second', photoURL: null },
        memberThird: { name: 'Third', photoURL: null },
      },
    });

    const result = await computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-11', time: '13:00' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.promoted).toBe('memberFirst');

    const snap = await db.collection('community_groups').doc(GROUP_ID).collection('attendance').doc('2026-11-11_13-00').get();
    expect(snap.data()!.waitlist).toEqual(['memberSecond', 'memberThird']);
    expect(snap.data()!.attendees).toEqual(['memberFirst']);
  });

  it('waitlist empty: no-op, returns promoted: null, document unchanged', async () => {
    await seedSession('2026-11-12_07-00', {
      groupId: GROUP_ID, date: '2026-11-12', time: '07:00',
      attendees: ['memberA'], currentCount: 1, waitlist: [],
    });

    const result = await computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-12', time: '07:00' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.promoted).toBeNull();

    const snap = await db.collection('community_groups').doc(GROUP_ID).collection('attendance').doc('2026-11-12_07-00').get();
    expect(snap.data()!.attendees).toEqual(['memberA']);
    expect(snap.data()!.currentCount).toBe(1);
  });

  it('no waitlist field at all (never set): treated the same as empty — no-op, promoted: null', async () => {
    await seedSession('2026-11-13_07-00', {
      groupId: GROUP_ID, date: '2026-11-13', time: '07:00',
      attendees: ['memberA'], currentCount: 1,
    });

    const result = await computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-13', time: '07:00' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.promoted).toBeNull();
  });

  it('session doc does not exist: returns 404 session-not-found, nothing written', async () => {
    const result = await computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-14', time: '07:00' });
    expect(result.status).toBe(404);
  });

  it('concurrent calls on the same session with a 2-person waitlist: each promotes a DIFFERENT uid exactly once — never the same uid twice (the race the transaction exists to prevent)', async () => {
    await seedSession('2026-11-15_18-00', {
      groupId: GROUP_ID, date: '2026-11-15', time: '18:00',
      attendees: ['memberA', 'memberB'], currentCount: 2, maxParticipants: 4,
      waitlist: ['memberC', 'memberD'],
      waitlistProfiles: { memberC: { name: 'C', photoURL: null }, memberD: { name: 'D', photoURL: null } },
    });

    const [r1, r2] = await Promise.all([
      computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-15', time: '18:00' }),
      computePromoteWaitlist(db, { groupId: GROUP_ID, date: '2026-11-15', time: '18:00' }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const promoted = [r1, r2].map((r) => (r.status === 200 ? r.body.promoted : null));
    expect(new Set(promoted)).toEqual(new Set(['memberC', 'memberD']));

    const snap = await db.collection('community_groups').doc(GROUP_ID).collection('attendance').doc('2026-11-15_18-00').get();
    const data = snap.data()!;
    expect(data.waitlist).toEqual([]);
    expect(new Set(data.attendees)).toEqual(new Set(['memberA', 'memberB', 'memberC', 'memberD']));
    expect(data.currentCount).toBe(4);
  });
});

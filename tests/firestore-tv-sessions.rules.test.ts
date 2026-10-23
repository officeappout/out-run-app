/**
 * tvSessions/{code} + participants/{uid} (enable_tv_mode_v1, 23.10.2026). PROPOSAL rules only:
 * firestore.rules is NOT edited — the rules under test are docs/tv-mode/tv-sessions.rules.proposal
 * wrapped in the two helpers it uses (copied from firestore.rules). NO DEPLOY.
 *
 * The app's own repo (src/features/tv-mode/services/firestore-tv-repo.ts) is run against the
 * emulator, so a green run proves the client writes and the rules agree.
 *
 * Run: isolated emulator on 127.0.0.1:8089 —
 *   firebase emulators:exec --only firestore --config firebase-audit.json --project appout-1-audit-test \
 *     "npx vitest run tests/firestore-tv-sessions.rules.test.ts"
 */
import { describe, beforeAll, afterAll, it as vitestIt } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { createFirestoreTvRepo } from '../src/features/tv-mode/services/firestore-tv-repo';
import { initialMirror, mirrorReducer } from '../src/features/tv-mode/core/mirror';

let pass = 0;
let fail = 0;
const failures: string[] = [];

async function it(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e?.message ?? e}`);
    fail++;
    failures.push(name);
  }
}

const PROJECT_ID = 'appout-1-audit-test';
const HELPERS = `
    function isAuthenticated() { return request.auth != null; }
    function isAnonymous() { return isAuthenticated() && request.auth.token.firebase.sign_in_provider == 'anonymous'; }
`;
const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
${HELPERS}
${readFileSync('docs/tv-mode/tv-sessions.rules.proposal', 'utf8')}
  }
}`;

let env: RulesTestEnvironment;
const CODE = '482913';
const EXPIRED = '111111';
const HOUR = 3600_000;

const real = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore() as unknown as Firestore;
const guest = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore() as unknown as Firestore;
const tv = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

async function reset() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const base = { hostUid: null, hostName: null, hostGender: null, status: 'waiting', createdAt: Timestamp.now(), volume: 1 };
    await setDoc(doc(db, 'tvSessions', CODE), { code: CODE, ...base, expiresAt: Timestamp.fromMillis(Date.now() + 4 * HOUR) });
    await setDoc(doc(db, 'tvSessions', EXPIRED), { code: EXPIRED, ...base, expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  });
}

async function testTvRead() {
  console.log('\ntvSessions — the TV (no account)');
  await reset();
  await it('[ALLOW] get one live session by its code', async () => {
    await assertSucceeds(getDoc(doc(tv(), 'tvSessions', CODE)));
  });
  await it('[DENY] get an expired session', async () => {
    await assertFails(getDoc(doc(tv(), 'tvSessions', EXPIRED)));
  });
  await it('[DENY] list the collection (a code is a capability)', async () => {
    await assertFails(getDocs(collection(tv(), 'tvSessions')));
  });
  await it('[DENY] any write from the TV', async () => {
    await assertFails(updateDoc(doc(tv(), 'tvSessions', CODE), { volume: 0.5 }));
    await assertFails(setDoc(doc(tv(), 'tvSessions', '999999'), { code: '999999' }));
    await assertFails(deleteDoc(doc(tv(), 'tvSessions', CODE)));
  });
  await it('[ALLOW] list participants of a live session', async () => {
    await assertSucceeds(getDocs(collection(tv(), 'tvSessions', CODE, 'participants')));
  });
  await it('[DENY] list participants of an expired session', async () => {
    await assertFails(getDocs(collection(tv(), 'tvSessions', EXPIRED, 'participants')));
  });
  await it('[DENY] a signed-in user cannot create a session either', async () => {
    await assertFails(setDoc(doc(real('u1'), 'tvSessions', '222222'), { code: '222222', expiresAt: Timestamp.fromMillis(Date.now() + HOUR) }));
  });
}

async function testJoin() {
  console.log('\ntvSessions — host claim and participants (through the real repo)');
  await reset();
  const repoOf = (db: Firestore) => createFirestoreTvRepo(db);
  await it('[ALLOW] the first real user claims host (one transaction, also writes own participant doc)', async () => {
    const r = await repoOf(real('noa')).join(CODE, { uid: 'noa', name: 'נועה', gender: 'female' });
    if (!r.ok || r.role !== 'host') throw new Error(`expected host, got ${JSON.stringify(r)}`);
  });
  await it('[ALLOW] the second real user becomes a participant', async () => {
    const r = await repoOf(real('dani')).join(CODE, { uid: 'dani', name: 'דני' });
    if (!r.ok || r.role !== 'participant') throw new Error(`expected participant, got ${JSON.stringify(r)}`);
  });
  await it('[ALLOW] the host re-joining stays host', async () => {
    const r = await repoOf(real('noa')).join(CODE, { uid: 'noa', name: 'נועה' });
    if (!r.ok || r.role !== 'host') throw new Error(`expected host, got ${JSON.stringify(r)}`);
  });
  await it('[DENY] a guest (anonymous) cannot claim or join', async () => {
    await reset();
    const r = await repoOf(guest('g1')).join(CODE, { uid: 'g1', name: 'אורח' });
    if (r.ok) throw new Error('a guest joined');
    await assertFails(setDoc(doc(guest('g1'), 'tvSessions', CODE, 'participants', 'g1'), { uid: 'g1', name: 'x', joinedAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 4 * HOUR), state: 'joined', seq: 0 }));
  });
  await it('[DENY] claiming an expired session', async () => {
    const r = await repoOf(real('noa')).join(EXPIRED, { uid: 'noa', name: 'נועה' });
    if (r.ok) throw new Error('joined an expired session');
  });
  await it('[DENY] stealing the host role of a session that has one', async () => {
    await reset();
    await repoOf(real('noa')).join(CODE, { uid: 'noa', name: 'נועה' });
    await assertFails(updateDoc(doc(real('mallory'), 'tvSessions', CODE), { hostUid: 'mallory', hostName: 'M', status: 'lobby' }));
  });
}

async function testHost() {
  console.log('\ntvSessions — what the host may write');
  await reset();
  const noa = createFirestoreTvRepo(real('noa'));
  await noa.join(CODE, { uid: 'noa', name: 'נועה' });
  const dani = createFirestoreTvRepo(real('dani'));
  await dani.join(CODE, { uid: 'dani', name: 'דני' });
  const mirror = mirrorReducer(initialMirror(), { type: 'exercise', index: 0, count: 5, name: 'מתח', setCount: 3 });

  await it('[ALLOW] workout, start, mirror (+ server anchor), heartbeat, volume command', async () => {
    await assertSucceeds(noa.setWorkout(CODE, { title: 'מתח רחב', kind: 'strength', durationMin: 35, exerciseCount: 5, sharedWorkoutId: 'abc' }));
    await assertSucceeds(noa.startWorkout(CODE));
    await assertSucceeds(noa.writeMirror(CODE, mirror, true));
    await assertSucceeds(noa.beat(CODE));
    await assertSucceeds(noa.sendCommand(CODE, { seq: 1, type: 'volume', value: 0.4 }));
  });
  await it('[DENY] a participant writing any host field', async () => {
    await assertFails(dani.beat(CODE));
    await assertFails(dani.writeMirror(CODE, mirror, false));
    await assertFails(dani.sendCommand(CODE, { seq: 2, type: 'end' }));
    await assertFails(dani.end(CODE));
  });
  await it('[DENY] host fields outside the whitelist / identity changes', async () => {
    const d = doc(real('noa'), 'tvSessions', CODE);
    await assertFails(updateDoc(d, { hostUid: 'dani' }));
    await assertFails(updateDoc(d, { expiresAt: Timestamp.fromMillis(Date.now() + 99 * HOUR) }));
    await assertFails(updateDoc(d, { code: '000000' }));
    await assertFails(updateDoc(d, { somethingElse: 1 }));
  });
  await it('[DENY] a forged server timestamp, an out-of-range volume, a bad status', async () => {
    const d = doc(real('noa'), 'tvSessions', CODE);
    await assertFails(updateDoc(d, { hostBeatAt: Timestamp.fromMillis(1) }));
    await assertFails(updateDoc(d, { timerAnchorAt: Timestamp.fromMillis(1) }));
    await assertFails(updateDoc(d, { volume: 7 }));
    await assertFails(updateDoc(d, { status: 'waiting' }));
  });
  await it('[ALLOW] the host ends the session; [DENY] nobody revives it', async () => {
    await assertSucceeds(noa.end(CODE));
    await assertFails(updateDoc(doc(real('noa'), 'tvSessions', CODE), { status: 'live' }));
  });
}

async function testParticipants() {
  console.log('\ntvSessions/participants — own doc only');
  await reset();
  await createFirestoreTvRepo(real('noa')).join(CODE, { uid: 'noa', name: 'נועה' });
  const dani = createFirestoreTvRepo(real('dani'));
  await dani.join(CODE, { uid: 'dani', name: 'דני' });
  const exp = () => Timestamp.fromMillis(Date.now() + 4 * HOUR);

  await it('[ALLOW] own presence update', async () => {
    await assertSucceeds(dani.publishPresence(CODE, 'dani', { state: 'active', set: 2, totalSets: 5, seq: 1 }));
  });
  await it('[DENY] writing another person\'s presence', async () => {
    await assertFails(createFirestoreTvRepo(real('dani')).publishPresence(CODE, 'noa', { state: 'done', seq: 9 }));
  });
  await it('[DENY] changing name / joinedAt, an unknown state, delete', async () => {
    const d = doc(real('dani'), 'tvSessions', CODE, 'participants', 'dani');
    await assertFails(updateDoc(d, { name: 'someone else' }));
    await assertFails(updateDoc(d, { joinedAt: Timestamp.fromMillis(1) }));
    await assertFails(updateDoc(d, { state: 'host' }));
    await assertFails(deleteDoc(d));
  });
  await it('[DENY] creating a participant doc for someone else, with extra keys, or with a foreign expiresAt', async () => {
    const d = (uid: string, as = 'eve') => doc(real(as), 'tvSessions', CODE, 'participants', uid);
    const body = { uid: 'eve', name: 'x', joinedAt: serverTimestamp(), expiresAt: exp(), state: 'joined', seq: 0 };
    await assertFails(setDoc(d('someone'), { ...body, uid: 'someone' }));
    await assertFails(setDoc(d('eve'), { ...body, isHost: true }));
    await assertFails(setDoc(d('eve'), { ...body, expiresAt: Timestamp.fromMillis(Date.now() + 99 * HOUR) }));
    await assertSucceeds(setDoc(d('eve'), { ...body, expiresAt: (await getDoc(doc(tv(), 'tvSessions', CODE))).data()!.expiresAt }));
  });
  await it('[ALLOW] leaving = state left', async () => {
    await assertSucceeds(dani.leave(CODE, 'dani'));
  });
}

function wrapSuite(name: string, fn: () => Promise<void>) {
  describe(name, () => {
    vitestIt('all cases', async () => {
      const before = fail;
      await fn();
      if (fail > before) throw new Error(`${fail - before} case(s) failed in "${name}" — see console output above`);
    });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules, host: '127.0.0.1', port: 8089 } });
});

afterAll(async () => {
  console.log(`\ntvSessions rules: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('tvSessions read (TV)', testTvRead);
wrapSuite('tvSessions join', testJoin);
wrapSuite('tvSessions host writes', testHost);
wrapSuite('tvSessions participants', testParticipants);

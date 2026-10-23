/**
 * tvSessions/{code} + participants/{uid} (enable_tv_mode_v1, 23.10.2026). PROPOSAL rules only:
 * firestore.rules is NOT edited — the rules under test are docs/tv-mode/tv-sessions.rules.proposal
 * wrapped in the two helpers it uses (copied from firestore.rules). NO DEPLOY.
 *
 * The app's own repo (src/features/tv-mode/services/firestore-tv-repo.ts) is run against the
 * emulator, so a green run proves the client writes and the rules agree.
 *
 * Guests (anonymous auth) join as participants with a nickname (Kahoot model, owner decision 23.10); only a
 * signed-in account can host. The guest cases below pin: own participants/{uid} only, validated fields, no host
 * fields, no session create / claim / commands.
 *
 * To check the rules AFTER they were pasted into firestore.rules, run the same suite against the real file:
 *   TV_RULES_FILE=firestore.rules firebase emulators:exec ... (same command as below)
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
const rules = process.env.TV_RULES_FILE
  ? readFileSync(process.env.TV_RULES_FILE, 'utf8')
  : `rules_version = '2';
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
/** The live session's expiresAt (a participant doc must carry exactly the same value). */
const LIVE_EXP = Timestamp.fromMillis(Date.now() + 4 * HOUR);

const real = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore() as unknown as Firestore;
const guest = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore() as unknown as Firestore;
const tv = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
/** A participant doc exactly as the repo writes it (override a field to test a rule). */
const part = (uid: string, name: string, extra: Record<string, unknown> = {}) => ({
  uid, name, avatar: 3, joinedAt: serverTimestamp(), expiresAt: LIVE_EXP, state: 'joined', seq: 0, ...extra,
});

async function reset() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const base = { hostUid: null, hostName: null, hostGender: null, status: 'waiting', createdAt: Timestamp.now(), volume: 1 };
    await setDoc(doc(db, 'tvSessions', CODE), { code: CODE, ...base, expiresAt: LIVE_EXP });
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
  await it('[DENY] a guest cannot claim the host role (nobody hosts yet)', async () => {
    await reset();
    const r = await repoOf(guest('g1')).join(CODE, { uid: 'g1', name: 'אורח', guest: true });
    if (r.ok || r.error !== 'host-required') throw new Error(`expected host-required, got ${JSON.stringify(r)}`);
    await assertFails(updateDoc(doc(guest('g1'), 'tvSessions', CODE), { hostUid: 'g1', hostName: 'x', status: 'lobby' }));
    await assertFails(setDoc(doc(guest('g1'), 'tvSessions', CODE, 'participants', 'g1'), part('g1', 'אורח')));
  });
  await it('[ALLOW] a guest joins as a participant once a real user hosts (nickname + default avatar)', async () => {
    await reset();
    await repoOf(real('noa')).join(CODE, { uid: 'noa', name: 'נועה' });
    const r = await repoOf(guest('g1')).join(CODE, { uid: 'g1', name: '  גיא   the Great  ', guest: true });
    if (!r.ok || r.role !== 'participant') throw new Error(`expected participant, got ${JSON.stringify(r)}`);
    const snap = await getDoc(doc(tv(), 'tvSessions', CODE, 'participants', 'g1'));
    if (snap.data()?.name !== 'גיא the Great') throw new Error(`nickname not normalised: ${snap.data()?.name}`);
    const again = await repoOf(guest('g1')).join(CODE, { uid: 'g1', name: 'גיא the Great', guest: true });
    if (!again.ok) throw new Error('a guest could not re-join');
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
    const body = { uid: 'eve', name: 'x', avatar: 1, joinedAt: serverTimestamp(), expiresAt: exp(), state: 'joined', seq: 0 };
    await assertFails(setDoc(d('someone'), { ...body, uid: 'someone' }));
    await assertFails(setDoc(d('eve'), { ...body, isHost: true }));
    await assertFails(setDoc(d('eve'), { ...body, expiresAt: Timestamp.fromMillis(Date.now() + 99 * HOUR) }));
    await assertSucceeds(setDoc(d('eve'), { ...body, expiresAt: (await getDoc(doc(tv(), 'tvSessions', CODE))).data()!.expiresAt }));
  });
  await it('[ALLOW] leaving = state left', async () => {
    await assertSucceeds(dani.leave(CODE, 'dani'));
  });
}

async function testGuests() {
  console.log('\nguests (anonymous) — participants only');
  await reset();
  await createFirestoreTvRepo(real('noa')).join(CODE, { uid: 'noa', name: 'נועה' });
  const d = (uid: string, as = 'g1', db: Firestore = guest(as)) => doc(db, 'tvSessions', CODE, 'participants', uid);

  await it('[ALLOW] a guest creates exactly their own participant doc with valid fields', async () => {
    await assertSucceeds(setDoc(d('g1'), part('g1', 'גיא')));
    await assertSucceeds(setDoc(d('g2', 'g2'), part('g2', "Dana-Lee O'Neil_7")));
  });
  await it('[DENY] nickname: empty, 21 chars, markup, emoji, leading / trailing space', async () => {
    for (const bad of ['', 'a'.repeat(21), '<script>alert(1)</script>', 'hi 😀', ' lead', 'trail ', 'a/b', 'x\ny']) {
      await assertFails(setDoc(d('g3', 'g3'), part('g3', bad)));
    }
  });
  await it('[ALLOW] nickname at the limits (1 and 20 characters, Hebrew with niqqud)', async () => {
    await assertSucceeds(setDoc(d('g4', 'g4'), part('g4', 'א')));
    await assertSucceeds(setDoc(d('g5', 'g5'), part('g5', 'ב'.repeat(20))));
    await assertSucceeds(setDoc(d('g6', 'g6'), part('g6', 'שָׁלוֹם')));
  });
  await it('[DENY] a guest writing host fields or any extra key on their doc', async () => {
    for (const extra of [{ isHost: true }, { hostUid: 'g7' }, { cmd: { seq: 1, type: 'end' } }, { volume: 0 }, { guest: true }]) {
      await assertFails(setDoc(d('g7', 'g7'), part('g7', 'x', extra)));
    }
  });
  await it('[DENY] a guest creating a doc for someone else, or with a bad avatar / state / seq / expiry / joinedAt', async () => {
    await assertFails(setDoc(d('victim', 'g8'), part('victim', 'x')));
    await assertFails(setDoc(d('g8', 'g8'), part('g8', 'x', { uid: 'victim' })));
    for (const extra of [{ avatar: 8 }, { avatar: -1 }, { avatar: 1.5 }, { avatar: 'a' }, { state: 'active' }, { seq: 5 }, { joinedAt: Timestamp.fromMillis(1) }, { expiresAt: Timestamp.fromMillis(Date.now() + 99 * HOUR) }]) {
      await assertFails(setDoc(d('g8', 'g8'), part('g8', 'x', extra)));
    }
  });
  await it('[ALLOW] a guest updates own presence; [DENY] name / avatar / joinedAt changes, other people, delete', async () => {
    await assertSucceeds(updateDoc(d('g1'), { state: 'active', set: 1, totalSets: 4, seq: 1 }));
    await assertFails(updateDoc(d('g1'), { name: 'new name' }));
    await assertFails(updateDoc(d('g1'), { avatar: 5 }));
    await assertFails(updateDoc(d('g1'), { joinedAt: Timestamp.fromMillis(1) }));
    await assertFails(updateDoc(d('g1'), { state: 'host' }));
    await assertFails(updateDoc(d('noa', 'g1'), { state: 'done', seq: 9 }));
    await assertFails(deleteDoc(d('g1')));
    await assertFails(updateDoc(d('g2', 'g1'), { state: 'left' }));
  });
  await it('[DENY] a guest cannot create a session, claim, or send any command / write any session field', async () => {
    const s = (code: string) => doc(guest('g1'), 'tvSessions', code);
    await assertFails(setDoc(s('333333'), { code: '333333', hostUid: null, status: 'waiting', expiresAt: Timestamp.fromMillis(Date.now() + HOUR) }));
    for (const patch of [{ volume: 0.2 }, { cmd: { seq: 9, type: 'end' } }, { status: 'ended' }, { status: 'live' }, { mirror: { v: 1 } }, { hostBeatAt: serverTimestamp() }, { workout: { title: 'x' } }]) {
      await assertFails(updateDoc(s(CODE), patch));
    }
    await assertFails(deleteDoc(s(CODE)));
  });
  await it('[DENY] a guest cannot join an ended or expired session', async () => {
    await assertFails(setDoc(doc(guest('g9'), 'tvSessions', EXPIRED, 'participants', 'g9'), part('g9', 'x')));
    await createFirestoreTvRepo(real('noa')).end(CODE);
    const r = await createFirestoreTvRepo(guest('g9')).join(CODE, { uid: 'g9', name: 'x', guest: true });
    if (r.ok) throw new Error('joined an ended session');
  });
  await it('[ALLOW] the TV (no account) sees guests in the list', async () => {
    await reset();
    await createFirestoreTvRepo(real('noa')).join(CODE, { uid: 'noa', name: 'נועה' });
    await createFirestoreTvRepo(guest('g1')).join(CODE, { uid: 'g1', name: 'גיא', guest: true });
    const snap = await getDocs(collection(tv(), 'tvSessions', CODE, 'participants'));
    if (snap.size !== 2) throw new Error(`expected 2 participants, got ${snap.size}`);
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
wrapSuite('tvSessions guests', testGuests);

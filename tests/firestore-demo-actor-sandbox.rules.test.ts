/**
 * Demo actor sandbox (B1, agent-briefs/ai-testers-design.md §2.5, owner-approved 20.10.2026).
 * firestore.rules only. NO DEPLOY — David deploys manually from main after merge:
 *   firebase deploy --only firestore:rules --project appout-1
 *
 * A demo actor (uid demo_* OR token claim demo:true) may write chat / kudos / group-join /
 * reports ONLY to demo targets, and its own profile's authorityId / tenantId /
 * neighborhoodId must be empty or demo-*. Every real-user path is pinned unchanged ([REAL]).
 *
 * Run: isolated emulator on 127.0.0.1:8089 —
 *   bash scripts/ci/run-emulator-suites.sh --only 8089 tests/firestore-demo-actor-sandbox.rules.test.ts
 */
import { describe, beforeAll, afterAll, it as vitestIt } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, updateDoc, addDoc, collection, arrayUnion } from 'firebase/firestore';

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
const rules = readFileSync('firestore.rules', 'utf8');
let env: RulesTestEnvironment;

// Actors
const TESTER = 'demo_qa_walker'; // uid-prefixed demo actor (+ claim, like the real testers)
const CLAIM_ONLY = 'claimed_tester'; // claim-only demo actor
const DEMO_P = 'demo_tlv01'; // a seeded demo persona
const VIEWER = 'viewer_uid'; // owner's viewer account (real, listed in demo_registry/viewers)
const REAL_A = 'real_a';
const REAL_B = 'real_b';

const tester = () => env.authenticatedContext(TESTER, { demo: true, qaTester: true, email: 'qa@example.com' }).firestore();
const claimOnly = () => env.authenticatedContext(CLAIM_ONLY, { demo: true }).firestore();
const realA = () => env.authenticatedContext(REAL_A, { email: 'a@example.com' }).firestore();

const adult = (name: string, extra: Record<string, unknown> = {}) => ({ core: { name, ageGroup: 'adult', ...extra } });

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, name] of [[TESTER, 'Tester'], [CLAIM_ONLY, 'Claim'], [DEMO_P, 'Persona'], [VIEWER, 'Viewer'], [REAL_A, 'A'], [REAL_B, 'B']] as const) {
      await setDoc(doc(db, 'users', uid), adult(name));
    }
    await setDoc(doc(db, 'demo_registry', 'viewers'), { uids: [VIEWER] });
    await setDoc(doc(db, 'community_groups', 'real-grp'), { name: 'Real', isPublic: true, createdBy: REAL_B });
    await setDoc(doc(db, 'community_groups', 'demo-grp-tlv-run'), { name: 'Demo', isPublic: true, createdBy: DEMO_P, isDemo: true });
    // Chats the tester is ALREADY a participant of (e.g. added by someone else).
    await setDoc(doc(db, 'chats', 'group_real-grp'), { type: 'group', groupId: 'real-grp', participants: [REAL_A, TESTER] });
    await setDoc(doc(db, 'chats', 'group_demo-grp-tlv-run'), { type: 'group', groupId: 'demo-grp-tlv-run', participants: [DEMO_P, TESTER] });
    await setDoc(doc(db, 'chats', 'dm_real'), { type: 'dm', participants: [REAL_A, TESTER] });
    await setDoc(doc(db, 'chats', 'dm_demo'), { type: 'dm', participants: [DEMO_P, TESTER] });
    await setDoc(doc(db, 'chats', 'dm_reals'), { type: 'dm', participants: [REAL_A, REAL_B] });
  });
}

const msg = (sender: string) => ({ senderUid: sender, text: 'hi', type: 'text', readBy: [sender] });
const kudo = (from: string) => ({ fromUid: from, createdAt: new Date() });
const report = (reporter: string, targetId: string, targetType: string) => ({ targetId, targetType, targetName: 'x', reporterId: reporter, reason: 'spam', status: 'pending' });

async function testChats() {
  console.log('\nchats — a demo actor writes only in demo chats');
  await it('[DENY] tester opens a DM with a real user', async () => {
    await assertFails(setDoc(doc(tester(), 'chats', 'new_dm_real'), { type: 'dm', participants: [TESTER, REAL_B] }));
  });
  await it('[ALLOW] tester opens a DM with a demo persona', async () => {
    await assertSucceeds(setDoc(doc(tester(), 'chats', 'new_dm_demo'), { type: 'dm', participants: [TESTER, DEMO_P] }));
  });
  await it('[ALLOW] tester opens a DM with a registered viewer', async () => {
    await assertSucceeds(setDoc(doc(tester(), 'chats', 'new_dm_viewer'), { type: 'dm', participants: [TESTER, VIEWER] }));
  });
  await it('[DENY] tester creates a group chat for a real group', async () => {
    await assertFails(setDoc(doc(tester(), 'chats', 'group_other-real'), { type: 'group', groupId: 'other-real', participants: [TESTER] }));
  });
  await it('[ALLOW] tester creates a group chat for a demo group', async () => {
    await assertSucceeds(setDoc(doc(tester(), 'chats', 'group_demo-grp-new'), { type: 'group', groupId: 'demo-grp-new', participants: [TESTER] }));
  });
  await it('[DENY] tester sends a message in a real group chat it is already in', async () => {
    await assertFails(addDoc(collection(tester(), 'chats', 'group_real-grp', 'messages'), msg(TESTER)));
  });
  await it('[DENY] tester sends a message in a DM with a real user', async () => {
    await assertFails(addDoc(collection(tester(), 'chats', 'dm_real', 'messages'), msg(TESTER)));
  });
  await it('[DENY] tester updates the real chat doc (lastMessage)', async () => {
    await assertFails(updateDoc(doc(tester(), 'chats', 'dm_real'), { lastMessage: 'hi' }));
  });
  await it('[ALLOW] tester sends a message in a demo group chat', async () => {
    await assertSucceeds(addDoc(collection(tester(), 'chats', 'group_demo-grp-tlv-run', 'messages'), msg(TESTER)));
  });
  await it('[ALLOW] tester sends a message in a demo DM + updates it', async () => {
    await assertSucceeds(addDoc(collection(tester(), 'chats', 'dm_demo', 'messages'), msg(TESTER)));
    await assertSucceeds(updateDoc(doc(tester(), 'chats', 'dm_demo'), { lastMessage: 'hi' }));
  });
  await it('[REAL] real user opens a DM with another real user (unchanged)', async () => {
    await assertSucceeds(setDoc(doc(realA(), 'chats', 'new_dm_reals'), { type: 'dm', participants: [REAL_A, REAL_B] }));
  });
  await it('[REAL] real user messages in a real group chat (unchanged)', async () => {
    await assertSucceeds(addDoc(collection(realA(), 'chats', 'group_real-grp', 'messages'), msg(REAL_A)));
  });
  await it('[REAL] real user messages in a real DM + updates it (unchanged)', async () => {
    await assertSucceeds(addDoc(collection(realA(), 'chats', 'dm_reals', 'messages'), msg(REAL_A)));
    await assertSucceeds(updateDoc(doc(realA(), 'chats', 'dm_reals'), { lastMessage: 'hi' }));
  });
}

async function testKudos() {
  console.log('\nkudos — a demo actor high-fives only demo users / viewers');
  await it('[DENY] tester sends kudos to a real user', async () => {
    await assertFails(addDoc(collection(tester(), 'kudos', REAL_A, 'inbox'), kudo(TESTER)));
  });
  await it('[DENY] claim-only actor sends kudos to a real user', async () => {
    await assertFails(addDoc(collection(claimOnly(), 'kudos', REAL_A, 'inbox'), kudo(CLAIM_ONLY)));
  });
  await it('[ALLOW] tester sends kudos to a demo persona', async () => {
    await assertSucceeds(addDoc(collection(tester(), 'kudos', DEMO_P, 'inbox'), kudo(TESTER)));
  });
  await it('[ALLOW] tester sends kudos to a viewer', async () => {
    await assertSucceeds(addDoc(collection(tester(), 'kudos', VIEWER, 'inbox'), kudo(TESTER)));
  });
  await it('[REAL] real user sends kudos to a real user (unchanged)', async () => {
    await assertSucceeds(addDoc(collection(realA(), 'kudos', REAL_B, 'inbox'), kudo(REAL_A)));
  });
}

async function testGroupJoin() {
  console.log('\ncommunity_groups/{g}/members — a demo actor joins only demo- groups');
  await it('[DENY] tester joins a real public group', async () => {
    await assertFails(setDoc(doc(tester(), 'community_groups', 'real-grp', 'members', TESTER), { uid: TESTER, name: 'T', role: 'member' }));
  });
  await it('[DENY] claim-only actor joins a real public group', async () => {
    await assertFails(setDoc(doc(claimOnly(), 'community_groups', 'real-grp', 'members', CLAIM_ONLY), { uid: CLAIM_ONLY, name: 'C', role: 'member' }));
  });
  await it('[ALLOW] tester joins a demo public group', async () => {
    await assertSucceeds(setDoc(doc(tester(), 'community_groups', 'demo-grp-tlv-run', 'members', TESTER), { uid: TESTER, name: 'T', role: 'member' }));
  });
  await it('[REAL] real user joins a real public group (unchanged)', async () => {
    await assertSucceeds(setDoc(doc(realA(), 'community_groups', 'real-grp', 'members', REAL_A), { uid: REAL_A, name: 'A', role: 'member' }));
  });
}

async function testReports() {
  console.log('\nreports — a demo actor reports only demo content');
  await it('[DENY] tester reports a real user', async () => {
    await assertFails(addDoc(collection(tester(), 'reports'), report(TESTER, REAL_A, 'user')));
  });
  await it('[DENY] tester reports a real group', async () => {
    await assertFails(addDoc(collection(tester(), 'reports'), report(TESTER, 'real-grp', 'group')));
  });
  await it('[ALLOW] tester reports a demo persona / a demo post / a demo group', async () => {
    await assertSucceeds(addDoc(collection(tester(), 'reports'), report(TESTER, DEMO_P, 'user')));
    await assertSucceeds(addDoc(collection(tester(), 'reports'), report(TESTER, `${DEMO_P}_post_2026-10-20_0`, 'post')));
    await assertSucceeds(addDoc(collection(tester(), 'reports'), report(TESTER, 'demo-grp-tlv-run', 'group')));
  });
  await it('[REAL] real user reports a real user (unchanged)', async () => {
    await assertSucceeds(addDoc(collection(realA(), 'reports'), report(REAL_A, REAL_B, 'user')));
  });
}

async function testProfile() {
  console.log('\nusers/{uid}.core — a demo actor lives only in demo cities / units');
  await it('[DENY] tester sets a real authorityId on its own profile', async () => {
    await assertFails(updateDoc(doc(tester(), 'users', TESTER), { 'core.authorityId': 'sderot' }));
  });
  await it('[DENY] tester sets a real neighborhoodId', async () => {
    await assertFails(updateDoc(doc(tester(), 'users', TESTER), { 'core.neighborhoodId': 'sderot-n1' }));
  });
  await it('[ALLOW] tester sets a demo authority + neighborhood', async () => {
    await assertSucceeds(updateDoc(doc(tester(), 'users', TESTER), { 'core.authorityId': 'demo-tlv', 'core.neighborhoodId': 'demo-tlv-n1' }));
  });
  await it('[ALLOW] tester edits its name (no scope change)', async () => {
    await assertSucceeds(updateDoc(doc(tester(), 'users', TESTER), { 'core.name': 'Walker' }));
  });
  await it('[DENY] a new demo actor creates its profile with a real authorityId', async () => {
    const db = env.authenticatedContext('demo_qa_fresh', { demo: true }).firestore();
    await assertFails(setDoc(doc(db, 'users', 'demo_qa_fresh'), { core: { name: 'Fresh', authorityId: 'sderot' } }));
  });
  await it('[ALLOW] a new demo actor creates its profile with a demo authorityId', async () => {
    const db = env.authenticatedContext('demo_qa_fresh2', { demo: true }).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'demo_qa_fresh2'), { core: { name: 'Fresh', authorityId: 'demo-b7' } }));
  });
  await it('[REAL] real user sets a real authorityId (unchanged)', async () => {
    await assertSucceeds(updateDoc(doc(realA(), 'users', REAL_A), { 'core.authorityId': 'sderot' }));
  });
  await it('[REAL] real user joins a group chat it is a member of (unchanged)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'community_groups', 'real-grp', 'members', REAL_B), { uid: REAL_B, role: 'member' });
    });
    const db = env.authenticatedContext(REAL_B, { email: 'b@example.com' }).firestore();
    await assertSucceeds(updateDoc(doc(db, 'chats', 'group_real-grp'), { participants: arrayUnion(REAL_B) }));
  });
}

function wrapSuite(name: string, fn: () => Promise<void>) {
  describe(name, () => {
    vitestIt('runs', async () => {
      const before = fail;
      await fn();
      if (fail > before) throw new Error(`${fail - before} case(s) failed in "${name}" — see console output above`);
    });
  });
}

beforeAll(async () => {
  await setup();
});

afterAll(async () => {
  console.log(`\ndemo actor sandbox: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('chats', testChats);
wrapSuite('kudos', testKudos);
wrapSuite('group join', testGroupJoin);
wrapSuite('reports', testReports);
wrapSuite('profile scope', testProfile);

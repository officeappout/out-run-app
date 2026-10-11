/**
 * LAYER-1 SECURITY FIX — planned_sessions read scoping (write-layer-4
 * audit, 11.10.2026). firestore.rules only. NO DEPLOY.
 *
 * HELD, NOT MERGED — per instruction, this rule must not go live until
 * the paired query-split code (fix/planned-sessions-query-split, already
 * shipped on its own branch) has had hours to propagate. Every real
 * caller's query must already carry the matching where() clause before
 * this rule is live, or `list` is rejected outright for the OLD unscoped
 * query shape — same lesson the attendance fix already proved.
 *
 * Covers BOTH single-doc get() semantics AND — the critical, non-obvious
 * part — `list`-query provability for each of the 3 real query shapes
 * the paired code change actually executes. A get()-only test suite
 * would NOT have caught the real bug found while building this: the
 * first draft used isGroupMember(groupId) (a get() whose path depends on
 * the CANDIDATE document's own groupId field) for the squad check, which
 * is not provable for `list` at all — Firestore can't verify a
 * per-candidate dynamic sub-path exists() without running the query
 * first. Fixed to memberGroupIds(request.auth.uid) (one cached read of
 * the CALLER's own user_memberships mirror, same pattern presence's
 * existing group-mode rule already uses successfully for `list`) before
 * this file was even written — but every squad case below specifically
 * runs as a real `list` query, not a get(), to prove that fix holds and
 * guard against anyone "simplifying" it back to isGroupMember later.
 *
 * Run: isolated emulator on 127.0.0.1:8089 (NOT the shared 8080 instance
 * another concurrent session may be using) — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, beforeAll, afterAll, it as vitestIt } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { collection, doc, setDoc, query, where, getDoc, getDocs, Timestamp } from 'firebase/firestore';

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

const FUTURE = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const base = { status: 'planned', expiresAt: FUTURE };

    await setDoc(doc(db, 'planned_sessions', 'pubOther'), {
      ...base, userId: 'otherUid', privacyMode: 'verified_global', routeId: 'route1', parkId: null, groupId: null,
    });
    await setDoc(doc(db, 'planned_sessions', 'ownGhost'), {
      ...base, userId: 'meUid', privacyMode: 'ghost', routeId: 'route1', parkId: null, groupId: null,
    });
    await setDoc(doc(db, 'planned_sessions', 'squadMine'), {
      ...base, userId: 'otherUid', privacyMode: 'squad', routeId: 'route1', parkId: null, groupId: 'myGroup',
    });
    await setDoc(doc(db, 'planned_sessions', 'squadOther'), {
      ...base, userId: 'otherUid', privacyMode: 'squad', routeId: 'route1', parkId: null, groupId: 'notMyGroup',
    });
    await setDoc(doc(db, 'planned_sessions', 'ghostOther'), {
      ...base, userId: 'otherUid', privacyMode: 'ghost', routeId: 'route1', parkId: null, groupId: null,
    });
    // meUid's own membership mirror (axiom §17 — this is what
    // memberGroupIds() actually reads, NOT community_groups/{g}/members).
    await setDoc(doc(db, 'user_memberships', 'meUid'), { groupIds: ['myGroup'] });
  });
}

async function testGetSemantics() {
  console.log('\nsingle-doc get() — baseline correctness per privacyMode');

  await it('[CONTROL] public (verified_global) doc readable by any authenticated user', async () => {
    const ctx = env.authenticatedContext('meUid');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'planned_sessions', 'pubOther')));
  });

  await it('[CONTROL] owner reads their own doc regardless of privacyMode (ghost here)', async () => {
    const ctx = env.authenticatedContext('meUid');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'planned_sessions', 'ownGhost')));
  });

  await it('[CONTROL] squad doc readable by a real member of that group', async () => {
    const ctx = env.authenticatedContext('meUid');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'planned_sessions', 'squadMine')));
  });

  await it('[DENY] squad doc NOT readable by a non-member', async () => {
    const ctx = env.authenticatedContext('strangerUid');
    await assertFails(getDoc(doc(ctx.firestore(), 'planned_sessions', 'squadMine')));
  });

  await it('[DENY] squad doc for a DIFFERENT group not readable even though meUid is a member of SOME group', async () => {
    const ctx = env.authenticatedContext('meUid');
    await assertFails(getDoc(doc(ctx.firestore(), 'planned_sessions', 'squadOther')));
  });

  await it('[DENY] ghost doc not readable by anyone but the owner', async () => {
    const ctx = env.authenticatedContext('strangerUid');
    await assertFails(getDoc(doc(ctx.firestore(), 'planned_sessions', 'ghostOther')));
  });
}

async function testListProvability() {
  console.log('\n`list` query provability — the real shapes the paired app code executes');

  await it('[CONTROL] public slice (privacyMode==verified_global + status in + expiresAt>=) as a real list query → ALLOWED, returns the public doc', async () => {
    const ctx = env.authenticatedContext('strangerUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('privacyMode', '==', 'verified_global'),
      where('status', 'in', ['planned', 'active']),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await assertSucceeds(getDocs(q));
    const ids = (snap as any).docs.map((d: any) => d.id);
    if (!ids.includes('pubOther')) throw new Error(`expected pubOther in results, got ${JSON.stringify(ids)}`);
  });

  await it('[CONTROL] own slice (userId==me + status in + expiresAt>=) as a real list query → ALLOWED, returns my own ghost doc', async () => {
    const ctx = env.authenticatedContext('meUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('userId', '==', 'meUid'),
      where('status', 'in', ['planned', 'active']),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await assertSucceeds(getDocs(q));
    const ids = (snap as any).docs.map((d: any) => d.id);
    if (!ids.includes('ownGhost')) throw new Error(`expected ownGhost in results, got ${JSON.stringify(ids)}`);
  });

  await it('[CONTROL] squad slice (privacyMode==squad + groupId in [myGroup] + expiresAt>=) as a real list query by a real member → ALLOWED (this is the case that would have caught the isGroupMember() provability bug)', async () => {
    const ctx = env.authenticatedContext('meUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('privacyMode', '==', 'squad'),
      where('groupId', 'in', ['myGroup']),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await assertSucceeds(getDocs(q));
    const ids = (snap as any).docs.map((d: any) => d.id);
    if (!ids.includes('squadMine')) throw new Error(`expected squadMine in results, got ${JSON.stringify(ids)}`);
  });

  await it('[DENY] squad slice as a real list query by a NON-member → the query itself is denied, not just filtered to empty', async () => {
    const ctx = env.authenticatedContext('strangerUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('privacyMode', '==', 'squad'),
      where('groupId', 'in', ['myGroup']),
      where('expiresAt', '>=', Timestamp.now()),
    );
    await assertFails(getDocs(q));
  });

  await it('[CONTROL] a member of a DIFFERENT group querying their own squad slice (groupId in [notMyGroup]) → ALLOWED for that group, proving the rule is scoped per-group, not "any squad membership passes"', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'user_memberships', 'otherMemberUid'), { groupIds: ['notMyGroup'] });
    });
    const ctx = env.authenticatedContext('otherMemberUid');
    const q = query(
      collection(ctx.firestore(), 'planned_sessions'),
      where('privacyMode', '==', 'squad'),
      where('groupId', 'in', ['notMyGroup']),
      where('expiresAt', '>=', Timestamp.now()),
    );
    const snap = await assertSucceeds(getDocs(q));
    const ids = (snap as any).docs.map((d: any) => d.id);
    if (!ids.includes('squadOther')) throw new Error(`expected squadOther in results, got ${JSON.stringify(ids)}`);
  });
}

async function testMissingPrivacyModeFallback() {
  console.log('\nmissing privacyMode field — fail-open default matches the client\'s own fallback, not assumed');

  await it('[CONTROL] a doc with NO privacyMode field at all is readable by a stranger — defaults to verified_global, same direction as usePartnerData.ts\'s own client-side fallback for legacy-absent docs', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'planned_sessions', 'legacyNoPrivacyMode'), {
        status: 'planned', expiresAt: FUTURE, userId: 'otherUid', routeId: 'route1', parkId: null, groupId: null,
      });
    });
    const ctx = env.authenticatedContext('strangerUid');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'planned_sessions', 'legacyNoPrivacyMode')));
  });
}

function wrapSuite(name: string, fn: () => Promise<void>) {
  describe(name, () => {
    vitestIt('runs', async () => {
      const before = fail;
      await fn();
      if (fail > before) {
        throw new Error(`${fail - before} case(s) failed in "${name}" — see console output above for details`);
      }
    }, 60_000);
  });
}

beforeAll(async () => {
  await setup();
}, 30_000);

afterAll(async () => {
  console.log(`\n=== firestore-fix-planned-sessions-privacy.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('get() semantics', testGetSemantics);
wrapSuite('list provability', testListProvability);
wrapSuite('missing privacyMode fallback', testMissingPrivacyModeFallback);

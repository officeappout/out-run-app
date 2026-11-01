/**
 * SECURITY AUDIT 01.11.2026 — urgent fixes in firestore.rules:
 *   1. isRootAdmin() requires a VERIFIED email (an unverified sign-up with
 *      david@/office@ used to become root admin).
 *   2. chats: an adult could open a 'group' chat with any minor (bypassing the
 *      adults-only DM rule), and any participant could rewrite `participants`.
 *      Now: create = creator alone + real group membership; join = add only
 *      yourself; leave = remove yourself (or a group admin removes one member);
 *      the generic participant update never touches participants/type/groupId.
 *
 * Run: isolated emulator on 127.0.0.1:8089 —
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
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

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

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'adult'), { core: { name: 'Adult', ageGroup: 'adult' } });
    await setDoc(doc(db, 'users', 'adult2'), { core: { name: 'Adult2', ageGroup: 'adult' } });
    await setDoc(doc(db, 'users', 'minor'), { core: { name: 'Minor', ageGroup: 'minor' } });
    await setDoc(doc(db, 'users', 'member'), { core: { name: 'Member', ageGroup: 'adult' } });
    await setDoc(doc(db, 'users', 'groupAdmin'), { core: { name: 'GA', ageGroup: 'adult' } });

    // community group g1: groupAdmin (role admin) + member + adult are real members.
    await setDoc(doc(db, 'community_groups', 'sa_g1'), { name: 'G1', createdBy: 'groupAdmin' });
    await setDoc(doc(db, 'community_groups', 'sa_g1', 'members', 'groupAdmin'), { uid: 'groupAdmin', role: 'admin' });
    await setDoc(doc(db, 'community_groups', 'sa_g1', 'members', 'member'), { uid: 'member', role: 'member' });
    await setDoc(doc(db, 'community_groups', 'sa_g1', 'members', 'adult'), { uid: 'adult', role: 'member' });
    await setDoc(doc(db, 'community_groups', 'sa_g2'), { name: 'G2', createdBy: 'adult' });
    await setDoc(doc(db, 'community_groups', 'sa_g2', 'members', 'adult'), { uid: 'adult', role: 'admin' });

    await setDoc(doc(db, 'chats', 'group_sa_g1'), {
      type: 'group', groupId: 'sa_g1', groupName: 'G1',
      participants: ['groupAdmin', 'member'], participantNames: { groupAdmin: 'GA', member: 'Member' },
    });
    await setDoc(doc(db, 'chats', 'dmAA'), { type: 'dm', participants: ['adult', 'adult2'] });

    // A doc only root admin may read (catch-all is isRootAdmin()-only).
    await setDoc(doc(db, 'zz_root_only_probe', 'x'), { v: 1 });
  });
}

async function testRootAdminVerifiedEmail() {
  console.log('\nFix 1 — isRootAdmin requires a verified email');

  await it('[DENY] unverified office@appout.co.il is NOT root admin', async () => {
    const ctx = env.authenticatedContext('attacker', { email: 'office@appout.co.il', email_verified: false });
    await assertFails(getDoc(doc(ctx.firestore(), 'zz_root_only_probe', 'x')));
  });

  await it('[DENY] office@appout.co.il with no email_verified claim is NOT root admin', async () => {
    const ctx = env.authenticatedContext('attacker2', { email: 'office@appout.co.il' });
    await assertFails(getDoc(doc(ctx.firestore(), 'zz_root_only_probe', 'x')));
  });

  await it('[CONTROL] verified office@appout.co.il is still root admin', async () => {
    const ctx = env.authenticatedContext('root', { email: 'office@appout.co.il', email_verified: true });
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'zz_root_only_probe', 'x')));
  });
}

async function testGroupChats() {
  console.log('\nFix 2 — group chats');

  await it('[DENY] adult creates a "group" chat with a minor (DM-rule bypass)', async () => {
    const ctx = env.authenticatedContext('adult');
    await assertFails(setDoc(doc(ctx.firestore(), 'chats', 'group_sa_g2'), {
      type: 'group', groupId: 'sa_g2', participants: ['adult', 'minor'],
    }));
  });

  await it('[DENY] non-member creates a group chat for a group they are not in', async () => {
    const ctx = env.authenticatedContext('adult2');
    await assertFails(setDoc(doc(ctx.firestore(), 'chats', 'group_sa_g2'), {
      type: 'group', groupId: 'sa_g2', participants: ['adult2'],
    }));
  });

  await it('[DENY] group chat with an arbitrary id (not group_ + groupId)', async () => {
    const ctx = env.authenticatedContext('adult');
    await assertFails(setDoc(doc(ctx.firestore(), 'chats', 'whatever'), {
      type: 'group', groupId: 'sa_g2', participants: ['adult'],
    }));
  });

  await it('[CONTROL] group member creates the group chat alone (createGroupChat)', async () => {
    const ctx = env.authenticatedContext('adult');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'chats', 'group_sa_g2'), {
      type: 'group', groupId: 'sa_g2', groupName: 'G2',
      participants: ['adult'], participantNames: { adult: 'Adult' },
    }));
  });

  await it('[DENY] a participant adds a minor via the generic update', async () => {
    const ctx = env.authenticatedContext('member');
    await assertFails(updateDoc(doc(ctx.firestore(), 'chats', 'group_sa_g1'), {
      participants: arrayUnion('minor'),
    }));
  });

  await it('[DENY] a DM participant adds a third person', async () => {
    const ctx = env.authenticatedContext('adult');
    await assertFails(updateDoc(doc(ctx.firestore(), 'chats', 'dmAA'), {
      participants: arrayUnion('minor'),
    }));
  });

  await it('[DENY] a real member joins AND adds a minor in the same write', async () => {
    const ctx = env.authenticatedContext('adult');
    await assertFails(updateDoc(doc(ctx.firestore(), 'chats', 'group_sa_g1'), {
      participants: arrayUnion('adult', 'minor'),
    }));
  });

  await it('[CONTROL] a real member joins themselves (addMemberToGroupChat)', async () => {
    const ctx = env.authenticatedContext('adult');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'chats', 'group_sa_g1'), {
      participants: arrayUnion('adult'),
      'participantNames.adult': 'Adult',
    }));
  });

  await it('[CONTROL] a participant still updates message metadata', async () => {
    const ctx = env.authenticatedContext('member');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'chats', 'group_sa_g1'), {
      lastMessage: 'hi', lastSenderId: 'member',
    }));
  });

  await it('[DENY] a regular member removes someone else', async () => {
    const ctx = env.authenticatedContext('member');
    await assertFails(updateDoc(doc(ctx.firestore(), 'chats', 'group_sa_g1'), {
      participants: ['groupAdmin', 'member'],
      participantNames: { groupAdmin: 'GA', member: 'Member' },
    }));
  });

  await it('[CONTROL] the group admin removes one member (removeGroupMember)', async () => {
    const ctx = env.authenticatedContext('groupAdmin');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'chats', 'group_sa_g1'), {
      participants: ['groupAdmin', 'member'],
      participantNames: { groupAdmin: 'GA', member: 'Member' },
    }));
  });

  await it('[CONTROL] a member leaves (leaveGroup, member doc already deleted)', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(c.firestore(), 'community_groups', 'sa_g1', 'members', 'member'));
    });
    const ctx = env.authenticatedContext('member');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'chats', 'group_sa_g1'), {
      participants: ['groupAdmin'],
      participantNames: { groupAdmin: 'GA' },
    }));
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
  console.log(`\n=== firestore-fix-security-audit-2026-11.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('isRootAdmin verified email', testRootAdminVerifiedEmail);
wrapSuite('group chat membership', testGroupChats);

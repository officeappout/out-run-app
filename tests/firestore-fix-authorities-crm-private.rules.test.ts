/**
 * SECURITY FIX — authorities CRM split (01.11.2026).
 *
 * authorities/{id} is world-readable (city lookups), but used to also hold
 * OUT's sales CRM (contacts / activityLog / tasks / financials / documents).
 * Those now live in authorities/{id}/crm_private/main, admin-only, and even
 * an admin's client write may not put them back on the public doc.
 * Also unit-tests the pure split/merge helpers (src/features/admin/services/authority-crm.ts).
 *
 * Run: isolated emulator on 127.0.0.1:8089 — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, beforeAll, afterAll, it as vitestIt, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { collection, collectionGroup, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import {
  AUTHORITY_CRM_FIELDS,
  mergeCrmFields,
  planCrmMigration,
  splitCrmFields,
} from '../src/features/admin/services/authority-crm';

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

const AUTH = 'crm_city';
const LEGACY = 'crm_legacy_city';
const ADMIN = 'crm_admin_uid';
const USER = 'crm_user_uid';

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ADMIN), { core: { name: 'Admin', isSuperAdmin: true } });
    await setDoc(doc(db, 'users', USER), { core: { name: 'User' } });
    await setDoc(doc(db, 'authorities', AUTH), { name: 'עיר', type: 'city', parentAuthorityId: null, pipelineStatus: 'lead' });
    await setDoc(doc(db, 'authorities', AUTH, 'crm_private', 'main'), {
      contacts: [{ id: 'c1', name: 'ראש מחלקה', phone: '0500000000' }],
      activityLog: [], tasks: [], documents: [],
      financials: { totalQuoteAmount: 1000, installments: [] },
    });
    // Pre-migration doc: still carries a legacy CRM key on the public doc.
    await setDoc(doc(db, 'authorities', LEGACY), { name: 'ישן', type: 'city', pipelineStatus: 'lead', contacts: [{ id: 'old' }] });
  });
}

async function testPublicDocStillPublic() {
  console.log('\nauthorities main doc — still public');

  await it('[ALLOW] unauthenticated GET of the main doc', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'authorities', AUTH)));
  });
  await it('[ALLOW] unauthenticated list of authorities', async () => {
    await assertSucceeds(getDocs(collection(env.unauthenticatedContext().firestore(), 'authorities')));
  });
  await it('[ALLOW] regular user GET of the main doc', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext(USER).firestore(), 'authorities', AUTH)));
  });
  await it('[ALLOW] regular user still increments pressureCount only', async () => {
    await assertSucceeds(updateDoc(doc(env.authenticatedContext(USER).firestore(), 'authorities', AUTH), { pressureCount: 1 }));
  });
}

async function testCrmPrivate() {
  console.log('\nauthorities/{id}/crm_private — admin only');

  await it('[DENY] unauthenticated GET crm_private/main', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'authorities', AUTH, 'crm_private', 'main')));
  });
  await it('[DENY] regular user GET crm_private/main', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext(USER).firestore(), 'authorities', AUTH, 'crm_private', 'main')));
  });
  await it('[DENY] regular user writes crm_private/main', async () => {
    await assertFails(setDoc(doc(env.authenticatedContext(USER).firestore(), 'authorities', AUTH, 'crm_private', 'main'), { tasks: [] }, { merge: true }));
  });
  await it('[ALLOW] admin GET crm_private/main', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext(ADMIN).firestore(), 'authorities', AUTH, 'crm_private', 'main')));
  });
  await it('[ALLOW] admin writes crm_private/main', async () => {
    await assertSucceeds(setDoc(doc(env.authenticatedContext(ADMIN).firestore(), 'authorities', AUTH, 'crm_private', 'main'), { tasks: [{ id: 't1' }] }, { merge: true }));
  });
  await it('[DENY] regular user collection-group query on crm_private', async () => {
    await assertFails(getDocs(collectionGroup(env.authenticatedContext(USER).firestore(), 'crm_private')));
  });
  await it('[DENY] unauthenticated collection-group query on crm_private', async () => {
    await assertFails(getDocs(collectionGroup(env.unauthenticatedContext().firestore(), 'crm_private')));
  });
  await it('[ALLOW] admin collection-group query on crm_private', async () => {
    await assertSucceeds(getDocs(collectionGroup(env.authenticatedContext(ADMIN).firestore(), 'crm_private')));
  });
}

async function testAdminCannotReAddCrmKeys() {
  console.log('\nauthorities main doc — CRM keys can no longer be written from the client');

  await it('[DENY] admin update re-adding contacts to the main doc', async () => {
    await assertFails(updateDoc(doc(env.authenticatedContext(ADMIN).firestore(), 'authorities', AUTH), { contacts: [{ id: 'x' }] }));
  });
  await it('[DENY] admin update writing financials to the main doc', async () => {
    await assertFails(updateDoc(doc(env.authenticatedContext(ADMIN).firestore(), 'authorities', AUTH), { financials: { totalQuoteAmount: 5 } }));
  });
  await it('[DENY] admin create with activityLog on the main doc', async () => {
    await assertFails(setDoc(doc(env.authenticatedContext(ADMIN).firestore(), 'authorities', 'crm_new_1'), { name: 'x', activityLog: [] }));
  });
  await it('[ALLOW] admin create without CRM keys', async () => {
    await assertSucceeds(setDoc(doc(env.authenticatedContext(ADMIN).firestore(), 'authorities', 'crm_new_2'), { name: 'x', type: 'city', pipelineStatus: 'lead' }));
  });
  await it('[ALLOW] admin updates pipelineStatus on the main doc', async () => {
    await assertSucceeds(updateDoc(doc(env.authenticatedContext(ADMIN).firestore(), 'authorities', AUTH), { pipelineStatus: 'meeting' }));
  });
  await it('[ALLOW] admin updates a pre-migration doc that still holds legacy contacts (untouched)', async () => {
    await assertSucceeds(updateDoc(doc(env.authenticatedContext(ADMIN).firestore(), 'authorities', LEGACY), { pipelineStatus: 'meeting' }));
  });
  await it('[DENY] admin changes legacy contacts on a pre-migration doc', async () => {
    await assertFails(updateDoc(doc(env.authenticatedContext(ADMIN).firestore(), 'authorities', LEGACY), { contacts: [] }));
  });
  await it('[DENY] regular user writes contacts on the main doc', async () => {
    await assertFails(updateDoc(doc(env.authenticatedContext(USER).firestore(), 'authorities', AUTH), { contacts: [] }));
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
  console.log(`\n=== firestore-fix-authorities-crm-private.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('authorities main doc stays public', testPublicDocStillPublic);
wrapSuite('crm_private admin only', testCrmPrivate);
wrapSuite('admin client writes cannot re-add CRM keys', testAdminCannotReAddCrmKeys);

describe('authority-crm helpers (pure)', () => {
  vitestIt('field list is exactly the 5 CRM keys', () => {
    expect([...AUTHORITY_CRM_FIELDS]).toEqual(['contacts', 'activityLog', 'tasks', 'financials', 'documents']);
  });

  vitestIt('splitCrmFields separates CRM keys from public keys', () => {
    const { publicData, crmData } = splitCrmFields({ name: 'x', pipelineStatus: 'lead', contacts: [1], financials: { a: 1 }, updatedAt: 5 });
    expect(publicData).toEqual({ name: 'x', pipelineStatus: 'lead', updatedAt: 5 });
    expect(crmData).toEqual({ contacts: [1], financials: { a: 1 } });
  });

  vitestIt('mergeCrmFields: private wins per field, legacy fills the rest, public keys untouched', () => {
    const main = { name: 'x', contacts: ['legacy'], tasks: ['legacyT'] };
    expect(mergeCrmFields(main, { contacts: ['new'], name: 'ignored' })).toEqual({ name: 'x', contacts: ['new'], tasks: ['legacyT'] });
    expect(mergeCrmFields(main, null)).toBe(main);
  });

  vitestIt('planCrmMigration never overwrites existing private fields, always deletes legacy keys', () => {
    const plan = planCrmMigration({ name: 'x', contacts: ['legacy'], tasks: ['t'] }, { contacts: ['newer'] });
    expect(plan.toWrite).toEqual({ tasks: ['t'] });
    expect(plan.keptPrivate).toEqual(['contacts']);
    expect(plan.toDelete.sort()).toEqual(['contacts', 'tasks']);
    expect(planCrmMigration({ name: 'x' }, null)).toEqual({ toWrite: {}, toDelete: [], keptPrivate: [] });
  });
});

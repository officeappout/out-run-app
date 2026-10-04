/**
 * Readiness-roster ↔ app-account matching — REAL Firestore-emulator
 * integration suite (04.10.2026, 00-MASTER-PLAN.md §13.84). §31
 * discipline: every assertion reads back the REAL stored document via
 * the real Admin SDK. No Cloud Function trigger exists on
 * readiness_soldiers/readiness_results/users.core (confirmed earlier
 * this build) — a plain Firestore-only emulator is correct and
 * sufficient.
 *
 * Requires `firebase emulators:start --only firestore` running
 * separately at 127.0.0.1:8080 — beforeAll throws immediately if it
 * isn't reachable, and vitest shows every case below as skipped (not
 * failed) when that happens — same established behavior as every
 * other emulator suite in this build.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from compute*() functions'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { computeReadinessMatchSuggestions } from '../readiness-match.service';
import { computeRejectReadinessMatch, computeBulkApproveReadinessMatches, computeLinkSoldier } from '../readiness-write.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

const PROJECT_ID = 'appout-1-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8080';
const TENANT_ID = 'emu-brigade-match';
const UNIT_ID = 'emu-unit-match';

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${FIRESTORE_HOST}?`);
}

const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: TENANT_ID };
const CTX = { callerUid: 'test-officer', tokenEmail: 'officer@test.local', sourceIp: '127.0.0.1' };

async function seedUnit(): Promise<void> {
  await db.collection('tenants').doc(TENANT_ID).collection('units').doc(UNIT_ID).set({
    name: 'פלוגה א׳', unitPath: ['פלוגה א׳'], memberCount: 0, createdAt: new Date(),
  });
}

async function seedUser(uid: string, name: string, unitId: string = UNIT_ID): Promise<void> {
  await db.collection('users').doc(uid).set({
    core: { tenantId: TENANT_ID, unitId, name },
  });
}

async function seedSoldier(id: string, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const ref = db.collection('readiness_soldiers').doc(id);
  await ref.set({
    tenantId: TENANT_ID, unitId: UNIT_ID, name, gender: 'male',
    uid: null, linkedAt: null, mergedInto: null,
    createdBy: 'seed', createdAt: new Date(), updatedAt: new Date(),
    ...extra,
  });
  return ref.id;
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `readiness-match-emulator-test-${Date.now()}`);
  db = getFirestore(app);
  // A reachability check belongs HERE, not only inside beforeEach — a
  // beforeAll failure is what makes vitest show every test below as
  // "skipped" (not individually failed) when the emulator isn't
  // running, the same established behavior every other
  // *.emulator.test.ts file in this build relies on. beforeEach also
  // calls clearEmulator() per test (for isolation, since many cases
  // reuse the same doc ids like 's1') — without this check, THAT call
  // would be the first to throw, once per test, producing 15 separate
  // failures instead of one clean "skipped" file.
  await clearEmulator();
}, 20000);

afterAll(async () => {
  if (app) await deleteApp(app);
});

beforeEach(async () => {
  await clearEmulator();
  await seedUnit();
});

describe('computeReadinessMatchSuggestions', () => {
  it('an exact-name match is suggested, unambiguously', async () => {
    await seedSoldier('s1', 'יוסי לוי');
    await seedUser('u1', 'יוסי לוי');

    const result = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.suggestions).toHaveLength(1);
    expect(result.body.suggestions[0]).toMatchObject({ soldierId: 's1', uid: 'u1', soldierName: 'יוסי לוי', accountName: 'יוסי לוי' });
    expect(result.body.ambiguities).toHaveLength(0);
  });

  it('two soldiers sharing the same name are NOT auto-suggested — shown as a choice', async () => {
    await seedSoldier('s1', 'דוד כהן');
    await seedSoldier('s2', 'דוד כהן');
    await seedUser('u1', 'דוד כהן');

    const result = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.suggestions).toHaveLength(0);
    expect(result.body.ambiguities.map((a) => a.soldierId).sort()).toEqual(['s1', 's2']);
    result.body.ambiguities.forEach((a) => expect(a.candidates.map((c) => c.uid)).toEqual(['u1']));
  });

  it('one account matching two soldier rows is NOT auto-suggested for either — shown as a choice for both', async () => {
    await seedSoldier('s1', 'נועה לוי');
    await seedSoldier('s2', 'נועה לוי');
    await seedUser('u1', 'נועה לוי');

    const result = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.suggestions).toHaveLength(0);
    expect(result.body.ambiguities).toHaveLength(2);
  });

  it('a double space / hyphen is matched after normalization', async () => {
    await seedSoldier('s1', 'בן  דוד'); // double space
    await seedUser('u1', 'בן-דוד'); // hyphen

    const result = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.suggestions).toHaveLength(1);
    expect(result.body.suggestions[0]).toMatchObject({ soldierId: 's1', uid: 'u1' });
  });

  it('a genuinely different spelling ("דויד" vs "דוד") is never matched, deliberately', async () => {
    await seedSoldier('s1', 'דויד ישראלי');
    await seedUser('u1', 'דוד ישראלי');

    const result = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.suggestions).toHaveLength(0);
    expect(result.body.ambiguities).toHaveLength(0);
    // Both show up as "declared not in roster" / simply unmatched — no crash, no guess.
  });

  it('a user who declared a DIFFERENT unit is never offered as a match here', async () => {
    await db.collection('tenants').doc(TENANT_ID).collection('units').doc('other-unit').set({ name: 'אחר', unitPath: ['אחר'], memberCount: 0, createdAt: new Date() });
    await seedSoldier('s1', 'רועי אברהם');
    await seedUser('u1', 'רועי אברהם', 'other-unit'); // declared a different unit

    const result = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.suggestions).toHaveLength(0);
    expect(result.body.ambiguities).toHaveLength(0);
  });

  it('a user outside the caller\'s own scope is blocked by the EXISTING precondition (computeUnitMembers), not a new filter', async () => {
    const outsideTenant = 'some-other-brigade';
    const outsideScope: UnitPermissionScope = { kind: 'tenantOwner', tenantId: outsideTenant };
    await seedSoldier('s1', 'כל אחד');
    await seedUser('u1', 'כל אחד');

    const result = await computeReadinessMatchSuggestions(db, outsideScope, { unitId: UNIT_ID });
    // computeUnitMembers itself rejects (unit not found under the caller's own tenant) — forwarded as-is.
    expect(result.status).not.toBe(200);
  });

  it('a soldier already linked never appears as an unmatched candidate', async () => {
    await seedSoldier('s1', 'חייל מקושר', { uid: 'already-linked-uid', linkedAt: new Date() });
    await seedUser('u2', 'חייל מקושר'); // same name, different account

    const result = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    // s1 is already linked — not in the unlinked pool at all, so u2 shows as declared-not-in-roster, not a suggestion for s1.
    expect(result.body.suggestions.find((s) => s.soldierId === 's1')).toBeUndefined();
  });

  it('an account already linked to another soldier is excluded from the candidate pool entirely', async () => {
    await seedSoldier('s1', 'חייל אחר', { uid: 'u-linked-elsewhere' });
    await seedSoldier('s2', 'חייל שני');
    await seedUser('u-linked-elsewhere', 'חייל שני'); // matches s2 by name, but already linked to s1

    const result = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.suggestions.find((s) => s.soldierId === 's2')).toBeUndefined();
  });

  it('declaredNotInRoster lists declared users with no linked row, count and names only', async () => {
    await seedUser('u1', 'לא ברשימה א');
    await seedUser('u2', 'לא ברשימה ב');

    const result = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.declaredNotInRoster).toHaveLength(2);
    expect(result.body.declaredNotInRoster.map((d) => d.uid).sort()).toEqual(['u1', 'u2']);
  });

  it('"לא הוא" — a rejected pair is never offered again on the next computation', async () => {
    await seedSoldier('s1', 'יוסי לוי');
    await seedUser('u1', 'יוסי לוי');

    const before = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(before.status === 200 && before.body.suggestions).toHaveLength(1);

    const rejectResult = await computeRejectReadinessMatch(db, TENANT_OWNER_SCOPE, { soldierId: 's1', uid: 'u1' }, CTX);
    expect(rejectResult.status).toBe(200);

    const after = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(after.status).toBe(200);
    if (after.status !== 200) return;
    expect(after.body.suggestions).toHaveLength(0);

    // Confirmed on the real stored document, not just inferred from behavior.
    const soldierSnap = await db.collection('readiness_soldiers').doc('s1').get();
    expect(soldierSnap.data()?.rejectedUids).toEqual(['u1']);
  });

  it('"לא הוא" is NOT a one-way door — a rejected pair can still be linked MANUALLY afterward, because computeLinkSoldier never reads rejectedUids (David\'s Q2, verified on the real document, not just by reading the source)', async () => {
    await seedSoldier('s1', 'יוסי לוי');
    await seedUser('u1', 'יוסי לוי');

    const reject = await computeRejectReadinessMatch(db, TENANT_OWNER_SCOPE, { soldierId: 's1', uid: 'u1' }, CTX);
    expect(reject.status).toBe(200);

    // Confirm the suggestion is really gone first — otherwise this test
    // wouldn't be exercising the "rejected, then manually linked anyway" path.
    const afterReject = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, { unitId: UNIT_ID });
    expect(afterReject.status).toBe(200);
    if (afterReject.status === 200) expect(afterReject.body.suggestions).toHaveLength(0);

    // The officer changes their mind and links the SAME pair manually
    // (e.g. via the existing "שייך לרשומה קיימת" picker) — must succeed.
    const link = await computeLinkSoldier(db, TENANT_OWNER_SCOPE, { soldierId: 's1', uid: 'u1' }, CTX);
    expect(link.status).toBe(200);

    const soldierSnap = await db.collection('readiness_soldiers').doc('s1').get();
    expect(soldierSnap.data()?.uid).toBe('u1'); // really linked, on the real document
  });

  it('omitting unitId matches across every unit in the officer\'s whole command span, never crossing a soldier in one unit with a declaration in another', async () => {
    await db.collection('tenants').doc(TENANT_ID).collection('units').doc('second-unit').set({
      name: 'פלוגה ב׳', unitPath: ['פלוגה ב׳'], memberCount: 0, createdAt: new Date(),
    });
    await seedSoldier('s-unit-a', 'איתן ברק'); // unit UNIT_ID (helper default)
    await db.collection('readiness_soldiers').doc('s-unit-b').set({
      tenantId: TENANT_ID, unitId: 'second-unit', name: 'רון שגיא',
      uid: null, linkedAt: null, mergedInto: null, gender: 'male',
      createdBy: 'seed', createdAt: new Date(), updatedAt: new Date(),
    });
    await seedUser('u-unit-a', 'איתן ברק', UNIT_ID);
    await seedUser('u-unit-b', 'רון שגיא', 'second-unit');
    // A same-named declarant in the WRONG unit for each soldier — must never match across the boundary.
    await seedUser('u-wrong-a', 'רון שגיא', UNIT_ID);

    const result = await computeReadinessMatchSuggestions(db, TENANT_OWNER_SCOPE, {}); // no unitId at all
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.suggestions).toHaveLength(2);
    const bySoldier = new Map(result.body.suggestions.map((s) => [s.soldierId, s]));
    expect(bySoldier.get('s-unit-a')?.uid).toBe('u-unit-a');
    expect(bySoldier.get('s-unit-b')?.uid).toBe('u-unit-b');
  });
});

describe('computeBulkApproveReadinessMatches', () => {
  it('100 pairs in one call all link successfully via the existing computeLinkSoldier', async () => {
    const pairs: { soldierId: string; uid: string }[] = [];
    for (let i = 0; i < 100; i++) {
      const soldierId = await seedSoldier(`bulk-s-${i}`, `חייל ${i}`);
      await seedUser(`bulk-u-${i}`, `חייל ${i}`);
      pairs.push({ soldierId, uid: `bulk-u-${i}` });
    }

    const result = await computeBulkApproveReadinessMatches(db, TENANT_OWNER_SCOPE, { pairs }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.linked).toHaveLength(100);
    expect(result.body.failed).toHaveLength(0);

    const snap = await db.collection('readiness_soldiers').where('uid', '!=', null).get();
    expect(snap.size).toBe(100);
  }, 30000);

  it('101 pairs is rejected, never silently truncated', async () => {
    const pairs = Array.from({ length: 101 }, (_, i) => ({ soldierId: `x${i}`, uid: `y${i}` }));
    const result = await computeBulkApproveReadinessMatches(db, TENANT_OWNER_SCOPE, { pairs }, CTX);
    expect(result.status).toBe(400);
  });

  it('one invalid pair fails independently without blocking the other valid ones', async () => {
    const soldierId = await seedSoldier('valid-s', 'חייל תקין');
    await seedUser('valid-u', 'חייל תקין');

    const result = await computeBulkApproveReadinessMatches(db, TENANT_OWNER_SCOPE, {
      pairs: [{ soldierId, uid: 'valid-u' }, { soldierId: 'does-not-exist', uid: 'also-missing' }],
    }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.linked).toEqual([soldierId]);
    expect(result.body.failed).toHaveLength(1);
  });
});

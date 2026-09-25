#!/usr/bin/env npx tsx
/**
 * scripts/verify-unit-declaration.ts
 *
 * Emulator-only (no --prod, matching every other verify-*.ts script in
 * this build) verification of POST /api/units/declare — Slice A of the
 * persona-unit-unification build (25.09.2026, see docs/audit-2026-09/
 * 00-MASTER-PLAN.md §13.25).
 *
 * Covers every negative David required:
 *   - a unit not present in unitDirectory is rejected
 *   - a fabricated unitPathIds from the client is completely ignored
 *     (the request shape doesn't even accept it — this proves the server's
 *     own computed chain is what actually gets written, not client input)
 *   - the ancestor chain is built AND verified server-side against a real
 *     seeded multi-level hierarchy
 *   - a user with a matching core.blockedUnitIds entry is rejected, with
 *     zero writes
 *   - a non-military/non-educational org is rejected even if a
 *     unitDirectory entry somehow exists for it
 *   - a mid-flight failure (simulated batch.commit() rejection) leaves NO
 *     partial write on either document
 *   - rate limiting works (reused isRateLimited/RATE_LIMITS as-is)
 * Plus: the happy path (military), an educational org accepted too (proves
 * "not hardcoded to military"), and brigade-only (no unitId) rejected.
 *
 * Usage:
 *   firebase emulators:start --only firestore
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-unit-declaration.ts
 */
import * as admin from 'firebase-admin';
import { createRequire } from 'module';

function neutralizeServerOnly(): void {
  const cjsRequire = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeMod = cjsRequire('module') as any;
  const origLoad = NodeMod._load.bind(NodeMod);
  NodeMod._load = function (id: string, ...args: unknown[]) {
    if (id === 'server-only') return {};
    return origLoad(id, ...args);
  };
}
neutralizeServerOnly();

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
console.log(`🧪  Firestore → emulator ONLY (${EMULATOR_HOST}) — this script never targets production.\n`);

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-outrun-unit-declaration-verify' });
}
const db = admin.firestore();

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else { console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function clearAll() {
  const collections = ['unitDirectory', 'authorities', 'users', 'military_declarations'];
  for (const col of collections) {
    const snap = await db.collection(col).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

/** Seeds authorities/{orgId} + a brigade->battalion->company unitDirectory
 *  chain. Returns the directoryIds/unitIds needed by the tests below. */
async function seedMilitaryHierarchy(orgId: string, tenantType: 'military' | 'educational' = 'military') {
  await db.collection('authorities').doc(orgId).set({ name: `${orgId} name`, tenantType });

  await db.collection('unitDirectory').doc(orgId).set({
    name: 'חטיבה 11', parentId: null, level: 'brigade', orgId, unitId: null,
  });

  const battalionUnitId = 'bat_1';
  const battalionDirectoryId = `${orgId}__${battalionUnitId}`;
  await db.collection('unitDirectory').doc(battalionDirectoryId).set({
    name: 'גדוד 101', parentId: orgId, level: 'battalion', orgId, unitId: battalionUnitId,
  });

  const companyUnitId = 'co_a';
  const companyDirectoryId = `${orgId}__${companyUnitId}`;
  await db.collection('unitDirectory').doc(companyDirectoryId).set({
    name: 'פלוגה א', parentId: battalionDirectoryId, level: 'company', orgId, unitId: companyUnitId,
  });

  return { orgId, battalionUnitId, battalionDirectoryId, companyUnitId, companyDirectoryId };
}

async function main() {
  const { computeUnitDeclaration } = await import('../src/app/api/units/declare/route');
  const { isRateLimited } = await import('../src/lib/rateLimit');
  const { RATE_LIMITS } = await import('../src/lib/rateLimitConfig');

  const run = Date.now();

  // ══════════════════════════════════════════════════════════════════════
  console.log('── happy path: military, company-level declaration ──────────');
  await clearAll();
  {
    const org = await seedMilitaryHierarchy(`org-${run}-a`);
    const uid = `soldier-${run}-a`;
    await db.collection('users').doc(uid).set({ core: { name: 'טסט' } });

    const result = await computeUnitDeclaration(db, uid, { orgId: org.orgId, unitId: org.companyUnitId });
    assert('happy path: 200', result.status === 200, JSON.stringify(result.body));
    if (result.status === 200) {
      assert('  tenantId echoes orgId', result.body.tenantId === org.orgId);
      assert('  unitId echoes company unitId', result.body.unitId === org.companyUnitId);
      assert('  unitPath = [battalion, company] names, brigade excluded', JSON.stringify(result.body.unitPath) === JSON.stringify(['גדוד 101', 'פלוגה א']));
      assert('  tenantType = military', result.body.tenantType === 'military');
    }

    const userSnap = await db.collection('users').doc(uid).get();
    const core = userSnap.data()?.core ?? {};
    assert('users/{uid}.core.tenantId written', core.tenantId === org.orgId);
    assert('users/{uid}.core.unitId written', core.unitId === org.companyUnitId);
    assert('users/{uid}.core.unitMembershipSource = self_declared', core.unitMembershipSource === 'self_declared');
    assert('users/{uid}.core.unitApprovedByOfficer = false', core.unitApprovedByOfficer === false);
    assert('users/{uid}.core.unitDeclaredAt is a real Timestamp', typeof core.unitDeclaredAt?.toMillis === 'function');
    assert('users/{uid}.core.name untouched by the merge (sibling field survives)', core.name === 'טסט');

    const declSnap = await db.collection('military_declarations').doc(uid).get();
    const decl = declSnap.data() ?? {};
    assert('military_declarations.orgId written', decl.orgId === org.orgId);
    assert('military_declarations.unitId written', decl.unitId === org.companyUnitId);
    assert('military_declarations.unitPathIds = [battalionUnitId, companyUnitId]', JSON.stringify(decl.unitPathIds) === JSON.stringify([org.battalionUnitId, org.companyUnitId]));
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── educational org accepted too — NOT hardcoded to military ──');
  await clearAll();
  {
    const org = await seedMilitaryHierarchy(`org-${run}-edu`, 'educational');
    const uid = `student-${run}`;
    await db.collection('users').doc(uid).set({ core: {} });
    const result = await computeUnitDeclaration(db, uid, { orgId: org.orgId, unitId: org.companyUnitId });
    assert('educational org: 200', result.status === 200);
    if (result.status === 200) assert('  tenantType = educational', result.body.tenantType === 'educational');
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── THE required negative: unit not in unitDirectory is rejected ──');
  await clearAll();
  {
    const uid = `nobody-${run}`;
    await db.collection('users').doc(uid).set({ core: {} });
    const result = await computeUnitDeclaration(db, uid, { orgId: 'no-such-org', unitId: 'no-such-unit' });
    assert('nonexistent unit: 400', result.status === 400);

    const userSnap = await db.collection('users').doc(uid).get();
    assert('no write happened on rejection', userSnap.data()?.core?.tenantId === undefined);
    const declSnap = await db.collection('military_declarations').doc(uid).get();
    assert('military_declarations untouched on rejection', !declSnap.exists);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── THE required negative: fabricated unitPathIds from the client is completely ignored ──');
  await clearAll();
  {
    const org = await seedMilitaryHierarchy(`org-${run}-fake`);
    const uid = `faker-${run}`;
    await db.collection('users').doc(uid).set({ core: {} });

    // The request type doesn't even declare a unitPathIds field — this
    // proves it at the call boundary: passing extra junk on the input
    // object has zero effect, because computeUnitDeclaration never reads
    // req.unitPathIds in the first place.
    const result = await computeUnitDeclaration(db, uid, {
      orgId: org.orgId,
      unitId: org.companyUnitId,
      // @ts-expect-error — deliberately not part of DeclareUnitInput
      unitPathIds: ['totally-fabricated-ancestor', 'another-fake-one'],
    });
    assert('fabricated unitPathIds: still 200 (ignored, not rejected)', result.status === 200);
    if (result.status === 200) {
      assert('  server-computed unitPath used, not the fabricated array', JSON.stringify(result.body.unitPath) === JSON.stringify(['גדוד 101', 'פלוגה א']));
    }
    const decl = (await db.collection('military_declarations').doc(uid).get()).data() ?? {};
    assert('  written unitPathIds = real server chain, not fabricated', JSON.stringify(decl.unitPathIds) === JSON.stringify([org.battalionUnitId, org.companyUnitId]));
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── ancestor chain built + verified server-side against a real 3-level hierarchy ──');
  await clearAll();
  {
    const org = await seedMilitaryHierarchy(`org-${run}-chain`);
    const uid = `chain-${run}`;
    await db.collection('users').doc(uid).set({ core: {} });

    // Declare the BATTALION (mid-level, not the deepest company) — proves
    // the chain walk works correctly at a non-leaf depth too.
    const result = await computeUnitDeclaration(db, uid, { orgId: org.orgId, unitId: org.battalionUnitId });
    assert('battalion-level declaration: 200', result.status === 200);
    if (result.status === 200) {
      assert('  unitPath = [battalion] only (brigade excluded, no company drilled)', JSON.stringify(result.body.unitPath) === JSON.stringify(['גדוד 101']));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── THE required negative: blocked user is rejected, zero writes ──');
  await clearAll();
  {
    const org = await seedMilitaryHierarchy(`org-${run}-block`);
    const uid = `blocked-${run}`;
    await db.collection('users').doc(uid).set({ core: { blockedUnitIds: [org.companyDirectoryId] } });

    const result = await computeUnitDeclaration(db, uid, { orgId: org.orgId, unitId: org.companyUnitId });
    assert('blocked unit: 403', result.status === 403);

    const userSnap = await db.collection('users').doc(uid).get();
    assert('blocked: core.tenantId NOT written', userSnap.data()?.core?.tenantId === undefined);
    assert('blocked: blockedUnitIds itself untouched', JSON.stringify(userSnap.data()?.core?.blockedUnitIds) === JSON.stringify([org.companyDirectoryId]));
    const declSnap = await db.collection('military_declarations').doc(uid).get();
    assert('blocked: military_declarations untouched', !declSnap.exists);
  }
  {
    // Sanity: blocking is scoped by directoryId, not bare unitId — a block
    // on a DIFFERENT org's unit sharing the same raw unitId must NOT block
    // this one.
    const org = await seedMilitaryHierarchy(`org-${run}-block2`);
    const uid = `not-blocked-${run}`;
    await db.collection('users').doc(uid).set({ core: { blockedUnitIds: [`some-other-org__${org.companyUnitId}`] } });
    const result = await computeUnitDeclaration(db, uid, { orgId: org.orgId, unitId: org.companyUnitId });
    assert('block keyed by directoryId, not bare unitId — unrelated org\'s block does not apply here', result.status === 200);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── THE required negative: non-military/non-educational org is rejected ──');
  await clearAll();
  {
    const orgId = `org-${run}-city`;
    await db.collection('authorities').doc(orgId).set({ name: 'עיריית טסט', tenantType: 'municipal' });
    await db.collection('unitDirectory').doc(orgId).set({ name: 'עיריית טסט', parentId: null, level: 'brigade', orgId, unitId: null });
    const unitId = 'dept_1';
    const directoryId = `${orgId}__${unitId}`;
    await db.collection('unitDirectory').doc(directoryId).set({ name: 'מחלקה', parentId: orgId, level: 'battalion', orgId, unitId });

    const uid = `citizen-${run}`;
    await db.collection('users').doc(uid).set({ core: {} });
    const result = await computeUnitDeclaration(db, uid, { orgId, unitId });
    assert('municipal org (even with a real unitDirectory entry): 400', result.status === 400);
    const userSnap = await db.collection('users').doc(uid).get();
    assert('unsupported org: no write happened', userSnap.data()?.core?.tenantId === undefined);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── brigade-only (no unitId) is rejected — deliberate scoping decision ──');
  await clearAll();
  {
    const org = await seedMilitaryHierarchy(`org-${run}-brigade-only`);
    const uid = `brigade-only-${run}`;
    await db.collection('users').doc(uid).set({ core: {} });
    const result = await computeUnitDeclaration(db, uid, { orgId: org.orgId, unitId: undefined });
    assert('brigade-only submission: 400', result.status === 400);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── THE required negative: a mid-flight failure leaves NO partial write ──');
  await clearAll();
  {
    const org = await seedMilitaryHierarchy(`org-${run}-fail`);
    const uid = `will-fail-${run}`;
    await db.collection('users').doc(uid).set({ core: { name: 'לפני-הכשל' } });

    const proto = Object.getPrototypeOf(db);
    const originalBatch = proto.batch;
    proto.batch = function simulateMidFlightFailure(this: FirebaseFirestore.Firestore) {
      const realBatch = originalBatch.call(this);
      const originalCommit = realBatch.commit.bind(realBatch);
      realBatch.commit = () => Promise.reject(new Error('simulated: Firestore batch commit failure'));
      void originalCommit; // never called — the point of this simulation
      return realBatch;
    };

    let result: Awaited<ReturnType<typeof computeUnitDeclaration>>;
    try {
      result = await computeUnitDeclaration(db, uid, { orgId: org.orgId, unitId: org.companyUnitId });
    } finally {
      proto.batch = originalBatch;
    }
    assert('mid-flight commit failure: 500, not a thrown exception', result.status === 500);

    const userSnap = await db.collection('users').doc(uid).get();
    assert('no partial write on users/{uid} — core.tenantId absent', userSnap.data()?.core?.tenantId === undefined);
    assert('pre-existing sibling field untouched either way', userSnap.data()?.core?.name === 'לפני-הכשל');
    const declSnap = await db.collection('military_declarations').doc(uid).get();
    assert('no partial write on military_declarations either', !declSnap.exists);

    // Restored correctly — a normal call works again afterward.
    const uid2 = `after-restore-${run}`;
    await db.collection('users').doc(uid2).set({ core: {} });
    const retryResult = await computeUnitDeclaration(db, uid2, { orgId: org.orgId, unitId: org.companyUnitId });
    assert('after restoring the batch path: a normal call succeeds again', retryResult.status === 200);
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n── Rate limit: uid-based, reusing isRateLimited as-is ────────');
  {
    const uid = `rate-limited-${run}`;
    const window = RATE_LIMITS.unitDeclaration.uidHourly();
    const results: boolean[] = [];
    for (let i = 0; i < window.maxRequests + 1; i++) {
      results.push(await isRateLimited(db, `unit-declaration:${uid}`, window));
    }
    const allButLastAllowed = results.slice(0, -1).every((blocked) => blocked === false);
    const lastBlocked = results[results.length - 1] === true;
    assert(`attempts 1-${window.maxRequests} are NOT rate-limited`, allButLastAllowed);
    assert(`attempt ${window.maxRequests + 1} (over the cap) IS rate-limited`, lastBlocked);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verify-unit-declaration:', err);
  process.exit(1);
});

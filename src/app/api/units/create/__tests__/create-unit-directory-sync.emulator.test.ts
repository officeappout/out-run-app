/**
 * POST /api/units/create — the unitDirectory-sync portion of §31's
 * write-then-read requirement, via the REAL onUnitWrite Cloud Function
 * trigger (03.10.2026, 00-MASTER-PLAN.md §13.81). David's explicit
 * requirement, verbatim: "זו הכתיבה הראשונה אי פעם של parentUnitId בנתיב
 * הזה... §31 חל במלואו... אימות שרשומת unitDirectory נוצרה עם ה-parentId
 * הנכון — לא רק שהיחידה נוצרה." A fake-db test proving computeCreateUnit's
 * own write shape is correct (see the sibling create-unit.emulator.test.ts
 * for exactly that) does NOT prove the thing that actually matters here:
 * does the REAL unitDirectory record onUnitWrite produces end up with the
 * right parentId. onUnitWrite.ts itself is untouched by this round — this
 * suite never asserts anything about its own logic, only about what THIS
 * route hands it as input, observed through the real trigger firing.
 *
 * Requires BOTH emulators running together, sharing one Firestore instance
 * (so the Functions emulator actually sees these writes), with the REAL
 * project id — NOT a fake placeholder:
 *   npm --prefix functions run build
 *   firebase emulators:start --only firestore,functions --project appout-1
 * (firebase.json's emulators.functions port was added for this.) A fake
 * project id makes the Functions emulator log "Unable to fetch project
 * Admin SDK configuration" and admin.firestore.FieldValue comes back
 * undefined inside the trigger's sandboxed runtime — confirmed, not
 * guessed. Still fully local — FIRESTORE_EMULATOR_HOST keeps every actual
 * data operation on this machine; the real id is only needed for the
 * emulator's own config-fetch step.
 *
 * KNOWN, PRE-EXISTING, UNRELATED ENVIRONMENT GAP (found while building
 * this, not caused by it, reported in full in 00-MASTER-PLAN.md §13.81):
 * even with the real project id AND functions/node_modules installed to
 * match functions/package.json's own pinned firebase-admin@^12/
 * firebase-functions@^5 exactly, every onDocumentWritten trigger that
 * uses the LEGACY `admin.firestore.FieldValue` namespaced access (not
 * just onUnitWrite — userPublicSync.ts and onGroupMemberWrite.ts crash
 * identically) throws "Cannot read properties of undefined (reading
 * 'serverTimestamp')" the instant it actually runs inside this machine's
 * Functions emulator — a dependency/runtime incompatibility bigger than
 * this task, not something this route caused or can fix (onUnitWrite is
 * explicitly off-limits this round regardless). This route's OWN code
 * already uses the modern `import { FieldValue } from
 * 'firebase-admin/firestore'` form and is unaffected — this gap is
 * specifically about onUnitWrite's downstream reaction, which is why the
 * three cases below cannot currently complete in THIS environment.
 *
 * beforeAll checks the Functions emulator is reachable (a plain fetch to
 * its own port — a 404 still proves it's up, a connection error doesn't)
 * BEFORE attempting anything that depends on a trigger firing, and throws
 * if it isn't — vitest shows every case below as skipped (not failed) in
 * that case, same established behavior as every other emulator suite in
 * this build. Today that is the expected, default outcome (plain
 * `--only firestore` is what every other suite's own header documents);
 * once the environment gap above is fixed, running with
 * `--only firestore,functions` turns this into a real, passing
 * end-to-end proof without any change to this file.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// computeCreateUnit's own module has no top-level @/lib/firebase-admin
// import, but route.ts (which re-exports it) does via getAdminAuth/
// getAdminDb — same guard every other readiness/units test file in this
// build already carries, needed because vitest resolves the whole module
// graph at import time regardless of which export is actually used.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from compute*() functions'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { computeCreateUnit } from '../route';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

// The real project id — see header comment for why a fake one breaks the
// Functions emulator's Admin SDK config fetch. Still fully local: every
// data operation stays on FIRESTORE_EMULATOR_HOST below, nothing reaches
// production.
const PROJECT_ID = 'appout-1';
const FIRESTORE_HOST = '127.0.0.1:8080';
const FUNCTIONS_HOST = '127.0.0.1:5001';
const TENANT_ID = 'emu-brigade-1';

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${FIRESTORE_HOST}?`);
}

async function assertFunctionsEmulatorReachable(): Promise<void> {
  // Any HTTP response (even a 404 — this exact port has no root route)
  // proves the process is up; a thrown fetch error means it isn't.
  await fetch(`http://${FUNCTIONS_HOST}/`).catch(() => {
    throw new Error(`Functions emulator not reachable at ${FUNCTIONS_HOST} — this suite needs --only firestore,functions, not firestore alone.`);
  });
}

function directoryIdForUnit(tenantId: string, unitId: string): string {
  return `${tenantId}__${unitId}`;
}

/**
 * onUnitWrite is async (a real Cloud Function trigger, not a callback
 * this test invokes directly) — polls until the expected directory doc
 * exists, or fails loudly on timeout rather than letting a slow/dead
 * trigger masquerade as "nothing to assert yet."
 */
async function waitForUnitDirectory(directoryId: string, timeoutMs = 8000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await db.collection('unitDirectory').doc(directoryId).get();
    if (snap.exists) return snap.data() as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`unitDirectory/${directoryId} never appeared within ${timeoutMs}ms — onUnitWrite did not fire or crashed (see this file's header comment for a known environment gap that currently causes exactly this).`);
}

const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: TENANT_ID };

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  await assertFunctionsEmulatorReachable();
  app = initializeApp({ projectId: PROJECT_ID }, `unit-create-dirsync-emulator-test-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
}, 20000);

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('POST /api/units/create — unitDirectory sync via the real onUnitWrite trigger', () => {
  it('no parent chosen (brigade): omits parentUnitId, and unitDirectory.parentId falls back to the bare tenantId — exactly the existing 135/135-battalion shape', async () => {
    const result = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID,
      name: 'גדוד בדיקה א',
      parentUnitId: null,
    });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;

    const dirId = directoryIdForUnit(TENANT_ID, result.body.unitId);
    const dirData = await waitForUnitDirectory(dirId);
    expect(dirData.parentId).toBe(TENANT_ID);
    expect(dirData.level).toBe('battalion');
  });

  it('a real unit as parent: unitDirectory.parentId resolves to that parent\'s own, REAL directory doc (not an orphan)', async () => {
    const battalion = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: 'גדוד בדיקה ב', parentUnitId: null,
    });
    expect(battalion.status).toBe(200);
    if (battalion.status !== 200) return;
    const battalionDirId = directoryIdForUnit(TENANT_ID, battalion.body.unitId);
    await waitForUnitDirectory(battalionDirId); // battalion's own directory entry must exist first

    const company = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: 'פלוגה בדיקה', parentUnitId: battalion.body.unitId,
    });
    expect(company.status).toBe(200);
    if (company.status !== 200) return;

    const companyDirId = directoryIdForUnit(TENANT_ID, company.body.unitId);
    const companyDir = await waitForUnitDirectory(companyDirId);
    expect(companyDir.parentId).toBe(battalionDirId);
    expect(companyDir.level).toBe('company');

    // The parent pointer isn't just a string that happens to match a
    // formula — the REAL directory doc it points to actually exists.
    const parentDirSnap = await db.collection('unitDirectory').doc(companyDir.parentId as string).get();
    expect(parentDirSnap.exists).toBe(true);
  });

  it('the trap: parentUnitId sent as the tenantId itself normalizes to "no parent", never the broken tenantId__tenantId composite', async () => {
    const result = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID,
      name: 'גדוד בדיקה ג',
      parentUnitId: TENANT_ID, // the exact mistake David's trap warns about
    });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;

    const dirId = directoryIdForUnit(TENANT_ID, result.body.unitId);
    const dirData = await waitForUnitDirectory(dirId);
    // The broken shape this test exists to catch: `${TENANT_ID}__${TENANT_ID}`.
    expect(dirData.parentId).not.toBe(directoryIdForUnit(TENANT_ID, TENANT_ID));
    expect(dirData.parentId).toBe(TENANT_ID);
  });
});

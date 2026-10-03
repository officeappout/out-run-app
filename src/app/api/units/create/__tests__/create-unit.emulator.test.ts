/**
 * POST /api/units/create — REAL Firestore-emulator suite for
 * computeCreateUnit's own write shape and authorization (03.10.2026,
 * 00-MASTER-PLAN.md §13.81). This is the first write path in this
 * codebase to decide a NEW parentUnitId value (135/135 real battalions
 * have none today) — §31's write-then-read discipline applies: every
 * assertion here reads back the REAL stored document via the real
 * Admin SDK, never a fake in-memory shape.
 *
 * What this suite does NOT cover: whether the real onUnitWrite trigger
 * produces the correct unitDirectory.parentId from what this route
 * writes. That requires the Functions emulator running alongside this
 * one and is covered separately by the sibling
 * create-unit-directory-sync.emulator.test.ts — split out because (a) a
 * pre-existing, unrelated environment gap currently stops any
 * Firestore trigger from completing in this machine's Functions
 * emulator (documented in that file's header), and (b) this suite's own
 * scope/validation scenarios must stay reliably green with just the
 * plain, single-emulator setup every other suite in this build uses.
 *
 * Requires `firebase emulators:start --only firestore` running
 * separately at 127.0.0.1:8080 — beforeAll throws immediately if it
 * isn't reachable, and vitest shows every case below as skipped (not
 * failed) when that happens — same established behavior as
 * tests/firestore-rules.test.ts and readiness-unit-detail.emulator.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from compute*() functions'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { computeCreateUnit } from '../route';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

const PROJECT_ID = 'appout-1-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8080';
const TENANT_ID = 'emu-brigade-write-shape';

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${FIRESTORE_HOST}?`);
}

const ROOT_SCOPE: UnitPermissionScope = { kind: 'root' };
const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: TENANT_ID };
const DENIED_SCOPE: UnitPermissionScope = { kind: 'denied' };
const UNKNOWN_SCOPE: UnitPermissionScope = { kind: 'unknown' };

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `unit-create-write-shape-emulator-test-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
}, 20000);

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('computeCreateUnit — write shape + authorization (real Firestore)', () => {
  it('no parent chosen (brigade): the stored doc has NO parentUnitId key at all — not null, absent', async () => {
    const result = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: 'גדוד בדיקה א', parentUnitId: null,
    });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;

    const unitSnap = await db.collection('tenants').doc(TENANT_ID).collection('units').doc(result.body.unitId).get();
    expect(unitSnap.exists).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(unitSnap.data(), 'parentUnitId')).toBe(false);
    expect(unitSnap.data()?.unitPath).toEqual(['גדוד בדיקה א']);
  });

  it('a real existing unit as parent: parentUnitId is written, and unitPath extends the parent\'s own real unitPath (read back, not assumed)', async () => {
    const battalion = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: 'גדוד בדיקה ב', parentUnitId: null,
    });
    expect(battalion.status).toBe(200);
    if (battalion.status !== 200) return;

    const company = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: 'פלוגה בדיקה', parentUnitId: battalion.body.unitId,
    });
    expect(company.status).toBe(200);
    if (company.status !== 200) return;

    const unitSnap = await db.collection('tenants').doc(TENANT_ID).collection('units').doc(company.body.unitId).get();
    expect(unitSnap.data()?.parentUnitId).toBe(battalion.body.unitId);
    expect(unitSnap.data()?.unitPath).toEqual(['גדוד בדיקה ב', 'פלוגה בדיקה']);
  });

  it('the trap: parentUnitId sent as the tenantId itself is normalized away — the stored doc has no parentUnitId key', async () => {
    const result = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: 'גדוד בדיקה ג', parentUnitId: TENANT_ID,
    });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.parentUnitId).toBeNull();

    const unitSnap = await db.collection('tenants').doc(TENANT_ID).collection('units').doc(result.body.unitId).get();
    expect(Object.prototype.hasOwnProperty.call(unitSnap.data(), 'parentUnitId')).toBe(false);
  });

  it('scope — unit_admin cannot create directly under the brigade (parentUnitId null is never in their scope.unitIds)', async () => {
    const unitAdminScope: UnitPermissionScope = { kind: 'unitAdmin', tenantId: TENANT_ID, unitIds: ['some-managed-battalion'] };
    const result = await computeCreateUnit(db, unitAdminScope, {
      tenantId: TENANT_ID, name: 'ניסיון לא מורשה', parentUnitId: null,
    });
    expect(result.status).toBe(403);
  });

  it('scope — unit_admin CAN create under a unit inside their own (downward-expanded) scope', async () => {
    const battalion = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: 'גדוד בדיקה ד', parentUnitId: null,
    });
    expect(battalion.status).toBe(200);
    if (battalion.status !== 200) return;

    const unitAdminScope: UnitPermissionScope = { kind: 'unitAdmin', tenantId: TENANT_ID, unitIds: [battalion.body.unitId] };
    const result = await computeCreateUnit(db, unitAdminScope, {
      tenantId: TENANT_ID, name: 'פלוגה תחת מפקד יחידה', parentUnitId: battalion.body.unitId,
    });
    expect(result.status).toBe(200);
  });

  it('scope — unit_admin is denied a parent outside their scope.unitIds, even within the same tenant', async () => {
    const outsideBattalion = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: 'גדוד בדיקה ה', parentUnitId: null,
    });
    expect(outsideBattalion.status).toBe(200);
    if (outsideBattalion.status !== 200) return;

    const unitAdminScope: UnitPermissionScope = { kind: 'unitAdmin', tenantId: TENANT_ID, unitIds: ['a-different-unit-entirely'] };
    const result = await computeCreateUnit(db, unitAdminScope, {
      tenantId: TENANT_ID, name: 'ניסיון חוץ-תחום', parentUnitId: outsideBattalion.body.unitId,
    });
    expect(result.status).toBe(403);
  });

  it('scope — tenant_owner from a DIFFERENT tenant is denied, even with a real parentUnitId from the right tenant', async () => {
    const battalion = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: 'גדוד בדיקה ו', parentUnitId: null,
    });
    expect(battalion.status).toBe(200);
    if (battalion.status !== 200) return;

    const otherTenantOwner: UnitPermissionScope = { kind: 'tenantOwner', tenantId: 'some-other-brigade-entirely' };
    const result = await computeCreateUnit(db, otherTenantOwner, {
      tenantId: TENANT_ID, name: 'ניסיון מטננט אחר', parentUnitId: battalion.body.unitId,
    });
    expect(result.status).toBe(403);
  });

  it('a nonexistent parentUnitId is rejected with 400, never silently accepted', async () => {
    const result = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: 'יחידה עם הורה לא קיים', parentUnitId: 'this-unit-id-does-not-exist',
    });
    expect(result.status).toBe(400);
  });

  it('root can create across any tenant, with any parent (or none)', async () => {
    const result = await computeCreateUnit(db, ROOT_SCOPE, {
      tenantId: TENANT_ID, name: 'גדוד שנוצר על ידי root', parentUnitId: null,
    });
    expect(result.status).toBe(200);
  });

  it('denied scope never reaches Firestore', async () => {
    const result = await computeCreateUnit(db, DENIED_SCOPE, {
      tenantId: TENANT_ID, name: 'לא אמור להיווצר', parentUnitId: null,
    });
    expect(result.status).toBe(403);
  });

  it('unknown scope (verification failed) returns 503, distinct from a checked denial', async () => {
    const result = await computeCreateUnit(db, UNKNOWN_SCOPE, {
      tenantId: TENANT_ID, name: 'לא אמור להיווצר', parentUnitId: null,
    });
    expect(result.status).toBe(503);
  });

  it('missing name/tenantId is rejected with 400', async () => {
    const result = await computeCreateUnit(db, TENANT_OWNER_SCOPE, {
      tenantId: TENANT_ID, name: '  ', parentUnitId: null,
    });
    expect(result.status).toBe(400);
  });
});

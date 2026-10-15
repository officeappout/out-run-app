import { describe, it, expect, beforeEach, vi } from 'vitest';

// 15.10.2026 (owner, explicit) — the chief fitness officer outranks every
// brigade officer, so he may appoint brigade officers (tenant_owner) and
// unit officers (unit_admin) — only inside the brigades of his own
// vertical scope. Everyone else keeps the exact rules they had.

vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => { throw new Error('not used'); },
  getAdminDb: () => { throw new Error('not used'); },
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromDate: (d: Date) => ({ __op: 'timestamp', ms: d.getTime() }) },
  FieldValue: { serverTimestamp: () => ({ __op: 'serverTimestamp' }) },
}));

const scopeByUid: Record<string, unknown> = {};
vi.mock('@/lib/unitPermissionScope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/unitPermissionScope')>();
  return {
    ...actual,
    resolveUnitPermissionScope: async (uid: string) => scopeByUid[uid] ?? { kind: 'denied' },
  };
});

import { computeCreateInvitation } from '../route';

const CHIEF = { uid: 'chief-uid', email: 'chief@example.com' };
const OFFICER = { uid: 'officer-uid', email: 'officer@example.com' };

/** authorities/{id} and tenants/{t}/units/{u} docs, plus a log of added invitations */
function makeFakeDb(docs: Record<string, Record<string, unknown>>) {
  const added: Record<string, unknown>[] = [];
  const ref = (path: string) => ({
    get: async () => ({ exists: path in docs, data: () => docs[path] }),
    collection: (name: string) => col(`${path}/${name}`),
  });
  const col = (path: string) => ({
    doc: (id: string) => ref(`${path}/${id}`),
    async add(data: Record<string, unknown>) {
      added.push(data);
      return { id: `generated-${added.length}` };
    },
  });
  return {
    db: { collection: (name: string) => col(name) } as unknown as import('firebase-admin/firestore').Firestore,
    added,
  };
}

const DOCS = {
  'authorities/mil-1': { type: 'military_unit' },
  'authorities/mil-2': { type: 'military_unit' },
  'authorities/school-1': { type: 'school' },
  'tenants/mil-1/units/u-1': { name: 'פלוגה א' },
  'tenants/mil-2/units/u-2': { name: 'פלוגה ב' },
  'tenants/school-1/units/c-1': { name: 'כיתה א' },
};

beforeEach(() => {
  for (const k of Object.keys(scopeByUid)) delete scopeByUid[k];
  scopeByUid[CHIEF.uid] = { kind: 'vertical', vertical: 'military', authorityIds: ['mil-1', 'mil-2'] };
  scopeByUid[OFFICER.uid] = { kind: 'tenantOwner', tenantId: 'mil-1' };
});

describe('chief fitness officer — appointing a brigade officer (tenant_owner)', () => {
  it('is allowed for a brigade in his scope', async () => {
    const { db, added } = makeFakeDb(DOCS);
    const r = await computeCreateInvitation(db, CHIEF, { email: 'b@example.com', role: 'tenant_owner', tenantId: 'mil-2' });
    expect(r.status).toBe(200);
    expect(added[0].tenantId).toBe('mil-2');
  });

  it('is denied for a tenant outside his scope (a school)', async () => {
    const { db, added } = makeFakeDb(DOCS);
    const r = await computeCreateInvitation(db, CHIEF, { email: 'b@example.com', role: 'tenant_owner', tenantId: 'school-1' });
    expect(r.status).toBe(403);
    expect(added.length).toBe(0);
  });

  it('stays denied for a brigade officer (only root and the chief appoint brigade officers)', async () => {
    const { db, added } = makeFakeDb(DOCS);
    const r = await computeCreateInvitation(db, OFFICER, { email: 'b@example.com', role: 'tenant_owner', tenantId: 'mil-1' });
    expect(r.status).toBe(403);
    expect(added.length).toBe(0);
  });
});

describe('chief fitness officer — appointing a unit officer (unit_admin)', () => {
  it('is allowed for a unit of a brigade in his scope (he names the brigade)', async () => {
    const { db, added } = makeFakeDb(DOCS);
    const r = await computeCreateInvitation(db, CHIEF, { email: 'u@example.com', role: 'unit_admin', tenantId: 'mil-2', unitId: 'u-2' });
    expect(r.status).toBe(200);
    expect(added[0]).toMatchObject({ tenantId: 'mil-2', unitId: 'u-2' });
  });

  it('is denied outside his scope, and for a unit that isn\'t in the named brigade', async () => {
    const { db, added } = makeFakeDb(DOCS);
    expect((await computeCreateInvitation(db, CHIEF, { email: 'u@example.com', role: 'unit_admin', tenantId: 'school-1', unitId: 'c-1' })).status).toBe(403);
    expect((await computeCreateInvitation(db, CHIEF, { email: 'u@example.com', role: 'unit_admin', tenantId: 'mil-1', unitId: 'u-2' })).status).toBe(403);
    expect(added.length).toBe(0);
  });

  it('a brigade officer still invites only into their own brigade, whatever tenantId is sent', async () => {
    const { db, added } = makeFakeDb(DOCS);
    const own = await computeCreateInvitation(db, OFFICER, { email: 'u@example.com', role: 'unit_admin', tenantId: 'mil-2', unitId: 'u-1' });
    expect(own.status).toBe(200);
    expect(added[0].tenantId).toBe('mil-1');
    const other = await computeCreateInvitation(db, OFFICER, { email: 'u@example.com', role: 'unit_admin', unitId: 'u-2' });
    expect(other.status).toBe(403);
  });
});

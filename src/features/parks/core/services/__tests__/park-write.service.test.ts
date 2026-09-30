import { describe, it, expect } from 'vitest';
import {
  resolveParkWriteCaller,
  computeParkCreate,
  computeParkUpdate,
  type ParkWriteCaller,
} from '../park-write.service';

// David's explicit mandate (30.09.2026): these tests must prove DENIAL,
// not just acceptance — a server route bypasses firestore.rules entirely,
// there is no safety net underneath it. Every scenario below is one he
// named directly.

interface FakeAuthority {
  id: string;
  managerIds?: string[];
}
interface FakePark {
  id: string;
  authorityId?: string | null;
  [key: string]: unknown;
}
interface FakeUser {
  id: string;
  core?: { name?: string };
}

function makeFakeDb(seed: { authorities?: FakeAuthority[]; parks?: FakePark[]; users?: FakeUser[] }) {
  const authorities = new Map((seed.authorities ?? []).map((a) => [a.id, a]));
  const parks = new Map((seed.parks ?? []).map((p) => [p.id, p]));
  const users = new Map((seed.users ?? []).map((u) => [u.id, u]));
  const updates: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];
  const created: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];
  let nextId = 1;

  function docSnap<T extends { id: string }>(store: Map<string, T>, id: string) {
    const d = store.get(id);
    return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) };
  }

  function collection(name: string) {
    const store = name === 'authorities' ? authorities : name === 'parks' ? parks : name === 'users' ? users : new Map();
    return {
      doc(id: string) {
        return {
          get: async () => docSnap(store as Map<string, any>, id),
          update: async (data: Record<string, unknown>) => {
            updates.push({ collection: name, id, data });
            const existing = (store as Map<string, any>).get(id) ?? { id };
            (store as Map<string, any>).set(id, { ...existing, ...data });
          },
        };
      },
      add: async (data: Record<string, unknown>) => {
        const id = `${name}_generated_${nextId++}`;
        created.push({ collection: name, id, data });
        (store as Map<string, any>).set(id, { id, ...data });
        return { id };
      },
      where(field: string, op: string, value: unknown) {
        if (field !== 'managerIds' || op !== 'array-contains') throw new Error(`unexpected where: ${field} ${op}`);
        return {
          limit(_n: number) {
            return {
              get: async () => {
                const matches = Array.from(authorities.values()).filter((a) => Array.isArray(a.managerIds) && a.managerIds.includes(value as string));
                return { empty: matches.length === 0, docs: matches.map((a) => docSnap(authorities, a.id)) };
              },
            };
          },
        };
      },
    };
  }

  return { collection, updates, created } as unknown as import('firebase-admin/firestore').Firestore & { updates: typeof updates; created: typeof created };
}

const CTX = { tokenEmail: 'officer@example.com', sourceIp: '203.0.113.1' };

describe('resolveParkWriteCaller', () => {
  it('root (admin:true) → kind root, regardless of scope', async () => {
    const db = makeFakeDb({});
    const caller = await resolveParkWriteCaller(db, 'root-uid', true, undefined);
    expect(caller).toEqual({ kind: 'root', uid: 'root-uid' });
  });

  it('authority_manager scope with a real authorities match → kind authority_manager, real authorityId', async () => {
    const db = makeFakeDb({ authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }] });
    const caller = await resolveParkWriteCaller(db, 'am-uid', false, 'authority_manager');
    expect(caller).toEqual({ kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' });
  });

  it('tenant_owner scope → denied (no evidence this role has any park involvement)', async () => {
    const db = makeFakeDb({});
    const caller = await resolveParkWriteCaller(db, 'to-uid', false, 'tenant_owner');
    expect(caller).toEqual({ kind: 'denied' });
  });

  it('unit_admin scope → denied', async () => {
    const db = makeFakeDb({});
    const caller = await resolveParkWriteCaller(db, 'ua-uid', false, 'unit_admin');
    expect(caller).toEqual({ kind: 'denied' });
  });

  it('authenticated user with NO relevant role/scope at all → denied', async () => {
    const db = makeFakeDb({});
    const caller = await resolveParkWriteCaller(db, 'random-uid', false, undefined);
    expect(caller).toEqual({ kind: 'denied' });
  });

  it('scope says authority_manager but the authorities lookup finds nothing (stale/forged claim) → denied, not trusted blindly', async () => {
    const db = makeFakeDb({ authorities: [] });
    const caller = await resolveParkWriteCaller(db, 'ghost-uid', false, 'authority_manager');
    expect(caller).toEqual({ kind: 'denied' });
  });
});

describe('computeParkCreate', () => {
  it('denied caller → 403, no park created', async () => {
    const db = makeFakeDb({});
    const result = await computeParkCreate(db, { kind: 'denied' }, { name: 'X', location: { lat: 1, lng: 1 } }, CTX);
    expect(result.status).toBe(403);
    expect(db.created.length).toBe(0);
  });

  it('authority_manager creates in their OWN scope → 200, authorityId forced to their own regardless of body', async () => {
    const db = makeFakeDb({ authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }] });
    const caller: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
    const result = await computeParkCreate(db, caller, { name: 'New Park', location: { lat: 32.8, lng: 34.9 }, authorityId: 'city-tel-aviv' }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const created = db.created.find((c) => c.id === result.body.parkId);
    expect(created?.data.authorityId).toBe('city-haifa'); // NOT city-tel-aviv from the body
    expect(created?.data.contentStatus).toBe('published'); // David's decision — no pending_review
    expect(created?.data.published).toBe(true);
  });

  it('authority_manager sends a disallowed field (e.g. rating) → 400, nothing created', async () => {
    const db = makeFakeDb({ authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }] });
    const caller: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
    const result = await computeParkCreate(db, caller, { name: 'New Park', location: { lat: 32.8, lng: 34.9 }, rating: 5 }, CTX);
    expect(result.status).toBe(400);
    expect(db.created.length).toBe(0);
  });

  // 30.09.2026, David's shape-verification round — hasWaterFountain (and
  // its "MapPark-specific features" sibling flags) was missing from the
  // FIRST version of the allowlist, a real gap caught by cross-checking
  // against the existing proven write paths (createPark/
  // buildParkUpdateFields), not by this suite alone — a fake db proves
  // the LOGIC decides correctly, never that the field names it reads/
  // writes are real. This locks the fix in as a regression test.
  it('authority_manager sends hasWaterFountain (a real, editable Park field missed on the first pass) → 200, accepted', async () => {
    const db = makeFakeDb({ authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }] });
    const caller: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
    const result = await computeParkCreate(db, caller, { name: 'New Park', location: { lat: 32.8, lng: 34.9 }, hasWaterFountain: true, neighborhoodId: 'nb-1' }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const created = db.created.find((c) => c.id === result.body.parkId);
    expect(created?.data.hasWaterFountain).toBe(true);
    expect(created?.data.neighborhoodId).toBe('nb-1');
  });

  it('root creates with an explicit, real authorityId → 200, that authorityId is used', async () => {
    const db = makeFakeDb({ authorities: [{ id: 'city-haifa' }] });
    const result = await computeParkCreate(db, { kind: 'root', uid: 'root-uid' }, { name: 'New Park', location: { lat: 32.8, lng: 34.9 }, authorityId: 'city-haifa' }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const created = db.created.find((c) => c.id === result.body.parkId);
    expect(created?.data.authorityId).toBe('city-haifa');
    expect(created?.data.origin).toBe('super_admin');
  });

  // 30.09.2026 — caught wiring up the real callers (stage 3): ParkForm.tsx/
  // LocationEditor.tsx's data objects still carry stale client-SDK-era
  // fields (createdAt set to Firebase's serverTimestamp() sentinel, which
  // JSON-serializes to garbage; contentStatus/published/origin/
  // createdByUser from the OLD pending_review branch). Root's "full field
  // access" must not let ANY of these override the server-derived values
  // — not even for a trusted caller, since the caller in practice is
  // stale/irrelevant client code, not a deliberate admin action.
  it('root sends stale client-SDK fields (createdAt sentinel, contentStatus, origin, createdByUser) → all silently ignored, server-derived values win', async () => {
    const db = makeFakeDb({ authorities: [{ id: 'city-haifa' }] });
    const result = await computeParkCreate(db, { kind: 'root', uid: 'root-uid' }, {
      name: 'New Park',
      location: { lat: 32.8, lng: 34.9 },
      authorityId: 'city-haifa',
      createdAt: { _methodName: 'serverTimestamp' }, // what JSON.stringify(serverTimestamp()) actually looks like
      contentStatus: 'pending_review', // an attempt to override the server's decision
      origin: 'some-forged-value',
      createdByUser: 'someone-else-entirely',
    }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const created = db.created.find((c) => c.id === result.body.parkId);
    expect(created?.data.contentStatus).toBe('published'); // not 'pending_review'
    expect(created?.data.origin).toBe('super_admin'); // not the forged value
    expect(created?.data.createdByUser).toBe('root-uid'); // not 'someone-else-entirely'
    expect(created?.data.createdAt).toBeInstanceOf(Date); // not the sentinel garbage
  });

  it('root creates with an authorityId that does not exist → 400, nothing created', async () => {
    const db = makeFakeDb({ authorities: [] });
    const result = await computeParkCreate(db, { kind: 'root', uid: 'root-uid' }, { name: 'New Park', location: { lat: 32.8, lng: 34.9 }, authorityId: 'no-such-city' }, CTX);
    expect(result.status).toBe(400);
    expect(db.created.length).toBe(0);
  });

  it('a successful create writes an audit_logs row in the SAME call — not a separate step', async () => {
    const db = makeFakeDb({ authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }], users: [{ id: 'am-uid', core: { name: 'Officer Cohen' } }] });
    const caller: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
    const result = await computeParkCreate(db, caller, { name: 'New Park', location: { lat: 32.8, lng: 34.9 } }, CTX);
    expect(result.status).toBe(200);
    const auditRow = db.created.find((c) => c.collection === 'audit_logs');
    expect(auditRow).toBeDefined();
    expect(auditRow?.data.actionType).toBe('CREATE');
    expect(auditRow?.data.targetEntity).toBe('Park');
    expect(auditRow?.data.adminId).toBe('am-uid');
    expect(auditRow?.data.adminName).toBe('Officer Cohen');
  });
});

describe('computeParkUpdate — the mandatory denial scenarios', () => {
  it('authority_manager editing a park belonging to a DIFFERENT authority → 403, nothing updated', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-tel-aviv', name: 'TLV Park' }],
    });
    const caller: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
    const result = await computeParkUpdate(db, caller, 'park-1', { name: 'Hijacked' }, CTX);
    expect(result.status).toBe(403);
    expect(db.updates.length).toBe(0);
  });

  it('authority_manager editing an ORPHAN park (authorityId: null) → 403, cannot claim it by editing', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-orphan', authorityId: null, name: 'Unassigned Park' }],
    });
    const caller: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
    const result = await computeParkUpdate(db, caller, 'park-orphan', { name: 'Claimed' }, CTX);
    expect(result.status).toBe(403);
    expect(db.updates.length).toBe(0);
  });

  it('authority_manager sends authorityId in the body → the field is dropped, never written, rest of a valid request still succeeds', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name' }],
    });
    const caller: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
    const result = await computeParkUpdate(db, caller, 'park-1', { name: 'New Name', authorityId: 'city-tel-aviv' }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.updatedFields).toContain('name');
    expect(result.body.updatedFields).not.toContain('authorityId');
    const update = db.updates.find((u) => u.id === 'park-1');
    expect(update?.data.name).toBe('New Name');
    expect(Object.prototype.hasOwnProperty.call(update?.data ?? {}, 'authorityId')).toBe(false);
  });

  it('authority_manager sends a field NOT in the allowlist (e.g. rating) → 400, and NOTHING is written — not even the allowed fields in the same request', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name' }],
    });
    const caller: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
    const result = await computeParkUpdate(db, caller, 'park-1', { name: 'New Name', rating: 5 }, CTX);
    expect(result.status).toBe(400);
    expect(db.updates.length).toBe(0);
  });

  // 'published' specifically is NOT rejected — it's one of
  // ALWAYS_SERVER_CONTROLLED_FIELDS, silently dropped for every caller
  // (root included), never a 400. Distinct from a genuinely-disallowed
  // content field like `rating` above, which IS rejected for
  // authority_manager. Two different reasons a field doesn't get
  // written — worth a test each so they don't get conflated later.
  it('authority_manager sends `published` (a server-controlled field, not merely an unlisted one) → silently dropped, the rest of a valid request still succeeds', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name' }],
    });
    const caller: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
    const result = await computeParkUpdate(db, caller, 'park-1', { name: 'New Name', published: false }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.updatedFields).not.toContain('published');
    const update = db.updates.find((u) => u.id === 'park-1');
    expect(Object.prototype.hasOwnProperty.call(update?.data ?? {}, 'published')).toBe(false);
  });

  it('authenticated user with no relevant role at all → 403', async () => {
    const db = makeFakeDb({ parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name' }] });
    const result = await computeParkUpdate(db, { kind: 'denied' }, 'park-1', { name: 'Hacked' }, CTX);
    expect(result.status).toBe(403);
    expect(db.updates.length).toBe(0);
  });

  it('root edits ANY park, including reassigning authorityId → 200, both applied', async () => {
    const db = makeFakeDb({ parks: [{ id: 'park-1', authorityId: 'city-tel-aviv', name: 'Old Name' }] });
    const result = await computeParkUpdate(db, { kind: 'root', uid: 'root-uid' }, 'park-1', { name: 'Reassigned', authorityId: 'city-haifa' }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.updatedFields).toContain('authorityId');
    const update = db.updates.find((u) => u.id === 'park-1');
    expect(update?.data.authorityId).toBe('city-haifa');
    expect(update?.data.name).toBe('Reassigned');
  });

  it('root sends stale client-SDK fields on update (createdAt, createdByUser, origin) → silently ignored, never written', async () => {
    const db = makeFakeDb({ parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name' }] });
    const result = await computeParkUpdate(db, { kind: 'root', uid: 'root-uid' }, 'park-1', {
      name: 'New Name',
      createdAt: { _methodName: 'serverTimestamp' },
      createdByUser: 'someone-else',
      origin: 'forged',
    }, CTX);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.updatedFields).not.toContain('createdAt');
    expect(result.body.updatedFields).not.toContain('createdByUser');
    expect(result.body.updatedFields).not.toContain('origin');
    const update = db.updates.find((u) => u.id === 'park-1');
    expect(Object.prototype.hasOwnProperty.call(update?.data ?? {}, 'createdByUser')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(update?.data ?? {}, 'origin')).toBe(false);
  });

  it('root edits a park that does not exist → 404', async () => {
    const db = makeFakeDb({});
    const result = await computeParkUpdate(db, { kind: 'root', uid: 'root-uid' }, 'no-such-park', { name: 'X' }, CTX);
    expect(result.status).toBe(404);
  });

  it('authority_manager editing THEIR OWN authority\'s park with only allowed fields → 200, and an audit row is written in the same call', async () => {
    const db = makeFakeDb({
      authorities: [{ id: 'city-haifa', managerIds: ['am-uid'] }],
      parks: [{ id: 'park-1', authorityId: 'city-haifa', name: 'Old Name', facilityType: 'gym_park' }],
      users: [{ id: 'am-uid', core: { name: 'Officer Cohen' } }],
    });
    const caller: ParkWriteCaller = { kind: 'authority_manager', uid: 'am-uid', authorityId: 'city-haifa' };
    const result = await computeParkUpdate(db, caller, 'park-1', { name: 'New Name' }, CTX);
    expect(result.status).toBe(200);
    const auditRow = db.created.find((c) => c.collection === 'audit_logs');
    expect(auditRow).toBeDefined();
    expect(auditRow?.data.actionType).toBe('UPDATE');
    expect(auditRow?.data.targetId).toBe('park-1');
    expect((auditRow?.data.oldValue as string)?.includes('Old Name')).toBe(true);
  });
});

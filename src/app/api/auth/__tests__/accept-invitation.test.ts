import { describe, it, expect, beforeEach, vi } from 'vitest';

// P1-3 item 3 (00-MASTER-PLAN.md §13.49): accept-invitation used to write
// ONLY the new role's own core fields, never clearing a previous role's —
// exactly what left the §13.47 test account's core.authorityId clobbered
// (Tel Aviv-Yafo -> a military tenant) with the OLD authorities.managerIds
// grant left dangling. This suite drives the real transaction logic
// through a minimal in-memory Firestore fake (dot-path updates + the real
// FieldValue sentinel shapes), verifying: (1) every acceptance writes the
// COMPLETE role-defining field bundle, clearing whatever doesn't apply to
// the new role, and (2) a stale prior authority/unit managerIds grant gets
// removed in the same transaction — without ever touching a "which role
// wins" multi-role rule (David explicitly deprioritized that, 28.09.2026).
//
// isCreatorEntitledForRole's unit_admin branch short-circuits on
// isRootAdmin(inv.createdByEmail) BEFORE ever calling
// resolveUnitPermissionScope — so every fixture below uses a real,
// already-documented root email (office@appout.co.il, from CLAUDE.md's
// own "Owner: David, Calisthenics Ltd" line) as createdByEmail, letting
// every role path run without needing to mock collectionGroup queries.

type Sentinel =
  | { __op: 'delete' }
  | { __op: 'arrayUnion'; values: unknown[] }
  | { __op: 'arrayRemove'; values: unknown[] }
  | { __op: 'serverTimestamp' };

function isSentinel(v: unknown): v is Sentinel {
  return typeof v === 'object' && v !== null && '__op' in (v as Record<string, unknown>);
}

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ __op: 'serverTimestamp' }) as Sentinel,
    delete: () => ({ __op: 'delete' }) as Sentinel,
    arrayUnion: (...values: unknown[]) => ({ __op: 'arrayUnion', values }) as Sentinel,
    arrayRemove: (...values: unknown[]) => ({ __op: 'arrayRemove', values }) as Sentinel,
  },
}));

// The route file statically imports getAdminAuth/getAdminDb from
// @/lib/firebase-admin (used only by its POST handler, not by
// computeAcceptInvitation — db is passed in directly below) — but that
// module has a top-level `import 'server-only'`, which throws outside a
// real Next.js server-component boundary the moment the module loads,
// regardless of which of its exports actually get called. Mocking it
// prevents the real module (and its server-only guard) from loading at
// all — matches the convention in
// src/app/api/challenge/leaderboard/__tests__/route.test.ts.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => { throw new Error('not used — computeAcceptInvitation takes db directly'); },
  getAdminDb: () => { throw new Error('not used — computeAcceptInvitation takes db directly'); },
}));

import { computeAcceptInvitation } from '../accept-invitation/route';

const store = new Map<string, Record<string, unknown>>();

function setDotPath(obj: Record<string, unknown>, dotKey: string, value: unknown) {
  const parts = dotKey.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (isSentinel(value)) {
    if (value.__op === 'delete') {
      delete cur[last];
      return;
    }
    if (value.__op === 'arrayUnion') {
      const arr = Array.isArray(cur[last]) ? (cur[last] as unknown[]) : [];
      cur[last] = Array.from(new Set([...arr, ...value.values]));
      return;
    }
    if (value.__op === 'arrayRemove') {
      const arr = Array.isArray(cur[last]) ? (cur[last] as unknown[]) : [];
      cur[last] = arr.filter((x) => !value.values.includes(x));
      return;
    }
    if (value.__op === 'serverTimestamp') {
      cur[last] = 'SERVER_TIMESTAMP';
      return;
    }
  }
  cur[last] = value;
}

function makeDocRef(path: string) {
  return {
    id: path.split('/').pop()!,
    path,
    collection(name: string) {
      return makeCollectionRef(`${path}/${name}`);
    },
    // Standalone .get() — used before entering the transaction (e.g. the
    // invitation-doc read at the top of computeAcceptInvitation), distinct
    // from tx.get() used inside it. Both read the same store.
    async get() {
      const data = store.get(path);
      return { exists: data !== undefined, data: () => data, id: path.split('/').pop()! };
    },
  };
}
function makeCollectionRef(path: string) {
  return {
    doc(id: string) {
      return makeDocRef(`${path}/${id}`);
    },
  };
}

function makeFakeDb() {
  return {
    collection(name: string) {
      return makeCollectionRef(name);
    },
    async runTransaction(fn: (tx: unknown) => Promise<unknown>) {
      const tx = {
        async get(ref: { path: string; id: string }) {
          const data = store.get(ref.path);
          return { exists: data !== undefined, data: () => data, id: ref.id, ref };
        },
        update(ref: { path: string }, patch: Record<string, unknown>) {
          if (!store.has(ref.path)) throw new Error(`update() on missing doc: ${ref.path}`);
          const doc = { ...(store.get(ref.path) as Record<string, unknown>) };
          for (const [key, value] of Object.entries(patch)) setDotPath(doc, key, value);
          store.set(ref.path, doc);
        },
        set(ref: { path: string }, data: Record<string, unknown>) {
          store.set(ref.path, JSON.parse(JSON.stringify(data, (_k, v) => (isSentinel(v) ? undefined : v))));
        },
      };
      return fn(tx);
    },
  } as unknown as import('firebase-admin/firestore').Firestore;
}

const ROOT_EMAIL = 'office@appout.co.il'; // real, already-public in CLAUDE.md — not a test secret

function seedInvitation(id: string, data: Record<string, unknown>) {
  store.set(`admin_invitations/${id}`, {
    isUsed: false,
    expiresAt: { toMillis: () => Date.now() + 100_000 },
    createdByEmail: ROOT_EMAIL,
    ...data,
  });
}

function seedUser(uid: string, core: Record<string, unknown>) {
  store.set(`users/${uid}`, { core });
}

const CALLER = { uid: 'caller-1', email: 'officer@example.com', emailVerified: true };

describe('computeAcceptInvitation — write-completeness + stale managerIds cleanup (P1-3 item 3)', () => {
  beforeEach(() => {
    store.clear();
  });

  it('the exact §13.47 incident: prior authority_manager accepts a unit_admin invite — authorityId is fully replaced, old authorities.managerIds grant is removed, new unit grant is added', async () => {
    const db = makeFakeDb();
    seedUser(CALLER.uid, { authorityId: 'tel-aviv', email: CALLER.email, isApproved: true });
    store.set('authorities/tel-aviv', { managerIds: [CALLER.uid] });
    store.set('tenants/brigade-810/units/unit-9307', { managerIds: [], unitPath: ['brigade-810', 'unit-9307'] });
    seedInvitation('inv-1', {
      role: 'unit_admin',
      email: CALLER.email,
      tenantId: 'brigade-810',
      unitId: 'unit-9307',
      createdBy: 'root-uid',
    });

    const result = await computeAcceptInvitation(db, CALLER, 'inv-1');

    expect(result.status).toBe(200);
    const user = store.get(`users/${CALLER.uid}`)!;
    const core = user.core as Record<string, unknown>;
    expect(core.authorityId).toBe('brigade-810'); // NOT tel-aviv anymore
    expect(core.tenantId).toBe('brigade-810');
    expect(core.unitId).toBe('unit-9307');
    // Complete-bundle write: fields no other role touches must be absent.
    expect(core.isTenantOwner).toBeUndefined();
    expect(core.tenantType).toBeUndefined();
    expect(core.allowedSections).toBeUndefined();
    expect(core.teamRole).toBeUndefined();

    const staleAuthority = store.get('authorities/tel-aviv')!;
    expect((staleAuthority.managerIds as string[])).not.toContain(CALLER.uid);

    const newUnit = store.get('tenants/brigade-810/units/unit-9307')!;
    expect((newUnit.managerIds as string[])).toContain(CALLER.uid);
  });

  it('prior tenant_owner (core.tenantId + isTenantOwner, no core.authorityId) accepting authority_manager — the tenant_owner grant is still found and cleaned', async () => {
    const db = makeFakeDb();
    seedUser(CALLER.uid, { tenantId: 'brigade-810', isTenantOwner: true, tenantType: 'military', email: CALLER.email });
    store.set('authorities/brigade-810', { managerIds: [CALLER.uid] });
    store.set('authorities/haifa', { managerIds: [] });
    seedInvitation('inv-2', { role: 'authority_manager', email: CALLER.email, authorityId: 'haifa' });

    const result = await computeAcceptInvitation(db, CALLER, 'inv-2');

    expect(result.status).toBe(200);
    const core = (store.get(`users/${CALLER.uid}`)!.core) as Record<string, unknown>;
    expect(core.authorityId).toBe('haifa');
    expect(core.isTenantOwner).toBeUndefined();
    expect(core.tenantType).toBeUndefined();
    expect(core.tenantId).toBeUndefined();

    expect((store.get('authorities/brigade-810')!.managerIds as string[])).not.toContain(CALLER.uid);
    expect((store.get('authorities/haifa')!.managerIds as string[])).toContain(CALLER.uid);
  });

  it('prior unit_admin (core.unitId set) accepting authority_manager — the stale tenants/{}/units/{} grant is cleaned', async () => {
    const db = makeFakeDb();
    seedUser(CALLER.uid, { tenantId: 'brigade-810', unitId: 'unit-9307', unitPath: ['brigade-810', 'unit-9307'], authorityId: 'brigade-810', email: CALLER.email });
    store.set('tenants/brigade-810/units/unit-9307', { managerIds: [CALLER.uid] });
    store.set('authorities/haifa', { managerIds: [] });
    seedInvitation('inv-3', { role: 'authority_manager', email: CALLER.email, authorityId: 'haifa' });

    const result = await computeAcceptInvitation(db, CALLER, 'inv-3');

    expect(result.status).toBe(200);
    const core = (store.get(`users/${CALLER.uid}`)!.core) as Record<string, unknown>;
    expect(core.unitId).toBeUndefined();
    expect(core.unitPath).toBeUndefined();
    expect((store.get('tenants/brigade-810/units/unit-9307')!.managerIds as string[])).not.toContain(CALLER.uid);
  });

  it('a brand-new user (no existing doc) — no stale cleanup attempted, only the new role fields are written', async () => {
    const db = makeFakeDb();
    store.set('authorities/haifa', { managerIds: [] });
    seedInvitation('inv-4', { role: 'authority_manager', email: CALLER.email, authorityId: 'haifa' });

    const result = await computeAcceptInvitation(db, CALLER, 'inv-4');

    expect(result.status).toBe(200);
    const user = store.get(`users/${CALLER.uid}`);
    expect(user).toBeDefined();
    const core = user!.core as Record<string, unknown>;
    expect(core.authorityId).toBe('haifa');
    expect((store.get('authorities/haifa')!.managerIds as string[])).toContain(CALLER.uid);
  });

  it('re-accepting the SAME authority (prior authorityId equals the new one) skips cleanup entirely — no wasted/incorrect removal', async () => {
    const db = makeFakeDb();
    seedUser(CALLER.uid, { authorityId: 'haifa', email: CALLER.email });
    store.set('authorities/haifa', { managerIds: [CALLER.uid] });
    seedInvitation('inv-5', { role: 'authority_manager', email: CALLER.email, authorityId: 'haifa' });

    const result = await computeAcceptInvitation(db, CALLER, 'inv-5');

    expect(result.status).toBe(200);
    // Still present — cleanup must not have removed-then-not-re-added, or
    // any other double-write artifact.
    expect((store.get('authorities/haifa')!.managerIds as string[])).toContain(CALLER.uid);
  });

  it('a prior authority that no longer exists is skipped safely — the acceptance still succeeds instead of throwing', async () => {
    const db = makeFakeDb();
    // core.authorityId points at a deleted authority — deliberately never store.set('authorities/deleted-authority', ...)
    seedUser(CALLER.uid, { authorityId: 'deleted-authority', email: CALLER.email });
    store.set('authorities/haifa', { managerIds: [] });
    seedInvitation('inv-6', { role: 'authority_manager', email: CALLER.email, authorityId: 'haifa' });

    const result = await computeAcceptInvitation(db, CALLER, 'inv-6');

    expect(result.status).toBe(200);
    const core = (store.get(`users/${CALLER.uid}`)!.core) as Record<string, unknown>;
    expect(core.authorityId).toBe('haifa');
  });

  describe('06.10.2026 ("chief fitness officer") — readiness_chief_officer acceptance', () => {
    it('a brand-new user accepting writes EXACTLY core.isReadinessChiefOfficer=true — no tenantId/unitId/authorityId at all, no managerIds array touched', async () => {
      const db = makeFakeDb();
      seedInvitation('inv-rco-1', { role: 'readiness_chief_officer', email: CALLER.email });

      const result = await computeAcceptInvitation(db, CALLER, 'inv-rco-1');

      expect(result.status).toBe(200);
      const core = (store.get(`users/${CALLER.uid}`)!.core) as Record<string, unknown>;
      expect(core.isReadinessChiefOfficer).toBe(true);
      expect(core.tenantId).toBeUndefined();
      expect(core.unitId).toBeUndefined();
      expect(core.authorityId).toBeUndefined();
      expect(core.isTenantOwner).toBeUndefined();
    });

    it('a real tenant_owner reassigned to readiness_chief_officer — old tenant_owner fields cleared, old authorities.managerIds grant removed, isReadinessChiefOfficer set (exercises the EXISTING stale-cleanup path with the new role plugged in, zero new cleanup code)', async () => {
      const db = makeFakeDb();
      seedUser(CALLER.uid, { tenantId: 'brigade-810', isTenantOwner: true, tenantType: 'military', email: CALLER.email });
      store.set('authorities/brigade-810', { managerIds: [CALLER.uid] });
      seedInvitation('inv-rco-2', { role: 'readiness_chief_officer', email: CALLER.email });

      const result = await computeAcceptInvitation(db, CALLER, 'inv-rco-2');

      expect(result.status).toBe(200);
      const core = (store.get(`users/${CALLER.uid}`)!.core) as Record<string, unknown>;
      expect(core.isReadinessChiefOfficer).toBe(true);
      expect(core.isTenantOwner).toBeUndefined();
      expect(core.tenantId).toBeUndefined();
      expect(core.tenantType).toBeUndefined();
      expect((store.get('authorities/brigade-810')!.managerIds as string[])).not.toContain(CALLER.uid);
    });

    it('a real readiness_chief_officer reassigned to tenant_owner — isReadinessChiefOfficer is cleared, not left as a stale second grant', async () => {
      const db = makeFakeDb();
      seedUser(CALLER.uid, { isReadinessChiefOfficer: true, email: CALLER.email });
      store.set('authorities/brigade-810', { managerIds: [] });
      seedInvitation('inv-rco-3', { role: 'tenant_owner', email: CALLER.email, tenantId: 'brigade-810' });

      const result = await computeAcceptInvitation(db, CALLER, 'inv-rco-3');

      expect(result.status).toBe(200);
      const core = (store.get(`users/${CALLER.uid}`)!.core) as Record<string, unknown>;
      expect(core.isTenantOwner).toBe(true);
      expect(core.isReadinessChiefOfficer).toBeUndefined();
    });
  });
});

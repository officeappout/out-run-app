import { describe, it, expect, beforeEach, vi } from 'vitest';

// Same server-only-guard mocking convention as
// src/app/api/auth/__tests__/accept-invitation.test.ts — computeCreateInvitation
// takes db directly, never calls getAdminAuth/getAdminDb itself.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => { throw new Error('not used — computeCreateInvitation takes db directly'); },
  getAdminDb: () => { throw new Error('not used — computeCreateInvitation takes db directly'); },
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromDate: (d: Date) => ({ __op: 'timestamp', ms: d.getTime() }) },
  FieldValue: { serverTimestamp: () => ({ __op: 'serverTimestamp' }) },
}));

import { computeCreateInvitation } from '../route';

const ROOT_EMAIL = 'office@appout.co.il'; // real, already-public in CLAUDE.md — not a test secret
const NON_ROOT_EMAIL = 'officer@example.com';

function makeFakeDb(authorityDocs: Record<string, Record<string, unknown>> = {}) {
  const added: Record<string, unknown>[] = [];
  return {
    db: {
      collection(name: string) {
        return {
          doc(id: string) {
            return { get: async () => ({ exists: id in authorityDocs, data: () => authorityDocs[id] }) };
          },
          async add(data: Record<string, unknown>) {
            added.push(data);
            return { id: `generated-${added.length}` };
          },
        };
      },
    } as unknown as import('firebase-admin/firestore').Firestore,
    added,
  };
}

describe('06.10.2026 ("chief fitness officer") — computeCreateInvitation, readiness_chief_officer', () => {
  it('a non-root caller is DENIED (403) — the mandatory gate this branch exists for', async () => {
    const { db } = makeFakeDb();
    const result = await computeCreateInvitation(db, { uid: 'u1', email: NON_ROOT_EMAIL }, {
      email: 'new-officer@example.com',
      role: 'readiness_chief_officer',
    });
    expect(result.status).toBe(403);
  });

  it('root can create it — the written doc has no tenantId/unitId/authorityId at all', async () => {
    const { db, added } = makeFakeDb();
    const result = await computeCreateInvitation(db, { uid: 'root-uid', email: ROOT_EMAIL }, {
      email: 'new-officer@example.com',
      role: 'readiness_chief_officer',
    });
    expect(result.status).toBe(200);
    expect(added.length).toBe(1);
    expect(added[0].role).toBe('readiness_chief_officer');
    expect(added[0].tenantId).toBeNull();
    expect(added[0].unitId).toBeNull();
    expect(added[0].authorityId).toBeNull();
  });

  it('a caller-supplied tenantId is silently ignored — this role is never tenant-scoped, even if someone tries', async () => {
    const { db, added } = makeFakeDb({ 'some-brigade': { type: 'military_unit' } });
    const result = await computeCreateInvitation(db, { uid: 'root-uid', email: ROOT_EMAIL }, {
      email: 'new-officer@example.com',
      role: 'readiness_chief_officer',
      tenantId: 'some-brigade', // ignored — this role's branch never reads request body fields
    });
    expect(result.status).toBe(200);
    expect(added[0].tenantId).toBeNull();
  });
});

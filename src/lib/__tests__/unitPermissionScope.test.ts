import { describe, it, expect, vi, beforeEach } from 'vitest';

// P1-3 item 1 (00-MASTER-PLAN.md §13.43/§13.49): resolveUnitPermissionScope
// used to collapse EVERY failure mode — a real "checked, not a manager of
// anything" AND a thrown exception (missing index, Firestore outage, a bug)
// — into the same {kind:'denied'}. That conflation is exactly what made a
// missing collectionGroup index (00-MASTER-PLAN.md §13.47.1) look
// indistinguishable from a genuine non-manager in production. These tests
// verify the split: 'denied' only for a real, checked "no"; 'unknown' for
// anything that threw. Fail-closed for authorization is unchanged either
// way — both still refuse access; only the reported KIND differs.
//
// Follows the established getAdminDb mock convention (see
// src/app/api/challenge/leaderboard/__tests__/route.test.ts) — a hoisted,
// per-test-configurable fake, chainable enough to cover every query this
// file actually makes (users/{uid}, authorities query, collectionGroup
// units query, tenants/{t}/units query for downward expansion).

const state = vi.hoisted(() => ({
  userDoc: null as { core: Record<string, unknown> } | null,
  ownedTenantDocs: [] as Array<{ id: string }>,
  managedUnitDocs: [] as Array<{ id: string; tenantId: string }>,
  descendantsByParent: {} as Record<string, Array<{ id: string; parentUnitId: string }>>,
  throwOn: null as null | 'user' | 'authorities' | 'units' | 'downward',
}));

function maybeThrow(tag: typeof state.throwOn) {
  if (state.throwOn === tag) throw new Error(`simulated failure: ${tag}`);
}

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => ({
    collection: (name: string) => {
      if (name === 'users') {
        return {
          doc: () => ({
            get: async () => {
              maybeThrow('user');
              return { data: () => state.userDoc ?? {} };
            },
          }),
        };
      }
      if (name === 'authorities') {
        return {
          where: () => ({
            where: () => ({
              limit: () => ({
                get: async () => {
                  maybeThrow('authorities');
                  return {
                    empty: state.ownedTenantDocs.length === 0,
                    docs: state.ownedTenantDocs.map((d) => ({ id: d.id })),
                  };
                },
              }),
            }),
          }),
        };
      }
      if (name === 'tenants') {
        return {
          doc: (tenantId: string) => ({
            collection: () => ({
              where: (_field: string, _op: string, ids: string[]) => ({
                get: async () => {
                  maybeThrow('downward');
                  const children = ids.flatMap((pid) => state.descendantsByParent[pid] ?? []);
                  return { docs: children.map((c) => ({ id: c.id, data: () => ({ parentUnitId: c.parentUnitId }) })) };
                },
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
    collectionGroup: (name: string) => {
      if (name !== 'units') throw new Error(`unexpected collectionGroup: ${name}`);
      return {
        where: () => ({
          get: async () => {
            maybeThrow('units');
            return {
              empty: state.managedUnitDocs.length === 0,
              docs: state.managedUnitDocs.map((d) => ({
                id: d.id,
                ref: { parent: { parent: { id: d.tenantId } } },
              })),
            };
          },
        }),
      };
    },
  }),
}));

import { resolveUnitPermissionScope, isMemberWithinScope } from '@/lib/unitPermissionScope';

describe('resolveUnitPermissionScope — denied vs unknown split (P1-3 item 1)', () => {
  beforeEach(() => {
    state.userDoc = { core: { email: 'someone@example.com' } };
    state.ownedTenantDocs = [];
    state.managedUnitDocs = [];
    state.descendantsByParent = {};
    state.throwOn = null;
  });

  it('resolves root for a known root-admin email', async () => {
    state.userDoc = { core: { email: 'office@appout.co.il' } };
    const scope = await resolveUnitPermissionScope('root-uid');
    expect(scope).toEqual({ kind: 'root' });
  });

  it('resolves tenantOwner when the authorities query matches', async () => {
    state.ownedTenantDocs = [{ id: 'tenant-1' }];
    const scope = await resolveUnitPermissionScope('owner-uid');
    expect(scope).toEqual({ kind: 'tenantOwner', tenantId: 'tenant-1' });
  });

  it('resolves unitAdmin, including downward-expanded descendants', async () => {
    state.managedUnitDocs = [{ id: 'battalion-1', tenantId: 'tenant-1' }];
    state.descendantsByParent = { 'battalion-1': [{ id: 'company-1', parentUnitId: 'battalion-1' }] };
    const scope = await resolveUnitPermissionScope('commander-uid');
    expect(scope.kind).toBe('unitAdmin');
    if (scope.kind === 'unitAdmin') {
      expect(scope.tenantId).toBe('tenant-1');
      expect(scope.unitIds.sort()).toEqual(['battalion-1', 'company-1']);
    }
  });

  it('resolves denied — a real, checked "no" — when every query succeeds and finds nothing', async () => {
    const scope = await resolveUnitPermissionScope('nobody-uid');
    expect(scope).toEqual({ kind: 'denied' });
  });

  it('resolves unknown, NOT denied, when the user-doc read throws', async () => {
    state.throwOn = 'user';
    const scope = await resolveUnitPermissionScope('any-uid');
    expect(scope).toEqual({ kind: 'unknown' });
  });

  it('resolves unknown, NOT denied, when the authorities query throws (e.g. a missing index)', async () => {
    state.throwOn = 'authorities';
    const scope = await resolveUnitPermissionScope('any-uid');
    expect(scope).toEqual({ kind: 'unknown' });
  });

  it('resolves unknown, NOT denied, when the collectionGroup(units) query throws — the exact §13.47.1 production case', async () => {
    state.throwOn = 'units';
    const scope = await resolveUnitPermissionScope('any-uid');
    expect(scope).toEqual({ kind: 'unknown' });
  });

  it('resolves unknown, NOT denied, when the downward-expansion query throws', async () => {
    state.managedUnitDocs = [{ id: 'battalion-1', tenantId: 'tenant-1' }];
    state.throwOn = 'downward';
    const scope = await resolveUnitPermissionScope('any-uid');
    expect(scope).toEqual({ kind: 'unknown' });
  });
});

describe('isMemberWithinScope — unchanged fail-closed behavior for the new kind', () => {
  it('returns false for an unknown scope, same as denied — authorization stays fail-closed either way', () => {
    expect(isMemberWithinScope({ kind: 'unknown' }, 'tenant-1', 'unit-1')).toBe(false);
    expect(isMemberWithinScope({ kind: 'denied' }, 'tenant-1', 'unit-1')).toBe(false);
  });

  it('still allows root through regardless', () => {
    expect(isMemberWithinScope({ kind: 'root' }, 'tenant-1', 'unit-1')).toBe(true);
  });
});

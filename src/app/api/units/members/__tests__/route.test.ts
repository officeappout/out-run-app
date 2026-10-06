import { describe, it, expect, vi } from 'vitest';

// Same convention as structure/route.ts's own test — firebase-admin has a
// top-level `import 'server-only'` that throws outside Next's bundler;
// computeUnitMembers takes db directly, never calls getAdminDb() itself.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => { throw new Error('not used — computeUnitMembers takes db directly'); },
  getAdminDb: () => { throw new Error('not used — computeUnitMembers takes db directly'); },
}));

import { computeUnitMembers } from '../route';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

/**
 * Minimal fake db — enough for computeUnitMembers to reach (or be denied
 * before reaching) its data-aggregation phase. The 'vertical' scope tests
 * below only assert on the AUTHORIZATION branch (400/403/200-status), not
 * on the actual member/pending data, so an empty-everywhere fake is
 * sufficient and keeps this file focused on the one thing this round
 * changed.
 */
function makeEmptyFakeDb(knownUnitIds: Set<string> = new Set()) {
  return {
    collection(name: string) {
      if (name === 'tenants') {
        return {
          doc(_tenantId: string) {
            return {
              collection(sub: string) {
                if (sub !== 'units') throw new Error(`unexpected sub-collection: ${sub}`);
                return {
                  doc(unitId: string) {
                    return { get: async () => ({ id: unitId, exists: knownUnitIds.has(unitId), data: () => ({ name: unitId }) }) };
                  },
                  get: async () => ({ docs: [] }),
                };
              },
            };
          },
        };
      }
      if (name === 'users' || name === 'unit_join_requests') {
        return {
          where() {
            return {
              where() {
                return { get: async () => ({ docs: [] }) };
              },
              get: async () => ({ docs: [] }),
            };
          },
        };
      }
      throw new Error(`unexpected top-level collection: ${name}`);
    },
  } as unknown as import('firebase-admin/firestore').Firestore;
}

describe('computeUnitMembers — "vertical" scope (06.10.2026 fix, axioms.md §29/§32)', () => {
  it('a vertical-scoped caller requesting an IN-scope tenantId succeeds', async () => {
    const db = makeEmptyFakeDb();
    const scope: UnitPermissionScope = { kind: 'vertical', vertical: 'military', authorityIds: ['brigade-810', 'brigade-other'] };

    const result = await computeUnitMembers(db, scope, { tenantId: 'brigade-810' });

    expect(result.status).toBe(200);
  });

  it('THE BUG THIS ROUND FIXED (David\'s correction: cross-CUSTOMER leak, not a narrower in-military one) — a vertical-scoped caller requesting a REAL MUNICIPAL tenant\'s id is now DENIED. Before this fix, nothing here checked query.tenantId against authorityIds at all, so a military "vertical" caller could request a city\'s own tenantId and get real residents\' names back.', async () => {
    const db = makeEmptyFakeDb();
    const scope: UnitPermissionScope = { kind: 'vertical', vertical: 'military', authorityIds: ['brigade-810'] };

    const result = await computeUnitMembers(db, scope, { tenantId: 'city-ofakim' });

    expect(result.status).toBe(403);
  });

  it('a vertical-scoped caller with no tenantId at all → 400, same as root', async () => {
    const db = makeEmptyFakeDb();
    const scope: UnitPermissionScope = { kind: 'vertical', vertical: 'military', authorityIds: ['brigade-810'] };

    const result = await computeUnitMembers(db, scope, {});

    expect(result.status).toBe(400);
  });

  it('root is UNCHANGED by this fix — still blindly trusts query.tenantId (root has no "own" authorityIds to check against)', async () => {
    const db = makeEmptyFakeDb();
    const result = await computeUnitMembers(db, { kind: 'root' }, { tenantId: 'brigade-810' });

    expect(result.status).toBe(200);
  });
});

/**
 * resolveReadinessTargetScope — parametric contract test (09.10.2026,
 * adversarial-audit consolidation). Built BEFORE any of the 8 existing
 * call sites are migrated — this file is the thing David reviews before
 * migration starts, per his explicit "דווח ואישור לפני הגרגור".
 *
 * Every row below pins down ONE specific (scope.kind, query) combination
 * to its exact expected outcome — the full contract documented in the
 * function's own header comment, made executable. A future change to
 * this function that silently alters any one of these is a failing test,
 * not a missed review.
 */
import { describe, it, expect, vi } from 'vitest';

// Same reason as every other compute*() test: unitPermissionScope.ts
// imports @/lib/firebase-admin at the top level ('server-only' guard)
// even though resolveReadinessTargetScope never calls getAdminDb() itself
// — db is always injected.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from resolveReadinessTargetScope — db is always injected'); },
}));

import { resolveReadinessTargetScope } from '../unitPermissionScope';
import type { UnitPermissionScope } from '../unitPermissionScope';
import type { Firestore } from 'firebase-admin/firestore';

/** `tenants/{tenantId}/units/{unitId}` existence, nothing else — the only
 * Firestore shape this function ever reads. */
function makeFakeDb(existingUnits: Set<string>): Firestore {
  return {
    collection: (name: string) => {
      if (name !== 'tenants') throw new Error(`fake db: unexpected top-level collection "${name}"`);
      return {
        doc: (tenantId: string) => ({
          collection: (sub: string) => {
            if (sub !== 'units') throw new Error(`fake db: unexpected subcollection "${sub}"`);
            return {
              doc: (unitId: string) => ({
                get: async () => ({ exists: existingUnits.has(`${tenantId}/${unitId}`) }),
              }),
            };
          },
        }),
      };
    },
  } as unknown as Firestore;
}

const UNKNOWN: UnitPermissionScope = { kind: 'unknown' };
const DENIED: UnitPermissionScope = { kind: 'denied' };
const UNIT_ADMIN: UnitPermissionScope = { kind: 'unitAdmin', tenantId: 'brigade-own', unitIds: ['unit-1', 'unit-2'] };
const TENANT_OWNER: UnitPermissionScope = { kind: 'tenantOwner', tenantId: 'brigade-own' };
const VERTICAL: UnitPermissionScope = { kind: 'vertical', vertical: 'military', authorityIds: ['brigade-in-scope'] };
const ROOT: UnitPermissionScope = { kind: 'root' };

const EXISTING_UNITS = new Set([
  'brigade-own/unit-1',
  'brigade-own/unit-2',
  'brigade-in-scope/unit-x',
  'brigade-other/unit-y', // belongs to a DIFFERENT tenant — must never satisfy a lookup under a different tenantId
]);

interface Case {
  name: string;
  scope: UnitPermissionScope;
  query: { tenantId?: string | null; unitId?: string | null };
  expect:
    | { status: 200; targetTenantId: string; targetUnitIds: string[] | null }
    | { status: 400 | 403 | 503 };
}

const CASES: Case[] = [
  // unknown / denied — same for every query, shown once each.
  { name: 'unknown → 503', scope: UNKNOWN, query: {}, expect: { status: 503 } },
  { name: 'denied → 403', scope: DENIED, query: {}, expect: { status: 403 } },

  // unitAdmin
  { name: 'unitAdmin, no unitId → 200, full scope.unitIds', scope: UNIT_ADMIN, query: {}, expect: { status: 200, targetTenantId: 'brigade-own', targetUnitIds: ['unit-1', 'unit-2'] } },
  { name: 'unitAdmin, unitId IN scope.unitIds → 200, narrowed', scope: UNIT_ADMIN, query: { unitId: 'unit-1' }, expect: { status: 200, targetTenantId: 'brigade-own', targetUnitIds: ['unit-1'] } },
  { name: 'unitAdmin, unitId NOT in scope.unitIds → 403 (no DB read needed)', scope: UNIT_ADMIN, query: { unitId: 'unit-99' }, expect: { status: 403 } },
  { name: 'unitAdmin, query.tenantId is IGNORED (own tenant always wins)', scope: UNIT_ADMIN, query: { tenantId: 'brigade-in-scope' }, expect: { status: 200, targetTenantId: 'brigade-own', targetUnitIds: ['unit-1', 'unit-2'] } },

  // tenantOwner
  { name: 'tenantOwner, no unitId → 200, targetUnitIds null (whole tenant)', scope: TENANT_OWNER, query: {}, expect: { status: 200, targetTenantId: 'brigade-own', targetUnitIds: null } },
  { name: 'tenantOwner, unitId exists under own tenant → 200, narrowed', scope: TENANT_OWNER, query: { unitId: 'unit-1' }, expect: { status: 200, targetTenantId: 'brigade-own', targetUnitIds: ['unit-1'] } },
  { name: 'tenantOwner, unitId does not exist under own tenant → 403 ("not yours")', scope: TENANT_OWNER, query: { unitId: 'unit-99' }, expect: { status: 403 } },
  { name: 'tenantOwner, unitId real but belongs to a DIFFERENT tenant → 403 (robustness, not a leak — confirmed by the adversarial audit)', scope: TENANT_OWNER, query: { unitId: 'unit-y' }, expect: { status: 403 } },
  { name: 'tenantOwner, query.tenantId is IGNORED (own tenant always wins)', scope: TENANT_OWNER, query: { tenantId: 'brigade-other' }, expect: { status: 200, targetTenantId: 'brigade-own', targetUnitIds: null } },

  // vertical — this branch IS the 08.10.2026 security fix.
  { name: 'vertical, missing tenantId → 400', scope: VERTICAL, query: {}, expect: { status: 400 } },
  { name: 'vertical, tenantId NOT in scope.authorityIds → 403 (the fix itself)', scope: VERTICAL, query: { tenantId: 'brigade-own' }, expect: { status: 403 } },
  { name: 'vertical, tenantId in scope.authorityIds, no unitId → 200', scope: VERTICAL, query: { tenantId: 'brigade-in-scope' }, expect: { status: 200, targetTenantId: 'brigade-in-scope', targetUnitIds: null } },
  { name: 'vertical, tenantId in scope, unitId exists → 200, narrowed', scope: VERTICAL, query: { tenantId: 'brigade-in-scope', unitId: 'unit-x' }, expect: { status: 200, targetTenantId: 'brigade-in-scope', targetUnitIds: ['unit-x'] } },
  { name: 'vertical, tenantId in scope, unitId does not exist → 400 ("unit not found", not 403 — no ownership claim)', scope: VERTICAL, query: { tenantId: 'brigade-in-scope', unitId: 'unit-99' }, expect: { status: 400 } },

  // root
  { name: 'root, missing tenantId → 400', scope: ROOT, query: {}, expect: { status: 400 } },
  { name: 'root, tenantId given, no unitId → 200, trusted blindly', scope: ROOT, query: { tenantId: 'brigade-other' }, expect: { status: 200, targetTenantId: 'brigade-other', targetUnitIds: null } },
  { name: 'root, tenantId + unitId exists → 200, narrowed', scope: ROOT, query: { tenantId: 'brigade-other', unitId: 'unit-y' }, expect: { status: 200, targetTenantId: 'brigade-other', targetUnitIds: ['unit-y'] } },
  { name: 'root, tenantId + unitId does not exist → 400 ("unit not found")', scope: ROOT, query: { tenantId: 'brigade-other', unitId: 'unit-99' }, expect: { status: 400 } },
];

describe('resolveReadinessTargetScope — full parametric contract (20 cases)', () => {
  const db = makeFakeDb(EXISTING_UNITS);

  it.each(CASES)('$name', async ({ scope, query, expect: want }) => {
    const result = await resolveReadinessTargetScope(db, scope, query);
    expect(result.status).toBe(want.status);
    if (want.status === 200) {
      if (result.status !== 200) throw new Error(`expected 200, got ${result.status}: ${JSON.stringify(result)}`);
      expect(result.targetTenantId).toBe(want.targetTenantId);
      expect(result.targetUnitIds).toEqual(want.targetUnitIds);
    }
  });
});

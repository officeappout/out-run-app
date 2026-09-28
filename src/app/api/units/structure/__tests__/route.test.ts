import { describe, it, expect, vi } from 'vitest';

// The route file statically imports getAdminAuth/getAdminDb from
// @/lib/firebase-admin (used only by its GET handler, not by
// computeUnitStructure — db is passed in directly below), but that
// module has a top-level `import 'server-only'`, which throws outside a
// real Next.js server-component boundary the moment it loads. Mocking it
// prevents the real module from loading at all — matches the convention
// in src/app/api/auth/__tests__/accept-invitation.test.ts.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => { throw new Error('not used — computeUnitStructure takes db directly'); },
  getAdminDb: () => { throw new Error('not used — computeUnitStructure takes db directly'); },
}));

import { computeUnitStructure } from '../route';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

// David asked (28.09.2026, team/page.tsx counting-bugs review) exactly
// what the new managerIds passthrough field exposes, and to whom — in
// particular: does a company commander (a narrowly-scoped unitAdmin)
// reading /api/units/structure get back the BATTALION's managerIds too,
// the unit ABOVE them? This suite answers that empirically, not by
// assertion — a fake tenants/{t}/units store with a real 3-level
// hierarchy (brigade -> battalion -> company), driving the REAL
// computeUnitStructure exactly as the route calls it.

interface FakeUnit {
  id: string;
  parentUnitId: string | null;
  name: string;
  managerIds?: unknown;
}

function makeFakeDb(units: FakeUnit[]) {
  const byId = new Map(units.map((u) => [u.id, u]));

  function makeDocSnap(u: FakeUnit | undefined, id: string) {
    return {
      id,
      exists: u !== undefined,
      data: () => (u ? { name: u.name, parentUnitId: u.parentUnitId, managerIds: u.managerIds } : undefined),
    };
  }

  function makeUnitsCollection() {
    return {
      doc(id: string) {
        return { get: async () => makeDocSnap(byId.get(id), id) };
      },
      async get() {
        return { docs: units.map((u) => makeDocSnap(u, u.id)) };
      },
      where(field: string, op: string, ids: string[]) {
        if (field !== 'parentUnitId' || op !== 'in') throw new Error(`unexpected where: ${field} ${op}`);
        return {
          get: async () => ({
            docs: units.filter((u) => u.parentUnitId && ids.includes(u.parentUnitId)).map((u) => makeDocSnap(u, u.id)),
          }),
        };
      },
    };
  }

  return {
    collection(name: string) {
      if (name !== 'tenants') throw new Error(`unexpected top-level collection: ${name}`);
      return {
        doc(_tenantId: string) {
          return { collection: (sub: string) => (sub === 'units' ? makeUnitsCollection() : (() => { throw new Error(`unexpected sub-collection: ${sub}`); })()) };
        },
      };
    },
  } as unknown as import('firebase-admin/firestore').Firestore;
}

// brigade-810
//   └─ battalion-9307 (commanded by officer-battalion)
//        └─ company-A (commanded by officer-company)
const HIERARCHY: FakeUnit[] = [
  { id: 'battalion-9307', parentUnitId: null, name: 'גדוד 9307', managerIds: ['officer-battalion'] },
  { id: 'company-A', parentUnitId: 'battalion-9307', name: 'פלוגה א', managerIds: ['officer-company'] },
];

describe('computeUnitStructure — managerIds passthrough scope (28.09.2026)', () => {
  it('a narrowly-scoped unitAdmin (company commander only, no descendants) never sees the battalion above them — not the unit, not its managerIds', async () => {
    const db = makeFakeDb(HIERARCHY);
    const scope: UnitPermissionScope = { kind: 'unitAdmin', tenantId: 'brigade-810', unitIds: ['company-A'] };

    const result = await computeUnitStructure(db, scope, {});

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const unitIds = result.body.units.map((u) => u.unitId);
    expect(unitIds).toEqual(['company-A']);
    expect(unitIds).not.toContain('battalion-9307');
    // The battalion's managerIds (officer-battalion) must not appear
    // ANYWHERE in the response — not attached to any returned unit.
    const allExposedManagerIds = result.body.units.flatMap((u) => u.managerIds);
    expect(allExposedManagerIds).not.toContain('officer-battalion');
  });

  it('this holds even if the caller explicitly asks for the parent tenantId — scope.unitIds wins, not the query', async () => {
    const db = makeFakeDb(HIERARCHY);
    const scope: UnitPermissionScope = { kind: 'unitAdmin', tenantId: 'brigade-810', unitIds: ['company-A'] };

    // Passing a tenantId in the query changes nothing for a unitAdmin —
    // computeUnitStructure uses scope.tenantId, never query.tenantId, for
    // both tenantOwner and unitAdmin scopes (only root reads query.tenantId).
    const result = await computeUnitStructure(db, scope, { tenantId: 'brigade-810' });

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.units.map((u) => u.unitId)).toEqual(['company-A']);
  });

  it('a battalion commander (unitAdmin scoped to the battalion + its downward-expanded company) sees BOTH units and BOTH managerIds — this is the intended, in-scope case', async () => {
    const db = makeFakeDb(HIERARCHY);
    // Mirrors resolveUnitPermissionScope's real downward expansion: a
    // battalion commander's scope.unitIds already includes the company
    // below them (§13.28) — this is not a leak, it's the documented
    // "מפקד רואה את כל מה שתחתיו" design.
    const scope: UnitPermissionScope = { kind: 'unitAdmin', tenantId: 'brigade-810', unitIds: ['battalion-9307', 'company-A'] };

    const result = await computeUnitStructure(db, scope, {});

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const byUnitId = new Map(result.body.units.map((u) => [u.unitId, u]));
    expect(byUnitId.get('battalion-9307')?.managerIds).toEqual(['officer-battalion']);
    expect(byUnitId.get('company-A')?.managerIds).toEqual(['officer-company']);
  });

  it('a tenantOwner (whole-tenant scope) sees every unit\'s managerIds — the intended top-level view', async () => {
    const db = makeFakeDb(HIERARCHY);
    const scope: UnitPermissionScope = { kind: 'tenantOwner', tenantId: 'brigade-810' };

    const result = await computeUnitStructure(db, scope, {});

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const byUnitId = new Map(result.body.units.map((u) => [u.unitId, u]));
    expect(byUnitId.get('battalion-9307')?.managerIds).toEqual(['officer-battalion']);
    expect(byUnitId.get('company-A')?.managerIds).toEqual(['officer-company']);
  });

  it('managerIds is exactly the raw uid array — no names, no emails, no other fields', async () => {
    const db = makeFakeDb(HIERARCHY);
    const scope: UnitPermissionScope = { kind: 'tenantOwner', tenantId: 'brigade-810' };

    const result = await computeUnitStructure(db, scope, {});

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const company = result.body.units.find((u) => u.unitId === 'company-A');
    expect(company?.managerIds).toEqual(['officer-company']);
    expect(typeof company?.managerIds[0]).toBe('string');
  });

  it('a unit with no managerIds field at all returns an empty array, never undefined/null/throws', async () => {
    const db = makeFakeDb([{ id: 'lonely-unit', parentUnitId: null, name: 'יחידה בודדת' }]);
    const scope: UnitPermissionScope = { kind: 'tenantOwner', tenantId: 'brigade-810' };

    const result = await computeUnitStructure(db, scope, {});

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.units[0].managerIds).toEqual([]);
  });

  it('non-string entries in a malformed managerIds array are filtered out defensively', async () => {
    const db = makeFakeDb([{ id: 'unit-1', parentUnitId: null, name: 'יחידה', managerIds: ['real-uid', 42, null, { nested: true }] }]);
    const scope: UnitPermissionScope = { kind: 'tenantOwner', tenantId: 'brigade-810' };

    const result = await computeUnitStructure(db, scope, {});

    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.units[0].managerIds).toEqual(['real-uid']);
  });
});

import { describe, it, expect } from 'vitest';
import { decideUnitsListOrgSource } from '../unitsListOrgSource';

// §13.49 (00-MASTER-PLAN.md): /admin/authority/units/page.tsx used to call
// ONLY getAuthoritiesByManager(uid) for a non-super-admin caller — correct
// for tenant_owner/authority_manager, but a unit_admin's uid is never in
// authorities.managerIds at all. An empty result silently stopped the load
// with zero error and zero units shown. These tests lock in the fallback
// and, just as importantly, that a genuinely unresolved caller (neither an
// authority manager NOR a unit_admin) is flagged 'unresolved' rather than
// silently defaulting to something that looks like a real empty tenant.
describe('decideUnitsListOrgSource', () => {
  it('prefers a resolved managed authority when one exists (tenant_owner/authority_manager)', () => {
    const decision = decideUnitsListOrgSource(
      { isUnitAdmin: false, tenantId: undefined },
      { id: 'authority-1' },
    );
    expect(decision).toEqual({ kind: 'org', orgId: 'authority-1' });
  });

  it('prefers the managed authority even when the caller ALSO has isUnitAdmin true (defensive — should not happen per checkUserRole, but must not silently misroute if it ever did)', () => {
    const decision = decideUnitsListOrgSource(
      { isUnitAdmin: true, tenantId: 'tenant-1' },
      { id: 'authority-1' },
    );
    expect(decision).toEqual({ kind: 'org', orgId: 'authority-1' });
  });

  it('falls back to the unit_admin tenantId when no managed authority is found', () => {
    const decision = decideUnitsListOrgSource(
      { isUnitAdmin: true, tenantId: 'tenant-1' },
      undefined,
    );
    expect(decision).toEqual({ kind: 'unit-admin-tenant', tenantId: 'tenant-1' });
  });

  it('is unresolved for a unit_admin flag with no tenantId (malformed/incomplete roleInfo)', () => {
    const decision = decideUnitsListOrgSource({ isUnitAdmin: true, tenantId: undefined }, undefined);
    expect(decision).toEqual({ kind: 'unresolved' });
  });

  it('is unresolved for a caller who is neither an authority manager nor a unit_admin', () => {
    const decision = decideUnitsListOrgSource({ isUnitAdmin: false, tenantId: undefined }, undefined);
    expect(decision).toEqual({ kind: 'unresolved' });
  });
});

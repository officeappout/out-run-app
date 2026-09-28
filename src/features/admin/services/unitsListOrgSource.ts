/**
 * decideUnitsListOrgSource — which tenant/authority /admin/authority/units/
 * page.tsx should load for a signed-in, non-super-admin caller.
 *
 * §13.49 (00-MASTER-PLAN.md): getAuthoritiesByManager(uid) is the only
 * source this page used to check — correct for tenant_owner/authority_manager
 * (both really do sit in authorities/{id}.managerIds), but a unit_admin's
 * uid is never there at all (it lives on a tenants/{t}/units/{u}.managerIds
 * doc instead). Before this, an empty result silently stopped the whole
 * load with zero error and zero units shown — the sixth production
 * instance of "0 that isn't really 0" this standing rule is about.
 *
 * Pure decision function, no Firebase imports — kept separate specifically
 * so it's vitest-testable (this repo's vitest config is .test.ts-only, no
 * .tsx — see 00-MASTER-PLAN.md §13.46).
 */
export type UnitsListOrgSource =
  | { kind: 'org'; orgId: string }
  | { kind: 'unit-admin-tenant'; tenantId: string }
  | { kind: 'unresolved' };

export function decideUnitsListOrgSource(
  role: { isUnitAdmin: boolean; tenantId?: string | null },
  managedAuthority: { id: string } | undefined | null,
): UnitsListOrgSource {
  if (managedAuthority) return { kind: 'org', orgId: managedAuthority.id };
  if (role.isUnitAdmin && role.tenantId) return { kind: 'unit-admin-tenant', tenantId: role.tenantId };
  return { kind: 'unresolved' };
}

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
 * DISPLAY ROUTING ONLY — NEVER AN AUTHORIZATION INPUT (David, 28.09.2026).
 * This function decides which org id a client component PASSES to
 * GET /api/units/structure — it never decides what that caller is
 * actually ALLOWED to see. Authorization is resolved exactly once, only
 * server-side, only from the verified uid: resolveUnitPermissionScope()
 * (src/lib/unitPermissionScope.ts) re-derives the real scope on every
 * request and ignores/narrows-within whatever tenantId the client sent —
 * confirmed during item 1 of this same build (00-MASTER-PLAN.md §13.49,
 * "the API doesn't trust the query params for authorization, only uses
 * them as optional narrowing"). If a future caller of this function ever
 * treats its 'unit-admin-tenant' result as proof the caller may access
 * that tenant, that is a bug — go through resolveUnitPermissionScope.
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

/**
 * §13.39 (27.09.2026) — where a tenant_owner/unit_admin lands right after
 * their invitation is accepted (or on any later re-resolution of their
 * destination). Kept pure (no Firebase/router imports) so it stays
 * unit-testable — see __tests__/postAcceptRedirect.test.ts.
 *
 * Both roles need their org's ACTUAL current vertical (military/
 * educational) to build the right URL. That value is NOT reliably
 * available as a stored field on the caller: tenant_owner gets
 * core.tenantType written at accept-time (accept-invitation/route.ts),
 * but unit_admin does NOT (checked — no core.tenantType write in that
 * branch). Rather than special-case that asymmetry, both callers
 * (admin/auth/callback/page.tsx) resolve tenantType fresh via
 * getAuthority(tenantId) + authorityTypeToTenantType() every time and
 * pass the result in here — this function only decides what to do with
 * it once resolved.
 *
 * Fail-closed by design: any required field missing or unresolvable
 * returns 'cannot-determine' with a specific, actionable message — never
 * a guess at a fallback path (David's explicit requirement: never redirect
 * to a wrong screen, never leave the user stuck; show a clear message and
 * a way forward instead — the caller's existing error-state UI already
 * provides that).
 */

export type PostAcceptRedirectDecision =
  | { kind: 'redirect'; path: string }
  | { kind: 'cannot-determine'; message: string };

export interface TenantOwnerRedirectInput {
  tenantId?: string | null;
  tenantType?: string | null;
}

export interface UnitAdminRedirectInput {
  tenantId?: string | null;
  unitId?: string | null;
  tenantType?: string | null;
}

export function decideTenantOwnerRedirect(input: TenantOwnerRedirectInput): PostAcceptRedirectDecision {
  if (!input.tenantId || !input.tenantType) {
    return {
      kind: 'cannot-determine',
      message: 'החשבון שלך מוגדר כבעל גוף, אך לא ניתן היה לקבוע לאיזה גוף. פנה למנהל המערכת.',
    };
  }
  return { kind: 'redirect', path: `/admin/authority/units?type=${input.tenantType}` };
}

export function decideUnitAdminRedirect(input: UnitAdminRedirectInput): PostAcceptRedirectDecision {
  if (!input.tenantId || !input.unitId || !input.tenantType) {
    return {
      kind: 'cannot-determine',
      message: 'החשבון שלך מוגדר כמנהל יחידה, אך לא ניתן היה לקבוע לאיזו יחידה. פנה למפקד או למנהל המערכת.',
    };
  }
  return {
    kind: 'redirect',
    path: `/admin/authority/units/${input.unitId}?type=${input.tenantType}&org=${input.tenantId}`,
  };
}

/**
 * The fresh-invitation call site (completeSignIn's invitationApplied
 * branch) — role comes as a clean discriminant string, no collision risk.
 * 'legacy' covers every role that keeps its EXISTING destination
 * unchanged (authority_manager, platform_member, any future role added to
 * SUPPORTED_ROLES without a dedicated branch here) — the caller still
 * owns building that path, this function only decides not to intercept it.
 */
export function decideInvitationRoleRedirect(
  role: string | null,
  input: { tenantId?: string | null; unitId?: string | null; tenantType?: string | null }
): PostAcceptRedirectDecision | { kind: 'legacy' } {
  if (role === 'unit_admin') return decideUnitAdminRedirect(input);
  if (role === 'tenant_owner') return decideTenantOwnerRedirect(input);
  // 06.10.2026 ("chief fitness officer") — no tenantId/unitId/tenantType
  // needed at all, unlike the two above; this role isn't tied to one org.
  if (role === 'readiness_chief_officer') {
    return { kind: 'redirect', path: '/admin/authority/readiness/vertical-overview' };
  }
  return { kind: 'legacy' };
}

/**
 * The existing-role call site (resolveDestination) — a real tenant_owner
 * is ALSO, mechanically, an authority_manager (accept-invitation/route.ts
 * arrayUnions them into authorities/{tenantId}.managerIds too — the two
 * roles' registration is deliberately identical at that level, see
 * accept-invitation/route.ts's own comment on this). isTenantOwner/
 * isUnitAdmin MUST be checked first, or every real tenant_owner falls into
 * 'legacy-authority-manager' — exactly the bug being fixed here. isUnitAdmin
 * has no such collision (never in any authority's managerIds) but is
 * checked alongside it for symmetry.
 *
 * 'legacy-authority-manager' signals the caller to run its EXISTING,
 * unchanged async neighborhood-special-case check before falling back to
 * /admin/authority-manager — that lookup needs a live Firestore call this
 * pure function can't make, and isn't part of what this slice changed.
 */
export interface ResolveDestinationFlags {
  isTenantOwner: boolean;
  isUnitAdmin: boolean;
  isAuthorityManager: boolean;
  isOnlyAuthorityManager: boolean;
  isVerticalAdmin: boolean;
  isSuperAdmin: boolean;
  isSystemAdmin: boolean;
  /** 06.10.2026 ("chief fitness officer") — checked AFTER isTenantOwner/isUnitAdmin, deliberately, same precedence as resolveUnitPermissionScope's own root→tenantOwner→unitAdmin→vertical order (axioms.md §32's dual-role trap is the same shape here — a real brigade officer's existing destination is untouched). */
  isReadinessChiefOfficer: boolean;
  tenantId?: string | null;
  unitId?: string | null;
  tenantType?: string | null;
}

export function decideResolveDestinationBranch(
  flags: ResolveDestinationFlags
): PostAcceptRedirectDecision | { kind: 'legacy-authority-manager' } {
  if (flags.isTenantOwner || flags.isUnitAdmin) {
    return flags.isUnitAdmin
      ? decideUnitAdminRedirect(flags)
      : decideTenantOwnerRedirect(flags);
  }
  if (flags.isReadinessChiefOfficer) {
    return { kind: 'redirect', path: '/admin/authority/readiness/vertical-overview' };
  }
  if (flags.isAuthorityManager || flags.isOnlyAuthorityManager) {
    return { kind: 'legacy-authority-manager' };
  }
  if (flags.isVerticalAdmin) {
    return { kind: 'redirect', path: '/admin/organizations' };
  }
  if (flags.isSuperAdmin || flags.isSystemAdmin) {
    return { kind: 'redirect', path: '/admin' };
  }
  return { kind: 'cannot-determine', message: 'אין לך גישה לפורטל. פנה למנהל המערכת.' };
}

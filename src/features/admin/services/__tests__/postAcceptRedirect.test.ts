import { describe, it, expect } from 'vitest';
import {
  decideTenantOwnerRedirect,
  decideUnitAdminRedirect,
  decideInvitationRoleRedirect,
  decideResolveDestinationBranch,
} from '../postAcceptRedirect';

describe('decideTenantOwnerRedirect', () => {
  it('resolves to the units list for their own tenant', () => {
    const result = decideTenantOwnerRedirect({ tenantId: 'brigade_810', tenantType: 'military' });
    expect(result).toEqual({ kind: 'redirect', path: '/admin/authority/units?type=military' });
  });

  it('missing tenantType (org lookup failed) — cannot-determine, never a guessed path', () => {
    const result = decideTenantOwnerRedirect({ tenantId: 'brigade_810', tenantType: null });
    expect(result.kind).toBe('cannot-determine');
  });

  it('missing tenantId — cannot-determine', () => {
    const result = decideTenantOwnerRedirect({ tenantId: null, tenantType: 'military' });
    expect(result.kind).toBe('cannot-determine');
  });
});

describe('decideUnitAdminRedirect', () => {
  it('resolves directly to their own unit page, with both type and org params', () => {
    const result = decideUnitAdminRedirect({ tenantId: 'brigade_810', unitId: 'bn_9307', tenantType: 'military' });
    expect(result).toEqual({ kind: 'redirect', path: '/admin/authority/units/bn_9307?type=military&org=brigade_810' });
  });

  it('missing unitId (the field unit_admin uniquely needs) — cannot-determine', () => {
    const result = decideUnitAdminRedirect({ tenantId: 'brigade_810', unitId: null, tenantType: 'military' });
    expect(result.kind).toBe('cannot-determine');
  });

  it('missing tenantType — cannot-determine, never falls back to a municipal-shaped URL', () => {
    const result = decideUnitAdminRedirect({ tenantId: 'brigade_810', unitId: 'bn_9307', tenantType: null });
    expect(result.kind).toBe('cannot-determine');
  });
});

describe('decideInvitationRoleRedirect (fresh-invitation call site)', () => {
  it('unit_admin — redirects to their unit', () => {
    const result = decideInvitationRoleRedirect('unit_admin', { tenantId: 't1', unitId: 'u1', tenantType: 'military' });
    expect(result).toEqual({ kind: 'redirect', path: '/admin/authority/units/u1?type=military&org=t1' });
  });

  it('tenant_owner — redirects to their units list', () => {
    const result = decideInvitationRoleRedirect('tenant_owner', { tenantId: 't1', tenantType: 'educational' });
    expect(result).toEqual({ kind: 'redirect', path: '/admin/authority/units?type=educational' });
  });

  it("authority_manager — 'legacy', caller keeps routing it to /admin/authority-manager exactly as before (requirement: don't break this)", () => {
    const result = decideInvitationRoleRedirect('authority_manager', {});
    expect(result).toEqual({ kind: 'legacy' });
  });

  it("platform_member — also 'legacy' (no dedicated branch, same as today)", () => {
    const result = decideInvitationRoleRedirect('platform_member', {});
    expect(result).toEqual({ kind: 'legacy' });
  });

  it('unit_admin invitation missing unitId — cannot-determine, not legacy and not a guess', () => {
    const result = decideInvitationRoleRedirect('unit_admin', { tenantId: 't1', unitId: null, tenantType: 'military' });
    expect(result.kind).toBe('cannot-determine');
  });
});

describe('decideResolveDestinationBranch (existing-role call site)', () => {
  const baseFlags = {
    isTenantOwner: false,
    isUnitAdmin: false,
    isAuthorityManager: false,
    isOnlyAuthorityManager: false,
    isVerticalAdmin: false,
    isSuperAdmin: false,
    isSystemAdmin: false,
  };

  it('unit_admin — redirects to their unit', () => {
    const result = decideResolveDestinationBranch({
      ...baseFlags,
      isUnitAdmin: true,
      tenantId: 't1',
      unitId: 'u1',
      tenantType: 'military',
    });
    expect(result).toEqual({ kind: 'redirect', path: '/admin/authority/units/u1?type=military&org=t1' });
  });

  it('tenant_owner — redirects to their units list, EVEN THOUGH isAuthorityManager is also true (the exact real shape: accept-invitation/route.ts arrayUnions a tenant_owner into authorities/{id}.managerIds too — this is the regression this slice fixes)', () => {
    const result = decideResolveDestinationBranch({
      ...baseFlags,
      isTenantOwner: true,
      isAuthorityManager: true, // mechanically always true for a real tenant_owner
      tenantId: 't1',
      tenantType: 'educational',
    });
    expect(result).toEqual({ kind: 'redirect', path: '/admin/authority/units?type=educational' });
  });

  it("a REAL municipal authority_manager (isTenantOwner/isUnitAdmin both false) — 'legacy-authority-manager', unaffected by this change", () => {
    const result = decideResolveDestinationBranch({
      ...baseFlags,
      isAuthorityManager: true,
    });
    expect(result).toEqual({ kind: 'legacy-authority-manager' });
  });

  it("isOnlyAuthorityManager alone (isAuthorityManager itself false) — also 'legacy-authority-manager', same as today", () => {
    const result = decideResolveDestinationBranch({
      ...baseFlags,
      isOnlyAuthorityManager: true,
    });
    expect(result).toEqual({ kind: 'legacy-authority-manager' });
  });

  it('vertical_admin — unaffected, still /admin/organizations', () => {
    const result = decideResolveDestinationBranch({ ...baseFlags, isVerticalAdmin: true });
    expect(result).toEqual({ kind: 'redirect', path: '/admin/organizations' });
  });

  it('super_admin — unaffected, still /admin', () => {
    const result = decideResolveDestinationBranch({ ...baseFlags, isSuperAdmin: true });
    expect(result).toEqual({ kind: 'redirect', path: '/admin' });
  });

  it('tenant_owner with tenantType unresolvable (org fetch failed) — cannot-determine, not silently sent to authority-manager', () => {
    const result = decideResolveDestinationBranch({
      ...baseFlags,
      isTenantOwner: true,
      isAuthorityManager: true,
      tenantId: 't1',
      tenantType: null,
    });
    expect(result.kind).toBe('cannot-determine');
  });

  it('unit_admin with unitId missing (a real data gap) — cannot-determine, not silently sent anywhere', () => {
    const result = decideResolveDestinationBranch({
      ...baseFlags,
      isUnitAdmin: true,
      tenantId: 't1',
      unitId: null,
      tenantType: 'military',
    });
    expect(result.kind).toBe('cannot-determine');
  });

  it('none of the flags true — cannot-determine with the existing "no access" message, unchanged', () => {
    const result = decideResolveDestinationBranch(baseFlags);
    expect(result).toEqual({ kind: 'cannot-determine', message: 'אין לך גישה לפורטל. פנה למנהל המערכת.' });
  });
});

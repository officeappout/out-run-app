import { describe, it, expect } from 'vitest';
import { hasAnyAdminAccess } from '../adminAccessGate';

const baseFlags = {
  isSuperAdmin: false,
  isSystemAdmin: false,
  isAuthorityManager: false,
  isTenantOwner: false,
  isUnitAdmin: false,
  isVerticalAdmin: false,
  isReadinessChiefOfficer: false,
  role: 'none',
};

describe('hasAnyAdminAccess', () => {
  it("P0-1 (§13.44) — a real unit_admin (every other flag false, exactly the shape accept-invitation produces) has access. This is the exact scenario the pre-fix admin/layout.tsx check denied on every mount", () => {
    expect(hasAnyAdminAccess({ ...baseFlags, isUnitAdmin: true })).toBe(true);
  });

  it('tenant_owner has access (unaffected by this fix — already worked)', () => {
    expect(hasAnyAdminAccess({ ...baseFlags, isTenantOwner: true })).toBe(true);
  });

  it('authority_manager has access (unaffected)', () => {
    expect(hasAnyAdminAccess({ ...baseFlags, isAuthorityManager: true })).toBe(true);
  });

  it('vertical_admin has access (unaffected)', () => {
    expect(hasAnyAdminAccess({ ...baseFlags, isVerticalAdmin: true })).toBe(true);
  });

  it('06.10.2026 ("chief fitness officer") — a real readiness-chief-officer (every other flag false) has access, matching the real shape accept-invitation produces for this role', () => {
    expect(hasAnyAdminAccess({ ...baseFlags, isReadinessChiefOfficer: true })).toBe(true);
  });

  it('super_admin has access (unaffected)', () => {
    expect(hasAnyAdminAccess({ ...baseFlags, isSuperAdmin: true })).toBe(true);
  });

  it('system_admin has access (unaffected)', () => {
    expect(hasAnyAdminAccess({ ...baseFlags, isSystemAdmin: true })).toBe(true);
  });

  it('platform_member (role check, not a boolean flag) has access (unaffected)', () => {
    expect(hasAnyAdminAccess({ ...baseFlags, role: 'platform_member' })).toBe(true);
  });

  it('a real "no access" user (every flag false, role none) is correctly denied — the fix must not open the gate wide', () => {
    expect(hasAnyAdminAccess(baseFlags)).toBe(false);
  });
});

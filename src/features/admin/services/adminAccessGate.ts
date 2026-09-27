/**
 * §13.44 (P0-1, 27.09.2026) — decides whether a signed-in user has ANY
 * admin-panel access at all (admin/layout.tsx's top-level gate). Kept
 * pure (no Firebase imports) so it stays unit-testable — layout.tsx
 * itself can't be, like every other heavy panel page this session.
 *
 * isUnitAdmin was missing from this check entirely until this fix: a
 * real unit_admin has every other flag false (accept-invitation/route.ts
 * never puts them in any authorities.managerIds, only
 * tenants/{t}/units/{u}.managerIds) and role !== 'platform_member' — so
 * the old check denied every real unit_admin, on every mount, even with
 * a perfectly valid session cookie.
 */
export interface AdminAccessFlags {
  isSuperAdmin: boolean;
  isSystemAdmin: boolean;
  isAuthorityManager: boolean;
  isTenantOwner: boolean;
  isUnitAdmin: boolean;
  isVerticalAdmin: boolean;
  role: string;
}

export function hasAnyAdminAccess(info: AdminAccessFlags): boolean {
  return (
    info.isSuperAdmin ||
    info.isSystemAdmin ||
    info.isAuthorityManager ||
    info.isTenantOwner ||
    info.isUnitAdmin ||
    info.isVerticalAdmin ||
    info.role === 'platform_member'
  );
}

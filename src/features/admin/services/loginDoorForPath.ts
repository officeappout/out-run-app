/**
 * resolveLoginDoorForPath — which login door a lost/never-established
 * session on this pathname should return to.
 *
 * Login-entry-points unification (00-MASTER-PLAN.md, 28.09.2026), hard
 * rule #1: an officer/coordinator is never bounced to /admin/login. This
 * is a UX routing hint, NOT a security decision — a super_admin who lands
 * on the "wrong" door (e.g. because they were browsing a shared
 * /admin/authority/* path when their session expired) still signs in
 * correctly regardless of which door they used: /admin/auth/callback's
 * resolveDestination routes by the REAL role resolved after a genuine
 * sign-in, never by which form sent the link (same reasoning that already
 * makes authority-portal/login safe to send a magic link unconditionally).
 * Getting this heuristic slightly wrong in either direction costs a
 * cosmetically-mismatched login form, never unauthorized access.
 *
 * Mirrors middleware.ts's own AUTHORITY_MANAGER_ALLOWED_PATHS-driven
 * decision at the coarse '/admin/authority' prefix level — a full shared
 * allowlist isn't reused here because middleware.ts can't be imported into
 * a 'use client' component (Edge vs. browser runtime), the same
 * already-documented constraint admin/layout.tsx's own route-protection
 * code lives with today.
 */
export function resolveLoginDoorForPath(pathname: string | null | undefined): '/admin/login' | '/authority-portal/login' {
  if (pathname?.startsWith('/admin/authority')) return '/authority-portal/login';
  return '/admin/login';
}

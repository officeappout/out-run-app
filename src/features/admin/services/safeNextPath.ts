/**
 * resolveSafeNextPath — validates a `?next=` redirect target before ever
 * using it in a router.replace()/router.push().
 *
 * P1-3 (00-MASTER-PLAN.md §13.43): middleware.ts already sets `?next=` when
 * it bounces an unauthenticated /admin/* request to /admin/login (line
 * ~353 of src/middleware.ts) — but until this, nothing on the client ever
 * read it back, so a session expiring mid-navigation always dumped the
 * admin back at /admin root instead of where they were actually headed.
 *
 * Pure function, no Firebase/Next imports — kept separate specifically so
 * it stays vitest-testable (this repo's vitest config is .test.ts-only,
 * no .tsx — see 00-MASTER-PLAN.md §13.46).
 */
export function resolveSafeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Reject protocol-relative ("//host/...") and absolute URLs — both are
  // open-redirect vectors; a validated `next` must be a same-origin path.
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw.includes('://')) return null;
  // Scope to the admin panel — this value only ever comes from middleware
  // bouncing an /admin/* request, so anything else is unexpected/suspect.
  if (!raw.startsWith('/admin')) return null;
  // Never redirect back into the login/callback flow itself — would loop.
  if (raw.startsWith('/admin/login') || raw.startsWith('/admin/auth/callback')) return null;
  return raw;
}

'use client';

import { auth } from './firebase';
import { mintAdminSessionCookie } from './auth.service';

/**
 * Drop-in replacement for fetch() on admin API routes.
 * On 401: refreshes the session cookie via mintAdminSessionCookie and
 * retries once. If the refresh fails (user logged out, rate-limited,
 * network down): redirects to /admin/login.
 *
 * P1-3 (00-MASTER-PLAN.md §13.43/§13.45.1) — used to have its own local
 * `refreshSession` with its own in-flight-promise dedup, duplicating the
 * exact same POST /api/auth/session as auth.service.ts and
 * AdminSessionSync. Now calls the one shared, deduped entrypoint — a 401
 * here that races AdminSessionSync's periodic refresh collapses into the
 * same network call instead of firing twice.
 */
export async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const opts: RequestInit = { ...init, credentials: 'include' };
  const res = await fetch(url, opts);

  if (res.status !== 401) return res;

  const user = auth.currentUser;
  const ok = user ? await mintAdminSessionCookie(user) : false;
  if (!ok) {
    if (typeof window !== 'undefined') {
      window.location.href = '/admin/login';
    }
    throw new Error('Session expired — redirecting to login');
  }

  return fetch(url, opts); // single retry
}

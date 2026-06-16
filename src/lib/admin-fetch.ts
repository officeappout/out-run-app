'use client';

import { auth } from './firebase';

// Singleton — concurrent 401s share one refresh, not N parallel attempts
let inflightRefresh: Promise<void> | null = null;

async function refreshSession(): Promise<void> {
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = (async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('no-user');

    const idToken = await user.getIdToken(/* forceRefresh */ true);
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) throw new Error(`session-refresh-${res.status}`);
  })().finally(() => {
    inflightRefresh = null;
  });

  return inflightRefresh;
}

/**
 * Drop-in replacement for fetch() on admin API routes.
 * On 401: silently refreshes the session cookie and retries once.
 * If the refresh fails (user logged out): redirects to /admin/login.
 */
export async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const opts: RequestInit = { ...init, credentials: 'include' };
  const res = await fetch(url, opts);

  if (res.status !== 401) return res;

  try {
    await refreshSession();
  } catch {
    if (typeof window !== 'undefined') {
      window.location.href = '/admin/login';
    }
    throw new Error('Session expired — redirecting to login');
  }

  return fetch(url, opts); // single retry
}

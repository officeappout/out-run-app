'use client';

/**
 * AdminSessionSync — keeps the server-side admin session cookie in sync
 * with the Firebase Auth state on the client.
 *
 * Mounted once at the top of /admin/layout.tsx. Whenever
 * `onAuthStateChanged` fires with a user, this component fetches a
 * fresh ID token and POSTs it to /api/auth/session, which:
 *   1. Verifies the ID token with the Admin SDK,
 *   2. Resolves the admin role server-side, and
 *   3. Mints an HttpOnly HMAC session cookie consumed by the Edge
 *      middleware for /admin/* gating.
 *
 * The cookie has a 1-hour TTL (matching Firebase ID-token lifetime),
 * so we re-sync every 50 minutes while the tab is open. We also re-sync
 * when the tab regains focus, in case it was suspended past the TTL.
 *
 * On sign-out, the component DELETEs the cookie immediately.
 */

import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

async function postSession(idToken: string): Promise<void> {
  try {
    await fetch('/api/auth/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  } catch (err) {
    console.warn('[AdminSessionSync] Failed to mint session cookie:', err);
  }
}

async function clearSession(): Promise<void> {
  try {
    await fetch('/api/auth/session', {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  } catch (err) {
    console.warn('[AdminSessionSync] Failed to clear session cookie:', err);
  }
}

export function AdminSessionSync() {
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    const startRefresh = () => {
      if (refreshTimer.current) window.clearInterval(refreshTimer.current);
      refreshTimer.current = window.setInterval(async () => {
        const u = auth.currentUser;
        if (!u) return;
        try {
          const idToken = await u.getIdToken(/* forceRefresh */ true);
          await postSession(idToken);
        } catch (err) {
          console.warn('[AdminSessionSync] Refresh failed:', err);
        }
      }, REFRESH_INTERVAL_MS);
    };

    const stopRefresh = () => {
      if (refreshTimer.current) {
        window.clearInterval(refreshTimer.current);
        refreshTimer.current = null;
      }
    };

    const onFocus = async () => {
      const u = auth.currentUser;
      if (!u) return;
      try {
        const idToken = await u.getIdToken(true);
        await postSession(idToken);
      } catch {
        /* swallow — next nav will re-trigger */
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const idToken = await user.getIdToken(/* forceRefresh */ true);
          await postSession(idToken);
          startRefresh();
        } catch (err) {
          console.warn('[AdminSessionSync] Initial mint failed:', err);
        }
      } else {
        stopRefresh();
        await clearSession();
      }
    });

    window.addEventListener('focus', onFocus);

    return () => {
      unsubscribe();
      stopRefresh();
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}

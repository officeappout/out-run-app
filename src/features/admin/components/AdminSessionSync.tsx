'use client';

/**
 * AdminSessionSync — keeps the server-side admin session cookie in sync
 * with the Firebase Auth state on the client.
 *
 * Mounted once at the top of /admin/layout.tsx. Whenever
 * `onAuthStateChanged` fires with a user, this component mints/refreshes
 * the session via `mintAdminSessionCookie` (src/lib/auth.service.ts),
 * which:
 *   1. Verifies the ID token with the Admin SDK,
 *   2. Resolves the admin role server-side, and
 *   3. Mints an HttpOnly HMAC session cookie consumed by the Edge
 *      middleware for /admin/* gating.
 *
 * The cookie has a 1-hour TTL (matching Firebase ID-token lifetime),
 * so we re-sync every 50 minutes while the tab is open. We also re-sync
 * when the tab regains focus, in case it was suspended past the TTL.
 *
 * P1-3 (00-MASTER-PLAN.md §13.43/§13.45.1): this component used to POST
 * to /api/auth/session directly via its own local `postSession`, entirely
 * uncoordinated with the identical calls in auth.service.ts and
 * useSessionRefresh.ts (now retired — its 55-minute timer was a pure
 * subset of this component's 50-minute timer + focus listener, running
 * in parallel for no added coverage). admin/layout.tsx also mounts a
 * fresh instance of THIS component on every loading→loaded render-branch
 * switch (three separate early-return JSX trees), which fired a second
 * onAuthStateChanged-triggered mint on nearly every page load. Routing
 * through mintAdminSessionCookie's own in-flight/recent-success dedup
 * absorbs all of that instead of raising the rate limit — this is what
 * actually eliminates the redundant POSTs, not just moving them around.
 *
 * On sign-out, the component DELETEs the cookie immediately.
 */

import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { mintAdminSessionCookie } from '@/lib/auth.service';

const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

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
        await mintAdminSessionCookie(u); // logs + reports to sessionHealth.store on failure, never throws
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
      await mintAdminSessionCookie(u);
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const ok = await mintAdminSessionCookie(user);
        // Only start the periodic refresh if the mint succeeded.
        // If it failed, the next tab-focus will retry via onFocus.
        if (ok) startRefresh();
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

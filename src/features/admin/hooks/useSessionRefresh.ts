'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const SESSION_TTL_MS = 3600 * 1000;       // must match SESSION_TTL_SECONDS in admin-session.ts
const REFRESH_BEFORE_MS = 5 * 60 * 1000;  // refresh 5 min before expiry → every 55 min

/**
 * Silently renews the admin session cookie before it expires.
 * Call once in the admin layout — covers all pages under /admin.
 */
export function useSessionRefresh() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const schedule = (user: { getIdToken: (force: boolean) => Promise<string> }) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const idToken = await user.getIdToken(true);
          await fetch('/api/auth/session', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });
        } catch (err) {
          console.warn('[session] silent refresh failed:', err);
        }
        schedule(user); // reschedule regardless of success/failure
      }, SESSION_TTL_MS - REFRESH_BEFORE_MS);
    };

    const unsubscribe = onAuthStateChanged(auth, user => {
      clearTimeout(timer);
      if (user) schedule(user);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);
}

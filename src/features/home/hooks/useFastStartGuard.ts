'use client';
/**
 * Home's half of the `/` fast path (enable_fast_startup_v1, src/lib/fast-startup).
 *
 * `/` sends a returning user to /home from the persisted profile without waiting for auth or
 * the users doc. This hook does that check here instead — once, only when `/` left the
 * one-shot marker (normal navigations to /home do no extra reads):
 *   - auth restores to nobody / another uid       → back to `/` (its normal guest/redirect flow);
 *   - auth signs out while we check (revoked token,
 *     deleted account — the refresh fails)        → back to `/`;
 *   - users/{uid} no longer exists                → back to `/` (MAP_ONLY recovery / gateway);
 *   - the doc's onboarding state isn't "home"     → straight to the route `/` would pick
 *                                                   (decideLandingRoute — same function);
 *   - timeout / offline / App Check trouble       → stay (same as opening /home with a
 *                                                   persisted profile today).
 * Every bail clears the last-uid hint first, so `/` can't fast-path straight back here.
 */
import { useEffect } from 'react';
import { onAuthStateChanged, type Unsubscribe } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { fastStartGuardTarget } from '@/lib/fast-startup/landing-decision';
import { clearLastAuthUid, clearPendingVerify, readPendingVerify, writeLastAuthUid } from '@/lib/fast-startup/session-uid';
import { startupMark } from '@/lib/fast-startup/perf';
import { isLandingRealFallbackOn } from '@/lib/landing-fallback/flag';

const VERIFY_TIMEOUT_MS = 8_000;

interface RouterLike {
  replace: (href: string) => void;
}

export function useFastStartGuard(router: RouterLike): void {
  useEffect(() => {
    startupMark('home-mounted');
    const expectedUid = readPendingVerify();
    if (!expectedUid) return;

    let done = false;
    let unsub: Unsubscribe | undefined;
    const bail = (to: string) => {
      if (done) return;
      done = true;
      clearPendingVerify();
      clearLastAuthUid();
      router.replace(to);
    };

    (async () => {
      try {
        await (auth as unknown as { authStateReady?: () => Promise<void> }).authStateReady?.();
      } catch { /* older SDK — currentUser below is the best we have */ }
      if (done) return;
      startupMark('auth-restored');
      const user = auth.currentUser;
      const authTarget = fastStartGuardTarget({ expectedUid, authUid: user?.uid ?? null, doc: 'unknown' });
      if (authTarget || !user) { bail(authTarget ?? '/'); return; }
      writeLastAuthUid(user.uid);

      unsub = onAuthStateChanged(auth, (u) => { if (!u) bail('/'); });
      try {
        const snap = await Promise.race([
          getDoc(doc(db, 'users', user.uid)),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('FAST_START_VERIFY_TIMEOUT')), VERIFY_TIMEOUT_MS)),
        ]);
        startupMark('users-doc');
        const target = fastStartGuardTarget({
          expectedUid,
          authUid: auth.currentUser?.uid ?? null,
          doc: snap.exists() ? (snap.data() ?? {}) : 'missing',
          realFallback: isLandingRealFallbackOn(),
        });
        if (target) bail(target);
      } catch {
        if (!auth.currentUser) bail('/');
      } finally {
        unsub?.();
        unsub = undefined;
        if (!done) clearPendingVerify(); // checked — one verification per fast-path launch
      }
    })();

    return () => {
      done = true;
      unsub?.();
    };
    // router is stable for the page's lifetime; verify once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

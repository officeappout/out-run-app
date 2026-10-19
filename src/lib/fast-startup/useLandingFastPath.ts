'use client';
/**
 * `/` fast path (enable_fast_startup_v1). On mount, before Firebase has restored auth:
 *   - prefetch /home so its chunk is warm whichever way the decision goes;
 *   - if the session hint, the last restored uid and the persisted profile all agree this is
 *     a returning, fully-onboarded user (canFastPathToHome — the same decision page.tsx makes
 *     from the server doc), replace('/') → '/home' right away and leave a one-shot marker so
 *     home's useFastStartGuard re-checks auth + users/{uid} in the background.
 *
 * Returns a ref that is true once the fast path fired — page.tsx's auth listener then skips
 * its own redirect (it would only push /home a second time). Flag off → nothing runs, the ref
 * stays false and `/` behaves exactly as before.
 */
import { useEffect, useRef, type MutableRefObject } from 'react';
import { isFastStartupOn } from './flag';
import { canFastPathToHome } from './landing-decision';
import { markPendingVerify, readLastAuthUid, readPersistedProfile, readSessionHint } from './session-uid';
import { homeCarouselCache } from './daily-record-cache';
import { startupMark } from './perf';

interface RouterLike {
  replace: (href: string) => void;
  prefetch: (href: string) => void;
}

export function useLandingFastPath(router: RouterLike): MutableRefObject<boolean> {
  const takenRef = useRef(false);
  useEffect(() => {
    if (!isFastStartupOn()) return;
    try { router.prefetch('/home'); } catch { /* prefetch is best-effort */ }
    const lastAuthUid = readLastAuthUid();
    const ok = canFastPathToHome({
      hasSessionHint: readSessionHint(),
      lastAuthUid,
      persistedProfile: readPersistedProfile(),
    });
    if (!ok || !lastAuthUid) return;
    takenRef.current = true;
    markPendingVerify(lastAuthUid);
    void homeCarouselCache.prefetch(); // warm today's cached carousel while /home loads
    startupMark('fast-path-redirect');
    router.replace('/home');
    // router is stable for the page's lifetime; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return takenRef;
}

'use client';

/**
 * HealthDeclarationSelfHeal — once per authenticated session, in the background, regenerate a
 * signed health-declaration PDF that never made it to Storage (app killed mid-upload, network
 * failure, timeout). Mounted once in ClientLayout; renders nothing, never blocks the UI.
 * Logic + guards (once per session, no second PDF): services/health-declaration-record.ts.
 */
import { useEffect } from 'react';

/** Let app start / first paint finish before the one private/legal read. */
export const SELF_HEAL_DELAY_MS = 10_000;

export default function HealthDeclarationSelfHeal() {
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void import('@/lib/firebase')
      .then(({ auth }) => {
        if (cancelled) return;
        unsub = auth.onAuthStateChanged((user) => {
          clearTimeout(timer);
          if (!user) return;
          timer = setTimeout(() => {
            void import('../services/health-declaration-record')
              .then(({ healHealthDeclarationPdf }) => healHealthDeclarationPdf(user.uid))
              .catch(() => { /* non-fatal — next session tries again */ });
          }, SELF_HEAL_DELAY_MS);
        });
      })
      .catch(() => { /* non-fatal */ });
    return () => {
      cancelled = true;
      unsub?.();
      clearTimeout(timer);
    };
  }, []);
  return null;
}

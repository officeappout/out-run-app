'use client';

/**
 * SessionHealthBanner — visible surface for a failed admin session-cookie
 * mint (rate limit, network error, rejected token). Mounted alongside
 * AdminSessionSync in every admin/layout.tsx render branch.
 *
 * P1-3 (00-MASTER-PLAN.md §13.43): before this existed, a mint failure was
 * only a console.warn — invisible to the admin, who would just eventually
 * get silently bounced to /admin/login with no explanation. Reads
 * useSessionHealthStore (src/lib/sessionHealth.store.ts), which
 * mintAdminSessionCookie updates on every attempt.
 *
 * David caught (28.09.2026) that the first version of this banner showed
 * ONE fixed message regardless of `lastFailureReason` — a 429 and a
 * network drop read identically, exactly the "different failure modes
 * collapsed into the same report" pattern §13.47/§13.48's standing rule
 * is about. Message now branches on the reason mintAdminSessionCookie
 * actually recorded.
 *
 * §13.5x — the retry button itself had the same problem one layer down:
 * offering an immediate manual retry on a rate_limited failure just
 * re-trips the same limiter. Disabled specifically for that reason;
 * available immediately for 'network' (a transient failure retrying
 * makes sense for right away) and the generic fallback.
 */

import { AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { mintAdminSessionCookie } from '@/lib/auth.service';
import { useSessionHealthStore } from '@/lib/sessionHealth.store';
import { messageForSessionFailure } from '@/features/admin/services/sessionHealthMessage';

export function SessionHealthBanner() {
  const status = useSessionHealthStore((s) => s.status);
  const retrying = useSessionHealthStore((s) => s.retrying);
  const lastFailureReason = useSessionHealthStore((s) => s.lastFailureReason);

  if (status !== 'degraded') return null;

  const isRateLimited = lastFailureReason === 'rate_limited';

  const handleRetry = async () => {
    const user = auth.currentUser;
    if (!user) return;
    useSessionHealthStore.getState().setRetrying(true);
    await mintAdminSessionCookie(user);
    useSessionHealthStore.getState().setRetrying(false);
  };

  return (
    <div
      dir="rtl"
      className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-white text-sm px-4 py-2 flex items-center justify-center gap-3 shadow-md"
    >
      <AlertTriangle size={16} className="flex-shrink-0" />
      <span>{messageForSessionFailure(lastFailureReason)}</span>
      <button
        onClick={handleRetry}
        disabled={retrying || isRateLimited}
        title={isRateLimited ? 'יותר מדי ניסיונות בזמן קצר — המתן כמה דקות' : undefined}
        className="underline font-bold disabled:opacity-60 disabled:no-underline flex-shrink-0"
      >
        {retrying ? 'מנסה...' : 'נסה שוב'}
      </button>
    </div>
  );
}

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
 */

import { AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { mintAdminSessionCookie } from '@/lib/auth.service';
import { useSessionHealthStore } from '@/lib/sessionHealth.store';

export function SessionHealthBanner() {
  const status = useSessionHealthStore((s) => s.status);
  const retrying = useSessionHealthStore((s) => s.retrying);

  if (status !== 'degraded') return null;

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
      <span>לא הצלחנו לרענן את החיבור שלך למערכת. אם זה חוזר, ייתכן שתידרש להתחבר מחדש בקרוב.</span>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="underline font-bold disabled:opacity-60 disabled:no-underline flex-shrink-0"
      >
        {retrying ? 'מנסה...' : 'נסה שוב'}
      </button>
    </div>
  );
}

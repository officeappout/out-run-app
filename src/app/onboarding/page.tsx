"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { useLandingRealFallback } from '@/features/user/onboarding/hooks/useLandingRealFallback';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { LEGACY_GATEWAY_ROUTE, resolveBackFallback } from '@/lib/landing-fallback/fallback-routes';

/**
 * Redirect page for /onboarding -> /gateway
 * Backward compatibility for stale external links (old bookmarks, old
 * marketing/QR/bio-link URLs not tracked in the admin links tool).
 * Was /onboarding-new/intro — a dead-ended pre-08.2026 onboarding chain
 * (intro/selection/roadmap/persona-selection), removed 13.08.2026.
 */
export default function OnboardingRedirect() {
  const router = useRouter();
  const t = useT(onboarding);
  // enable_landing_real_fallback: /home with a loaded profile, else the welcome screen.
  const { enabled: realFallback, loading: flagLoading } = useLandingRealFallback();
  const hasProfile = useUserStore((st) => !!st.profile?.id);

  useEffect(() => {
    if (flagLoading) return;
    router.replace(realFallback ? resolveBackFallback(hasProfile) : LEGACY_GATEWAY_ROUTE);
  }, [router, realFallback, flagLoading, hasProfile]);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-cyan-50 to-blue-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">{t('legacyRedirect.redirecting')}</p>
      </div>
    </div>
  );
}

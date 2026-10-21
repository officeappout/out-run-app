'use client';

/**
 * /join?ref=<uid> — Referral landing page.
 * Captures the referrer UID into sessionStorage, then redirects
 * to the Gateway where the normal onboarding flow begins.
 * After sign-up, the Gateway (or onboarding sync) calls processReferral().
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { captureReferralParam } from '@/features/safecity/services/referral.service';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { useLandingRealFallback } from '@/features/user/onboarding/hooks/useLandingRealFallback';
import { LEGACY_GATEWAY_ROUTE, WELCOME_ROUTE } from '@/lib/landing-fallback/fallback-routes';

export default function JoinPage() {
  const router = useRouter();
  const t = useT(onboarding);
  // enable_landing_real_fallback: the welcome screen instead of the old picker. The referrer is
  // stored first (localStorage referrer_uid) and quick signup / a new Google-Apple account
  // (runExploreMapFlow) consumes it. Waits for the flag only while nothing is known on the device.
  const { enabled: realFallback, loading: flagLoading } = useLandingRealFallback();

  useEffect(() => {
    if (flagLoading) return;
    captureReferralParam();
    router.replace(realFallback ? WELCOME_ROUTE : LEGACY_GATEWAY_ROUTE);
  }, [router, realFallback, flagLoading]);

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] flex items-center justify-center">
      <p className="text-sm text-gray-400 animate-pulse">{t('join.referral.redirecting')}</p>
    </div>
  );
}

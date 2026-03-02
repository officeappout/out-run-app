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

export default function JoinPage() {
  const router = useRouter();

  useEffect(() => {
    captureReferralParam();
    router.replace('/gateway');
  }, [router]);

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] flex items-center justify-center">
      <p className="text-sm text-gray-400 animate-pulse">מעביר אותך...</p>
    </div>
  );
}

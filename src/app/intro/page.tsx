"use client";

/**
 * /intro — entry flow v2: the "why it's hard to keep going" bridge + the five
 * barrier stories (enable_entry_intro_v1). Reached once per device, right after
 * the landing's quick signup ("הרשמה מהירה"), on its way to /explorer.
 *
 * On finish or "דלג": mark the intro seen (durable onboardingPrefs), leave the
 * one-shot arrival hint for /explorer's ring-close overlay, then go there.
 * Flag off → straight to /explorer (nothing links here then anyway).
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import { useEntryIntroV1 } from '@/features/user/onboarding/hooks/useEntryIntroV1';
import { IntroFlow } from '@/features/user/onboarding/intro/components/IntroFlow';
import {
  EXPLORER_ROUTE, INTRO_SEEN_PREF, markIntroArrival,
} from '@/features/user/onboarding/intro/intro-route';

export default function IntroPage() {
  const router = useRouter();
  const { enabled, loading } = useEntryIntroV1();
  const leaving = useRef(false);

  useEffect(() => {
    if (!loading && !enabled) router.replace(EXPLORER_ROUTE);
  }, [loading, enabled, router]);

  const done = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setOnboardingPref(INTRO_SEEN_PREF, '1');
    markIntroArrival(typeof window !== 'undefined' ? window.sessionStorage : null);
    router.replace(EXPLORER_ROUTE);
  }, [router]);

  if (!enabled) return <div className="fixed inset-0 bg-white" />;
  return <IntroFlow onDone={done} />;
}

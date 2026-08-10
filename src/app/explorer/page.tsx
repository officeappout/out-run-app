"use client";

/**
 * /explorer — Lightweight park discovery for guests (MAP_ONLY users).
 *
 * Uses React.lazy + Suspense instead of next/dynamic to preserve
 * the forwardRef on UnifiedLocationStep (next/dynamic wraps in a
 * non-forwardRef shell, which causes the React ref warning).
 *
 * The component is rendered only on the client (guarded by a mount
 * check) to prevent hydration errors from browser-only APIs.
 */

import React, { Suspense, useState, useEffect, lazy } from 'react';
import { useRouter } from 'next/navigation';
import { getOnboardingPrefAsync } from '@/lib/onboardingPrefs';

// ── Lazy import preserves forwardRef (unlike next/dynamic) ───────────
const UnifiedLocationStep = lazy(
  () => import('@/features/user/onboarding/components/steps/UnifiedLocationStep')
);

function LoadingPlaceholder() {
  return (
    <div className="fixed inset-0 bg-[#F8FAFC] flex items-center justify-center">
      <div className="text-4xl font-black text-[#5BC2F2] animate-pulse tracking-widest">
        OUT
      </div>
    </div>
  );
}

export default function ExplorerPage() {
  const router = useRouter();

  // Client-only guard — prevents SSR of browser-dependent code
  const [mounted, setMounted] = useState(false);

  // Fix 2a — before showing the location picker, check for a durably-saved
  // map-arrival answer (written by UnifiedLocationStep, Fix 1). If present,
  // re-hydrate the sessionStorage handoff channel and skip straight to /map
  // instead of re-asking; MapShell's fromExplorer effect then syncs it to
  // Firestore + refreshes the profile. No saved answer → show the picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const authId = await getOnboardingPrefAsync('map_authority_id');
      const neighborhoodId = await getOnboardingPrefAsync('map_neighborhood_id');
      const lat = await getOnboardingPrefAsync('map_anchor_lat');
      const lng = await getOnboardingPrefAsync('map_anchor_lng');
      if (cancelled) return;
      if (authId || lat) {
        if (authId) sessionStorage.setItem('selected_authority_id', authId);
        if (neighborhoodId) sessionStorage.setItem('selected_neighborhood_id', neighborhoodId);
        if (lat) sessionStorage.setItem('selected_anchor_lat', lat);
        if (lng) sessionStorage.setItem('selected_anchor_lng', lng);
        router.replace('/map?fromExplorer=true');
        return;
      }
      setMounted(true);
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (!mounted) return <LoadingPlaceholder />;

  return (
    <Suspense fallback={<LoadingPlaceholder />}>
      <UnifiedLocationStep
        mode="explorer"
        onNext={() => {}}
        onExplorerDismiss={() => {
          router.push('/map?fromExplorer=true');
        }}
      />
    </Suspense>
  );
}

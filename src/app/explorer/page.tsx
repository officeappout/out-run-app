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
import { syncLocationToFirestore, getUserFromFirestore } from '@/lib/firestore.service';
import { useUserStore } from '@/features/user';
import { useToast } from '@/components/ui/Toast';
import { auth } from '@/lib/firebase';

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
  const { showToast } = useToast();

  // Client-only guard — prevents SSR of browser-dependent code
  const [mounted, setMounted] = useState(false);

  // Fix 2a — before showing the location picker, check for a durably-saved
  // map-arrival answer (written by UnifiedLocationStep, Fix 1). If present,
  // re-hydrate the sessionStorage handoff channel and skip straight to /map
  // instead of re-asking; MapShell's fromExplorer effect then syncs it to
  // Firestore + refreshes the profile. No saved answer → show the picker.
  //
  // Explicit-edit intent (explorer_return_to set, e.g. Profile's "עיר" row)
  // always skips this fast path and shows the picker — the user asked to
  // CHANGE their location, so a stale saved answer from a previous /explorer
  // visit must never silently short-circuit that.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const returnTo = typeof window !== 'undefined'
        ? sessionStorage.getItem('explorer_return_to')
        : null;
      if (returnTo) {
        setMounted(true);
        return;
      }
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
        onExplorerDismiss={async () => {
          const returnTo = typeof window !== 'undefined'
            ? sessionStorage.getItem('explorer_return_to')
            : null;

          // Default guest/MAP_ONLY path — unchanged. The actual Firestore
          // write happens in MapShell's fromExplorer effect.
          if (returnTo !== 'profile') {
            router.push('/map?fromExplorer=true');
            return;
          }

          // Explicit edit-from-profile path — write directly here instead of
          // bouncing through /map, then return to Profile.
          sessionStorage.removeItem('explorer_return_to');
          const authorityId = sessionStorage.getItem('selected_authority_id');
          const neighborhoodId = sessionStorage.getItem('selected_neighborhood_id');
          const lat = sessionStorage.getItem('selected_anchor_lat');
          const lng = sessionStorage.getItem('selected_anchor_lng');
          sessionStorage.removeItem('selected_anchor_lat');
          sessionStorage.removeItem('selected_anchor_lng');
          sessionStorage.removeItem('selected_authority_id');
          sessionStorage.removeItem('selected_neighborhood_id');

          if (authorityId || lat) {
            const ok = await syncLocationToFirestore({
              authorityId: authorityId || undefined,
              neighborhoodId: neighborhoodId || undefined,
              anchorLat: lat ? parseFloat(lat) : undefined,
              anchorLng: lng ? parseFloat(lng) : undefined,
            });
            if (ok) {
              try {
                const uid = auth.currentUser?.uid;
                if (uid) {
                  const freshProfile = await getUserFromFirestore(uid);
                  if (freshProfile) useUserStore.getState().initializeProfile(freshProfile);
                }
              } catch { /* /profile does its own re-fetch below, via profile_update_toast */ }
              // /profile doesn't otherwise re-fetch on mount — it trusts
              // whatever's already in useUserStore. This flag makes it do
              // an authoritative re-fetch of its own instead of relying
              // solely on the refresh above landing before the navigation
              // below is observed (same signal handleJITSave already uses
              // for its own /profile returns).
              if (typeof window !== 'undefined') {
                sessionStorage.setItem('profile_update_toast', '1');
              }
            } else {
              showToast('error', 'לא הצלחנו לשמור את המיקום. בדקו חיבור לאינטרנט ונסו שוב.');
            }
          }
          router.replace('/profile');
        }}
      />
    </Suspense>
  );
}

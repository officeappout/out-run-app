'use client';

/**
 * FullMapView — Entry point for the map experience.
 *
 * Architecture:
 *   1. Location Gate  — UnifiedLocationStep must be cleared first.
 *   2. MapModeProvider — wraps everything below with mode context.
 *      initialWorkoutId comes from the Server Component (page.tsx)
 *      so the mode is rock-solid from the very first render.
 *   3. MapShell       — base map + layer router.
 *
 * No map-related hooks, APIs, or GPS calls run until the location gate is passed.
 */

import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserStore } from '@/features/user';
import { syncLocationToFirestore } from '@/lib/firestore.service';
import { MapModeProvider } from '@/features/parks/core/context/MapModeContext';
import type { MapPurpose } from '@/features/user/onboarding/components/steps/UnifiedLocation/location-types';

import MapShell from './MapShell';

const UnifiedLocationStep = lazy(
  () => import('@/features/user/onboarding/components/steps/UnifiedLocationStep'),
);

interface FullMapViewProps {
  initialWorkoutId?: string | null;
  initialContext?: string | null;
  /** Community meeting-point coordinates to fly to on map load */
  spotFocus?: { lat: number; lng: number } | null;
}

export default function FullMapView({ initialWorkoutId, initialContext, spotFocus }: FullMapViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapPurpose = (initialContext ?? searchParams.get('context') ?? 'general') as MapPurpose;

  // If the user just confirmed their location in /explorer, bypass the gate entirely.
  // We read this once — before any state is set — so there is no flash-of-gate.
  const fromExplorer = searchParams.get('fromExplorer') === 'true';

  // Subscribe to individual slices so we only re-render on real changes and
  // can read the persisted values synchronously on the very first render.
  const profile = useUserStore((s) => s.profile);
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const refreshProfile = useUserStore((s) => s.refreshProfile);

  // The user can manually clear the gate by completing UnifiedLocationStep.
  // Keep this as state so the override sticks immediately, even before
  // refreshProfile() roundtrips a new authorityId from Firestore.
  const [manuallyCleared, setManuallyCleared] = useState(false);

  // Derive gate visibility synchronously from the persisted profile so we
  // never flash UnifiedLocationStep when authority is already known.
  //
  // The legacy `useState(fromExplorer)` + `useEffect(...setLocationGateCleared)`
  // pattern caused a one-frame flash of the location gate on every Map-tab
  // visit because the effect only ran AFTER the first render. Deriving the
  // value with useMemo eliminates that in-between render entirely.
  //
  // Spec: map-first. Default to "show map" while state is unknown — only
  // surface the gate when we can affirmatively prove it's needed (profile
  // hydrated AND no authority AND not MAP_ONLY).
  const needsLocationGate = useMemo(() => {
    if (fromExplorer) return false;
    if (manuallyCleared) return false;
    if (!hasHydrated) return false;        // store still rehydrating from storage
    if (!profile) return false;            // profile not loaded — let map render
    if (profile.core?.authorityId) return false;
    if (profile.onboardingPath === 'MAP_ONLY') return false;
    return true;
  }, [fromExplorer, manuallyCleared, hasHydrated, profile]);

  // fromExplorer bypass: clean up the URL and run the same background sync
  // that the bridge gate's handleLocationGateComplete performs.
  useEffect(() => {
    if (!fromExplorer) return;

    // Remove the query param so a manual refresh doesn't re-trigger edge cases
    router.replace('/map');

    if (typeof window === 'undefined') return;

    const authorityId = sessionStorage.getItem('selected_authority_id');
    const lat = sessionStorage.getItem('selected_anchor_lat');
    const lng = sessionStorage.getItem('selected_anchor_lng');

    // Clear immediately so a subsequent session doesn't replay stale data
    sessionStorage.removeItem('selected_anchor_lat');
    sessionStorage.removeItem('selected_anchor_lng');
    sessionStorage.removeItem('selected_authority_id');

    const hasData = authorityId || lat || lng;
    if (hasData) {
      syncLocationToFirestore({
        authorityId: authorityId || undefined,
        anchorLat: lat ? parseFloat(lat) : undefined,
        anchorLng: lng ? parseFloat(lng) : undefined,
      }).then(() => refreshProfile());
    }
  }, [fromExplorer, router, refreshProfile]);

  const handleLocationGateComplete = async () => {
    if (typeof window !== 'undefined') {
      const authorityId = sessionStorage.getItem('selected_authority_id');
      const lat = sessionStorage.getItem('selected_anchor_lat');
      const lng = sessionStorage.getItem('selected_anchor_lng');

      // Clear immediately so a subsequent visit doesn't replay stale data
      sessionStorage.removeItem('selected_anchor_lat');
      sessionStorage.removeItem('selected_anchor_lng');
      sessionStorage.removeItem('selected_authority_id');

      const hasData = authorityId || lat || lng;
      if (hasData) {
        await syncLocationToFirestore({
          authorityId: authorityId || undefined,
          anchorLat: lat ? parseFloat(lat) : undefined,
          anchorLng: lng ? parseFloat(lng) : undefined,
        });
        refreshProfile();
      }
    }
    setManuallyCleared(true);
  };

  if (needsLocationGate) {
    return (
      <Suspense
        // Map-toned skeleton matches the dynamic-import + Suspense fallbacks
        // up the tree, so lazy-loading the gate doesn't introduce a third
        // distinct loading flash.
        fallback={<div className="fixed inset-0 z-[80] bg-[#f3f4f6]" aria-busy="true" />}
      >
        <div className="fixed inset-0 z-[80]">
          <UnifiedLocationStep
            mode="bridge"
            onNext={handleLocationGateComplete}
            purpose={mapPurpose}
          />
        </div>
      </Suspense>
    );
  }

  return (
    <MapModeProvider initialWorkoutId={initialWorkoutId ?? null} initialContext={initialContext}>
      <MapShell spotFocus={spotFocus ?? null} />
    </MapModeProvider>
  );
}

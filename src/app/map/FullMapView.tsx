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

import React, { useState, useEffect, lazy, Suspense } from 'react';
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

  const { profile, refreshProfile } = useUserStore();

  const [locationGateCleared, setLocationGateCleared] = useState(fromExplorer);

  // Standard profile-based auto-clear (existing users with a saved authorityId)
  useEffect(() => {
    if (!profile) return;
    const hasAuthority = !!profile.core?.authorityId;
    const isMapOnly = profile.onboardingPath === 'MAP_ONLY';
    if (hasAuthority || isMapOnly) {
      setLocationGateCleared(true);
    }
  }, [profile]);

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
    setLocationGateCleared(true);
  };

  console.log('🚪 [FullMapView] locationGateCleared:', locationGateCleared, '| initialWorkoutId:', initialWorkoutId, '| hasAuthority:', !!profile?.core?.authorityId, '| onboardingPath:', profile?.onboardingPath);

  if (!locationGateCleared) {
    return (
      <Suspense
        fallback={
          <div className="fixed inset-0 z-[80] bg-white/80 flex items-center justify-center">
            <p className="animate-pulse text-slate-500">טוען...</p>
          </div>
        }
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

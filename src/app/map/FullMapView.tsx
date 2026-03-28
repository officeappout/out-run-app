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
import { useSearchParams } from 'next/navigation';
import { useUserStore } from '@/features/user';
import { syncFieldToFirestore } from '@/lib/firestore.service';
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
  const searchParams = useSearchParams();
  const mapPurpose = (initialContext ?? searchParams.get('context') ?? 'general') as MapPurpose;
  const { profile, refreshProfile } = useUserStore();

  const [locationGateCleared, setLocationGateCleared] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const hasAuthority = !!profile.core?.authorityId;
    const isMapOnly = profile.onboardingPath === 'MAP_ONLY';
    if (hasAuthority || isMapOnly) {
      setLocationGateCleared(true);
    }
  }, [profile]);

  const handleLocationGateComplete = async () => {
    const authorityId =
      typeof window !== 'undefined' ? sessionStorage.getItem('selected_authority_id') : null;
    if (authorityId) {
      await syncFieldToFirestore('core.authorityId', authorityId);
      refreshProfile();
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

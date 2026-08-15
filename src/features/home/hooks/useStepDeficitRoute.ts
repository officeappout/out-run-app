'use client';

/**
 * useStepDeficitRoute — C3 (15.08.2026): resolves a rest-day walking route sized to close
 * today's remaining step-goal gap, for the new home-page card.
 *
 * Deliberately calls generateDynamicRoutes directly (same function free-run uses) instead
 * of going through runSuggestionEngine/routeGenerator.generate() — the rec-engine's own
 * retrofit of this exact computation (workout-engine/core/generators/route.generator.ts).
 * A pragmatic shortcut for a single always-eligible card that doesn't need ranking against
 * other generators, not an abandonment of the shared-engine contract — see the doc-comment
 * on build-home-user-context.ts for what must stay unified if/when a future combined
 * (strength+aerobic) suggestion needs to render identically on home and map.
 *
 * GPS is requested softly (requestPermissionIfAllowed — the same courtesy pattern
 * WorkoutLocationSuggestions.tsx already uses): denied/unsupported/no-fix simply resolves
 * to no route, never a hard prompt.
 */

import { useEffect, useState } from 'react';
import { HOME_STEP_DEFICIT_CARD_ENABLED } from '@/config/feature-flags';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { generateDynamicRoutes } from '@/features/parks/core/services/route-generator.service';
import { buildHomeUserContext } from '@/features/workout-engine/core/context/build-home-user-context';
import { deriveAerobicTargetKm } from '@/features/workout-engine/hybrid/hybrid-aerobic.util';
import type { Route } from '@/features/parks/core/types/route.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

interface UseStepDeficitRouteResult {
  route: Route | null;
  isLoading: boolean;
}

export function useStepDeficitRoute(
  profile: UserFullProfile | null,
  isRestDay: boolean,
): UseStepDeficitRouteResult {
  const [route, setRoute] = useState<Route | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!HOME_STEP_DEFICIT_CARD_ENABLED || !isRestDay || !profile) {
      setRoute(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    useGPSStore.getState().requestPermissionIfAllowed().then(async (coords) => {
      if (cancelled) return;
      if (!coords) {
        setIsLoading(false);
        setRoute(null);
        return;
      }

      const context = buildHomeUserContext({ profile, location: coords });

      // Goal already met today -- nothing to suggest.
      if (context.stepsRemaining <= 0) {
        setIsLoading(false);
        setRoute(null);
        return;
      }

      const targetDistance = deriveAerobicTargetKm(
        { timeBudgetMin: context.availableTimeMin, aerobicShare: 1, aerobicKind: 'walking' },
        0, // no pace-calibration source wired for home yet -- same fallback route.generator.ts uses
        { stepsRemaining: context.stepsRemaining, stepGoal: context.stepGoal },
      );

      try {
        const parks = await fetchRealParks();
        if (cancelled) return;

        const routes = await generateDynamicRoutes({
          userLocation: coords,
          targetDistance,
          activity: 'walking',
          routeGenerationIndex: 0,
          preferences: { includeStrength: false, maxRoutes: 1 },
          parks,
        });

        if (cancelled) return;
        setRoute(routes[0] ?? null);
      } catch (err) {
        if (!cancelled) {
          console.error('[useStepDeficitRoute] generateDynamicRoutes failed', err);
          setRoute(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [profile, isRestDay]);

  return { route, isLoading };
}

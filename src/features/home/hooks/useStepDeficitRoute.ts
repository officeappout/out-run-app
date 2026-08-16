'use client';

/**
 * useStepDeficitRoute — C3 (15.08.2026): resolves a rest-day walking route sized to close
 * today's remaining step-goal gap, for the new home-page card's own preview.
 *
 * REVISED 16.08.2026 after finding the step-goal push deep-link
 * (/map?openRun=walking&targetSteps=N, DiscoverLayer.tsx:390-407) — a real,
 * device-verified mechanism (IS_STEP_GOAL_ROUTE_PREVIEW_ENABLED, re-enabled 12.08 after
 * root-causing a native tap-listener boot-order bug, unrelated to this code) that already
 * does exactly what David asked the card's tap-through to do: open /map with the route
 * carousel pre-built at the target size, "route already shown at top + info-card below."
 * That effect has NO per-user gating of its own (the "David-only" restriction lives on the
 * PUSH-sending side, app_config/feature_flags.stepGoalTestUids — not in this URL-consuming
 * code) — so the card's CTA can navigate straight to that same URL instead of needing a new
 * pre-generated-Route hand-off mechanism. See StatsOverview.tsx's onCta for the navigation.
 *
 * Distance math switched from deriveAerobicTargetKm to stepsToTargetKm
 * (route-request.utils.ts) to match: that's the SAME formula the map-side deep-link uses
 * (stepsToTargetKm(Number(targetSteps))) — using a different formula here would mean the
 * home-card preview shows a different distance than what /map regenerates on tap, exactly
 * the "two mechanisms drift apart" case flagged as a risk to avoid. Also matches the deep-
 * link's own preferences (surface:'road', shortRouteMode:IS_STEP_GOAL_SHORT_ROUTE_ENABLED)
 * for the same reason — this is a preview of what tapping through will produce, not an
 * independent computation using the general-purpose hybrid formula.
 *
 * Deliberately still calls generateDynamicRoutes directly (not
 * runSuggestionEngine/routeGenerator.generate(), the rec-engine's own retrofit of this
 * computation) for the HOME PREVIEW specifically — a pragmatic shortcut for a single
 * always-eligible card that doesn't need ranking against other generators. See the
 * doc-comment on build-home-user-context.ts for what must stay unified if/when a future
 * combined (strength+aerobic) suggestion needs to render identically on home and map.
 *
 * GPS is requested softly (requestPermissionIfAllowed — the same courtesy pattern
 * WorkoutLocationSuggestions.tsx already uses): denied/unsupported/no-fix simply resolves
 * to no route, never a hard prompt.
 */

import { useEffect, useState } from 'react';
import { HOME_STEP_DEFICIT_CARD_ENABLED, IS_STEP_GOAL_SHORT_ROUTE_ENABLED } from '@/config/feature-flags';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { generateDynamicRoutes } from '@/features/parks/core/services/route-generator.service';
import { stepsToTargetKm } from '@/features/parks/core/services/route-request.utils';
import { buildHomeUserContext } from '@/features/workout-engine/core/context/build-home-user-context';
import type { Route } from '@/features/parks/core/types/route.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

interface UseStepDeficitRouteResult {
  route: Route | null;
  isLoading: boolean;
  /** Real, live count -- feed straight into the /map?targetSteps= deep-link on tap. */
  stepsRemaining: number;
}

export function useStepDeficitRoute(
  profile: UserFullProfile | null,
  isRestDay: boolean,
): UseStepDeficitRouteResult {
  const [route, setRoute] = useState<Route | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stepsRemaining, setStepsRemaining] = useState(0);

  useEffect(() => {
    if (!HOME_STEP_DEFICIT_CARD_ENABLED || !isRestDay || !profile) {
      setRoute(null);
      setIsLoading(false);
      setStepsRemaining(0);
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
      setStepsRemaining(context.stepsRemaining);

      // Goal already met today -- nothing to suggest.
      if (context.stepsRemaining <= 0) {
        setIsLoading(false);
        setRoute(null);
        return;
      }

      const targetDistance = stepsToTargetKm(context.stepsRemaining);

      try {
        const parks = await fetchRealParks();
        if (cancelled) return;

        const routes = await generateDynamicRoutes({
          userLocation: coords,
          targetDistance,
          activity: 'walking',
          routeGenerationIndex: 0,
          shortRouteMode: IS_STEP_GOAL_SHORT_ROUTE_ENABLED,
          preferences: {
            includeStrength: false,
            maxRoutes: 1,
            surface: 'road',
          },
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

  return { route, isLoading, stepsRemaining };
}

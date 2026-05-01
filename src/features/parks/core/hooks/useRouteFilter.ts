'use client';

import { useState, useMemo, useEffect } from 'react';
import { Route, ActivityType, PlannedRoute } from '../types/route.types';
import { useUserStore } from '@/features/user';
import { calculateCalories } from '@/lib/calories.utils';
import { generateDynamicRoutes } from '../services/route-generator.service';
import { fetchRealParks } from '../services/parks.service';
import { Park } from '../types/park.types';

let _parksCache: Park[] | null = null;
async function getCachedParks(): Promise<Park[]> {
  if (!_parksCache) _parksCache = await fetchRealParks();
  return _parksCache;
}

interface RouteWithScore extends Route {
  calculatedScore: number;
  distanceFromUser: number;
  isReachableWithoutCar: boolean;
}

export interface FilterPreferences {
  activity: ActivityType;
  duration: number;
  includeStrength: boolean;
  surface?: 'road' | 'trail';
  workoutFocus?: 'flat' | 'hills';
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

function getClosestPointInfo(userLat: number, userLng: number, path: [number, number][]) {
  let minDistance = Infinity;
  let closestIndex = 0;
  path.forEach((point, index) => {
    const dist = getDistanceFromLatLonInKm(userLat, userLng, point[1], point[0]);
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = index;
    }
  });
  return { minDistance, closestIndex };
}

export function useRouteFilter(
  allRoutes: Route[],
  userLocation: { lat: number; lng: number } | null,
  routeGenerationIndex: number = 0,
  mapMode?: string,
) {
  const [preferences, setPreferences] = useState<FilterPreferences>({
    activity: 'walking',
    duration: 30,
    includeStrength: false,
    surface: 'road',
  });

  const profile = useUserStore((state) => state.profile);
  const userWeight = (profile as any)?.core?.weight || 70;

  const [dynamicRoutes, setDynamicRoutes] = useState<Route[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Dynamic route generation — only fires on shuffle (routeGenerationIndex > 0)
  // and only in discover/builder modes.
  useEffect(() => {
    if (mapMode !== 'discover' && mapMode !== 'builder') return;
    if (!userLocation) {
      setDynamicRoutes([]);
      return;
    }

    const shouldGenerate = routeGenerationIndex > 0;

    if (shouldGenerate) {
      setIsGenerating(true);

      let speedKmH = 10;
      if (preferences.activity === 'cycling') speedKmH = 20;
      if (preferences.activity === 'walking') speedKmH = 5;
      const targetDistance = (preferences.duration / 60) * speedKmH;

      getCachedParks()
        .then((parks) =>
          generateDynamicRoutes({
            userLocation,
            targetDistance,
            activity: preferences.activity,
            routeGenerationIndex,
            preferences: {
              includeStrength: preferences.includeStrength,
              surface: preferences.surface,
            },
            parks,
          }),
        )
        .then((routes) => {
          setDynamicRoutes(routes);
          setIsGenerating(false);
        })
        .catch((error) => {
          console.error('Error generating dynamic routes:', error);
          setDynamicRoutes([]);
          setIsGenerating(false);
        });
    } else {
      setDynamicRoutes([]);
    }
  }, [userLocation, preferences, routeGenerationIndex, mapMode]);

  const filteredRoutes = useMemo(() => {
    if (!userLocation) {
      return [];
    }

    let speedKmH = 10;
    if (preferences.activity === 'cycling') speedKmH = 20;
    if (preferences.activity === 'walking') speedKmH = 5;

    const targetTotalDistance = (preferences.duration / 60) * speedKmH;

    let candidates = allRoutes.filter((route) => {
      const routeActivity = route.activityType || route.type;
      if (routeActivity !== preferences.activity) return false;
      if (preferences.includeStrength && !route.features?.hasGym) return false;
      return true;
    });

    if (preferences.includeStrength) {
      candidates.sort((a, b) => {
        const aHasGym = a.features?.hasGym ? 1 : 0;
        const bHasGym = b.features?.hasGym ? 1 : 0;
        return bHasGym - aHasGym;
      });
    }

    const processedRoutes = candidates
      .map((route) => {
        let matchScore = 50;
        let distFromUser = 0;
        let distFromRouteEndToHome = 0;
        let finalPath = route.path;
        let totalProjectedDistance = route.distance;
        let isLocalRoute = false;

        if (route.path && route.path.length > 0) {
          const { minDistance, closestIndex } = getClosestPointInfo(userLocation.lat, userLocation.lng, route.path);
          distFromUser = minDistance;

          const routeEndPoint = route.path[route.path.length - 1];
          distFromRouteEndToHome = getDistanceFromLatLonInKm(
            userLocation.lat,
            userLocation.lng,
            routeEndPoint[1],
            routeEndPoint[0]
          );

          const routeLength = route.distance;
          totalProjectedDistance = distFromUser + routeLength + distFromRouteEndToHome;

          const isWithinTimeBudget = totalProjectedDistance <= targetTotalDistance * 1.1;
          const isWarmupReasonable = distFromUser < targetTotalDistance * 0.4 || distFromUser < 4.0;

          if (isWarmupReasonable && isWithinTimeBudget) {
            isLocalRoute = true;
            const reorderedPath = [...route.path.slice(closestIndex), ...route.path.slice(0, closestIndex)];
            const userPoint: [number, number] = [userLocation.lng, userLocation.lat];
            finalPath = [userPoint, ...reorderedPath];

            matchScore -= distFromUser * 3;
            matchScore -= distFromRouteEndToHome * 2;
            if (route.analytics?.rating) {
              matchScore += route.analytics.rating * 3;
            }
          } else {
            return null;
          }

          const diffKm = Math.abs(totalProjectedDistance - targetTotalDistance);
          if (diffKm <= 2.0) matchScore += 30;
          else if (diffKm <= 4.0) matchScore += 10;
          else matchScore -= 20;
        }

        if (preferences.surface) {
          if (preferences.surface === route.features?.surface) matchScore += 15;
          else matchScore -= 25;
        }

        if (preferences.includeStrength && route.features?.hasGym) {
          matchScore += 30;
        }

        const estimatedCalories = calculateCalories(preferences.activity, route.duration || 0, userWeight);

        return {
          ...route,
          // Preserve original path and distance — RouteDetailSheet relies on them.
          // displayPath is the rotated/user-prepended geometry for AppMap + camera.
          // projectedDistance is the full trip estimate (walk-to-start + route + walk-home).
          displayPath: finalPath,
          projectedDistance: Number(totalProjectedDistance.toFixed(1)),
          calculatedScore: matchScore,
          score: estimatedCalories,
          distanceFromUser: distFromUser,
          isReachableWithoutCar: isLocalRoute,
        };
      })
      .filter((r): r is RouteWithScore => r !== null)
      .filter((r) => r.calculatedScore > 20)
      .sort((a, b) => b.calculatedScore - a.calculatedScore);

    if (routeGenerationIndex > 0 && dynamicRoutes.length > 0) {
      const sortedDynamic = [...dynamicRoutes]
        .sort((a, b) => (b.calculatedScore || 0) - (a.calculatedScore || 0))
        .slice(0, 5);

      return sortedDynamic.map((route) => {
        const estimatedCalories = calculateCalories(preferences.activity, route.duration || 0, userWeight);
        return {
          ...route,
          score: estimatedCalories,
        } as RouteWithScore;
      });
    }

    if (processedRoutes.length === 0) {
      return [];
    }

    return processedRoutes;
  }, [allRoutes, preferences, userLocation, userWeight, dynamicRoutes, routeGenerationIndex]);

  const updateFilter = (newPrefs: Partial<FilterPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...newPrefs }));
  };

  return { filteredRoutes, preferences, updateFilter, isGenerating };
}

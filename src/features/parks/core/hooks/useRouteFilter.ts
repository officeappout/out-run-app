import { useState, useMemo, useEffect } from 'react';
import { Route, ActivityType, PlannedRoute } from '../types/route.types';
import { useUserStore } from '@/features/user';
import { calculateCalories } from '@/lib/calories.utils';
import { generateDynamicRoutes } from '../services/route-generator.service';
import { MapboxService } from '../services/mapbox.service';
import { MOCK_PARKS } from '../data/mock-locations';

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
  routeGenerationIndex: number = 0
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

  const [smartFallbackRoute, setSmartFallbackRoute] = useState<RouteWithScore | null>(null);
  const [isLoadingSmartPath, setIsLoadingSmartPath] = useState(false);

  // ✅ Reset smartFallbackRoute when routeGenerationIndex changes (shuffle triggered)
  useEffect(() => {
    setSmartFallbackRoute(null);
  }, [routeGenerationIndex]);

  useEffect(() => {
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

      generateDynamicRoutes({
        userLocation,
        targetDistance,
        activity: preferences.activity,
        routeGenerationIndex,
        preferences: {
          includeStrength: preferences.includeStrength,
          surface: preferences.surface,
        },
        parks: MOCK_PARKS,
      })
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
  }, [userLocation, preferences, routeGenerationIndex]);

  // ✅ FIXED: Load smart path only once when conditions are right
  useEffect(() => {
    // Don't load if:
    // 1. No user location
    // 2. Routes already exist
    // 3. Already loaded smart fallback (avoid reloading!)
    if (!userLocation || allRoutes.length > 0 || smartFallbackRoute) {
      return;
    }

    let speedKmH = 10;
    if (preferences.activity === 'cycling') speedKmH = 20;
    if (preferences.activity === 'walking') speedKmH = 5;
    const targetTotalDistance = (preferences.duration / 60) * speedKmH;

    const angleOffset = (routeGenerationIndex * 45) % 360;
    const angleRad = (angleOffset * Math.PI) / 180;
    const kmPerDegree = 111;
    const routeRadius = (targetTotalDistance / 3) / kmPerDegree;

    const waypoint1 = {
      lng: userLocation.lng + routeRadius * Math.cos(angleRad),
      lat: userLocation.lat + routeRadius * Math.sin(angleRad),
    };
    const waypoint2 = {
      lng: userLocation.lng + routeRadius * Math.cos(angleRad + (2 * Math.PI) / 3),
      lat: userLocation.lat + routeRadius * Math.sin(angleRad + (2 * Math.PI) / 3),
    };
    const waypoint3 = {
      lng: userLocation.lng + routeRadius * Math.cos(angleRad + (4 * Math.PI) / 3),
      lat: userLocation.lat + routeRadius * Math.sin(angleRad + (4 * Math.PI) / 3),
    };

    const waypointsToUse = [
      { lat: waypoint1.lat, lng: waypoint1.lng },
      { lat: waypoint2.lat, lng: waypoint2.lng },
      { lat: waypoint3.lat, lng: waypoint3.lng },
    ];

    setIsLoadingSmartPath(true);

    MapboxService.getSmartPath(
      userLocation,
      userLocation,
      preferences.activity === 'cycling' ? 'cycling' : 'walking',
      waypointsToUse
    )
      .then((result) => {
        if (result && result.path && result.path.length > 10) {
          const routeDistanceKm = result.distance / 1000;
          const routeDurationMinutes = Math.round((routeDistanceKm / speedKmH) * 60);
          const estimatedCalories = calculateCalories(preferences.activity, routeDurationMinutes, userWeight);

          const activityName =
            preferences.activity === 'running'
              ? 'ריצה'
              : preferences.activity === 'cycling'
                ? 'רכיבה'
                : 'הליכה';

          const route: RouteWithScore = {
            id: `generated-smart-${routeGenerationIndex}-${Date.now()}`,
            name: preferences.includeStrength ? 'סיבוב כושר בשכונה' : 'סיבוב מותאם אישית',
            description: preferences.includeStrength
              ? `מסלול ${activityName} לולאתי של ${preferences.duration} דקות עם מתקני כושר חיצוניים`
              : `מסלול ${activityName} לולאתי של ${preferences.duration} דקות מהמיקום שלך`,
            distance: Number(routeDistanceKm.toFixed(1)),
            duration: routeDurationMinutes,
            score: estimatedCalories,
            type: preferences.activity,
            activityType: preferences.activity,
            difficulty: 'easy',
            path: result.path,
            segments: [],
            rating: 4.5,
            calories: estimatedCalories,
            analytics: { usageCount: 0, rating: 0, heatMapScore: 0 },
            features: {
              hasGym: preferences.includeStrength,
              hasBenches: true,
              scenic: false,
              lit: true,
              terrain: preferences.workoutFocus === 'hills' ? 'hilly' : 'flat',
              environment: 'urban',
              trafficLoad: 'low',
              surface: preferences.surface || 'road',
            },
            isReachableWithoutCar: true,
            distanceFromUser: 0,
            calculatedScore: 100,
            source: { type: 'system', name: 'OutRun AI' },
          };
          setSmartFallbackRoute(route);
          console.log(`[useRouteFilter] ✅ Smart path loaded with ${result.path.length} points`);
        }
      })
      .catch((error) => {
        console.warn('[useRouteFilter] Smart path failed, will use triangle fallback:', error);
      })
      .finally(() => {
        setIsLoadingSmartPath(false);
      });
  }, [userLocation, allRoutes.length]);

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

        const routeDurationMinutes = Math.round((totalProjectedDistance / speedKmH) * 60);
        const estimatedCalories = calculateCalories(preferences.activity, routeDurationMinutes, userWeight);

        return {
          ...route,
          path: finalPath,
          calculatedScore: matchScore,
          score: estimatedCalories,
          distanceFromUser: distFromUser,
          isReachableWithoutCar: isLocalRoute,
          distance: Number(totalProjectedDistance.toFixed(1)),
          duration: Math.round((totalProjectedDistance / speedKmH) * 60),
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
        const routeDurationMinutes = Math.round((route.distance / speedKmH) * 60);
        const estimatedCalories = calculateCalories(preferences.activity, routeDurationMinutes, userWeight);
        return {
          ...route,
          score: estimatedCalories,
          duration: routeDurationMinutes,
        } as RouteWithScore;
      });
    }

    if (processedRoutes.length === 0) {
      if (smartFallbackRoute) {
        return [smartFallbackRoute];
      }

      const angleOffset = (routeGenerationIndex * 45) % 360;
      const angleRad = (angleOffset * Math.PI) / 180;
      const kmPerDegree = 111;
      const routeRadius = (targetTotalDistance / 3) / kmPerDegree;

      const waypoint1 = {
        lng: userLocation.lng + routeRadius * Math.cos(angleRad),
        lat: userLocation.lat + routeRadius * Math.sin(angleRad),
      };
      const waypoint2 = {
        lng: userLocation.lng + routeRadius * Math.cos(angleRad + (2 * Math.PI) / 3),
        lat: userLocation.lat + routeRadius * Math.sin(angleRad + (2 * Math.PI) / 3),
      };
      const waypoint3 = {
        lng: userLocation.lng + routeRadius * Math.cos(angleRad + (4 * Math.PI) / 3),
        lat: userLocation.lat + routeRadius * Math.sin(angleRad + (4 * Math.PI) / 3),
      };

      const dummyPath = [
        [userLocation.lng, userLocation.lat],
        [waypoint1.lng, waypoint1.lat],
        [waypoint2.lng, waypoint2.lat],
        [waypoint3.lng, waypoint3.lat],
        [userLocation.lng, userLocation.lat],
      ] as [number, number][];

      const estimatedCalories = calculateCalories(preferences.activity, preferences.duration, userWeight);

      const routeName = preferences.includeStrength ? 'סיבוב כושר בשכונה' : 'סיבוב מותאם אישית';
      const activityName =
        preferences.activity === 'running' ? 'ריצה' : preferences.activity === 'cycling' ? 'רכיבה' : 'הליכה';
      const description = preferences.includeStrength
        ? `מסלול ${activityName} לולאתי של ${preferences.duration} דקות עם מתקני כושר חיצוניים`
        : `מסלול ${activityName} לולאתי של ${preferences.duration} דקות מהמיקום שלך`;

      const generatedRoute: RouteWithScore = {
        id: `generated-local-${routeGenerationIndex}`,
        name: routeName,
        description: description,
        distance: Number(targetTotalDistance.toFixed(1)),
        duration: preferences.duration,
        score: estimatedCalories,
        type: preferences.activity,
        activityType: preferences.activity,
        difficulty: 'easy',
        path: dummyPath,
        segments: [],
        rating: 4.5,
        calories: estimatedCalories,
        analytics: { usageCount: 0, rating: 0, heatMapScore: 0 },
        features: {
          hasGym: preferences.includeStrength,
          hasBenches: true,
          scenic: false,
          lit: true,
          terrain: preferences.workoutFocus === 'hills' ? 'hilly' : 'flat',
          environment: 'urban',
          trafficLoad: 'low',
          surface: preferences.surface || 'road',
        },
        isReachableWithoutCar: true,
        distanceFromUser: 0,
        calculatedScore: 100,
        source: { type: 'system', name: 'OutRun AI' },
      };
      return [generatedRoute];
    }

    return processedRoutes;
  }, [allRoutes, preferences, userLocation, userWeight, dynamicRoutes, smartFallbackRoute, routeGenerationIndex]);

  const updateFilter = (newPrefs: Partial<FilterPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...newPrefs }));
  };

  return { filteredRoutes, preferences, updateFilter, isGenerating: isGenerating || isLoadingSmartPath };
}
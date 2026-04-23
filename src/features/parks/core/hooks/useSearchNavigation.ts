'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapboxService } from '../services/mapbox.service';
import { Route, ActivityType } from '../types/route.types';
import { fetchRealParks } from '../services/parks.service';
import type { Park } from '../types/park.types';
import { getCachedOfficialRoutes, routePassesNearPoint, InventoryService } from '../services/inventory.service';

export type RouteVariant = 'recommended' | 'scenic' | 'facilityRich';

export interface SearchSuggestion {
  text: string;
  coords: [number, number];
  _source?: 'mapbox' | 'park' | 'route';
  _id?: string;
}

export interface NavVariants {
  recommended: Route | null;
  scenic: Route | null;
  facilityRich: Route | null;
}

let _parksSearchCache: Park[] | null = null;
async function getCachedParks(): Promise<Park[]> {
  if (!_parksSearchCache) _parksSearchCache = await fetchRealParks();
  return _parksSearchCache;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface SearchNavigationState {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  suggestions: SearchSuggestion[];
  setSuggestions: (s: SearchSuggestion[]) => void;
  isSearching: boolean;
  selectedAddress: any;
  isFilterOpen: boolean;
  setIsFilterOpen: (v: boolean) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  fetchNavigationVariants: (addr: { text: string; coords: [number, number] }, activity: ActivityType) => Promise<void>;
  navigationVariants: NavVariants;
  setNavigationVariants: (v: NavVariants) => void;
  selectedVariant: RouteVariant;
  setSelectedVariant: (v: RouteVariant) => void;
  navActivity: ActivityType;
  setNavActivity: (a: ActivityType) => void;
}

export function useSearchNavigation(
  currentUserPos: { lat: number; lng: number } | null,
  setFocusedRoute: (r: Route | null) => void,
  setSelectedRoute: (r: Route | null) => void,
): SearchNavigationState {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [navigationVariants, setNavigationVariants] = useState<NavVariants>({
    recommended: null, scenic: null, facilityRich: null,
  });
  const [selectedVariant, setSelectedVariant] = useState<RouteVariant>('recommended');
  const [navActivity, setNavActivity] = useState<ActivityType>('walking');

  useEffect(() => {
    if (searchQuery.length < 3) { setSuggestions([]); setIsSearching(false); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const term = searchQuery.toLowerCase();

        const [mapboxResults, parks, routes] = await Promise.all([
          MapboxService.searchAddress(searchQuery),
          getCachedParks(),
          getCachedOfficialRoutes(),
        ]);

        const parkHits: SearchSuggestion[] = parks
          .filter(p =>
            p.name?.toLowerCase().includes(term) ||
            p.city?.toLowerCase().includes(term),
          )
          .slice(0, 5)
          .map(p => ({
            text: p.name + (p.city ? ` · ${p.city}` : ''),
            coords: [p.location?.lng ?? 0, p.location?.lat ?? 0] as [number, number],
            _source: 'park' as const,
            _id: p.id,
          }));

        const routeHits: SearchSuggestion[] = routes
          .filter(r =>
            r.name?.toLowerCase().includes(term) ||
            r.city?.toLowerCase().includes(term),
          )
          .filter(r => r.path?.length > 0)
          .slice(0, 3)
          .map(r => ({
            text: r.name + (r.city ? ` · ${r.city}` : ''),
            coords: r.path[0] as [number, number],
            _source: 'route' as const,
            _id: r.id,
          }));

        const geoHits: SearchSuggestion[] = mapboxResults.map(r => ({
          ...r,
          _source: 'mapbox' as const,
        }));

        setSuggestions([...parkHits, ...routeHits, ...geoHits]);
      } catch { setSuggestions([]); }
      finally { setIsSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchNavigationVariants = useCallback(async (
    address: { text: string; coords: [number, number] },
    activity: ActivityType,
  ) => {
    if (!currentUserPos || !address?.coords) return;
    setSelectedAddress(address);
    const [destLng, destLat] = address.coords;
    const dest = { lat: destLat, lng: destLng };
    const mapboxProfile = activity === 'cycling' ? 'cycling' : 'walking';

    const mid = {
      lat: (currentUserPos.lat + destLat) / 2,
      lng: (currentUserPos.lng + destLng) / 2,
    };

    const [parks, facilities, official] = await Promise.all([
      fetchRealParks(),
      InventoryService.fetchFacilities(),
      getCachedOfficialRoutes(),
    ]);

    const nearParks = parks
      .filter(p => p.location?.lat && p.location?.lng)
      .sort((a, b) =>
        haversineKm(mid.lat, mid.lng, a.location.lat, a.location.lng) -
        haversineKm(mid.lat, mid.lng, b.location.lat, b.location.lng),
      )
      .slice(0, 2)
      .map(p => ({ lat: p.location.lat, lng: p.location.lng }));

    const nearFacilities = facilities
      .filter(f => ['water', 'gym'].includes(f.type) && f.location?.lat)
      .sort((a, b) =>
        haversineKm(mid.lat, mid.lng, a.location.lat, a.location.lng) -
        haversineKm(mid.lat, mid.lng, b.location.lat, b.location.lng),
      )
      .slice(0, 2)
      .map(f => ({ lat: f.location.lat, lng: f.location.lng }));

    // Step 1: check official routes near destination
    const nearbyOfficial = official
      .filter(r => r.activityType === activity || !r.activityType)
      .filter(r => routePassesNearPoint(r, destLat, destLng, 1.5))
      .sort((a, b) => (a.distance || 0) - (b.distance || 0));

    let recommendedVariant: Route | null = null;
    if (nearbyOfficial.length > 0) {
      const src = nearbyOfficial[0];
      recommendedVariant = {
        ...src,
        id: `nav-recommended-${src.id}`,
        name: `מומלץ — ${src.name || address.text}`,
      };
    }

    // Step 2: parallel Mapbox calls (Scenic + Facility always, Fastest only as fallback)
    const mapboxCalls: Promise<any>[] = [
      MapboxService.getSmartPath(currentUserPos, dest, mapboxProfile, nearParks),
      MapboxService.getSmartPath(currentUserPos, dest, mapboxProfile, nearFacilities),
    ];
    if (!recommendedVariant) {
      mapboxCalls.push(MapboxService.getSmartPath(currentUserPos, dest, mapboxProfile, []));
    }

    const results = await Promise.allSettled(mapboxCalls);
    const scenicResult = results[0];
    const facilityResult = results[1];
    const fastestResult = results.length > 2 ? results[2] : null;

    const buildRoute = (result: PromiseSettledResult<any> | null, label: string, variantId: string): Route | null => {
      if (!result || result.status !== 'fulfilled' || !result.value) return null;
      const { path, distance, duration } = result.value;
      const km = parseFloat((distance / 1000).toFixed(2));
      return {
        id: `nav-${variantId}-${Date.now()}`,
        name: `${label} ל${address.text || 'יעד'}`,
        description: `ניווט ${activity === 'running' ? 'בריצה' : activity === 'cycling' ? 'באופניים' : 'בהליכה'}`,
        distance: km,
        duration: Math.round(duration / 60),
        score: Math.round(km * 60),
        rating: 5,
        calories: Math.round(km * (activity === 'cycling' ? 25 : 65)),
        type: activity,
        activityType: activity,
        difficulty: 'easy',
        path,
        segments: [],
        features: { hasGym: false, hasBenches: true, lit: true, scenic: variantId === 'scenic', terrain: 'road', environment: 'urban', trafficLoad: 'medium', surface: 'asphalt' },
        source: { type: 'system', name: 'Navigation' },
      };
    };

    if (!recommendedVariant) {
      recommendedVariant = buildRoute(fastestResult, 'מסלול ישיר', 'recommended');
    }

    const variants: NavVariants = {
      recommended: recommendedVariant,
      scenic: buildRoute(scenicResult, 'מסלול ירוק', 'scenic'),
      facilityRich: buildRoute(facilityResult, 'מסלול מתקנים', 'facility'),
    };

    setNavigationVariants(variants);
    setSelectedVariant('recommended');
    setNavActivity(activity);

    const primary = variants.recommended ?? variants.scenic ?? variants.facilityRich;
    if (primary) {
      setFocusedRoute(primary);
      setSelectedRoute(primary);
    }
  }, [currentUserPos, setFocusedRoute, setSelectedRoute]);

  return {
    searchQuery, setSearchQuery, suggestions, setSuggestions, isSearching,
    selectedAddress,
    isFilterOpen, setIsFilterOpen, searchInputRef,
    fetchNavigationVariants,
    navigationVariants, setNavigationVariants,
    selectedVariant, setSelectedVariant,
    navActivity, setNavActivity,
  };
}

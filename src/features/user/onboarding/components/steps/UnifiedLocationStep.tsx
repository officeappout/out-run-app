'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { InventoryService } from '@/features/parks';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import { ISRAELI_LOCATIONS } from '@/lib/data/israel-locations';
import dynamic from 'next/dynamic';
import type { MapRef } from 'react-map-gl';
import type { Map as MapboxGLMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getCategoryBranding } from '@/features/admin/services/category-branding.service';
import type { CategoryBrandingConfig } from '@/features/admin/services/category-branding.service';
import { getFacilityIcon, resolveCategoryKey } from '@/utils/facility-icon';

// ── Refactored Module Imports ────────────────────────────
import {
  type UnifiedLocationStepProps,
  type NearbyFacility,
  type RouteWithDistance,
  type CityData,
  type SportContext,
  type TrainingContext,
  type SettlementNaming,
  LocationStage,
} from './UnifiedLocation/location-types';

import { MAPBOX_TOKEN, MAPBOX_STYLE } from './UnifiedLocation/location-constants';

import {
  setMapLanguageToHebrew,
  calculateDistance,
  formatDistance,
  reverseGeocode,
  getSettlementType,
  getSettlementNaming,
  findAuthorityIdByCity,
  classifySportContext,
  fetchNearbyFacilities,
  fetchHeroRoute,
  applyStrengthTierFilter,
  flattenLocations,
  getDefaultCoordinates,
} from './UnifiedLocation/location-utils';

// ── Sub-Components ───────────────────────────────────────
import { InitialCard } from './UnifiedLocation/sub-components/InitialCard';
import { LocatingCard } from './UnifiedLocation/sub-components/LocatingCard';
import { ConfirmationCard } from './UnifiedLocation/sub-components/ConfirmationCard';
import { SearchOverlay } from './UnifiedLocation/sub-components/SearchOverlay';
import { RadarPulse } from './UnifiedLocation/sub-components/RadarPulse';

// ── Dynamic Mapbox Imports (avoid SSR) ───────────────────
const MapboxMap = dynamic(() => import('react-map-gl').then((mod) => mod.default), { ssr: false });
const MapboxMarker = dynamic(() => import('react-map-gl').then((mod) => mod.Marker), { ssr: false });
const MapboxSource = dynamic(() => import('react-map-gl').then((mod) => mod.Source), { ssr: false });
const MapboxLayer = dynamic(() => import('react-map-gl').then((mod) => mod.Layer), { ssr: false });

// ============================================
// MAIN COMPONENT (State Machine & Map)
// ============================================

export default function UnifiedLocationStep({ onNext }: UnifiedLocationStepProps) {
  const { updateData, setMajorRoadmapStep } = useOnboardingStore();
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  
  // Get gender from sessionStorage
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') || 'male') as 'male' | 'female'
    : 'male';
  const t = (male: string, female: string) => gender === 'female' ? female : male;

  // ── Selected Sports from onboarding state ──
  const allSelectedSports: string[] = (() => {
    if (typeof window === 'undefined') return [];
    const stored = sessionStorage.getItem('onboarding_selected_sports');
    if (!stored) return [];
    try {
      const arr = JSON.parse(stored) as string[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  })();
  const selectedSportId: string | null = allSelectedSports[0] || null;
  const sportContext = classifySportContext(allSelectedSports);

  // ── Training Context ──
  const userProfile = useUserStore((state) => state.profile);
  const trainingContext: TrainingContext | null = (() => {
    if (!userProfile?.progression?.activePrograms?.length) return null;
    const program = userProfile.progression.activePrograms[0];
    const templateId = program.templateId || null;
    const focusDomain = program.focusDomains?.[0];
    const domainLevel = focusDomain && userProfile.progression.domains?.[focusDomain]
      ? userProfile.progression.domains[focusDomain]!.currentLevel
      : 1;
    return { programTemplateId: templateId, level: domainLevel };
  })();

  // ── Stage Control ──
  const [stage, setStage] = useState<LocationStage>(LocationStage.INITIAL);

  // ── Location Data ──
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [detectedNeighborhood, setDetectedNeighborhood] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');

  // ── Map State ──
  const [viewState, setViewState] = useState({
    longitude: 34.7818,
    latitude: 32.0853,
    zoom: 7,
  });

  // ── Facilities Data ──
  const [nearbyFacilities, setNearbyFacilities] = useState<NearbyFacility[]>([]);
  const [isLoadingParks, setIsLoadingParks] = useState(false);
  const [isLoadingCurated, setIsLoadingCurated] = useState(false);

  // ── Infrastructure & City Stats ──
  const [infraStats, setInfraStats] = useState<{ totalKm: number; segmentCount: number } | null>(null);
  const [cityAssetCounts, setCityAssetCounts] = useState<{ gyms: number; courts: number; nature: number } | null>(null);
  const [settlementNaming, setSettlementNaming] = useState<SettlementNaming | null>(null);
  const [heroRoute, setHeroRoute] = useState<RouteWithDistance | null>(null);

  // ── Category Branding ──
  const [brandingConfig, setBrandingConfig] = useState<CategoryBrandingConfig | null>(null);

  // ── UI State ──
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [showRadar, setShowRadar] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── "Power of One" — best match cycling ──
  const [bestMatchIndex, setBestMatchIndex] = useState(0);

  // ── Search State ──
  const [searchQuery, setSearchQuery] = useState('');
  const [cities, setCities] = useState<CityData[]>([]);
  const [filteredCities, setFilteredCities] = useState<CityData[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Resolved Authority ──
  const [resolvedAuthorityId, setResolvedAuthorityId] = useState<string | null>(null);

  // ══════════════════════════════════════════════════════════════════
  // EFFECTS
  // ══════════════════════════════════════════════════════════════════

  // Load category branding on mount
  useEffect(() => {
    getCategoryBranding()
      .then((config) => setBrandingConfig(config))
      .catch(console.error);
  }, []);

  // Load cities on mount
  useEffect(() => {
    const loadCities = () => {
      const flattened = flattenLocations(ISRAELI_LOCATIONS);
      const cityData: CityData[] = flattened.map(loc => ({
        id: loc.id,
        name: loc.name,
        displayName: loc.displayName,
        type: loc.type,
        lat: loc.coordinates?.lat || getDefaultCoordinates(loc.id, loc.parentId).lat,
        lng: loc.coordinates?.lng || getDefaultCoordinates(loc.id, loc.parentId).lng,
        trainers: 0,
        gyms: 0,
        isMapped: false,
        population: loc.population,
        parentId: loc.parentId,
        parentName: loc.parentName,
      })).sort((a, b) => b.population - a.population);
      
      setCities(cityData);
    };
    loadCities();
  }, []);

  // Filter cities based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCities(cities.slice(0, 15));
    } else {
      const queryWords = searchQuery.toLowerCase().trim().split(/\s+/).filter(word => word.length > 0);
      const filtered = cities.filter(city => {
        const cityFullName = `${city.name} ${city.displayName} ${city.parentName || ''}`.toLowerCase();
        return queryWords.every(word => cityFullName.includes(word));
      }).slice(0, 15);
      setFilteredCities(filtered);
    }
  }, [searchQuery, cities]);

  // Focus search input
  useEffect(() => {
    if (stage === LocationStage.SEARCHING && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [stage]);

  // Handle map load
  const handleMapLoad = useCallback((event: { target: MapboxGLMap }) => {
    setIsMapLoading(false);
    const map = event.target;
    if (!map) return;
    
    setTimeout(() => {
      if (map.isStyleLoaded()) {
        setMapLanguageToHebrew(map);
      } else {
        map.once('style.load', () => setMapLanguageToHebrew(map));
      }
    }, 100);
  }, []);

  // Auto-Zoom: fitBounds on the Hero Route
  useEffect(() => {
    if (!heroRoute || !heroRoute.path || heroRoute.path.length < 2) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of heroRoute.path) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    if (heroRoute.facilityStops && heroRoute.facilityStops.length > 0) {
      for (const stop of heroRoute.facilityStops) {
        if (stop.lng < minLng) minLng = stop.lng;
        if (stop.lng > maxLng) maxLng = stop.lng;
        if (stop.lat < minLat) minLat = stop.lat;
        if (stop.lat > maxLat) maxLat = stop.lat;
      }
    }

    try {
      map.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        {
          padding: { top: 60, bottom: 450, left: 40, right: 40 },
          duration: 1200,
          maxZoom: 15.5,
        }
      );
    } catch {
      // fitBounds can throw if map isn't fully initialized
    }
  }, [heroRoute]);

  // ══════════════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════════════

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }
  }, []);

  const handleDragEnd = useCallback(async () => {
    setIsDragging(false);
    if (stage !== LocationStage.CONFIRMING) return;
    
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }
    
    dragTimeoutRef.current = setTimeout(async () => {
      const centerLat = viewState.latitude;
      const centerLng = viewState.longitude;
      
      setIsUpdatingLocation(true);
      
      const result = await reverseGeocode(centerLat, centerLng);
      setDetectedCity(result.city);
      setDetectedNeighborhood(result.neighborhood);
      setDisplayName(result.displayName);
      setUserLocation({ lat: centerLat, lng: centerLng });
      
      const authId = await findAuthorityIdByCity(result.city || '');
      setResolvedAuthorityId(authId);

      setIsLoadingCurated(true);
      const hero = await fetchHeroRoute(centerLat, centerLng, authId, sportContext, selectedSportId);
      setHeroRoute(hero);
      setIsLoadingCurated(false);
      const heroArr: RouteWithDistance[] = hero ? [hero] : [];
      const rawFacilities = await fetchNearbyFacilities(centerLat, centerLng, 1600, selectedSportId, heroArr, sportContext);
      const facilities = applyStrengthTierFilter(rawFacilities, selectedSportId, trainingContext);
      setNearbyFacilities(facilities.slice(0, 5));
      setBestMatchIndex(0);

      loadInfrastructureContext(result.city, authId);
      
      updateData({
        locationAllowed: true,
        city: result.displayName,
        location: { lat: centerLat, lng: centerLng, city: result.displayName },
      });
      
      setIsUpdatingLocation(false);
    }, 500);
  }, [stage, viewState.latitude, viewState.longitude, updateData, selectedSportId]);

  const handleFindLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('הדפדפן שלך לא תומך באיתור מיקום');
      return;
    }

    setStage(LocationStage.LOCATING);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        setViewState({ longitude, latitude, zoom: 14 });
        setUserLocation({ lat: latitude, lng: longitude });
        
        const result = await reverseGeocode(latitude, longitude);
        setDetectedCity(result.city);
        setDetectedNeighborhood(result.neighborhood);
        setDisplayName(result.displayName);
        
        const authId = await findAuthorityIdByCity(result.city || '');
        setResolvedAuthorityId(authId);

        setIsLoadingParks(true);
        setIsLoadingCurated(true);
        const hero = await fetchHeroRoute(latitude, longitude, authId, sportContext, selectedSportId);
        setHeroRoute(hero);
        setIsLoadingCurated(false);
        const heroArr: RouteWithDistance[] = hero ? [hero] : [];
        const rawFacilities = await fetchNearbyFacilities(latitude, longitude, 1600, selectedSportId, heroArr, sportContext);
        const facilities = applyStrengthTierFilter(rawFacilities, selectedSportId, trainingContext);
        setNearbyFacilities(facilities.slice(0, 5));
        setBestMatchIndex(0);
        setIsLoadingParks(false);

        loadInfrastructureContext(result.city, authId);
        
        setShowRadar(true);
        setTimeout(() => setShowRadar(false), 3000);
        setStage(LocationStage.CONFIRMING);
        
        updateData({
          locationAllowed: true,
          city: result.displayName,
          location: { lat: latitude, lng: longitude, city: result.displayName },
        });
        
        try {
          const { Analytics } = await import('@/features/analytics/AnalyticsService');
          Analytics.logPermissionLocationStatus('granted', 'onboarding_unified_location');
        } catch {}
      },
      async (error) => {
        setLocationError('לא הצלחנו לאתר את המיקום שלך. נסה שוב או חפש ידנית.');
        setStage(LocationStage.INITIAL);
        
        try {
          const { Analytics } = await import('@/features/analytics/AnalyticsService');
          Analytics.logPermissionLocationStatus(error.code === 1 ? 'denied' : 'prompt', 'onboarding_unified_location');
        } catch {}
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  /**
   * Load infrastructure stats + settlement naming + city-wide asset counts.
   */
  const loadInfrastructureContext = async (cityName: string | null, authorityId: string | null) => {
    if (!cityName) return;
    try {
      const sType = getSettlementType(cityName);
      setSettlementNaming(getSettlementNaming(sType, cityName));

      if (!authorityId) return;

      const stats = await InventoryService.fetchInfrastructureStats(authorityId);
      setInfraStats(stats);
      
      const allParks = await getParksByAuthority(authorityId);
      const counts = { gyms: 0, courts: 0, nature: 0 };
      
      for (const park of allParks) {
        const isBench = park.urbanType === 'bench' || park.courtType === 'bench';
        const isStairs = park.urbanType === 'stairs' || park.courtType === 'stairs' || park.courtType === 'public_steps';
        if (isBench || isStairs) continue;
        
        if (park.facilityType === 'gym_park' || 
            park.courtType === 'calisthenics' || 
            park.courtType === 'fitness_station') {
          counts.gyms++;
        }
        else if (park.courtType === 'basketball' || 
                 park.courtType === 'football' || 
                 park.courtType === 'tennis' ||
                 park.courtType === 'padel') {
          counts.courts++;
        }
        else if (park.natureType === 'spring' || park.natureType === 'observation_point') {
          counts.nature++;
        }
      }
      
      setCityAssetCounts(counts);
    } catch (err) {
      console.warn('Non-critical: failed to load infrastructure context', err);
    }
  };

  const handleConfirm = () => {
    const bestRated = nearbyFacilities
      .filter(f => f.rating != null && f.rating > 0)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];

    if (bestRated) {
      updateData({
        selectedParkName: bestRated.name,
        selectedParkRating: bestRated.rating,
      } as any);
    } else if (nearbyFacilities.length > 0) {
      updateData({
        selectedParkName: nearbyFacilities[0].name,
      } as any);
    }

    setMajorRoadmapStep(2);
    router.push('/onboarding-new/roadmap');
  };

  const handleSearchOtherCity = () => {
    setStage(LocationStage.SEARCHING);
    setSearchQuery(detectedCity || '');
  };

  const handleCitySelect = async (city: CityData) => {
    setSearchQuery('');
    
    setViewState({ longitude: city.lng, latitude: city.lat, zoom: 14 });
    setUserLocation({ lat: city.lat, lng: city.lng });
    setDetectedCity(city.parentName || city.name);
    setDetectedNeighborhood(city.parentName ? city.name : null);
    setDisplayName(city.displayName);
    
    const effectiveCityName = city.parentName || city.name;
    const authId = await findAuthorityIdByCity(effectiveCityName);
    setResolvedAuthorityId(authId);

    setIsLoadingParks(true);
    setIsLoadingCurated(true);
    const hero = await fetchHeroRoute(city.lat, city.lng, authId, sportContext, selectedSportId);
    setHeroRoute(hero);
    setIsLoadingCurated(false);
    const heroArr: RouteWithDistance[] = hero ? [hero] : [];
    const rawFacilities = await fetchNearbyFacilities(city.lat, city.lng, 1600, selectedSportId, heroArr, sportContext);
    const facilities = applyStrengthTierFilter(rawFacilities, selectedSportId, trainingContext);
    setNearbyFacilities(facilities.slice(0, 5));
    setBestMatchIndex(0);
    setIsLoadingParks(false);

    loadInfrastructureContext(effectiveCityName, authId);
    
    setShowRadar(true);
    setTimeout(() => setShowRadar(false), 3000);
    
    updateData({
      locationAllowed: true,
      city: city.displayName,
      location: { lat: city.lat, lng: city.lng, city: city.displayName },
    });
    
    setStage(LocationStage.CONFIRMING);
  };

  const handleBackFromSearch = () => {
    if (userLocation) {
      setStage(LocationStage.CONFIRMING);
    } else {
      setStage(LocationStage.INITIAL);
    }
    setSearchQuery('');
  };

  const handleSearchManually = () => {
    setStage(LocationStage.SEARCHING);
    setSearchQuery('');
  };

  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════

  return (
    <div dir="rtl" className="fixed inset-0 w-full h-screen overflow-hidden bg-[#F8FAFC] z-50">
      {/* Map Container */}
      <div 
        className="absolute inset-0 overflow-hidden transition-all duration-300"
        style={{ 
          filter: stage === LocationStage.SEARCHING ? 'blur(4px)' : 'none',
          minHeight: '100vh', 
          height: '100vh', 
          width: '100%' 
        }}
      >
        {/* Loading Skeleton */}
        {isMapLoading && (
          <div className="absolute inset-0 bg-slate-200 flex items-center justify-center z-10">
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-slate-600 font-simpler"
            >
              טוען מפה...
            </motion.p>
          </div>
        )}
        
        {typeof window !== 'undefined' && (
          <MapboxMap
            ref={mapRef}
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            onMoveStart={handleDragStart}
            onMoveEnd={handleDragEnd}
            onLoad={handleMapLoad}
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle={MAPBOX_STYLE}
            style={{ width: '100%', height: '100%' }}
            interactive={stage === LocationStage.CONFIRMING}
            scrollZoom={stage === LocationStage.CONFIRMING}
            dragPan={stage === LocationStage.CONFIRMING}
            dragRotate={false}
            pitchWithRotate={false}
            touchZoomRotate={stage === LocationStage.CONFIRMING}
          >
            {/* Radar Pulse */}
            {showRadar && userLocation && (
              <RadarPulse center={userLocation} />
            )}
            
            {/* "Power of One" — Only the #1 best match park marker with Pulse/Glow */}
            {(() => {
              const parkFacilities = nearbyFacilities.filter(
                (f): f is NearbyFacility & { kind: 'park' } => f.kind === 'park'
              );
              const bestPark = parkFacilities[bestMatchIndex] || parkFacilities[0];
              if (!bestPark || !bestPark.location?.lat || !bestPark.location?.lng) return null;

              const catKey = resolveCategoryKey(bestPark);
              const icon = getFacilityIcon(bestPark.image, catKey, brandingConfig);
                return (
                  <MapboxMarker
                  key={`best-${bestPark.id}`}
                  longitude={bestPark.location.lng}
                  latitude={bestPark.location.lat}
                    anchor="bottom"
                  >
                      <div className="relative flex flex-col items-center">
                    {/* Pulse ring animation */}
                    <div
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full"
                      style={{
                        animation: 'heroMarkerPulse 2s ease-out infinite',
                        background: 'rgba(91, 194, 242, 0.25)',
                      }}
                    />
                    <div
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full"
                      style={{
                        animation: 'heroMarkerPulse 2s ease-out infinite 0.5s',
                        background: 'rgba(91, 194, 242, 0.12)',
                      }}
                    />
                    {icon.type === 'image' ? (
                      <div
                        className={`w-12 h-12 rounded-full border-3 border-[#5BC2F2] shadow-xl overflow-hidden bg-white relative z-10 ${
                            icon.tier === 'site_photo' ? '' : 'p-1'
                          }`}
                        style={{ boxShadow: '0 4px 20px rgba(91, 194, 242, 0.4)' }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={icon.value}
                          alt={bestPark.name}
                            className={`w-full h-full ${
                              icon.tier === 'site_photo' ? 'object-cover' : 'object-contain'
                            }`}
                        />
                      </div>
                    ) : (
                      <div
                        className="w-12 h-12 rounded-full bg-white border-3 border-[#5BC2F2] shadow-xl flex items-center justify-center text-xl relative z-10"
                        style={{ boxShadow: '0 4px 20px rgba(91, 194, 242, 0.4)' }}
                      >
                          {icon.value}
                        </div>
                    )}
                        <div
                      className="w-0 h-0 -mt-0.5 relative z-10"
                          style={{
                        borderLeft: '7px solid transparent',
                        borderRight: '7px solid transparent',
                        borderTop: '10px solid #5BC2F2',
                        filter: 'drop-shadow(0 2px 4px rgba(91, 194, 242, 0.3))',
                          }}
                        />
                      </div>
                  </MapboxMarker>
                );
            })()}

            {/* Hero Route — Zero-Noise: Only the single closest matching route */}
            {heroRoute && heroRoute.path && heroRoute.path.length >= 2 && (() => {
              const startPt = heroRoute.path[0];
                const isHybrid = heroRoute.isHybrid;
                const heroColor = isHybrid ? '#F97316' : '#06B6D4';
                const glowColor = isHybrid ? '#FB923C' : '#22D3EE';
                const routeKm = heroRoute.distance ? `${heroRoute.distance.toFixed(1)} ק״מ מסלול` : '';

                return (
                  <React.Fragment key={`hero-${heroRoute.id}`}>
                    <MapboxSource
                      id={`hero-route-line`}
                      type="geojson"
                      data={{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                          type: 'LineString',
                          coordinates: heroRoute.path,
                        },
                      }}
                    >
                      <MapboxLayer
                        id={`hero-glow-outer`}
                        type="line"
                        paint={{
                          'line-color': glowColor,
                          'line-width': 14,
                          'line-opacity': 0.15,
                          'line-blur': 10,
                        }}
                        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                      />
                      <MapboxLayer
                        id={`hero-glow-inner`}
                        type="line"
                        paint={{
                          'line-color': glowColor,
                          'line-width': 9,
                          'line-opacity': 0.3,
                          'line-blur': 4,
                        }}
                        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                      />
                      <MapboxLayer
                        id={`hero-main`}
                        type="line"
                        paint={{
                          'line-color': heroColor,
                          'line-width': 5.5,
                          'line-opacity': 0.95,
                        }}
                        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                      />
                    </MapboxSource>

                    <MapboxMarker longitude={startPt[0]} latitude={startPt[1]} anchor="center">
                      <div className="relative flex flex-col items-center">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center shadow-xl"
                          style={{
                            background: `linear-gradient(135deg, ${heroColor}, ${glowColor})`,
                            border: '3px solid white',
                            boxShadow: `0 4px 20px ${heroColor}66`,
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M8 5.14v14l11-7-11-7z" fill="white" />
                          </svg>
                        </div>
                        {routeKm && (
                          <div
                            className="absolute -bottom-5 whitespace-nowrap px-2 py-0.5 rounded-full text-[9px] font-black text-white shadow-lg"
                            style={{ backgroundColor: heroColor }}
                          >
                            {routeKm}
                          </div>
                        )}
                      </div>
                    </MapboxMarker>

                    {/* Hybrid facility pit-stop markers */}
                    {isHybrid && heroRoute.facilityStops?.map((stop, idx) => (
                      <MapboxMarker
                        key={`pitstop-${stop.id}-${idx}`}
                        longitude={stop.lng}
                        latitude={stop.lat}
                        anchor="center"
                      >
                      <div className="relative flex flex-col items-center">
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                          style={{
                              background: stop.priority === 1 ? '#EF4444' : stop.priority === 2 ? '#EAB308' : '#8B5CF6',
                              border: '2px solid white',
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                              {stop.priority === 1 ? (
                                <path d="M6.5 2C7.33 2 8 2.67 8 3.5V8h8V3.5C16 2.67 16.67 2 17.5 2S19 2.67 19 3.5V8h1.5a1 1 0 110 2H19v4.5c0 .83-.67 1.5-1.5 1.5S16 15.33 16 14.5V10H8v4.5C8 15.33 7.33 16 6.5 16S5 15.33 5 14.5V10H3.5a1 1 0 110-2H5V3.5C5 2.67 5.67 2 6.5 2z" />
                              ) : stop.priority === 2 ? (
                                <path d="M3 21h4v-4h4v-4h4v-4h4V5h-4v4h-4v4H7v4H3v4z" />
                              ) : (
                                <path d="M4 12h16v2H4v-2zm2 4h2v4H6v-4zm10 0h2v4h-2v-4zM3 10h18a1 1 0 011 1v1H2v-1a1 1 0 011-1z" />
                              )}
                            </svg>
                          </div>
                      </div>
                    </MapboxMarker>
                    ))}
                  </React.Fragment>
                );
              })()}
          </MapboxMap>
        )}
        
        {/* Fixed Center Marker - King Lemur Crosshair */}
        {stage === LocationStage.CONFIRMING && (
          <div 
            className="absolute inset-0 pointer-events-none flex items-center justify-center z-30"
            style={{ paddingBottom: '280px' }}
          >
            <motion.div
              animate={{ y: isDragging ? -16 : 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="relative flex flex-col items-center"
            >
              <motion.div 
                className="relative flex-shrink-0"
                animate={{ scale: isDragging ? 1.1 : 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                style={{ width: '76px', height: '76px' }}
              >
                <div 
                  className="absolute inset-0 bg-white rounded-full shadow-2xl"
                  style={{ 
                    boxShadow: isDragging 
                      ? '0 20px 50px rgba(0,0,0,0.35)' 
                      : '0 8px 30px rgba(0,0,0,0.2)'
                  }}
                />
                <div className="absolute inset-1 rounded-full overflow-hidden">
                  <img
                    src="/assets/lemur/king-lemur.png"
                    alt="המיקום שלך"
                    className="w-full h-full object-cover"
                    style={{ objectPosition: 'center center' }}
                  />
                </div>
                
                {isUpdatingLocation && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute -bottom-1 -right-1 bg-white rounded-full p-1.5 shadow-lg z-10"
                  >
                    <Loader2 size={16} className="text-[#5BC2F2] animate-spin" />
                  </motion.div>
                )}
              </motion.div>
              
              {/* Pin point */}
              <div 
                className="w-0 h-0 -mt-2"
                style={{
                  borderLeft: '12px solid transparent',
                  borderRight: '12px solid transparent',
                  borderTop: '20px solid white',
                  filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))'
                }}
              />
              
              {/* GPS dot */}
              <motion.div
                animate={{ 
                  scale: isDragging ? [1, 1.5, 1] : 1,
                  opacity: isDragging ? 0.8 : 0.6
                }}
                transition={{ 
                  scale: { duration: 0.5, repeat: isDragging ? Infinity : 0 },
                  opacity: { duration: 0.2 }
                }}
                className="w-3 h-3 bg-[#5BC2F2] rounded-full border-2 border-white shadow-lg -mt-1"
              />
              
              {/* Shadow */}
              <motion.div
                animate={{ 
                  opacity: isDragging ? 0.5 : 0.25,
                  scale: isDragging ? 1.4 : 1
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="absolute w-14 h-4 bg-black/50 rounded-full blur-md"
                style={{ top: 'calc(100% + 4px)' }}
              />
            </motion.div>
          </div>
        )}
      </div>

      {/* UI Overlays */}
      <AnimatePresence mode="wait">
        {stage === LocationStage.INITIAL && (
          <InitialCard
            key="initial"
            gender={gender}
            t={t}
            locationError={locationError}
            onFindLocation={handleFindLocation}
            onSearchManually={handleSearchManually}
          />
        )}

        {stage === LocationStage.LOCATING && (
          <LocatingCard key="locating" />
        )}

        {stage === LocationStage.CONFIRMING && (
          <ConfirmationCard
            key="confirming"
            displayName={displayName}
            detectedNeighborhood={detectedNeighborhood}
            detectedCity={detectedCity}
            nearbyFacilities={nearbyFacilities}
            isLoadingParks={isLoadingParks}
            isLoadingCurated={isLoadingCurated}
            isUpdatingLocation={isUpdatingLocation}
            onConfirm={handleConfirm}
            onSearchOther={handleSearchOtherCity}
            brandingConfig={brandingConfig}
            infraStats={infraStats}
            cityAssetCounts={cityAssetCounts}
            settlementNaming={settlementNaming}
            curatedRouteCount={heroRoute ? 1 : 0}
            heroRoute={heroRoute}
            sportContext={sportContext}
            bestMatchIndex={bestMatchIndex}
            trainingContext={trainingContext}
          />
        )}

        {stage === LocationStage.SEARCHING && (
          <SearchOverlay
            key="searching"
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filteredCities={filteredCities}
            onCitySelect={handleCitySelect}
            onBack={handleBackFromSearch}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

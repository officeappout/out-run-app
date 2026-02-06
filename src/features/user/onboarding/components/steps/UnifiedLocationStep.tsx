'use client';

import React, { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Loader2, Search, X, ChevronLeft } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { getAllParks } from '@/features/parks';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import { Park } from '@/types/admin-types';
import { ISRAELI_LOCATIONS, IsraeliLocation, SubLocation, LocationType } from '@/lib/data/israel-locations';
import dynamic from 'next/dynamic';
import type { MapRef } from 'react-map-gl';
import type { Map as MapboxGLMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// ============================================
// 1. CONSTANTS & CONFIG
// ============================================

const MAPBOX_TOKEN = "pk.eyJ1IjoiZGF2aWQtb3V0IiwiYSI6ImNtanZpZmJ0djM5MTEzZXF5YXNmcm9zNGwifQ.8MD8s4TZOr0WYYgEpFfpzw";
const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";

// Waze-style character types with emojis
const CHARACTER_TYPES = {
  ninja: '🥷',
  heavy: '💪',
  yoga: '🧘',
  runner: '🏃',
  calisthenics: '🤸',
} as const;

// Randomized Hebrew speech bubbles
const SPEECH_BUBBLES = [
  'מי בא למתח?',
  'סט אחרון וסיימתי!',
  'הגינה כאן מטורפת',
  'בואו נציל יחד!',
  'מי רוצה להתאמן?',
  'הגיע הזמן לסט!',
  'הכי טוב כאן',
  'מי בא איתי?',
];

// Waze-style OUTers with randomized characters and speech bubbles
const MOCK_OUTERS: OuterMarker[] = [
  { id: '1', lat: 32.0853, lng: 34.7818, level: 5, isActive: true, characterType: 'ninja', speechBubble: SPEECH_BUBBLES[0] },
  { id: '2', lat: 32.0865 + 0.001, lng: 34.7830 + 0.001, level: 12, isActive: true, characterType: 'heavy' },
  { id: '3', lat: 32.0840 - 0.0008, lng: 34.7800 - 0.001, level: 3, isActive: false, characterType: 'yoga', speechBubble: SPEECH_BUBBLES[1] },
  { id: '4', lat: 32.1664, lng: 34.8433, level: 8, isActive: true, characterType: 'runner' },
  { id: '5', lat: 32.1670 + 0.0012, lng: 34.8440 + 0.0008, level: 15, isActive: true, characterType: 'calisthenics', speechBubble: SPEECH_BUBBLES[2] },
  { id: '6', lat: 32.0829, lng: 34.8151, level: 6, isActive: true, characterType: 'heavy', speechBubble: SPEECH_BUBBLES[3] },
  { id: '7', lat: 32.0835 - 0.0005, lng: 34.8160 + 0.0007, level: 9, isActive: false, characterType: 'ninja' },
  { id: '8', lat: 32.0845 + 0.0009, lng: 34.7825 - 0.0006, level: 7, isActive: true, characterType: 'runner', speechBubble: SPEECH_BUBBLES[4] },
];

// ============================================
// 2. INTERFACES & TYPES
// ============================================

interface UnifiedLocationStepProps {
  onNext: () => void;
}

interface ParkWithDistance extends Park {
  distanceMeters: number;
  formattedDistance: string;
}

interface OuterMarker {
  id: string;
  lat: number;
  lng: number;
  level: number;
  isActive: boolean;
  characterType?: 'ninja' | 'heavy' | 'yoga' | 'runner' | 'calisthenics';
  speechBubble?: string;
}

interface CityData {
  id: string;
  name: string;
  displayName: string;
  type: LocationType;
  lat: number;
  lng: number;
  trainers: number;
  gyms: number;
  isMapped: boolean;
  population: number;
  parentId?: string;
  parentName?: string;
  parentAuthorityId?: string;
}

// Stage enum for state machine
enum LocationStage {
  INITIAL = 'INITIAL',
  LOCATING = 'LOCATING',
  CONFIRMING = 'CONFIRMING',
  SEARCHING = 'SEARCHING',
}

// ============================================
// 3. UTILITY FUNCTIONS
// ============================================

// Set map language to Hebrew (v2 compatible)
function setMapLanguageToHebrew(map: MapboxGLMap) {
  try {
    const style = map.getStyle();
    if (!style || !style.layers) return;

    style.layers.forEach((layer: any) => {
      if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
        try {
          map.setLayoutProperty(layer.id, 'text-field', [
            'coalesce',
            ['get', 'name_he'],
            ['get', 'name:he'],
            ['get', 'name'],
          ]);
        } catch {
          // Skip layers that can't be modified
        }
      }
    });
  } catch (error) {
    console.warn('Failed to set map language to Hebrew:', error);
  }
}

// Haversine formula for distance calculation
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Format distance in Hebrew
function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} מטר ממך`;
  }
  const kilometers = (distanceMeters / 1000).toFixed(1);
  return `${kilometers} ק״מ ממך`;
}

// Reverse geocoding using Mapbox API
async function reverseGeocode(lat: number, lng: number): Promise<{
  city: string | null;
  neighborhood: string | null;
  displayName: string;
}> {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=he&types=place,locality,neighborhood`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      return { city: null, neighborhood: null, displayName: 'מיקום לא ידוע' };
    }
    
    let city: string | null = null;
    let neighborhood: string | null = null;
    
    for (const feature of data.features) {
      if (feature.place_type.includes('place')) {
        city = feature.text_he || feature.text;
      }
      if (feature.place_type.includes('neighborhood') || feature.place_type.includes('locality')) {
        neighborhood = feature.text_he || feature.text;
      }
    }
    
    const displayName = neighborhood && city
      ? `${neighborhood}, ${city}`
      : city || neighborhood || 'מיקום לא ידוע';
    
    return { city, neighborhood, displayName };
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    return { city: null, neighborhood: null, displayName: 'מיקום לא ידוע' };
  }
}

// Fetch nearby parks
async function fetchNearbyParks(
  userLat: number,
  userLng: number,
  maxRadiusMeters: number = 10000
): Promise<ParkWithDistance[]> {
  try {
    const allParks = await getAllParks();
    
    const parksWithDistance: ParkWithDistance[] = allParks
      .filter((park) => park.location && park.location.lat && park.location.lng)
      .map((park) => {
        const distanceMeters = calculateDistance(
          userLat,
          userLng,
          park.location.lat,
          park.location.lng
        );
        return {
          ...park,
          distanceMeters,
          formattedDistance: formatDistance(distanceMeters),
        };
      })
      .filter((park) => park.distanceMeters <= maxRadiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return parksWithDistance;
  } catch (error) {
    console.error('Error fetching nearby parks:', error);
    return [];
  }
}

// Flatten hierarchical locations for search
function flattenLocations(locations: IsraeliLocation[]): Array<{
  id: string;
  name: string;
  displayName: string;
  type: LocationType;
  population: number;
  parentId?: string;
  parentName?: string;
  coordinates?: { lat: number; lng: number };
}> {
  const flattened: Array<{
    id: string;
    name: string;
    displayName: string;
    type: LocationType;
    population: number;
    parentId?: string;
    parentName?: string;
    coordinates?: { lat: number; lng: number };
  }> = [];

  locations.forEach(location => {
    flattened.push({
      id: location.id,
      name: location.name,
      displayName: location.name,
      type: location.type,
      population: location.population,
    });

    if (location.subLocations && location.subLocations.length > 0) {
      location.subLocations.forEach(sub => {
        flattened.push({
          id: sub.id,
          name: sub.name,
          displayName: `${location.name} - ${sub.name}`,
          type: sub.type,
          population: location.population,
          parentId: location.id,
          parentName: location.name,
        });
      });
    }
  });

  return flattened;
}

// Get default coordinates for known locations
function getDefaultCoordinates(locationId: string, parentId?: string): { lat: number; lng: number } {
  const coordsMap: Record<string, { lat: number; lng: number }> = {
    'tel-aviv': { lat: 32.0853, lng: 34.7818 },
    'jerusalem': { lat: 31.7683, lng: 35.2137 },
    'haifa': { lat: 32.7940, lng: 34.9896 },
    'rishon-lezion': { lat: 31.9730, lng: 34.7925 },
    'petah-tikva': { lat: 32.0892, lng: 34.8880 },
    'ashdod': { lat: 31.8044, lng: 34.6553 },
    'netanya': { lat: 32.3320, lng: 34.8599 },
    'beer-sheva': { lat: 31.2530, lng: 34.7915 },
    'holon': { lat: 32.0103, lng: 34.7792 },
    'ramat-gan': { lat: 32.0820, lng: 34.8130 },
    'bat-yam': { lat: 32.0140, lng: 34.7510 },
    'herzliya': { lat: 32.1636, lng: 34.8443 },
  };
  
  if (coordsMap[locationId]) return coordsMap[locationId];
  if (parentId && coordsMap[parentId]) return coordsMap[parentId];
  return { lat: 32.0853, lng: 34.7818 }; // Default: Tel Aviv
}

// Dynamic imports for Mapbox (avoid SSR)
const MapboxMap = dynamic(() => import('react-map-gl').then((mod) => mod.default), { ssr: false });
const MapboxMarker = dynamic(() => import('react-map-gl').then((mod) => mod.Marker), { ssr: false });

// ============================================
// 4. MAIN COMPONENT (State Machine & Map)
// ============================================

export default function UnifiedLocationStep({ onNext }: UnifiedLocationStepProps) {
  const { updateData } = useOnboardingStore();
  const mapRef = useRef<MapRef>(null);
  
  // Get gender from sessionStorage
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') || 'male') as 'male' | 'female'
    : 'male';
  const t = (male: string, female: string) => gender === 'female' ? female : male;

  // Stage control
  const [stage, setStage] = useState<LocationStage>(LocationStage.INITIAL);

  // Location data
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [detectedNeighborhood, setDetectedNeighborhood] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');

  // Map state
  const [viewState, setViewState] = useState({
    longitude: 34.7818,
    latitude: 32.0853,
    zoom: 7,
  });

  // Parks data
  const [nearbyParks, setNearbyParks] = useState<ParkWithDistance[]>([]);
  const [isLoadingParks, setIsLoadingParks] = useState(false);

  // UI state
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [showRadar, setShowRadar] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [cities, setCities] = useState<CityData[]>([]);
  const [filteredCities, setFilteredCities] = useState<CityData[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
      const query = searchQuery.toLowerCase().trim();
      const filtered = cities.filter(city => 
        city.name.toLowerCase().includes(query) ||
        city.displayName.toLowerCase().includes(query)
      ).slice(0, 10);
      setFilteredCities(filtered);
    }
  }, [searchQuery, cities]);

  // Focus search input when entering SEARCHING stage
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

  // Handle GPS location request
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
        
        // Animate map to user location
        setViewState({
          longitude,
          latitude,
          zoom: 14,
        });
        
        setUserLocation({ lat: latitude, lng: longitude });
        
        // Reverse geocode
        const result = await reverseGeocode(latitude, longitude);
        setDetectedCity(result.city);
        setDetectedNeighborhood(result.neighborhood);
        setDisplayName(result.displayName);
        
        // Fetch nearby parks
        setIsLoadingParks(true);
        const parks = await fetchNearbyParks(latitude, longitude);
        setNearbyParks(parks.slice(0, 3));
        setIsLoadingParks(false);
        
        // Show radar animation
        setShowRadar(true);
        setTimeout(() => setShowRadar(false), 3000);
        
        // Transition to confirming stage
        setStage(LocationStage.CONFIRMING);
        
        // Save to store
        updateData({
          locationAllowed: true,
          city: result.displayName,
          location: { lat: latitude, lng: longitude, city: result.displayName },
        });
        
        // Log analytics
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

  // Handle confirm (user says "Yes, this is my area")
  const handleConfirm = () => {
    onNext();
  };

  // Handle search other city
  const handleSearchOtherCity = () => {
    setStage(LocationStage.SEARCHING);
    setSearchQuery(detectedCity || '');
  };

  // Handle city selection from search
  const handleCitySelect = async (city: CityData) => {
    setSearchQuery('');
    
    // Animate map to selected city
    setViewState({
      longitude: city.lng,
      latitude: city.lat,
      zoom: 14,
    });
    
    setUserLocation({ lat: city.lat, lng: city.lng });
    setDetectedCity(city.name);
    setDetectedNeighborhood(city.parentName || null);
    setDisplayName(city.displayName);
    
    // Fetch parks for this city
    setIsLoadingParks(true);
    const parks = await fetchNearbyParks(city.lat, city.lng);
    setNearbyParks(parks.slice(0, 3));
    setIsLoadingParks(false);
    
    // Show radar
    setShowRadar(true);
    setTimeout(() => setShowRadar(false), 3000);
    
    // Update store
    updateData({
      locationAllowed: true,
      city: city.displayName,
      location: { lat: city.lat, lng: city.lng, city: city.displayName },
    });
    
    // Back to confirming
    setStage(LocationStage.CONFIRMING);
  };

  // Handle back from search
  const handleBackFromSearch = () => {
    if (userLocation) {
      setStage(LocationStage.CONFIRMING);
    } else {
      setStage(LocationStage.INITIAL);
    }
    setSearchQuery('');
  };

  // Handle manual search trigger from initial
  const handleSearchManually = () => {
    setStage(LocationStage.SEARCHING);
    setSearchQuery('');
  };

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
            onLoad={handleMapLoad}
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle={MAPBOX_STYLE}
            style={{ width: '100%', height: '100%' }}
            interactive={false}
          >
            {/* Radar Pulse */}
            {showRadar && userLocation && (
              <RadarPulse center={userLocation} />
            )}
            
            {/* OUTer Markers */}
            {MOCK_OUTERS.map((outer) => (
              <MapboxMarker
                key={outer.id}
                longitude={outer.lng}
                latitude={outer.lat}
                anchor="center"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + Math.random() * 0.5 }}
                >
                  <WazeAvatar
                    level={outer.level}
                    speechBubble={outer.speechBubble}
                    characterType={outer.characterType}
                  />
                </motion.div>
              </MapboxMarker>
            ))}
            
            {/* User Location Marker */}
            {userLocation && (
              <MapboxMarker
                longitude={userLocation.lng}
                latitude={userLocation.lat}
                anchor="center"
              >
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="relative"
                >
                  <img
                    src="/assets/lemur/king-lemur.png"
                    alt="המיקום שלך"
                    className="w-14 h-14 rounded-full border-3 border-white shadow-xl object-cover"
                  />
                </motion.div>
              </MapboxMarker>
            )}
            
            {/* Park Markers */}
            {nearbyParks.map((park) => {
              if (!park.location?.lat || !park.location?.lng) return null;
              return (
                <MapboxMarker
                  key={park.id}
                  longitude={park.location.lng}
                  latitude={park.location.lat}
                  anchor="bottom"
                >
                  <img src="/icons/park-pin.svg" alt={park.name} className="w-8 h-10" />
                </MapboxMarker>
              );
            })}
          </MapboxMap>
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
            nearbyParks={nearbyParks}
            isLoadingParks={isLoadingParks}
            onConfirm={handleConfirm}
            onSearchOther={handleSearchOtherCity}
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

// ============================================
// 5. UI OVERLAY SUB-COMPONENTS
// ============================================

interface InitialCardProps {
  gender: 'male' | 'female';
  t: (male: string, female: string) => string;
  locationError: string | null;
  onFindLocation: () => void;
  onSearchManually: () => void;
}

function InitialCard({ gender, t, locationError, onFindLocation, onSearchManually }: InitialCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.3 }}
      className="absolute bottom-0 left-0 right-0 z-20"
    >
      <div className="bg-gradient-to-t from-white via-white/98 to-transparent pt-12 pb-4">
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(91,194,242,0.10)] p-6 border-t border-slate-100/40">
          <h2 
            className="text-2xl font-bold leading-tight text-slate-900 mb-3"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            בואו נמצא את הגינה הכי קרובה אליכם
          </h2>
          <p 
            className="text-slate-600 leading-relaxed text-sm mb-4"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            מיפינו מאות גינות כושר ברחבי הארץ, עם מתקנים שמתאימים לאימוני OUT.
            {' '}
            {t('אשר את המיקום שלך ונמצא את הגינה הקרובה אליך.', 'אשרי את המיקום שלך ונמצא את הגינה הקרובה אלייך.')}
          </p>

          {locationError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-4"
            >
              <p className="text-sm text-red-600" style={{ fontFamily: 'var(--font-simpler)' }}>
                {locationError}
              </p>
            </motion.div>
          )}

          <button
            onClick={onFindLocation}
            className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-4 rounded-2xl shadow-xl shadow-[#5BC2F2]/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <MapPin size={20} />
            <span>מצאו את המיקום שלי</span>
          </button>

          <button
            onClick={onSearchManually}
            className="w-full mt-3 text-slate-500 hover:text-[#5BC2F2] text-sm py-2 transition-colors"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            או חפשו ידנית
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function LocatingCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.3 }}
      className="absolute bottom-0 left-0 right-0 z-20"
    >
      <div className="bg-gradient-to-t from-white via-white/98 to-transparent pt-12 pb-4">
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(91,194,242,0.10)] p-8 border-t border-slate-100/40">
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 size={40} className="text-[#5BC2F2] animate-spin mb-4" />
            <p 
              className="text-slate-700 font-medium text-lg"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              מאתרים את המיקום שלך...
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface ConfirmationCardProps {
  displayName: string;
  detectedNeighborhood: string | null;
  detectedCity: string | null;
  nearbyParks: ParkWithDistance[];
  isLoadingParks: boolean;
  onConfirm: () => void;
  onSearchOther: () => void;
}

function ConfirmationCard({
  displayName,
  detectedNeighborhood,
  detectedCity,
  nearbyParks,
  isLoadingParks,
  onConfirm,
  onSearchOther,
}: ConfirmationCardProps) {
  // Build the confirmation question
  const locationText = detectedNeighborhood && detectedCity
    ? `${detectedNeighborhood}, ${detectedCity}`
    : detectedCity || displayName;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.3 }}
      className="absolute bottom-0 left-0 right-0 z-20"
    >
      <div className="bg-gradient-to-t from-white via-white/98 to-transparent pt-8 pb-4">
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(91,194,242,0.10)] p-6 border-t border-slate-100/40">
          {/* Header Question */}
          <h2 
            className="text-xl font-bold leading-tight text-slate-900 mb-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            זיהינו שאתה ב-{locationText}.
          </h2>
          <p 
            className="text-slate-600 text-base mb-4"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            כאן תרצה להתאמן?
          </p>

          {/* Parks Count Badge */}
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-[#5BC2F2]/10 text-[#5BC2F2] px-3 py-1.5 rounded-xl text-sm font-medium">
              {isLoadingParks ? 'מחפש...' : `${nearbyParks.length} גינות כושר בסביבה`}
            </div>
          </div>

          {/* Parks List */}
          {!isLoadingParks && nearbyParks.length > 0 && (
            <div className="bg-slate-50 rounded-2xl p-4 mb-4 space-y-3">
              {nearbyParks.map((park, index) => (
                <motion.div
                  key={park.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="flex justify-between items-center"
                >
                  <span className="text-[#5BC2F2] font-bold text-sm">{park.formattedDistance}</span>
                  <span className="font-medium text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
                    {park.name}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {/* Primary Action */}
          <motion.button
            onClick={onConfirm}
            disabled={isLoadingParks}
            animate={{ scale: [1, 1.01, 1] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-4 rounded-2xl shadow-xl shadow-[#5BC2F2]/30 transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            כן, זה האזור שלי
          </motion.button>

          {/* Secondary Action */}
          <button
            onClick={onSearchOther}
            className="w-full mt-3 text-slate-500 hover:text-[#5BC2F2] text-sm py-2 transition-colors"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            לא, אני רוצה לחפש עיר אחרת
          </button>
        </div>
      </div>
    </motion.div>
  );
}

interface SearchOverlayProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredCities: CityData[];
  onCitySelect: (city: CityData) => void;
  onBack: () => void;
}

function SearchOverlay({
  searchQuery,
  onSearchChange,
  filteredCities,
  onCitySelect,
  onBack,
}: SearchOverlayProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-30 flex flex-col"
    >
      {/* Glassmorphism Header */}
      <div className="bg-[#F8FAFC]/80 backdrop-blur-xl p-4 pt-12 border-b border-slate-200/40">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-2xl bg-white shadow-md flex items-center justify-center"
          >
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          
          <div className="flex-1 relative">
            <Search 
              size={18} 
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400" 
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="חפשו עיר או שכונה"
              className="w-full bg-white rounded-2xl py-3 pr-11 pl-4 text-slate-900 placeholder-slate-400 border border-slate-200/60 shadow-[0_4px_20px_rgba(91,194,242,0.08)] focus:outline-none focus:ring-2 focus:ring-[#5BC2F2]/30"
              style={{ fontFamily: 'var(--font-simpler)' }}
              dir="rtl"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute left-4 top-1/2 transform -translate-y-1/2"
              >
                <X size={18} className="text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search Results */}
      <div className="flex-1 bg-white/95 backdrop-blur-sm overflow-y-auto">
        <div className="p-4">
          {filteredCities.length > 0 ? (
            <div className="rounded-3xl bg-white shadow-[0_8px_30px_rgba(91,194,242,0.12)] overflow-hidden">
              {filteredCities.map((city, index) => (
                <motion.button
                  key={city.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => onCitySelect(city)}
                  className="w-full px-4 py-4 flex items-center justify-between border-b border-slate-100 last:border-b-0 hover:bg-[#5BC2F2]/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                      {city.gyms > 0 ? `${city.gyms} גינות` : 'בקרוב'}
                    </div>
                  </div>
                  <div className="text-right">
                    <p 
                      className="font-medium text-slate-900 hover:text-[#5BC2F2]"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {city.displayName}
                    </p>
                    {city.parentName && (
                      <p className="text-xs text-slate-400">{city.parentName}</p>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          ) : searchQuery.length > 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500" style={{ fontFamily: 'var(--font-simpler)' }}>
                לא נמצאו תוצאות עבור "{searchQuery}"
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// 6. MAP MARKER SUB-COMPONENTS
// ============================================

interface WazeAvatarProps {
  level: number;
  speechBubble?: string;
  characterType?: 'ninja' | 'heavy' | 'yoga' | 'runner' | 'calisthenics';
}

const WazeAvatar = forwardRef<HTMLDivElement, WazeAvatarProps>(
  ({ level, speechBubble, characterType }, ref) => {
    const characterEmoji = characterType ? CHARACTER_TYPES[characterType] : CHARACTER_TYPES.runner;

    return (
      <div className="relative" ref={ref}>
        {/* Speech Bubble */}
        {speechBubble && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="absolute bottom-full mb-1.5 right-1/2 translate-x-1/2 z-20"
          >
            <div className="bg-white/90 rounded-xl px-2 py-1 shadow-md border border-slate-200 relative">
              <span 
                className="text-[10px] font-bold text-slate-900 whitespace-nowrap" 
                dir="rtl"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {speechBubble}
              </span>
              <div 
                className="absolute top-full right-1/2 translate-x-1/2 w-0 h-0" 
                style={{ borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderTop: '3px solid white' }}
              />
            </div>
          </motion.div>
        )}

        {/* Avatar Circle */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#60A5FA] to-[#4A90D9] border-2 border-white shadow-xl flex items-center justify-center relative z-10">
          <span className="text-xl">{characterEmoji}</span>
        </div>

        {/* Level Badge */}
        <div className="absolute -bottom-0.5 -right-0.5 bg-yellow-400 rounded-full w-5 h-5 border-2 border-white flex items-center justify-center shadow-md z-10">
          <span className="text-[9px] font-black text-yellow-900">{level}</span>
        </div>
      </div>
    );
  }
);

WazeAvatar.displayName = 'WazeAvatar';

interface RadarPulseProps {
  center: { lat: number; lng: number };
}

function RadarPulse({ center }: RadarPulseProps) {
  return (
    <MapboxMarker longitude={center.lng} latitude={center.lat} anchor="center">
      <div className="relative w-0 h-0">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ 
              scale: [0, 3, 6],
              opacity: [0.6, 0.25, 0],
            }}
            transition={{
              duration: 3,
              delay: i * 0.5,
              repeat: Infinity,
              ease: "easeOut",
            }}
            className="absolute inset-0 rounded-full border-2 border-[#5BC2F2]"
            style={{
              width: '200px',
              height: '200px',
              marginLeft: '-100px',
              marginTop: '-100px',
              backgroundColor: 'rgba(91, 194, 242, 0.08)',
            }}
          />
        ))}
      </div>
    </MapboxMarker>
  );
}

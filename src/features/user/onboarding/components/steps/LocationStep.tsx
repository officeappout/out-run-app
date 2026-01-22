'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Loader2, Search, Coins } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { getAllParks } from '@/features/parks';
import { Park } from '@/types/admin-types';
import dynamic from 'next/dynamic';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Mapbox Token
const MAPBOX_TOKEN = "pk.eyJ1IjoiZGF2aWQtb3V0IiwiYSI6ImNtanZpZmJ0djM5MTEzZXF5YXNmcm9zNGwifQ.8MD8s4TZOr0WYYgEpFfpzw";

// Custom Lemur User Location Marker Icon (divIcon for animated lemur)
const createLemurMarkerIcon = () => {
  return L.divIcon({
    className: 'lemur-marker-container',
    html: `
      <div style="
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-center;
        animation: breathe 2s ease-in-out infinite;
      ">
        <img 
          src="/assets/lemur/king-lemur.png" 
          alt="User Location"
          style="
            width: 50px;
            height: 50px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
            object-fit: cover;
          "
        />
      </div>
      <style>
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      </style>
    `,
    iconSize: [50, 50],
    iconAnchor: [25, 25], // Center anchor
    popupAnchor: [0, -25],
  });
};

// Custom User Location Marker Icon (fallback)
const userLocationIcon = L.icon({
  iconUrl: '/icons/user-marker.svg',
  iconSize: [32, 32],
  iconAnchor: [16, 32], // Bottom-center
  popupAnchor: [0, -32],
});

// Custom Park Marker Icon
const parkMarkerIcon = L.icon({
  iconUrl: '/icons/park-pin.svg',
  iconSize: [32, 40],
  iconAnchor: [16, 40], // Bottom-center
  popupAnchor: [0, -40],
});

// Dynamically import MapContainer to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false });

// Component to update map center when location changes (with stability fix)
function ChangeView({ center, zoom, isReady }: { center: [number, number]; zoom: number; isReady: boolean }) {
  // Only use the hook on client side
  if (typeof window === 'undefined') return null;
  
  const { useMap } = require('react-leaflet');
  const map = useMap();
  
  React.useEffect(() => {
    if (map && isReady) {
      // Small delay to ensure map is fully mounted
      const timer = setTimeout(() => {
        try {
          map.setView(center, zoom, { animate: true, duration: 1.0 });
        } catch (error) {
          console.warn('Map view update error:', error);
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [map, center, zoom, isReady]);
  
  return null;
}

interface LocationStepProps {
  onNext: () => void;
}

interface ParkWithDistance extends Park {
  distanceMeters: number;
  formattedDistance: string;
}

/**
 * Haversine formula to calculate distance between two coordinates in meters
 * @param lat1 Latitude of first point
 * @param lng1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lng2 Longitude of second point
 * @returns Distance in meters
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Format distance in a human-readable format (Hebrew)
 * @param distanceMeters Distance in meters
 * @returns Formatted string (e.g., "600 מטר ממך" or "1.7 קילומטר ממך")
 */
function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} מטר ממך`;
  }
  const kilometers = (distanceMeters / 1000).toFixed(1);
  return `${kilometers} קילומטר ממך`;
}

/**
 * Fetch nearby parks based on user location
 * @param userLat User's latitude
 * @param userLng User's longitude
 * @param maxRadiusMeters Maximum radius in meters (default: 10km)
 * @returns Array of parks sorted by distance (nearest first)
 */
async function fetchNearbyParks(
  userLat: number,
  userLng: number,
  maxRadiusMeters: number = 10000 // 10km default
): Promise<ParkWithDistance[]> {
  try {
    // Fetch all parks from database
    const allParks = await getAllParks();

    // Calculate distance for each park and filter by radius
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
      .sort((a, b) => a.distanceMeters - b.distanceMeters); // Sort by distance, nearest first

    return parksWithDistance;
  } catch (error) {
    console.error('Error fetching nearby parks:', error);
    return [];
  }
}

export default function LocationStep({ onNext }: LocationStepProps) {
  const { updateData, data, claimReward, hasClaimedReward } = useOnboardingStore();
  const [isLocating, setIsLocating] = useState(false);
  const [locationFound, setLocationFound] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [nearbyParks, setNearbyParks] = useState<ParkWithDistance[]>([]);
  const [isLoadingParks, setIsLoadingParks] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<NodeJS.Timeout | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [showCoinRain, setShowCoinRain] = useState(false);
  
  // Check if reward was already claimed (persisted in store)
  const hasEarnedLocationReward = hasClaimedReward('LOCATION_REWARD');

  // Get gender from sessionStorage
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') || 'male') as 'male' | 'female'
    : 'male';
  
  // Gender-aware translation helper
  const t = (male: string, female: string) => gender === 'female' ? female : male;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
      }
    };
  }, [autoAdvanceTimer]);

  // Countdown timer when location is found
  useEffect(() => {
    if (!locationFound) {
      setCountdown(null);
      return;
    }

    // Start countdown from 10 seconds
    setCountdown(10);
    
    // Update countdown every second
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-advance after 10 seconds
    const timer = setTimeout(() => {
      onNext();
    }, 10000);
    
    setAutoAdvanceTimer(timer);

    // Cleanup on unmount or when locationFound changes
    return () => {
      clearInterval(countdownInterval);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFound]); // onNext is stable from props, safe to exclude from deps

  const handleConfirmLocation = () => {
    if (locationFound) {
      // Already found location - cancel timer and continue immediately
      if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
        setAutoAdvanceTimer(null);
      }
      setCountdown(null);
      onNext();
      return;
    }

    if (!navigator.geolocation) {
      setLocationError('דפדפן זה לא תומך במיקום');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // Log permission granted
        const { Analytics } = await import('@/features/analytics/AnalyticsService');
        Analytics.logPermissionLocationStatus('granted', 'onboarding_location_step').catch((error) => {
          console.error('[LocationStep] Error logging permission status:', error);
        });
        
        // Success: Update store and fetch nearby parks
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        updateData({
          locationAllowed: true,
          city: 'מיקום נוכחי',
        });
        setIsLocating(false);
        setIsLoadingParks(true);

        try {
          // Fetch nearby parks (within 10km radius)
          const parks = await fetchNearbyParks(latitude, longitude, 10000);
          const top3Parks = parks.slice(0, 3); // Take top 3 nearest parks
          setNearbyParks(top3Parks);
          setLocationFound(true);

          // Award 150 coins for location approval (one-time reward via store)
          if (claimReward('LOCATION_REWARD', 150)) {
            // Trigger coin rain animation only if reward was claimed (first time)
            setShowCoinRain(true);
            setTimeout(() => setShowCoinRain(false), 2000);
          }

          // Countdown and auto-advance will be handled by useEffect
        } catch (error) {
          console.error('Error loading nearby parks:', error);
          setLocationFound(true); // Still mark as found even if parks fetch fails
          
          // Still award coins even if parks fetch fails
          if (claimReward('LOCATION_REWARD', 150)) {
            // Trigger coin rain animation only if reward was claimed (first time)
            setShowCoinRain(true);
            setTimeout(() => setShowCoinRain(false), 2000);
          }
        } finally {
          setIsLoadingParks(false);
        }
      },
      async (error) => {
        // Log permission denied
        const { Analytics } = await import('@/features/analytics/AnalyticsService');
        const status = error.code === 1 ? 'denied' : 'prompt';
        Analytics.logPermissionLocationStatus(status, 'onboarding_location_step').catch((err) => {
          console.error('[LocationStep] Error logging permission status:', err);
        });
        
        // Error: Show error message
        setIsLocating(false);
        setLocationError('לא הצלחנו לקבל את המיקום שלך. אנא נסה שוב.');
        
        // Update store to indicate location was denied
        updateData({
          locationAllowed: false,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };


  // Default center (Tel Aviv) if no user location
  // Leaflet uses [lat, lng] format
  const mapCenter: [number, number] = userLocation 
    ? [userLocation.lat, userLocation.lng]
    : [32.0853, 34.7818]; // Tel Aviv coordinates
  const mapZoom = locationFound ? 13 : 12; // Wide-angle view: 13 when location found, 12 for initial view

  return (
    <div dir="rtl" className="fixed inset-0 w-full h-screen overflow-hidden bg-background-light z-50">
      {/* Map Container */}
      <div className="absolute inset-0 overflow-hidden" style={{ minHeight: '100vh', height: '100vh', width: '100%' }}>
        {/* Loading Skeleton with Pulsing Effect */}
        {isMapLoading && (
          <div className="absolute inset-0 bg-slate-200 flex items-center justify-center z-10">
            <div className="text-center">
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="bg-slate-300 rounded-lg w-64 h-64 mb-4 mx-auto"
              />
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="text-slate-600 font-simpler"
                style={{ fontFamily: 'Assistant, sans-serif' }}
              >
                טוען מפה...
              </motion.p>
            </div>
          </div>
        )}
        
        {typeof window !== 'undefined' && (
          <div className="relative w-full h-full">
            <MapContainer
              key={`map-${userLocation ? `${userLocation.lat}-${userLocation.lng}` : 'default'}`}
              center={mapCenter}
              zoom={12}
              style={{ height: '100%', width: '100%', zIndex: 0 }}
              className="z-0"
              dragging={false}
              zoomControl={false}
              scrollWheelZoom={false}
              doubleClickZoom={false}
              touchZoom={false}
              boxZoom={false}
              keyboard={false}
              whenReady={() => {
                // Map is ready, allow view updates
                setTimeout(() => {
                  setIsMapReady(true);
                  setIsMapLoading(false);
                }, 200);
              }}
            >
              <ChangeView center={mapCenter} zoom={mapZoom} isReady={isMapReady} />
              <TileLayer
                attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>'
                url={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}&language=he`}
              />
              
              {/* User Location Marker - Lemur Avatar */}
              {userLocation && (
                <Marker position={[userLocation.lat, userLocation.lng]} icon={createLemurMarkerIcon()}>
                  <Popup>
                    <div className="text-center font-simpler">
                      <strong>המיקום שלך</strong>
                    </div>
                  </Popup>
                </Marker>
              )}


              {/* Real Park Markers - Only visible after location is found */}
              {locationFound && nearbyParks.length > 0 && (
                <>
                  {nearbyParks.map((park) => {
                    if (!park.location || !park.location.lat || !park.location.lng) return null;
                    return (
                      <Marker
                        key={park.id}
                        position={[park.location.lat, park.location.lng]}
                        icon={parkMarkerIcon}
                      >
                        <Popup>
                          <div className="text-center font-simpler">
                            <strong>{park.name}</strong>
                            <br />
                            <span className="text-sm text-gray-600">{park.formattedDistance}</span>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
                </>
              )}
            </MapContainer>
            
            {/* Blur Overlay - Only visible before location is approved */}
            {!locationFound && (
              <div 
                className="absolute inset-0 z-[2] pointer-events-none transition-all duration-500"
                style={{ 
                  backdropFilter: 'blur(8px)',
                  background: 'rgba(255, 255, 255, 0.1)'
                }}
              />
            )}
            
            {/* Fake Park Pins Overlay - Semi-transparent markers before location approval */}
            {!locationFound && (
              <div className="absolute inset-0 pointer-events-none z-[3] opacity-30">
                {/* CSS-based fake pins using absolute positioning */}
                <div className="absolute" style={{ top: '45%', right: '35%' }}>
                  <img src="/icons/park-pin.svg" alt="" className="w-8 h-10" style={{ filter: 'opacity(0.5)' }} />
                </div>
                <div className="absolute" style={{ top: '55%', right: '50%' }}>
                  <img src="/icons/park-pin.svg" alt="" className="w-8 h-10" style={{ filter: 'opacity(0.5)' }} />
                </div>
                <div className="absolute" style={{ top: '40%', right: '60%' }}>
                  <img src="/icons/park-pin.svg" alt="" className="w-8 h-10" style={{ filter: 'opacity(0.5)' }} />
                </div>
                <div className="absolute" style={{ top: '50%', right: '25%' }}>
                  <img src="/icons/park-pin.svg" alt="" className="w-8 h-10" style={{ filter: 'opacity(0.5)' }} />
                </div>
                <div className="absolute" style={{ top: '60%', right: '45%' }}>
                  <img src="/icons/park-pin.svg" alt="" className="w-8 h-10" style={{ filter: 'opacity(0.5)' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content Overlay - Bottom Sheet Card */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-background-light via-background-light/95 to-transparent pt-8 pb-6">
        <div className="bg-white rounded-t-3xl shadow-2xl shadow-slate-200/50 p-6 border-t border-slate-100 flex flex-col min-h-[300px]">
          {/* Conditional Header - Full mode when location not found, mini mode when found */}
          {!locationFound ? (
            <div className="mb-4">
              <h2 className="text-2xl font-bold leading-tight text-slate-900 mb-3" style={{ fontFamily: 'Assistant, sans-serif' }}>
                {t('רוצה למצוא את הפארק הקרוב אליך?', 'רוצה למצוא את הפארק הקרוב אלייך?')}
              </h2>
              <p className="text-slate-600 leading-relaxed text-sm mb-3" style={{ fontFamily: 'Assistant, sans-serif' }}>
                אין לך ציוד כושר? אין בעיה — בדיוק בשביל זה יש גינות כושר ציבוריות! מיפינו מאות גינות ברחבי הארץ, עם
                מתקנים שמתאימים לאימוני OUT.
              </p>
              <p className="text-slate-600 leading-relaxed text-sm font-semibold" style={{ fontFamily: 'Assistant, sans-serif' }}>
                {t('אשר את המיקום שלך, ונמצא את הגינה הקרובה אליך להתחיל בה את המסע שלך.', 'אשרי את המיקום שלך, ונמצא את הגינה הקרובה אלייך להתחיל בה את המסע שלך.')}
              </p>
            </div>
          ) : (
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Assistant, sans-serif' }}>
                פארקים קרובים אליי
              </h3>
            </div>
          )}

          {/* Nearby Parks List - Revealed after location found */}
          <AnimatePresence>
            {locationFound && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.4 }}
                className="bg-white rounded-xl shadow-lg p-6 relative z-10 border border-slate-100 mb-4"
              >
                {isLoadingParks ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="text-[#00BFFF] animate-spin" />
                    <span className="mr-3 text-slate-600" style={{ fontFamily: 'Assistant, sans-serif' }}>
                      מחפש פארקים קרובים...
                    </span>
                  </div>
                ) : nearbyParks.length > 0 ? (
                  <>
                    <div className="flex justify-between items-center mb-6">
                      <Search size={20} className="text-slate-400" />
                      <div className="h-6 w-px bg-slate-300 mx-2"></div>
                    </div>
                    <div className="space-y-6">
                      {nearbyParks.map((park, index) => (
                        <motion.div
                          key={park.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 * index }}
                          className="flex justify-between items-center"
                        >
                          <span className="text-[#00BFFF] font-bold text-sm">{park.formattedDistance}</span>
                          <span className="font-bold text-slate-900" style={{ fontFamily: 'Assistant, sans-serif' }}>
                            {park.name}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-600 mb-2" style={{ fontFamily: 'Assistant, sans-serif' }}>
                      אין פארקים קרובים עדיין, אבל אתה עדיין יכול להתאמן!
                    </p>
                    <p className="text-sm text-slate-500" style={{ fontFamily: 'Assistant, sans-serif' }}>
                      נמשיך לחפש פארקים חדשים באזור שלך.
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Coin Burst Animation - Appears when location is confirmed */}
          <AnimatePresence>
            {showCoinRain && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 pointer-events-none z-[100]"
              >
                {Array.from({ length: 15 }).map((_, i) => {
                  const angle = (i * 360) / 15;
                  const distance = 150 + (Math.random() * 100);
                  const x = Math.cos((angle * Math.PI) / 180) * distance;
                  const y = Math.sin((angle * Math.PI) / 180) * distance;
                  
                  return (
                    <motion.div
                      key={i}
                      initial={{
                        x: '50%',
                        y: '80%',
                        opacity: 1,
                        scale: 1,
                      }}
                      animate={{
                        x: `calc(50% + ${x}px)`,
                        y: `calc(80% + ${y}px)`,
                        opacity: [1, 1, 0],
                        scale: [1, 1.3, 0.8],
                        rotate: [0, 180 + (i * 24), 360],
                      }}
                      transition={{
                        duration: 1.5,
                        delay: i * 0.03,
                        ease: 'easeOut',
                      }}
                      className="absolute"
                    >
                      <div className="flex items-center gap-1 bg-yellow-300 text-yellow-900 rounded-full px-3 py-2 shadow-xl">
                        <Coins size={20} className="text-yellow-900" strokeWidth={2.5} />
                        <span className="text-lg font-bold font-simpler">+150</span>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          {locationError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-right"
            >
              <p className="text-sm text-red-600" style={{ fontFamily: 'Assistant, sans-serif' }}>
                {locationError}
              </p>
            </motion.div>
          )}

          {/* Action Button - Only show when location not found */}
          {!locationFound && (
            <div className="mt-auto pt-4 pb-2">
              {/* Coin Badge above button */}
              <div className="flex justify-center mb-3">
                <motion.div
                  initial={{ opacity: 0.8, scale: 1 }}
                  animate={{ 
                    opacity: 1,
                    scale: hasEarnedLocationReward ? 1.1 : 1
                  }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-1.5 bg-amber-100 text-amber-800 rounded-full px-4 py-2 shadow-md border-2 border-amber-300"
                >
                  <Coins size={18} className="text-amber-800" strokeWidth={2.5} />
                  <span className="text-base font-bold font-simpler">+150</span>
                </motion.div>
              </div>
              
              {/* Main Button */}
              <button
                onClick={handleConfirmLocation}
                disabled={isLocating}
                className="w-full bg-[#00BFFF] hover:bg-[#00BFFF]/90 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#00BFFF]/20 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative overflow-hidden"
                style={{ fontFamily: 'Assistant, sans-serif' }}
              >
                {isLocating ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>מחפש מיקום...</span>
                  </>
                ) : (
                t('אשר מיקום ומצא גינות', 'אשרי מיקום ומצא גינות')
              )}
              </button>
            </div>
          )}

          {/* Countdown indicator when location found */}
          {locationFound && countdown !== null && (
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-[#00BFFF]"
                  initial={{ width: '0%' }}
                  animate={{ width: `${((10 - countdown) / 10) * 100}%` }}
                  transition={{ duration: 1, ease: 'linear' }}
                />
              </div>
              <p className="text-center text-sm text-gray-600 mt-2" style={{ fontFamily: 'Assistant, sans-serif' }}>
                ממשיכים בעוד {countdown}...
              </p>
            </div>
          )}

          {/* Bottom Sheet Indicator */}
          <div className="flex justify-center mt-4 pt-2">
            <div className="w-32 h-1 bg-slate-200 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Coins, User } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { getAllAuthorities, getAuthority } from '@/features/admin/services/authority.service';
import { syncOnboardingToFirestore } from '../../services/onboarding-sync.service';
import { getParksByAuthority, getAllParks } from '@/features/admin/services/parks.service';
import { Authority } from '@/types/admin-types';
import { ISRAELI_LOCATIONS, IsraeliLocation, SubLocation, LocationType } from '@/lib/data/israel-locations';
import dynamic from 'next/dynamic';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox Token
const MAPBOX_TOKEN = "pk.eyJ1IjoiZGF2aWQtb3V0IiwiYSI6ImNtanZpZmJ0djM5MTEzZXF5YXNmcm9zNGwifQ.8MD8s4TZOr0WYYgEpFfpzw";

// Dynamic imports for Mapbox (avoid SSR issues)
const MapboxMap = dynamic(() => import('react-map-gl').then((mod) => mod.default), { ssr: false });
const MapboxMarker = dynamic(() => import('react-map-gl').then((mod) => mod.Marker), { ssr: false });

// Coin Fly Animation Component
function CoinFly({ 
  startPos, 
  endPos, 
  amount, 
  onComplete 
}: { 
  startPos: { x: number; y: number } | null; 
  endPos: { x: number; y: number } | null;
  amount: number;
  onComplete: () => void;
}) {
  if (!startPos || !endPos) return null;

  return (
    <motion.div
      initial={{ 
        x: startPos.x - 30,
        y: startPos.y - 12,
        scale: 1,
        opacity: 1
      }}
      animate={{ 
        x: endPos.x - 30,
        y: endPos.y - 12,
        scale: [1, 1.3, 0.8],
        opacity: [1, 1, 0]
      }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ 
        duration: 0.9,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      onAnimationComplete={onComplete}
      className="fixed pointer-events-none z-50"
      style={{ left: 0, top: 0 }}
    >
      <motion.div 
        className="flex items-center gap-1 bg-yellow-200 text-yellow-800 rounded-full px-2 py-1 shadow-lg"
        animate={{ rotate: [0, 180, 360] }}
        transition={{ duration: 0.9, ease: "linear" }}
      >
        <Coins size={16} className="text-yellow-800" strokeWidth={2.5} />
        <span className="text-xs font-bold font-simpler">+{amount}</span>
      </motion.div>
    </motion.div>
  );
}

// Radar Pulse Animation Component
function RadarPulse({ center, onComplete }: { center: { lat: number; lng: number } | null; onComplete: () => void }) {
  if (!center) return null;

  return (
    <MapboxMarker longitude={center.lng} latitude={center.lat} anchor="center">
      <div className="relative w-0 h-0">
        <AnimatePresence>
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ 
                scale: [0, 3, 6],
                opacity: [0.8, 0.4, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 3,
                delay: i * 0.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
              className="absolute inset-0 rounded-full border-4 border-[#60A5FA]"
              style={{
                width: '200px',
                height: '200px',
                marginLeft: '-100px',
                marginTop: '-100px',
              }}
            />
          ))}
        </AnimatePresence>
        </div>
      </MapboxMarker>
    );
  }

interface CitySelectionStepProps {
  onNext: () => void;
}

// Enhanced OUTer data with speech bubbles and character types
interface OuterMarker {
  id: string;
  lat: number;
  lng: number;
  level: number;
  isActive: boolean;
  characterType?: 'ninja' | 'heavy' | 'yoga' | 'runner' | 'calisthenics';
  speechBubble?: string; // Hebrew text for speech bubble
}

// City data structure (supports hierarchy)
interface CityData {
  id: string;
  name: string;
  displayName: string; // Includes parent name if it's a sub-location (e.g., "Tel Aviv - Florentin")
  type: LocationType;
  lat: number;
  lng: number;
  trainers: number; // User count from Firestore
  gyms: number; // Parks count from Firestore
  isMapped: boolean; // Derived from parks existence
  population: number; // Population for sorting
  parentId?: string; // For sub-locations (neighborhoods/settlements)
  parentName?: string; // Parent location name
  parentAuthorityId?: string; // Authority ID from Firestore (for billing)
}

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

// Hebrew to English city name mappings for search functionality
const CITY_MAPPINGS: Record<string, string> = {
  'תל אביב': 'Tel Aviv',
  'תל-אביב': 'Tel Aviv',
  'תל אביב-יפו': 'Tel Aviv',
  'ירושלים': 'Jerusalem',
  'חולון': 'Holon',
  'ראשון לציון': 'Rishon LeZion',
  'חיפה': 'Haifa',
  'פתח תקווה': 'Petah Tikva',
  'אשדוד': 'Ashdod',
  'נתניה': 'Netanya',
  'באר שבע': 'Beersheba',
  'רמת גן': 'Ramat Gan',
  'הרצליה': 'Herzliya',
  'אשקלון': 'Ashkelon',
  'רחובות': 'Rehovot',
  'כפר סבא': 'Kfar Saba',
  'בני ברק': 'Bnei Brak',
  'רמת השרון': 'Ramat HaSharon',
  'גבעתיים': 'Givatayim',
  'רעננה': 'Ra\'anana',
  'בת ים': 'Bat Yam',
  'קריית גת': 'Kiryat Gat',
  'טבריה': 'Tiberias',
  'נהריה': 'Nahariya',
  'עכו': 'Acre',
  'צפת': 'Safed',
  'אילת': 'Eilat',
  'מודיעין': 'Modi\'in',
  'ראש העין': 'Rosh HaAyin',
  'לוד': 'Lod',
  'רמלה': 'Ramla',
  'נצרת': 'Nazareth',
  'עפולה': 'Afula',
};

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

// Waze-style Character Avatar Component with 5 character types
// Using forwardRef to fix refs warning when used with motion
interface WazeAvatarProps {
  level: number;
  speechBubble?: string;
  characterType?: 'ninja' | 'heavy' | 'yoga' | 'runner' | 'calisthenics';
}

const WazeAvatar = forwardRef<HTMLDivElement, WazeAvatarProps>(
  ({ level, speechBubble, characterType }, ref) => {
    // Select character emoji based on type, default to runner
    const characterEmoji = characterType ? CHARACTER_TYPES[characterType] : CHARACTER_TYPES.runner;

    return (
      <div className="relative" ref={ref}>
        {/* Speech Bubble - Shrunk by 25% */}
        {speechBubble && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="absolute bottom-full mb-1.5 right-1/2 translate-x-1/2 z-20"
          >
            <div className="bg-white/90 rounded-xl px-2 py-1 shadow-md border border-slate-200 relative" style={{ opacity: 0.9 }}>
              <span className="text-[10px] font-bold font-simpler text-slate-900 whitespace-nowrap" dir="rtl">
                {speechBubble}
              </span>
              {/* Arrow pointing down - smaller */}
              <div className="absolute top-full right-1/2 translate-x-1/2 w-0 h-0" style={{ borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderTop: '3px solid white' }}></div>
            </div>
          </motion.div>
        )}

        {/* Avatar Circle with Character */}
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#60A5FA] to-[#4A90D9] border-[3px] border-white shadow-xl flex items-center justify-center relative z-10">
          <span className="text-2xl">{characterEmoji}</span>
        </div>

        {/* Level Badge */}
        <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full w-6 h-6 border-2 border-white flex items-center justify-center shadow-md z-10">
          <span className="text-[10px] font-black text-yellow-900">{level}</span>
        </div>
      </div>
    );
  }
);

WazeAvatar.displayName = 'WazeAvatar';

export default function CitySelectionStep({ onNext }: CitySelectionStepProps) {
  const { updateData, claimReward, hasClaimedReward, coins, data, setStep } = useOnboardingStore();
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  
  // Get current language
  const savedLanguage = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he') as OnboardingLanguage
    : 'he';
  const locale = getOnboardingLocale(savedLanguage);

  // State - Ensure arrays are always initialized as empty arrays
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [cities, setCities] = useState<CityData[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  
  // Safety: Ensure cities is always an array
  const safeCities = Array.isArray(cities) ? cities : [];
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [flyingCoin, setFlyingCoin] = useState<{ 
    startPos: { x: number; y: number } | null;
    endPos: { x: number; y: number } | null;
    amount: number;
  } | null>(null);
  const [radarCenter, setRadarCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [showRadar, setShowRadar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [parksCount, setParksCount] = useState<number | null>(null);
  const [selectedCityName, setSelectedCityName] = useState<string>('');
  const [showBottomCard, setShowBottomCard] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false); // Prevent double execution

  // Refs for coin animation
  const coinBadgeRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const coinTargetPos = useRef<{ x: number; y: number }>({ x: 50, y: 50 });

  // Click outside handler to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };

    if (isSearchOpen) {
      // Use a small delay to prevent immediate closing when clicking the input
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isSearchOpen]);

  // Helper: Flatten hierarchical locations (parent + sub-locations) for search
  const flattenLocations = (locations: IsraeliLocation[]): Array<{
    id: string;
    name: string;
    displayName: string;
    type: LocationType;
    population: number;
    parentId?: string;
    parentName?: string;
    coordinates?: { lat: number; lng: number };
  }> => {
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
      // Add parent location
      flattened.push({
        id: location.id,
        name: location.name,
        displayName: location.name,
        type: location.type,
        population: location.population,
      });

      // Add sub-locations with parent info
      if (location.subLocations && location.subLocations.length > 0) {
        location.subLocations.forEach(sub => {
          flattened.push({
            id: sub.id,
            name: sub.name,
            displayName: `${location.name} - ${sub.name}`, // Hierarchical display with hyphen separator
            type: sub.type,
            population: location.population, // Inherit parent population for sorting
            parentId: location.id,
            parentName: location.name,
          });
        });
      }
    });

    return flattened;
  };

  // Helper: Get default coordinates for known locations (fallback)
  const getDefaultCoordinates = (locationId: string, parentId?: string): { lat: number; lng: number } => {
    // Map of known coordinates for major locations (expanded)
    const coordsMap: Record<string, { lat: number; lng: number }> = {
      // Major cities
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
      'ashkelon': { lat: 31.6690, lng: 34.5715 },
      'rehovot': { lat: 31.8948, lng: 34.8118 },
      'herzliya': { lat: 32.1636, lng: 34.8443 },
      'kfar-saba': { lat: 32.1715, lng: 34.9068 },
      'hadera': { lat: 32.4340, lng: 34.9195 },
      'modiin': { lat: 31.8951, lng: 35.0094 },
      'lod': { lat: 31.9510, lng: 34.8880 },
      'beit-shemesh': { lat: 31.7511, lng: 34.9881 },
      // Regional Councils
      'emek-hefer': { lat: 32.3667, lng: 34.9167 },
      'mateh-yehuda': { lat: 31.7500, lng: 35.0000 },
      'drom-hasharon': { lat: 32.1500, lng: 34.8500 },
      'hof-hasharon': { lat: 32.2000, lng: 34.8333 },
      'emek-yizrael': { lat: 32.6333, lng: 35.3333 },
      'misgav': { lat: 32.8500, lng: 35.2500 },
      'eshkol': { lat: 31.2500, lng: 34.4000 },
      'shomron': { lat: 32.1667, lng: 35.0833 },
      'binyamin': { lat: 31.9500, lng: 35.2500 },
      'gush-etzion': { lat: 31.6500, lng: 35.1167 },
      'hevel-modiin': { lat: 31.9667, lng: 34.9167 },
      'gezer': { lat: 31.8667, lng: 34.9167 },
      'golan': { lat: 33.0000, lng: 35.7500 },
    };
    
    // Try direct match first
    if (coordsMap[locationId]) {
      return coordsMap[locationId];
    }
    
    // For sub-locations, try parent coordinates
    if (parentId && coordsMap[parentId]) {
      return coordsMap[parentId];
    }
    
    // Default to Tel Aviv
    return { lat: 32.0853, lng: 34.7818 };
  };

  // Fetch authorities from Firestore and merge with static location data
  useEffect(() => {
    const loadAuthorities = async () => {
      try {
        setLoading(true);
        
        // Step 1: Load static locations and flatten hierarchy
        const flattenedLocations = flattenLocations(ISRAELI_LOCATIONS);
        
        // Step 2: Fetch dynamic data from Firestore
        const auths = await getAllAuthorities();
        setAuthorities(auths);
        
        // Step 3: Create lookup maps for Firestore data
        const authMapById = new Map<string, Authority>();
        const authMapByName = new Map<string, Authority>();
        
        auths.forEach(auth => {
          if (auth.id) {
            authMapById.set(auth.id, auth);
          }
          if (auth.name) {
            authMapByName.set(auth.name.toLowerCase().trim(), auth);
          }
        });

        // Step 4: Merge static data with Firestore data
        const cityDataPromises = flattenedLocations.map(async (staticLoc) => {
          // Try to find matching authority by ID first
          let matchingAuth = authMapById.get(staticLoc.id);
          
          // For sub-locations, try parent ID first (since settlement might be under Regional Council)
          if (!matchingAuth && staticLoc.parentId) {
            const parentAuth = authMapById.get(staticLoc.parentId);
            if (parentAuth) {
              // Use parent authority for billing purposes
              matchingAuth = parentAuth;
            }
          }
          
          // If still not found, try matching by name (fuzzy)
          if (!matchingAuth) {
            const normalizedName = staticLoc.name.toLowerCase().trim();
            matchingAuth = authMapByName.get(normalizedName);
            
            if (!matchingAuth && staticLoc.parentName) {
              const normalizedParentName = staticLoc.parentName.toLowerCase().trim();
              matchingAuth = authMapByName.get(normalizedParentName);
            }
          }

          // Determine authority ID for park lookup
          // If it's a sub-location and we found a parent auth, use parent for parks
          // Otherwise, try direct match
          const authorityIdForParks = staticLoc.parentId && matchingAuth?.id === staticLoc.parentId
            ? matchingAuth.id
            : (matchingAuth?.id || staticLoc.id);
          
          // Get parks count for this location/authority
          const parks = authorityIdForParks ? await getParksByAuthority(authorityIdForParks).catch(() => []) : [];
          const parksCount = parks.length;
          
          // Get coordinates from Firestore or default (use parent coordinates for sub-locations)
          const coords = matchingAuth?.coordinates || staticLoc.coordinates || getDefaultCoordinates(staticLoc.id, staticLoc.parentId);
          
          // Determine parent authority ID (for billing - important for B2G)
          let parentAuthorityId = matchingAuth?.id;
          if (staticLoc.parentId && matchingAuth?.id === staticLoc.parentId) {
            parentAuthorityId = matchingAuth.id;
          } else if (staticLoc.parentId) {
            // Try to find parent authority in Firestore
            const parentAuth = authMapById.get(staticLoc.parentId);
            parentAuthorityId = parentAuth?.id || undefined;
          }

          return {
            id: staticLoc.id,
            name: staticLoc.name,
            displayName: staticLoc.displayName,
            type: staticLoc.type,
            lat: coords.lat,
            lng: coords.lng,
            trainers: matchingAuth?.userCount || 0,
            gyms: parksCount,
            isMapped: parksCount > 0 || matchingAuth?.status === 'active',
            population: staticLoc.population,
            parentId: staticLoc.parentId,
            parentName: staticLoc.parentName,
            parentAuthorityId, // For billing/reporting
          } as CityData;
        });
        
        // Step 5: Include any Firestore authorities not in static list
        const additionalAuthsPromises = auths
          .filter(auth => {
            if (!auth.id) return false;
            // Check if already covered by static data
            return !flattenedLocations.some(loc => loc.id === auth.id);
          })
          .map(async (auth) => {
            const parks = auth.id ? await getParksByAuthority(auth.id).catch(() => []) : [];
            const parksCount = parks.length;
            const coords = auth.coordinates || getDefaultCoordinates(auth.id);
            
            return {
              id: auth.id,
              name: auth.name,
              displayName: auth.name,
              type: (auth.type === 'city' || auth.type === 'regional_council' || auth.type === 'local_council')
                ? auth.type
                : 'city',
              lat: coords.lat,
              lng: coords.lng,
              trainers: auth.userCount || 0,
              gyms: parksCount,
              isMapped: parksCount > 0 || auth.status === 'active',
              population: 0,
              parentAuthorityId: auth.parentAuthorityId,
            } as CityData;
          });

        const cityData = await Promise.all(cityDataPromises);
        const additionalCities = await Promise.all(additionalAuthsPromises);
        
        // Step 6: Combine and sort by population (descending)
        const allCities = [...cityData, ...additionalCities];
        const sortedCities = allCities.sort((a, b) => {
          const popDiff = b.population - a.population;
          if (popDiff !== 0) return popDiff;
          return a.name.localeCompare(b.name, 'he');
        });
        
        const safeCityData = Array.isArray(sortedCities) ? sortedCities : [];
        setCities(safeCityData);
        
        // Set default selected city
        if (safeCityData.length > 0) {
          const telAvivCity = safeCityData.find(c => 
            c?.id === 'tel-aviv' || c?.name?.includes('תל אביב')
          );
          setSelectedCity(telAvivCity?.id || safeCityData[0]?.id || null);
        }
      } catch (error) {
        console.error('Error loading authorities:', error);
        // Fallback: use static data only
        const flattened = flattenLocations(ISRAELI_LOCATIONS);
        const fallbackCities = flattened.map(loc => ({
          ...loc,
          lat: loc.coordinates?.lat || getDefaultCoordinates(loc.id, loc.parentId).lat,
          lng: loc.coordinates?.lng || getDefaultCoordinates(loc.id, loc.parentId).lng,
          trainers: 0,
          gyms: 0,
          isMapped: false,
          displayName: loc.displayName || loc.name,
          type: loc.type,
          parentAuthorityId: undefined, // Will be resolved later when Firestore is available
        } as CityData)).sort((a, b) => b.population - a.population);
        
        setCities(fallbackCities);
        setAuthorities([]);
        
        const telAviv = fallbackCities.find(c => c.id === 'tel-aviv');
        if (telAviv) {
          setSelectedCity(telAviv.id);
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadAuthorities();
  }, []);

  // Update target position on mount
  useEffect(() => {
    coinTargetPos.current = { 
      x: typeof window !== 'undefined' ? window.innerWidth - 80 : 300,
      y: 80
    };
  }, []);

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
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
  };

  // Trigger radar pulse on city selection with park scanning
  // Uses both authority-based (inheritance) and radius-based checks
  const triggerRadarPulse = async (
    city: { lat: number; lng: number }, 
    authorityId: string,
    parentAuthorityId?: string
  ) => {
    // Hide bottom card at start of scan
    setShowBottomCard(false);
    setRadarCenter(city);
    setShowRadar(true);
    setScanning(true);
    
    // Fetch parks using multiple methods (inheritance + radius-based)
    try {
      const parkIds = new Set<string>(); // Use Set to deduplicate
      const MAX_RADIUS_METERS = 5000; // 5km radius
      
      // Method 1: Parks by current authority ID
      try {
        const parksByAuthority = await getParksByAuthority(authorityId);
        parksByAuthority.forEach(park => {
          if (park.id) parkIds.add(park.id);
        });
      } catch (error) {
        console.warn('Error fetching parks by authority:', error);
      }
      
      // Method 2: Parks by parent authority ID (inheritance - parks in parent city visible to sub-neighborhoods)
      if (parentAuthorityId && parentAuthorityId !== authorityId) {
    try {
          const parksByParent = await getParksByAuthority(parentAuthorityId);
          parksByParent.forEach(park => {
            if (park.id) parkIds.add(park.id);
          });
        } catch (error) {
          console.warn('Error fetching parks by parent authority:', error);
        }
      }
      
      // Method 3: Parks within radius (5km) of city coordinates
      try {
        const allParks = await getAllParks();
        const parksInRadius = allParks.filter(park => {
          if (!park.location || !park.location.lat || !park.location.lng) return false;
          const distance = calculateDistance(
            city.lat,
            city.lng,
            park.location.lat,
            park.location.lng
          );
          return distance <= MAX_RADIUS_METERS;
        });
        parksInRadius.forEach(park => {
          if (park.id) parkIds.add(park.id);
        });
      } catch (error) {
        console.warn('Error fetching parks by radius:', error);
      }
      
      setParksCount(parkIds.size);
    } catch (error) {
      console.error('Error fetching parks:', error);
      setParksCount(0);
    }
    
    // Apply map boundary tint (soft blue)
    if (mapRef.current?.getMap()) {
      const map = mapRef.current.getMap();
      // Note: This requires a custom layer or style modification
      // For now, we'll use a visual overlay effect
    }
    
    // After 1.5 seconds, reveal the bottom card with animation
    setTimeout(() => {
      setScanning(false);
      setShowBottomCard(true);
    }, 1500);
    
    // Stop radar after 3 seconds
    setTimeout(() => {
      setShowRadar(false);
      setRadarCenter(null);
    }, 3000);
  };

  // Fly to city on mount with zoom 13.5 and radar pulse
  useEffect(() => {
    if (mapRef.current && selectedCity && safeCities.length > 0) {
      const city = safeCities.find(c => c?.id === selectedCity);
      if (city && city.lat && city.lng) {
        const timer = setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.flyTo({
              center: [city.lng, city.lat],
              zoom: 13.5,
              duration: 2000,
            });
      // Pass both authority ID and parent authority ID for inheritance check
      const authorityId = city.id || '';
      const parentAuthorityId = city.parentAuthorityId;
      triggerRadarPulse({ lat: city.lat, lng: city.lng }, authorityId, parentAuthorityId);
      setSelectedCityName(city.displayName || city.name || '');
          }
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedCity, safeCities.length]); // Trigger when city is selected

  // Show bottom card on initial load (after cities are loaded and default city is set)
  useEffect(() => {
    if (!loading && safeCities.length > 0 && selectedCity && !showBottomCard) {
      // Show card after initial data load with a delay to allow radar scan
      const timer = setTimeout(() => {
        setShowBottomCard(true);
      }, 2000); // Wait for initial radar scan to complete
      return () => clearTimeout(timer);
    }
  }, [loading, safeCities.length, selectedCity, showBottomCard]);

  // Trigger coin fly animation
  const triggerCoinFly = (badgeRef: React.RefObject<HTMLElement>, amount: number) => {
    if (!badgeRef.current) return;
    
    const badgeRect = badgeRef.current.getBoundingClientRect();
    const startPos = {
      x: badgeRect.left + badgeRect.width / 2,
      y: badgeRect.top + badgeRect.height / 2
    };
    
    setFlyingCoin({
      startPos,
      endPos: coinTargetPos.current,
      amount
    });
  };

  const handleCoinFlyComplete = () => {
    setFlyingCoin(null);
  };

  // Handle city chip click
  const handleCityChipClick = (cityId: string) => {
    setSelectedCity(cityId);
    setSearchQuery('');
    
    const city = safeCities.find(c => c?.id === cityId);
    if (mapRef.current && city && city.lat && city.lng) {
      mapRef.current.flyTo({
        center: [city.lng, city.lat],
        zoom: 13.5,
        duration: 1500,
      });
      // Pass both authority ID and parent authority ID for inheritance check
      const authorityId = city.id || '';
      const parentAuthorityId = city.parentAuthorityId;
      triggerRadarPulse({ lat: city.lat, lng: city.lng }, authorityId, parentAuthorityId);
      setSelectedCityName(city.displayName || city.name || '');
    }
  };

  // Filter cities based on search query (supports hierarchy)
  const filteredCities = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return safeCities.slice(0, 10); // Show top 10 when no search query
    }

    const searchTerm = searchQuery.trim().toLowerCase();
    const englishMappedName = CITY_MAPPINGS[searchQuery.trim()];

    return safeCities.filter(city => {
      if (!city?.name && !city?.displayName) return false;
      
      // Search in displayName (includes hierarchy like "Tel Aviv - Florentin")
      const displayName = city.displayName || city.name;
      const name = city.name;
      const parentName = city.parentName || '';

      // Strategy 1: Direct Hebrew match in name or displayName
      if (name.toLowerCase().includes(searchTerm) || displayName.toLowerCase().includes(searchTerm)) return true;

      // Strategy 2: Match in parent name (e.g., search "Tel Aviv" finds "Tel Aviv - Florentin")
      if (parentName && parentName.toLowerCase().includes(searchTerm)) return true;

      // Strategy 3: English mapping check
      if (englishMappedName) {
        if (name.toLowerCase().includes(englishMappedName.toLowerCase()) || 
            displayName.toLowerCase().includes(englishMappedName.toLowerCase())) return true;
      }

      // Strategy 4: Case-insensitive match (try catch for special characters)
      try {
        if (name.toLowerCase().includes(searchTerm) || 
            displayName.toLowerCase().includes(searchTerm)) return true;
      } catch (e) {
        if (name.includes(searchTerm) || displayName.includes(searchTerm)) return true;
      }

      return false;
    });
  }, [searchQuery, safeCities]);

  // Handle search - select city and fly to it
  const handleSearch = (query: string) => {
    const searchTerm = query.trim();
    
    if (!searchTerm) {
      // If empty, reset to default or first city
      if (safeCities.length > 0) {
        const defaultCity = safeCities[0];
        if (defaultCity?.id && defaultCity?.lat && defaultCity?.lng) {
          setSelectedCity(defaultCity.id);
          setSelectedCityName(defaultCity.name || '');
          if (mapRef.current) {
            mapRef.current.flyTo({
              center: [defaultCity.lng, defaultCity.lat],
              zoom: 8,
              duration: 1500,
            });
          }
        }
      }
      setIsSearchOpen(false);
      return;
    }
    
    // Use first matching city from filtered results
    const matchingCity = filteredCities[0];
    
    if (matchingCity && mapRef.current && matchingCity.lat && matchingCity.lng) {
      console.log('Found matching city:', matchingCity.displayName || matchingCity.name);
      setSelectedCity(matchingCity.id || null);
      mapRef.current.flyTo({
        center: [matchingCity.lng, matchingCity.lat],
        zoom: 13.5,
        duration: 1500,
      });
      // Pass both authority ID and parent authority ID for inheritance check
      const authorityId = matchingCity.id || '';
      const parentAuthorityId = matchingCity.parentAuthorityId;
      triggerRadarPulse({ lat: matchingCity.lat, lng: matchingCity.lng }, authorityId, parentAuthorityId);
      setSelectedCityName(matchingCity.displayName || matchingCity.name || '');
      setIsSearchOpen(false);
      setSearchQuery(matchingCity.displayName || matchingCity.name || '');
    }
  };

  // Handle city selection from dropdown
  const handleCitySelect = (city: CityData) => {
    setSelectedCity(city.id || null);
    // Use displayName if it's hierarchical, otherwise use name
    setSearchQuery(city.displayName || city.name || '');
    setIsSearchOpen(false);
    
    // Pass both authority ID and parent authority ID for inheritance check
    const authorityId = city.id || '';
    const parentAuthorityId = city.parentAuthorityId;
    
    if (mapRef.current && city.lat && city.lng) {
      mapRef.current.flyTo({
        center: [city.lng, city.lat],
        zoom: 13.5,
        duration: 1500,
      });
      triggerRadarPulse({ lat: city.lat, lng: city.lng }, authorityId, parentAuthorityId);
      setSelectedCityName(city.displayName || city.name || '');
    }
  };

  // Handle confirm
  const handleConfirm = async () => {
    // Prevent double execution
    if (isCompleting) {
      console.log('[CitySelectionStep] Already completing, ignoring duplicate call');
      return;
    }

    setIsCompleting(true);
    
    try {
    // Use displayName (includes hierarchy) or fallback to name
    const cityName = selectedCityData?.displayName || selectedCityData?.name || '';
    
    // Determine authority ID for billing (parent authority if sub-location, otherwise direct)
    // For B2G billing: settlements link to Regional Council
      // Always use selectedCityData.id as fallback to ensure we save something
      let authorityIdForBilling = selectedCityData?.id || null;
    if (selectedCityData?.parentAuthorityId) {
      authorityIdForBilling = selectedCityData.parentAuthorityId;
    } else if (selectedCityData?.parentId) {
      // Try to find parent authority in Firestore
      try {
        const parentAuth = await getAuthority(selectedCityData.parentId);
        if (parentAuth) {
          authorityIdForBilling = parentAuth.id;
        }
      } catch (error) {
        console.error('Error fetching parent authority:', error);
          // Continue with selectedCityData.id as fallback
      }
    }
    
    // Store authority ID in sessionStorage for sync service to pick up
      // This ensures the admin panel can see which authority the user selected
    if (authorityIdForBilling && typeof window !== 'undefined') {
      sessionStorage.setItem('selected_authority_id', authorityIdForBilling);
      } else if (selectedCityData?.id && typeof window !== 'undefined') {
        // Fallback: save the direct authority ID if billing ID wasn't determined
        sessionStorage.setItem('selected_authority_id', selectedCityData.id);
    }
      
      // Update data in store (this will trigger a sync, but we'll also sync COMPLETED step)
      updateData({ city: cityName });
    
    // Determine coin amount based on parks (100 if unmapped, 15 if mapped)
    const coinAmount = (parksCount === 0 || !parksCount) ? 100 : 15;
    const rewardId = (parksCount === 0 || !parksCount) ? 'CITY_MAPPING_REWARD' : 'CITY_SELECTION_REWARD';
    
    // Award coins if not already claimed
      let shouldWaitForCoinAnimation = false;
    if (!hasClaimedReward(rewardId)) {
      const wasClaimed = claimReward(rewardId, coinAmount);
      if (wasClaimed && coinBadgeRef.current) {
        triggerCoinFly(coinBadgeRef, coinAmount);
          shouldWaitForCoinAnimation = true;
        }
      }
      
      // Sync SOCIAL_MAP step first (with latest data including city)
      const finalData = { ...data, city: cityName };
      await syncOnboardingToFirestore('SOCIAL_MAP', finalData);
      
      // Wait for coin animation if needed
      if (shouldWaitForCoinAnimation) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Set step to COMPLETED - this will trigger the calculating screen in OnboardingWizard
      setStep('COMPLETED');
      
      // Call onNext to trigger the wizard's handleFinish flow
      // The wizard will show the calculating screen and then navigate to SUMMARY
      onNext();
      
    } catch (error) {
      console.error('[CitySelectionStep] Error in handleConfirm:', error);
      setIsCompleting(false); // Reset on error so user can retry
      
      // Continue anyway - don't block user from proceeding
      const cityName = selectedCityData?.displayName || selectedCityData?.name || '';
    updateData({ city: cityName });
      
      // Save authority ID even on error
      if (selectedCityData?.id && typeof window !== 'undefined') {
        sessionStorage.setItem('selected_authority_id', selectedCityData.id);
      }
      
      // Still try to complete onboarding
      setStep('COMPLETED');
    onNext();
    }
  };

  // Safe city data access with optional chaining
  const selectedCityData = safeCities.find(c => c?.id === selectedCity) || safeCities[0] || null;
  const isMapped = selectedCityData?.isMapped || false;

  // Console log for debugging
  console.log('Current cities state:', safeCities);
  console.log('Cities count:', safeCities.length);
  if (safeCities.length > 0) {
    console.log('Sample City:', safeCities[0]);
    console.log('First city name:', safeCities[0]?.name);
    console.log('First city structure:', JSON.stringify(safeCities[0], null, 2));
    // Show multiple samples to understand the data structure
    if (safeCities.length > 1) {
      console.log('Second city:', safeCities[1]);
      console.log('Third city:', safeCities[2]);
    }
  }
  console.log('Selected city:', selectedCity);
  console.log('Selected city data:', selectedCityData);
  console.log('Loading state:', loading);

  // Conditional rendering: Show loading spinner if data is still loading
  if (loading) {
    return (
      <div dir="rtl" className="w-full h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white font-simpler text-xl">טוען מפה...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="w-full h-screen flex flex-col bg-slate-900 relative overflow-hidden">
      {/* Coin Fly Animation */}
      <AnimatePresence>
        {flyingCoin && (
          <CoinFly
            startPos={flyingCoin.startPos}
            endPos={flyingCoin.endPos}
            amount={flyingCoin.amount}
            onComplete={handleCoinFlyComplete}
          />
        )}
      </AnimatePresence>

      {/* Search Bar & Dropdown */}
      <div className="absolute top-4 left-4 right-4 z-50 pointer-events-auto space-y-3">
        {/* Search Bar with Heavy Shadow */}
        <div className="relative" ref={searchContainerRef}>
          <button
            type="button"
            onClick={() => handleSearch(searchQuery)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-[#60A5FA] z-20 transition-colors cursor-pointer pointer-events-auto"
            aria-label="חפש"
          >
            <Search size={20} />
          </button>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true); // Show dropdown when typing
            }}
            onFocus={() => {
              setIsSearchOpen(true); // Show dropdown on focus
            }}
            onClick={() => {
              setIsSearchOpen(true); // Show dropdown on click
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(searchQuery);
              } else if (e.key === 'Escape') {
                setIsSearchOpen(false);
              }
            }}
            placeholder="חפש עיר..."
            dir="rtl"
            className="w-full pr-12 pl-4 py-3.5 rounded-2xl border border-slate-300 bg-white text-right font-simpler text-slate-900 shadow-2xl focus:outline-none focus:ring-2 focus:ring-[#60A5FA] focus:shadow-[#60A5FA]/20 pointer-events-auto"
          />

          {/* Dropdown List */}
          {isSearchOpen && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-64 overflow-y-auto z-[60] pointer-events-auto"
                dir="rtl"
              >
                {filteredCities.length > 0 ? (
                  <div className="py-2">
                    {filteredCities.map((city) => {
                      // Get type label in Hebrew
                      const getTypeLabel = (type: LocationType): string => {
                        switch (type) {
                          case 'city': return 'עירייה';
                          case 'regional_council': return 'מועצה אזורית';
                          case 'local_council': return 'מועצה מקומית';
                          case 'neighborhood': return 'שכונה';
                          case 'settlement': return 'יישוב';
                          default: return type;
                        }
                      };

                      // Get type color
                      const getTypeColor = (type: LocationType): string => {
                        switch (type) {
                          case 'city': return 'bg-purple-50 text-purple-700 border-purple-200';
                          case 'regional_council': return 'bg-blue-50 text-blue-700 border-blue-200';
                          case 'local_council': return 'bg-green-50 text-green-700 border-green-200';
                          case 'neighborhood': return 'bg-gray-50 text-gray-600 border-gray-200';
                          case 'settlement': return 'bg-amber-50 text-amber-700 border-amber-200';
                          default: return 'bg-gray-50 text-gray-600 border-gray-200';
                        }
                      };

                      return (
                        <button
                          key={city.id}
                          type="button"
                          onClick={() => handleCitySelect(city)}
                          className="w-full px-4 py-3 text-right hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 pointer-events-auto cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 text-right">
                              <div className="font-semibold font-simpler text-slate-900">
                                {city.displayName || city.name}
                              </div>
                              {city.type && (
                                <div className="text-xs text-slate-500 mt-0.5">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${getTypeColor(city.type)}`}>
                                    {getTypeLabel(city.type)}
                                  </span>
                                </div>
                              )}
                            </div>
                            {city.gyms > 0 ? (
                              <span className="text-xs font-semibold font-simpler px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap flex-shrink-0">
                                {city.gyms} גינות כושר
                              </span>
                            ) : (
                              <span className="text-xs font-semibold font-simpler px-2 py-1 rounded-md bg-orange-50 text-orange-600 border border-orange-200 whitespace-nowrap flex-shrink-0">
                                אין גינות במערכת
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : searchQuery.trim() ? (
                  <div className="px-4 py-6 text-center text-slate-500 font-simpler">
                    לא נמצאו ערים התואמות את החיפוש
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center text-slate-400 font-simpler text-sm">
                    התחל להקליד כדי לחפש עיר...
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Map with Dark Style */}
      <div className="flex-1 relative">
        <MapboxMap
          ref={mapRef}
          initialViewState={{
            longitude: 34.7818,
            latitude: 32.0853,
            zoom: 8,
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {/* Radar Pulse Animation */}
          {showRadar && radarCenter && (
            <RadarPulse center={radarCenter} onComplete={() => {}} />
          )}

          {/* City Highlight Overlay (subtle blue tint via semi-transparent circle) */}
          {selectedCityData && selectedCityData.lat && selectedCityData.lng && (
            <MapboxMarker longitude={selectedCityData.lng} latitude={selectedCityData.lat} anchor="center">
              <div className="absolute inset-0 pointer-events-none">
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 15, opacity: [0.1, 0.05, 0.1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="rounded-full bg-[#60A5FA]"
                  style={{ width: '20px', height: '20px', marginLeft: '-10px', marginTop: '-10px' }}
                />
              </div>
            </MapboxMarker>
          )}

          {/* Waze-Style OUTer Markers */}
          {MOCK_OUTERS.map((outer) => (
            <MapboxMarker
              key={outer.id}
              longitude={outer.lng}
              latitude={outer.lat}
              anchor="bottom"
            >
              <div className="relative flex flex-col items-center">
                <motion.div
                  animate={outer.isActive ? {
                    scale: [1, 1.08, 1],
                  } : {}}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    type: "tween" // Use tween for 3-step animation
                  }}
                >
                  <WazeAvatar level={outer.level} speechBubble={outer.speechBubble} characterType={outer.characterType} />
                </motion.div>
              </div>
            </MapboxMarker>
          ))}
        </MapboxMap>
      </div>

      {/* Dynamic Footer Card (Fixed to bottom) - Suspenseful Reveal */}
      {showBottomCard && (
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
          <motion.div
            initial={{ y: 150, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ 
              type: "spring",
              stiffness: 100,
              damping: 15,
              delay: 0
            }}
            className="bg-white border-t border-slate-200 shadow-2xl pointer-events-auto"
          >
          <div className="px-6 pt-6 pb-6 space-y-4">
            {/* Dynamic Preview Card - RTL Layout */}
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-lg">
              {/* Copy - Text aligned to right (RTL) */}
              <div className="flex-1 text-right" dir="rtl">
                {scanning ? (
                  <p className="text-slate-600 font-semibold font-simpler text-base animate-pulse">
                    🔍 סורק את האזור...
                  </p>
                ) : parksCount !== null && parksCount > 0 ? (
                  <p className="text-slate-900 font-bold font-simpler text-base leading-relaxed">
                    מצאנו {parksCount} גינות כושר פעילות באזור שלך! הגיע הזמן למצוא שותפים.
                  </p>
                ) : parksCount === 0 ? (
                  <>
                  <p className="text-slate-900 font-bold font-simpler text-base leading-relaxed">
                    עדיין לא מיפינו גינות ב{selectedCityName || 'האזור שלך'}. היה ה-OUTer הראשון שממפה ותזכה ב-100 🪙!
                  </p>
                    <p className="text-slate-600 font-medium font-simpler text-sm mt-2 italic">
                      💡 הערה: עדיין לא מיפינו את האזור הזה במלואו, אבל אתה עדיין יכול להתחיל את תוכנית האימונים שלך!
                    </p>
                  </>
                ) : selectedCityData && isMapped ? (
                  <>
                    <p className="text-slate-900 font-bold font-simpler text-base leading-relaxed">
                      מצאנו {selectedCityData.gyms} גינות כושר פעילות באזור שלך! יש {selectedCityData.trainers} OUTers שמתאמנים עכשיו.
                    </p>
                    <p className="text-slate-700 font-semibold font-simpler text-sm mt-2">
                      זה הזמן למצוא שותפים לרמה שלך.
                    </p>
                  </>
                ) : (
                  <>
                  <p className="text-slate-900 font-bold font-simpler text-base leading-relaxed">
                    עדיין לא מיפינו גינות באזור שלך. תהיה ה-OUTer הראשון שממפה את השכונה ותרוויח בונוס מטבעות!
                  </p>
                    <p className="text-slate-600 font-medium font-simpler text-sm mt-2 italic">
                      💡 הערה: עדיין לא מיפינו את האזור הזה במלואו, אבל אתה עדיין יכול להתחיל את תוכנית האימונים שלך!
                    </p>
                  </>
                )}
              </div>
              
              {/* User Avatar / Lemur Searching - On RIGHT */}
              {parksCount === 0 ? (
                <div className="w-14 h-14 rounded-full border-2 border-white shadow-lg flex-shrink-0 overflow-hidden">
                  <Image
                    src="/assets/lemur/lemur-searching.png"
                    alt="Lemur Searching"
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to king-lemur.png if lemur-searching.png doesn't exist
                      (e.target as HTMLImageElement).src = '/assets/lemur/king-lemur.png';
                    }}
                  />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#60A5FA] to-[#4A90D9] border-2 border-white shadow-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-lg font-bold font-simpler">1</span>
                </div>
              )}
            </div>

            {/* Confirm Button with Coin Badge - Vibrant Blue */}
            <motion.button
              ref={confirmButtonRef}
              whileHover={isCompleting ? {} : { scale: 1.02 }}
              whileTap={isCompleting ? {} : { scale: 0.98 }}
              onClick={handleConfirm}
              disabled={isCompleting}
              className={`w-full font-bold py-4 rounded-2xl text-lg shadow-xl transition-all relative overflow-hidden flex items-center justify-center gap-2 ${
                isCompleting 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-[#60A5FA] hover:bg-[#4a90d9] text-white shadow-[#60A5FA]/30'
              }`}
            >
              {isCompleting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                  />
                  <span className="font-bold font-simpler text-lg">שומר...</span>
                </>
              ) : (
              <span className="font-bold font-simpler text-lg">אישור</span>
              )}
              {(() => {
                const coinAmount = (parksCount === 0 || !parksCount) ? 100 : 15;
                const rewardId = (parksCount === 0 || !parksCount) ? 'CITY_MAPPING_REWARD' : 'CITY_SELECTION_REWARD';
                const hasClaimed = hasClaimedReward(rewardId);
                
                if (!hasClaimed) {
                  return (
                    <motion.div
                      ref={coinBadgeRef}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ 
                        scale: 1,
                        opacity: 1
                      }}
                      transition={{ 
                        delay: 0.2,
                        type: "spring",
                        stiffness: 260,
                        damping: 20
                      }}
                      className="flex items-center gap-1 bg-yellow-200 text-yellow-800 rounded-full px-2.5 py-1 shadow-md"
                    >
                      <motion.div
                        animate={{ scale: [1, 1.1, 1], opacity: [1, 0.8, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }}
                      >
                        <Coins size={14} className="text-yellow-800" strokeWidth={2.5} />
                      </motion.div>
                      <span className="text-xs font-bold font-simpler">+{coinAmount}</span>
                    </motion.div>
                  );
                }
                return <span className="text-sm font-medium">{coinAmount} 🪙</span>;
              })()}
            </motion.button>
          </div>
        </motion.div>
        </div>
      )}
    </div>
  );
}

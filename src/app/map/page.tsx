"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserStore } from '@/features/user/store/useUserStore';
import { useMapStore } from '@/features/map/store/useMapStore';
import { RouteService } from '@/features/map/services/route.service';
import { rankRoutes, RankedRoute } from '@/features/map/services/route-ranking.service';
import { MOCK_PARKS } from '@/features/map/data/mock-locations';
import { MapPark, Route, RouteSegment } from '@/features/map/types/map-objects.type';

// ייבוא הקומפוננטות
import AppMap from '@/features/map/components/AppMap';
import MapTabs from '@/features/map/components/MapTabs';
import RouteTimelineOverlay from '@/features/map/components/RouteTimelineOverlay';
import { MapRouteCarousel } from '@/features/map/components/MapRouteCarousel';
import BottomNavigation from '@/components/BottomNavigation';

const BRAND_COLOR = '#00E5FF';
const GRAY_COLOR = '#6B7280';
const DEFAULT_LOCATION = { lat: 32.0853, lng: 34.7818 };

type TabMode = 'free' | 'plan' | 'my';

export default function MapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useUserStore();
  const { selectedPark, triggerUserLocation, isFollowing, setUserLocation } = useMapStore();
  
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [rankedRoutes, setRankedRoutes] = useState<RankedRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RankedRoute | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>('plan');
  const [focusedRoute, setFocusedRoute] = useState<RankedRoute | null>(null);

  // טעינת מיקום
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(location);
        setUserLocation(location);
      },
      (err) => {
        console.log("Error:", err);
        setCoords(DEFAULT_LOCATION);
        setUserLocation(DEFAULT_LOCATION);
      }
    );
  }, [setUserLocation]);

  // יצירת מסלולים חכמים
  useEffect(() => {
    if (!coords || !profile) return;
    if (routes.length > 0) return; // כבר נוצרו

    const generateRoutes = async () => {
      const targetParks = MOCK_PARKS.slice(0, 4) as MapPark[];
      
      const promises = targetParks.map(async (park) => {
        const segment = park.segmentEndpoints ? { start: park.segmentEndpoints.start, end: park.segmentEndpoints.end } : undefined;
        const routeData = await RouteService.getSmartRoute(coords, park.location, segment);
        if (!routeData) return null;

        const totalDistanceKm = parseFloat((routeData.distance / 1000).toFixed(1));
        const totalRunDuration = Math.round(routeData.duration / 60);
        const workoutDuration = 15;

        const legDistance = (totalDistanceKm / 2).toFixed(1);
        const legTime = Math.round(totalRunDuration / 2);

        const equipmentList = park.devices && park.devices.length > 0
          ? park.devices.slice(0, 2).map(d => d.name).join(', ')
          : 'תרגילי משקל גוף';

        const generatedSegments: RouteSegment[] = [
          {
            type: 'run',
            title: `ריצה ל${park.name}`,
            subTitle: 'חימום וריצה בקצב נוח',
            distance: `${legDistance} ק״מ`,
            duration: `${legTime} דק׳`
          },
          {
            type: 'workout',
            title: `אימון ב${park.name}`,
            subTitle: `כולל: ${equipmentList}`,
            duration: `${workoutDuration} דק׳`,
            exercises: park.devices?.slice(0, 3).map(d => ({
              name: d.name,
              reps: '3x10',
            })) || []
          },
          {
            type: 'run',
            title: 'ריצה בחזרה לנקודת ההתחלה',
            distance: `${legDistance} ק״מ`,
            duration: `${legTime} דק׳`
          },
          {
            type: 'finish',
            title: 'סיום וסיכום',
            subTitle: 'מתיחות ושחרור'
          }
        ];

        let difficulty: 'easy' | 'medium' | 'hard' = 'easy';
        if (totalDistanceKm > 3) difficulty = 'medium';
        if (totalDistanceKm > 6) difficulty = 'hard';

        return {
          id: park.id,
          name: `סיבוב ל${park.name}`,
          description: park.description || `מסלול המשלב ריצה ואימון ב${park.name}`,
          distance: totalDistanceKm,
          duration: totalRunDuration + workoutDuration,
          score: Math.round(totalDistanceKm * 50 + (park.adminQualityScore || 0) * 10),
          type: 'running' as const,
          activityType: 'running' as const,
          difficulty: difficulty,
          path: routeData.coordinates as [number, number][],
          segments: generatedSegments
        } as Route;
      });

      const results = await Promise.all(promises);
      const validRoutes = results.filter((r): r is Route => r !== null);
      
      // הוספת מסלול אופניים מומלץ (Curator Mode)
      const cyclingRoute: Route = {
        id: 'cycling-tel-aviv-loop',
        name: 'Tel Aviv Cycling Loop',
        description: 'מסלול אופניים מומלץ סביב תל אביב - נוף מדהים ודרך חלקה',
        distance: 12.5,
        duration: 45, // 45 דקות
        score: 950,
        type: 'cycling',
        activityType: 'cycling',
        difficulty: 'medium',
        adminRating: 9,
        isPromoted: true,
        path: [
          [34.7818, 32.0853], // Start point (Tel Aviv center)
          [34.7900, 32.0900],
          [34.8000, 32.0950],
          [34.8100, 32.1000],
          [34.8200, 32.1050],
          [34.8300, 32.1100],
          [34.8400, 32.1150],
          [34.8500, 32.1200],
          [34.8600, 32.1250],
          [34.8700, 32.1300],
          [34.8600, 32.1250],
          [34.8500, 32.1200],
          [34.8400, 32.1150],
          [34.8300, 32.1100],
          [34.8200, 32.1050],
          [34.8100, 32.1000],
          [34.8000, 32.0950],
          [34.7900, 32.0900],
          [34.7818, 32.0853] // Back to start
        ],
        segments: [
          {
            type: 'run', // For display purposes, cycling uses 'run' type in segments
            title: 'התחלה - כיכר רבין',
            subTitle: 'נקודת התחלה נוחה עם חניה',
            distance: '0 ק״מ',
            duration: '0 דק׳'
          },
          {
            type: 'run',
            title: 'רכיבה על הטיילת',
            subTitle: 'נוף ים מדהים ודרך חלקה',
            distance: '6 ק״מ',
            duration: '20 דק׳'
          },
          {
            type: 'run',
            title: 'סיבוב בפארק הירקון',
            subTitle: 'שבילי אופניים ייעודיים',
            distance: '4 ק״מ',
            duration: '15 דק׳'
          },
          {
            type: 'run',
            title: 'חזרה לנקודת ההתחלה',
            subTitle: 'דרך עירונית נוחה',
            distance: '2.5 ק״מ',
            duration: '10 דק׳'
          },
          {
            type: 'finish',
            title: 'סיום',
            subTitle: 'סיכום ומתיחות'
          }
        ]
      };
      
      setRoutes([...validRoutes, cyclingRoute]);
    };

    generateRoutes();
  }, [coords, profile, routes.length]);

  // דירוג מסלולים לפי פרופיל המשתמש
  useEffect(() => {
    if (!profile || routes.length === 0) return;

    // קבלת פרמטרים מ-URL (אם יש)
    const targetDuration = searchParams.get('duration') 
      ? parseInt(searchParams.get('duration')!) 
      : undefined;

    const ranked = rankRoutes(routes, profile, targetDuration);
    setRankedRoutes(ranked);
  }, [routes, profile, searchParams]);

  // Force Auto-Focus: מרכוז אוטומטי על המסלולים כשהם נטענים
  useEffect(() => {
    if (rankedRoutes.length > 0) {
      // חישוב bounding box של המסלול הראשון
      const firstRoute = rankedRoutes[0];
      if (firstRoute?.path && firstRoute.path.length > 0) {
        const bounds = firstRoute.path.reduce((acc, coord) => {
          return {
            minLng: Math.min(acc.minLng, coord[0]),
            minLat: Math.min(acc.minLat, coord[1]),
            maxLng: Math.max(acc.maxLng, coord[0]),
            maxLat: Math.max(acc.maxLat, coord[1]),
          };
        }, {
          minLng: Infinity,
          minLat: Infinity,
          maxLng: -Infinity,
          maxLat: -Infinity,
        });

        if (bounds.minLng !== Infinity) {
          // נשלח event ש-AppMap יקשיב לו
          // במקום זאת, נשתמש ב-focusRoute כדי לכפות את התצוגה
          setFocusedRoute(firstRoute);
          
          console.log('MapPage: Auto-focusing on first route:', firstRoute.name);
          console.log('MapPage: Route bounds:', bounds);
          console.log('MapPage: Route path length:', firstRoute.path.length);
        }
      }
    }
  }, [rankedRoutes]);

  const handleLocationClick = () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission().catch(console.error);
    }
    triggerUserLocation();
  };

  const handleRouteSelect = (route: Route) => {
    const ranked = rankedRoutes.find(r => r.id === route.id);
    if (ranked) {
      setSelectedRoute(ranked);
    }
  };

  const handleRouteFocus = (route: Route) => {
    const ranked = rankedRoutes.find(r => r.id === route.id);
    if (ranked) {
      setFocusedRoute(ranked);
      // עדכון המפה להתמקד במסלול (זה יטופל ב-AppMap דרך lineCoordinates)
    }
  };

  const handleSegmentClick = (segment: RouteSegment, index: number) => {
    if (selectedRoute && segment.location) {
      // הזזת המפה למיקום התחנה
      // זה יטופל ב-AppMap דרך callback
    }
  };

  const handleStartWorkout = () => {
    if (selectedRoute) {
      // שמירת המסלול ב-Store והתחלת אימון
      router.push('/run');
    }
  };

  // FitBounds לכל המסלולים (מצב A)
  const allRoutesBounds = useMemo(() => {
    if (rankedRoutes.length === 0) return null;
    
    const allCoords = rankedRoutes.flatMap(r => r.path);
    if (allCoords.length === 0) return null;

    const bounds = allCoords.reduce((acc, coord) => {
      return {
        minLng: Math.min(acc.minLng, coord[0]),
        minLat: Math.min(acc.minLat, coord[1]),
        maxLng: Math.max(acc.maxLng, coord[0]),
        maxLat: Math.max(acc.maxLat, coord[1]),
      };
    }, {
      minLng: Infinity,
      minLat: Infinity,
      maxLng: -Infinity,
      maxLat: -Infinity,
    });

    return bounds;
  }, [rankedRoutes]);

  return (
    <main className="relative h-[100dvh] w-full bg-[#f3f4f6] overflow-hidden font-sans">
      
      {/* Layer 0: Live Map - z-index 0 */}
      <div className="absolute inset-0 z-0">
        <AppMap 
          routes={rankedRoutes}
          showCarousel={false}
          onRouteSelect={handleRouteSelect}
          onRouteFocus={handleRouteFocus}
          focusedRoute={focusedRoute}
          selectedRoute={selectedRoute}
        />
      </div>

      {/* Layer 1: UI Overlays */}
      
      {/* Top Bar - Search & Tabs */}
      <div className="absolute top-0 left-0 right-0 z-10 pt-[max(1.5rem,env(safe-area-inset-top))] px-4 pointer-events-none">
        <div className="max-w-md mx-auto w-full pointer-events-auto flex flex-col gap-3">
          {/* Search Bar */}
          <div className="flex items-center gap-3">
            <button className="h-12 w-12 rounded-2xl bg-white shadow-md flex items-center justify-center border border-gray-200 shrink-0 text-gray-700 active:scale-95 transition-transform">
              <span className="material-icons-round text-xl">tune</span>
            </button>
            <div className="flex-1 bg-white shadow-md rounded-2xl h-12 flex items-center px-4 border border-gray-200 text-gray-700">
              <span className="material-icons-round text-gray-400 text-lg ms-2">search</span>
              <span className="text-sm font-bold text-gray-700 text-end flex-1">חיפוש...</span>
            </div>
          </div>
          
          {/* Tabs */}
          <MapTabs activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </div>

      {/* Location Button - Adjusted for bottom nav */}
      <div className={`absolute right-4 z-30 pointer-events-auto transition-all duration-500 ease-in-out ${selectedRoute ? 'bottom-[28rem]' : 'bottom-[22rem]'}`}>
        <button 
          onClick={handleLocationClick} 
          className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 active:scale-90 bg-white"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'rotate(0deg)', transition: 'all 0.3s ease' }}>
            <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" fill={isFollowing ? BRAND_COLOR : "white"} stroke={isFollowing ? "none" : GRAY_COLOR} strokeWidth={isFollowing ? "0" : "2"} strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Bottom Layer: Carousel or Timeline - z-index 50 with visible background */}
      {/* Add padding bottom to account for navigation bar (68px) */}
      <div className="absolute bottom-0 left-0 right-0 z-50 pb-20 pointer-events-none">
        {selectedRoute ? (
          // מצב B: Timeline Overlay
          <div className="pointer-events-auto">
            <RouteTimelineOverlay
              route={selectedRoute}
              onClose={() => setSelectedRoute(null)}
              onStart={handleStartWorkout}
              onSegmentClick={handleSegmentClick}
            />
          </div>
        ) : (
          // מצב A: Routes Carousel with gradient background
          rankedRoutes.length > 0 && (
            <div className="pointer-events-auto bg-gradient-to-t from-white via-white/95 to-transparent pt-4">
              <MapRouteCarousel
                routes={rankedRoutes}
                onRouteSelect={handleRouteSelect}
                onRouteFocus={handleRouteFocus}
              />
            </div>
          )
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <BottomNavigation />
    </main>
  );
}

'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { MapPin, Dumbbell, Route as RouteIcon, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { haversineKm } from '@/features/parks/core/services/geoUtils';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import type { Park } from '@/features/parks/core/types/park.types';
import type { Route } from '@/features/parks/core/types/route.types';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';

const PARK_FALLBACK_IMAGE = '/assets/lemur/smart-lemur.png';

const MAX_SUGGESTIONS = 8;
const RADIUS_KM = 10;

const CITY_FALLBACK_COORDS: Record<string, { lat: number; lng: number }> = {
  'שדרות': { lat: 31.5250, lng: 34.5995 },
  'תל אביב': { lat: 32.0853, lng: 34.7818 },
  'ירושלים': { lat: 31.7683, lng: 35.2137 },
  'חיפה': { lat: 32.7940, lng: 34.9896 },
  'באר שבע': { lat: 31.2530, lng: 34.7915 },
  'אשדוד': { lat: 31.8040, lng: 34.6553 },
  'הרצליה': { lat: 32.1629, lng: 34.8446 },
  'רמת גן': { lat: 32.0680, lng: 34.8240 },
  'נתניה': { lat: 32.3215, lng: 34.8532 },
  'ראשון לציון': { lat: 31.9730, lng: 34.7925 },
};
const DEFAULT_FALLBACK = { lat: 31.5250, lng: 34.5995 };

type WorkoutType = 'strength' | 'running';

interface WorkoutLocationSuggestionsProps {
  workoutType: WorkoutType;
}

function formatDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} מ'`;
  return `${km.toFixed(1)} ק"מ`;
}

export default function WorkoutLocationSuggestions({ workoutType }: WorkoutLocationSuggestionsProps) {
  const router = useRouter();
  const setDeepLink = useMapStore((s) => s.setDeepLink);
  const openGlobalParkSheet = useMapStore((s) => s.openGlobalParkSheet);
  const openGlobalRouteSheet = useMapStore((s) => s.openGlobalRouteSheet);
  const profile = useUserStore((s) => s.profile);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [parks, setParks] = useState<Park[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyFallback = () => {
      const city = (profile as any)?.core?.city ?? (profile as any)?.city;
      const fallback = (city && CITY_FALLBACK_COORDS[city]) ? CITY_FALLBACK_COORDS[city] : DEFAULT_FALLBACK;
      setUserPos(fallback);
      setUsingFallback(true);
    };

    if (!('geolocation' in navigator)) {
      applyFallback();
      return;
    }

    const permissionsAPI = navigator.permissions;
    if (permissionsAPI) {
      permissionsAPI.query({ name: 'geolocation' }).then((status) => {
        if (status.state === 'granted') {
          navigator.geolocation.getCurrentPosition(
            (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => applyFallback(),
            { maximumAge: 60_000, timeout: 8000 },
          );
        } else {
          applyFallback();
        }
      }).catch(() => applyFallback());
    } else {
      applyFallback();
    }
  }, [profile]);

  useEffect(() => {
    if (!userPos) return;
    let cancelled = false;

    async function load() {
      try {
        if (workoutType === 'strength') {
          const all = await fetchRealParks();
          if (!cancelled) setParks(all);
        } else {
          const snap = await getDocs(
            query(collection(db, 'routes'), where('published', '==', true)),
          );
          const arr: Route[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Route));
          if (!cancelled) setRoutes(arr);
        }
      } catch (e) {
        console.warn('[WorkoutLocationSuggestions] fetch error:', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [userPos, workoutType]);

  const suggestions = useMemo(() => {
    if (!userPos) return [];

    if (workoutType === 'strength') {
      return parks
        .filter((p) => p.location?.lat != null && p.location?.lng != null)
        .map((p) => ({
          id: p.id,
          name: p.name,
          distance: haversineKm(userPos.lat, userPos.lng, p.location.lat, p.location.lng),
          type: 'park' as const,
          subtitle: p.facilityType === 'gym_park' ? 'גינת כושר' : p.facilityType === 'court' ? 'מגרש' : 'מתקן',
          imageUrl: p.images?.[0] || p.image || p.imageUrl || null,
        }))
        .filter((s) => s.distance <= RADIUS_KM)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, MAX_SUGGESTIONS);
    }

    return routes
      .filter((r) => r.path?.length > 0)
      .map((r) => {
        const start = r.path[0];
        return {
          id: r.id,
          name: r.name,
          distance: haversineKm(userPos.lat, userPos.lng, start[1], start[0]),
          type: 'route' as const,
          subtitle: r.distance ? `${r.distance.toFixed(1)} ק"מ` : 'מסלול',
          imageUrl: null as string | null,
        };
      })
      .filter((s) => s.distance <= RADIUS_KM)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_SUGGESTIONS);
  }, [userPos, parks, routes, workoutType]);

  // Avoid the classic "widget pops in" jump: render a skeleton while GPS
  // resolves and parks are fetched. Empty-state still returns null because
  // by then the user has likely already scrolled past.
  const isResolvingLocation = !userPos;
  const isFetchingData = userPos && !loaded;

  if (isResolvingLocation || isFetchingData) {
    return <WorkoutLocationSuggestionsSkeleton workoutType={workoutType} />;
  }
  if (loaded && suggestions.length === 0) return null;

  const handleTap = (item: (typeof suggestions)[0]) => {
    if (item.type === 'park') {
      const park = parks.find((p) => p.id === item.id);
      if (park) {
        openGlobalParkSheet(park);
        return;
      }
    } else {
      const route = routes.find((r) => r.id === item.id);
      if (route) {
        openGlobalRouteSheet(route);
        return;
      }
    }
    setDeepLink({
      type: item.type === 'park' ? 'park' : 'route',
      targetId: item.id,
      source: 'home_workout',
    });
    router.push('/map');
  };

  const isStrength = workoutType === 'strength';
  const title = isStrength ? 'גינות כושר קרובות' : 'מסלולים קרובים';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      dir="rtl"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[15px] font-bold text-gray-800 flex items-center gap-1.5">
          {isStrength ? <Dumbbell size={15} className="text-cyan-500" /> : <RouteIcon size={15} className="text-cyan-500" />}
          {title}
        </h3>
        <button
          onClick={() => router.push('/map')}
          className="flex items-center gap-0.5 text-[11px] font-bold text-cyan-600 active:opacity-70 transition-opacity"
        >
          הכל
          <ChevronLeft size={14} />
        </button>
      </div>

      <div className="flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
        <AnimatePresence>
          {suggestions.map((item, i) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => handleTap(item)}
              className="flex-shrink-0 w-[148px] bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm active:scale-[0.97] transition-transform text-start"
            >
              {/* Park/Route cover image — `aspect-video` (16:9) replaces the
                  hardcoded 88px so the slot scales with card width on
                  larger viewports without re-laying out. */}
              <div className="relative w-full aspect-video bg-gradient-to-br from-cyan-50 to-cyan-100">
                <Image
                  src={item.imageUrl || PARK_FALLBACK_IMAGE}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="148px"
                  unoptimized={!!item.imageUrl}
                  onError={(e) => { (e.target as HTMLImageElement).src = PARK_FALLBACK_IMAGE; }}
                />
                {/* Distance badge */}
                <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white bg-black/50 backdrop-blur-sm tabular-nums">
                  {formatDist(item.distance)}
                </div>
              </div>
              {/* Details */}
              <div className="px-2.5 py-2">
                <p className="text-xs font-bold text-gray-800 truncate leading-tight">{item.name}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{item.subtitle}</p>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/**
 * WorkoutLocationSuggestionsSkeleton
 * ---------------------------------
 * Renders a header + 4 placeholder cards with the EXACT same dimensions as
 * the loaded carousel — same `w-[148px]` card, same `aspect-video` image
 * slot, same two text lines below. Reserves the vertical space the real
 * widget will occupy, so the cards below stop "jumping up" once GPS and
 * Firestore resolve.
 *
 * Uses `aspect-video` (not a fixed pixel height) per the responsive task.
 */
function WorkoutLocationSuggestionsSkeleton({ workoutType }: { workoutType: WorkoutType }) {
  const isStrength = workoutType === 'strength';
  const title = isStrength ? 'גינות כושר קרובות' : 'מסלולים קרובים';

  return (
    <div dir="rtl" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[15px] font-bold text-gray-800 flex items-center gap-1.5">
          {isStrength ? (
            <Dumbbell size={15} className="text-cyan-500" />
          ) : (
            <RouteIcon size={15} className="text-cyan-500" />
          )}
          {title}
        </h3>
        {/* Right-side "הכל" link omitted in skeleton — it's interactive. */}
      </div>

      <div className="flex gap-2.5 overflow-x-hidden -mx-4 px-4 pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[148px] bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm"
          >
            {/* Image slot — same `aspect-video` so the skeleton card has
                the exact final card height. */}
            <div className="relative w-full aspect-video bg-gradient-to-br from-slate-100 to-slate-200 animate-pulse" />
            <div className="px-2.5 py-2 space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-slate-200 animate-pulse" />
              <div className="h-2 w-1/2 rounded bg-slate-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

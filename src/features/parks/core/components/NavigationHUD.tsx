'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  CornerUpRight,
  CornerUpLeft,
  Navigation,
  Circle,
} from 'lucide-react';

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

interface NavigationHUDProps {
  routePath: [number, number][];
  currentLocation: { lat: number; lng: number };
  userBearing: number;
}

interface TurnInstruction {
  icon: React.ElementType;
  label: string;
  distanceMeters: number;
  streetName: string | null;
  turnCoord: [number, number];
  isRoundabout: boolean;
  roundaboutExit?: number;
}

// ────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────

const BEARING_THRESHOLD = 30;
const ROUNDABOUT_MIN_POINTS = 3;
const ROUNDABOUT_CUMULATIVE_DEG = 120;
const ROUNDABOUT_MAX_RADIUS_M = 40;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// ────────────────────────────────────────────────────────
// Geo helpers
// ────────────────────────────────────────────────────────

function bearingBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const dLng = (lng2 - lng1) * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
            Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function angleDiff(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

// ────────────────────────────────────────────────────────
// Turn icon mapping
// ────────────────────────────────────────────────────────

function getTurnIcon(diff: number): { icon: React.ElementType; label: string } {
  const normalised = ((diff + 540) % 360) - 180;
  if (Math.abs(normalised) < 20) return { icon: ArrowUp, label: 'ישר' };
  if (normalised > 0 && normalised < 70) return { icon: ArrowUpLeft, label: 'ימינה קל' };
  if (normalised < 0 && normalised > -70) return { icon: ArrowUpRight, label: 'שמאלה קל' };
  if (normalised >= 70) return { icon: CornerUpLeft, label: 'פנה ימינה' };
  if (normalised <= -70) return { icon: CornerUpRight, label: 'פנה שמאלה' };
  return { icon: ArrowUp, label: 'ישר' };
}

// ────────────────────────────────────────────────────────
// Reverse geocoding with LRU cache
// ────────────────────────────────────────────────────────

const GEOCODE_CACHE_SIZE = 60;
const GEOCODE_PRECISION = 4; // ~11m grid — good enough for street-level

const geocodeCache = new Map<string, string | null>();

function cacheKey(lng: number, lat: number): string {
  return `${lng.toFixed(GEOCODE_PRECISION)},${lat.toFixed(GEOCODE_PRECISION)}`;
}

async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  const key = cacheKey(lng, lat);
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  if (!MAPBOX_TOKEN) return null;

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address&language=he&limit=1&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const name: string | null = data.features?.[0]?.text ?? null;

    if (geocodeCache.size >= GEOCODE_CACHE_SIZE) {
      const firstKey = geocodeCache.keys().next().value;
      if (firstKey !== undefined) geocodeCache.delete(firstKey);
    }
    geocodeCache.set(key, name);
    return name;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────
// Roundabout detection
// ────────────────────────────────────────────────────────

interface RoundaboutResult {
  detected: boolean;
  exitNumber: number;
  endIdx: number;
}

function detectRoundabout(path: [number, number][], startIdx: number): RoundaboutResult {
  const none: RoundaboutResult = { detected: false, exitNumber: 0, endIdx: startIdx };
  if (startIdx + ROUNDABOUT_MIN_POINTS >= path.length) return none;

  const centerLat = path[startIdx][1];
  const centerLng = path[startIdx][0];
  let cumulativeBearing = 0;
  let exitCount = 0;
  let prevBearing = bearingBetween(
    path[startIdx][1], path[startIdx][0],
    path[startIdx + 1][1], path[startIdx + 1][0],
  );

  for (let i = startIdx + 1; i < Math.min(startIdx + 20, path.length - 1); i++) {
    const dist = haversineM(centerLat, centerLng, path[i][1], path[i][0]);
    if (dist > ROUNDABOUT_MAX_RADIUS_M) break;

    const seg = bearingBetween(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
    const diff = angleDiff(prevBearing, seg);
    cumulativeBearing += diff;
    prevBearing = seg;

    if (i - startIdx >= ROUNDABOUT_MIN_POINTS - 1 && Math.abs(cumulativeBearing) >= ROUNDABOUT_CUMULATIVE_DEG) {
      exitCount++;
      return { detected: true, exitNumber: Math.max(1, exitCount), endIdx: i };
    }

    if (Math.abs(diff) > 10) exitCount++;
  }

  return none;
}

// ────────────────────────────────────────────────────────
// Path helpers
// ────────────────────────────────────────────────────────

function findNearestIndex(path: [number, number][], pos: { lat: number; lng: number }): number {
  let minD = Infinity;
  let idx = 0;
  for (let i = 0; i < path.length; i++) {
    const d = Math.abs(path[i][1] - pos.lat) + Math.abs(path[i][0] - pos.lng);
    if (d < minD) { minD = d; idx = i; }
  }
  return idx;
}

function formatDistance(meters: number): string {
  if (meters < 100) return `${Math.round(meters)} מ׳`;
  if (meters < 1000) return `${Math.round(meters / 10) * 10} מ׳`;
  return `${(meters / 1000).toFixed(1)} ק"מ`;
}

// ────────────────────────────────────────────────────────
// Core turn detection
// ────────────────────────────────────────────────────────

function getNextTurn(
  path: [number, number][],
  nearestIdx: number,
  userPos: { lat: number; lng: number },
): TurnInstruction | null {
  if (nearestIdx >= path.length - 2) return null;

  let currentBearing = bearingBetween(
    path[nearestIdx][1], path[nearestIdx][0],
    path[nearestIdx + 1][1], path[nearestIdx + 1][0],
  );

  let distToTurn = haversineM(userPos.lat, userPos.lng, path[nearestIdx + 1][1], path[nearestIdx + 1][0]);

  for (let i = nearestIdx + 1; i < path.length - 1; i++) {
    const segBearing = bearingBetween(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
    const diff = angleDiff(currentBearing, segBearing);

    if (Math.abs(diff) > BEARING_THRESHOLD) {
      const roundabout = detectRoundabout(path, i);

      if (roundabout.detected) {
        return {
          icon: Circle,
          label: `בכיכר, צא ביציאה ה-${roundabout.exitNumber}`,
          distanceMeters: Math.max(0, distToTurn),
          streetName: null,
          turnCoord: path[Math.min(roundabout.endIdx + 1, path.length - 1)],
          isRoundabout: true,
          roundaboutExit: roundabout.exitNumber,
        };
      }

      const { icon, label } = getTurnIcon(diff);
      const turnPoint = path[Math.min(i + 1, path.length - 1)];
      return {
        icon,
        label,
        distanceMeters: Math.max(0, distToTurn),
        streetName: null,
        turnCoord: turnPoint,
        isRoundabout: false,
      };
    }
    currentBearing = segBearing;
    distToTurn += haversineM(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
  }

  let totalRemaining = haversineM(userPos.lat, userPos.lng, path[nearestIdx][1], path[nearestIdx][0]);
  for (let i = nearestIdx; i < path.length - 1; i++) {
    totalRemaining += haversineM(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
  }

  return {
    icon: Navigation,
    label: 'ישר קדימה',
    distanceMeters: Math.max(0, totalRemaining),
    streetName: null,
    turnCoord: path[path.length - 1],
    isRoundabout: false,
  };
}

// ────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────

export default function NavigationHUD({ routePath, currentLocation, userBearing }: NavigationHUDProps) {
  const lat = currentLocation?.lat ?? 0;
  const lng = currentLocation?.lng ?? 0;

  const posRef = useRef(currentLocation);
  posRef.current = currentLocation;

  const [instruction, setInstruction] = useState<TurnInstruction | null>(null);

  useEffect(() => {
    const compute = () => {
      const pos = posRef.current;
      if (!routePath || routePath.length < 2 || !pos) { setInstruction(null); return; }
      const nearestIdx = findNearestIndex(routePath, pos);
      setInstruction(getNextTurn(routePath, nearestIdx, pos));
    };
    compute();
    const id = setInterval(compute, 100);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePath, lat, lng]);

  // ── Reverse geocoding for the turn point ──
  const [streetName, setStreetName] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const lastGeoKey = useRef('');

  const fetchStreetName = useCallback(async (coord: [number, number]) => {
    const key = cacheKey(coord[0], coord[1]);
    if (key === lastGeoKey.current) return;
    lastGeoKey.current = key;

    const cached = geocodeCache.get(key);
    if (cached !== undefined) {
      setStreetName(cached);
      setGeoLoading(false);
      return;
    }

    setGeoLoading(true);
    const name = await reverseGeocode(coord[0], coord[1]);
    setStreetName(name);
    setGeoLoading(false);
  }, []);

  useEffect(() => {
    if (!instruction) { setStreetName(null); setGeoLoading(false); return; }
    fetchStreetName(instruction.turnCoord);
  }, [instruction?.turnCoord?.[0], instruction?.turnCoord?.[1], fetchStreetName]);

  if (!instruction) return null;

  const IconComp = instruction.icon;

  const displayLabel = (() => {
    if (instruction.isRoundabout) return instruction.label;
    if (streetName) return `${instruction.label} ל${streetName}`;
    return instruction.label;
  })();

  const subtitleText = (() => {
    if (instruction.isRoundabout) return 'כיכר';
    if (streetName) return streetName;
    if (geoLoading) return 'מחשב מסלול...';
    return '';
  })();

  return (
    <div
      className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 right-4 z-[60] pointer-events-none"
      dir="rtl"
    >
      <div
        className="mx-auto max-w-sm rounded-2xl px-4 py-3 flex items-center gap-3 pointer-events-auto"
        style={{
          background: 'rgba(5, 12, 24, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${instruction.isRoundabout ? 'rgba(255, 170, 0, 0.35)' : 'rgba(0, 229, 255, 0.25)'}`,
          boxShadow: instruction.isRoundabout
            ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 170, 0, 0.15)'
            : '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 229, 255, 0.1)',
        }}
      >
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: instruction.isRoundabout
              ? 'linear-gradient(135deg, #FF8C00, #FFAA00)'
              : 'linear-gradient(135deg, #00BAF7, #00E5FF)',
            boxShadow: instruction.isRoundabout
              ? '0 4px 12px rgba(255, 140, 0, 0.4)'
              : '0 4px 12px rgba(0, 186, 247, 0.4)',
          }}
        >
          <IconComp size={24} className="text-white" strokeWidth={2.5} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-black leading-tight truncate">
            {displayLabel}
          </p>
          <p
            className="text-[11px] font-bold mt-0.5 truncate"
            style={{ color: instruction.isRoundabout ? '#FFCC66' : '#67E8F9' }}
          >
            {subtitleText}
          </p>
        </div>

        {/* Distance */}
        <div className="flex-shrink-0 text-end">
          <p
            className="text-lg font-black leading-none"
            style={{ color: instruction.isRoundabout ? '#FFAA00' : '#00E5FF' }}
          >
            {formatDistance(instruction.distanceMeters)}
          </p>
        </div>
      </div>
    </div>
  );
}

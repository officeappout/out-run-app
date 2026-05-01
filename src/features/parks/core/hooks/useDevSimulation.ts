'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Route, type ActivityType } from '../types/route.types';
import { haversineMeters, interpolatePath } from '../services/geoUtils';
import {
  randomMockPace,
  randomProgramLevel,
  randomProgramName,
  randomGender,
  randomTargetDistanceKm,
  randomCurrentStreak,
} from '@/features/safecity/services/presence.service';

const WALK_SPEED_MS = 1.667; // 6 km/h in m/s
const TICK_MS = 100;
const PARTNER_TICK_MS = 500;
const MAX_MOCK_PARTNERS = 12;

const PARTNER_NAMES = [
  'נועה', 'איתי', 'מאיה', 'עידו', 'שירה', 'אדם',
  'ליאור', 'דנה', 'אריאל', 'יעל', 'רון', 'טל',
];
const PARTNER_ACTIVITIES: ActivityType[] = ['running', 'walking', 'cycling', 'running', 'running', 'walking'];

export interface MockPartner {
  id: string;
  name: string;
  activityType: ActivityType;
  speedMultiplier: number;
  routeId: string;
  /** Current position on route */
  lat: number;
  lng: number;
  /** Color halo */
  color: string;
  /** Internal sim state — not exposed to consumers */
  _initialOffset: number;
}

export interface CityPreset {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface DevSimulationState {
  isMockEnabled: boolean;
  toggleMock: () => void;
  mockLocation: { lat: number; lng: number } | null;
  setMockLocation: (pos: { lat: number; lng: number }) => void;
  effectiveLocation: (realPos: { lat: number; lng: number } | null) => { lat: number; lng: number } | null;
  selectedCity: string | null;
  setCityPreset: (city: CityPreset) => void;
  isSimulating: boolean;
  simulationProgress: number;
  simulatedBearing: number;
  simulatedSpeedKmH: number;
  startSimulation: (route: Route, speedMultiplier?: number) => void;
  stopSimulation: () => void;
  simulatedPath: [number, number][];
  mockPartners: MockPartner[];
  spawnMockPartners: (route: Route, count?: number) => void;
  clearMockPartners: () => void;
}

export function useDevSimulation(): DevSimulationState {
  const [isMockEnabled, setIsMockEnabled] = useState(false);
  const [mockLocation, setMockLocationRaw] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [simulatedPath, setSimulatedPath] = useState<[number, number][]>([]);
  const [simulatedBearing, setSimulatedBearing] = useState(0);
  const [simulatedSpeedKmH, setSimulatedSpeedKmH] = useState(6);
  const prevSimPos = useRef<{ lat: number; lng: number } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simStateRef = useRef<{
    path: [number, number][];
    segmentDistances: number[];
    totalDistance: number;
    distanceTravelled: number;
    speedMultiplier: number;
  } | null>(null);

  const toggleMock = useCallback(() => {
    setIsMockEnabled(prev => {
      if (prev) {
        setMockLocationRaw(null);
        setSelectedCity(null);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setIsSimulating(false);
        setSimulationProgress(0);
        setSimulatedPath([]);
        simStateRef.current = null;
      }
      return !prev;
    });
  }, []);

  const setMockLocation = useCallback((pos: { lat: number; lng: number }) => {
    setMockLocationRaw(pos);
    if (!isMockEnabled) setIsMockEnabled(true);
  }, [isMockEnabled]);

  const setCityPreset = useCallback((city: CityPreset) => {
    setMockLocationRaw({ lat: city.lat, lng: city.lng });
    setIsMockEnabled(true);
    setSelectedCity(city.name);
  }, []);

  const effectiveLocation = useCallback(
    (realPos: { lat: number; lng: number } | null) => {
      if (isMockEnabled && mockLocation) return mockLocation;
      return realPos;
    },
    [isMockEnabled, mockLocation],
  );

  const stopSimulation = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsSimulating(false);
    simStateRef.current = null;
  }, []);

  const startSimulation = useCallback((route: Route, speedMultiplier = 1) => {
    if (!route.path || route.path.length < 2) return;

    stopSimulation();
    setIsMockEnabled(true);

    const path = route.path;
    const segmentDistances: number[] = [];
    let totalDistance = 0;
    for (let i = 1; i < path.length; i++) {
      const d = haversineMeters(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
      segmentDistances.push(d);
      totalDistance += d;
    }

    const startPos = { lat: path[0][1], lng: path[0][0] };
    setMockLocationRaw(startPos);
    prevSimPos.current = startPos;
    setSimulationProgress(0);
    setSimulatedPath([[path[0][0], path[0][1]]]);
    setIsSimulating(true);
    if (path.length >= 2) {
      setSimulatedBearing(computeBearing(path[0][1], path[0][0], path[1][1], path[1][0]));
    }
    setSimulatedSpeedKmH(WALK_SPEED_MS * speedMultiplier * 3.6);

    simStateRef.current = {
      path,
      segmentDistances,
      totalDistance,
      distanceTravelled: 0,
      speedMultiplier,
    };

    timerRef.current = setInterval(() => {
      const state = simStateRef.current;
      if (!state) return;

      const stepDistance = WALK_SPEED_MS * (TICK_MS / 1000) * state.speedMultiplier;
      state.distanceTravelled += stepDistance;

      if (state.distanceTravelled >= state.totalDistance) {
        const last = state.path[state.path.length - 1];
        const newPos = { lat: last[1], lng: last[0] };
        updateBearing(newPos);
        setMockLocationRaw(newPos);
        setSimulationProgress(1);
        setSimulatedPath(prev => [...prev, [last[0], last[1]]]);
        stopSimulation();
        return;
      }

      setSimulationProgress(state.distanceTravelled / state.totalDistance);

      let accumulated = 0;
      for (let i = 0; i < state.segmentDistances.length; i++) {
        const segDist = state.segmentDistances[i];
        if (accumulated + segDist >= state.distanceTravelled) {
          const remaining = state.distanceTravelled - accumulated;
          const t = segDist > 0 ? remaining / segDist : 0;
          const pos = interpolatePath(state.path[i], state.path[i + 1], t);
          const newPos = { lat: pos[1], lng: pos[0] };
          updateBearing(newPos);
          setMockLocationRaw(newPos);
          setSimulatedPath(prev => [...prev, pos]);
          break;
        }
        accumulated += segDist;
      }
    }, TICK_MS);
  }, [stopSimulation]);

  const updateBearing = useCallback((newPos: { lat: number; lng: number }) => {
    const prev = prevSimPos.current;
    if (prev) {
      const b = computeBearing(prev.lat, prev.lng, newPos.lat, newPos.lng);
      if (!isNaN(b)) setSimulatedBearing(b);
    }
    prevSimPos.current = newPos;
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Mock Partner Peloton ────────────────────────────────────────────────────

  const [mockPartners, setMockPartners] = useState<MockPartner[]>([]);
  const partnerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partnerSimRef = useRef<Map<string, {
    path: [number, number][];
    segDist: number[];
    totalDist: number;
    distTravelled: number;
    speed: number;
    /**
     * Mock filter-data fields — generated once per partner spawn so the
     * partner-finder filters (gender / program / level / pace / distance /
     * streak) bucket each partner consistently across heartbeat ticks.
     * Re-rolling these every PARTNER_TICK_MS would thrash the carousel.
     */
    filterFields: {
      programLevel: number;
      programName: string;
      gender: 'male' | 'female';
      targetDistanceKm: number;
      currentStreak: number;
      mockPace?: string;
    };
  }>>(new Map());

  // Muted, dusty palette — keeps partners identifiable without competing
  // with the user's own bright cyan lemur marker.
  const PELOTON_COLORS = [
    '#8B9DC3', '#7BA898', '#C9A96E', '#A090B8', '#B08A9A',
    '#7EA88A', '#C49A7A', '#7E9DB0', '#B898A8', '#A4B87A',
    '#7AAEC0', '#B0AC84',
  ];

  const clearMockPartners = useCallback(() => {
    if (partnerTimerRef.current) { clearInterval(partnerTimerRef.current); partnerTimerRef.current = null; }
    const ids = Array.from(partnerSimRef.current.keys());
    partnerSimRef.current.clear();
    setMockPartners([]);
    ids.forEach((id) => deleteDoc(doc(db, 'presence', id)).catch(() => {}));
  }, []);

  const spawnMockPartners = useCallback((route: Route, count = 6) => {
    if (!route.path || route.path.length < 2) return;
    clearMockPartners();

    const path = route.path;
    const segDist: number[] = [];
    let totalDist = 0;
    for (let i = 1; i < path.length; i++) {
      const d = haversineMeters(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
      segDist.push(d);
      totalDist += d;
    }

    const n = Math.min(count, MAX_MOCK_PARTNERS);
    const ts = Date.now();
    const partners: MockPartner[] = [];

    for (let i = 0; i < n; i++) {
      const id = `mock_partner_${ts}_${i}`;
      const speedMult = 0.8 + Math.random() * 0.6;
      const offset = Math.random() * 0.3 * totalDist;
      const activity = PARTNER_ACTIVITIES[i % PARTNER_ACTIVITIES.length];

      const initial = positionOnPath(path, segDist, offset);
      partners.push({
        id,
        name: PARTNER_NAMES[i % PARTNER_NAMES.length],
        activityType: activity,
        speedMultiplier: speedMult,
        routeId: route.id,
        lat: initial.lat,
        lng: initial.lng,
        color: PELOTON_COLORS[i % PELOTON_COLORS.length],
        _initialOffset: offset,
      });

      const isMover = activity === 'running' || activity === 'walking';
      partnerSimRef.current.set(id, {
        path,
        segDist,
        totalDist,
        distTravelled: offset,
        speed: WALK_SPEED_MS * speedMult,
        filterFields: {
          programLevel: randomProgramLevel(),
          programName: randomProgramName(),
          gender: randomGender(),
          targetDistanceKm: randomTargetDistanceKm(),
          currentStreak: randomCurrentStreak(),
          ...(isMover ? { mockPace: randomMockPace() } : {}),
        },
      });
    }

    setMockPartners(partners);

    partnerTimerRef.current = setInterval(() => {
      setMockPartners((prev) => {
        const next = prev.map((p) => {
          const state = partnerSimRef.current.get(p.id);
          if (!state) return p;
          state.distTravelled += state.speed * (PARTNER_TICK_MS / 1000);
          if (state.distTravelled >= state.totalDist) state.distTravelled = 0;
          const pos = positionOnPath(state.path, state.segDist, state.distTravelled);

          writePartnerPresence(p.id, p.name, p.activityType, pos.lat, pos.lng, state.filterFields);

          return { ...p, lat: pos.lat, lng: pos.lng };
        });
        return next;
      });
    }, PARTNER_TICK_MS);
  }, [clearMockPartners]);

  useEffect(() => {
    return () => { if (partnerTimerRef.current) clearInterval(partnerTimerRef.current); };
  }, []);

  return {
    isMockEnabled,
    toggleMock,
    mockLocation,
    setMockLocation,
    effectiveLocation,
    selectedCity,
    setCityPreset,
    isSimulating,
    simulationProgress,
    simulatedBearing,
    simulatedSpeedKmH,
    startSimulation,
    stopSimulation,
    simulatedPath,
    mockPartners,
    spawnMockPartners,
    clearMockPartners,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function positionOnPath(
  path: [number, number][],
  segDist: number[],
  distTravelled: number,
): { lat: number; lng: number } {
  let acc = 0;
  for (let i = 0; i < segDist.length; i++) {
    if (acc + segDist[i] >= distTravelled) {
      const t = segDist[i] > 0 ? (distTravelled - acc) / segDist[i] : 0;
      const pos = interpolatePath(path[i], path[i + 1], t);
      return { lat: pos[1], lng: pos[0] };
    }
    acc += segDist[i];
  }
  const last = path[path.length - 1];
  return { lat: last[1], lng: last[0] };
}

/** Bearing in degrees (0 = North, 90 = East) between two lat/lng points. */
function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const dLng = (lng2 - lng1) * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
            Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

interface MockFilterFields {
  programLevel: number;
  programName: string;
  gender: 'male' | 'female';
  targetDistanceKm: number;
  currentStreak: number;
  mockPace?: string;
}

function writePartnerPresence(
  id: string,
  name: string,
  activity: ActivityType,
  lat: number,
  lng: number,
  filterFields: MockFilterFields,
) {
  setDoc(doc(db, 'presence', id), {
    uid: id,
    name,
    ageGroup: 'adult',
    isVerified: true,
    schoolName: null,
    mode: 'verified_global',
    lat,
    lng,
    authorityId: null,
    updatedAt: serverTimestamp(),
    activity: {
      status: activity,
      workoutTitle: activity === 'running' ? 'ריצה קבוצתית' : 'אימון קבוצתי',
      startedAt: Date.now() - Math.floor(Math.random() * 15 * 60_000),
    },
    lemurStage: 3,
    level: 3,
    programLevel: filterFields.programLevel,
    programName: filterFields.programName,
    gender: filterFields.gender,
    targetDistanceKm: filterFields.targetDistanceKm,
    currentStreak: filterFields.currentStreak,
    ...(filterFields.mockPace ? { mockPace: filterFields.mockPace } : {}),
  }).catch(() => {});
}

'use client';

/**
 * FreeRunLayer — free-run mode layer for MapShell (mode==='free_run').
 *
 * Delegates the BASE/TOP two-layer drag skeleton to TwoLayerShell:
 *   BASE (z-0) — RunLapsList; revealed as TOP drags to minimizedY.
 *   TOP  (z-10) — AppMap + workout or browse UI (drag controlled by TwoLayerShell).
 *
 * AppMap remount prevention:
 *   AppMap lives inside TwoLayerShell's render-prop (always in the TOP LAYER).
 *   isWorkoutActive false→true only swaps the overlay; AppMap never moves in
 *   the React tree, so Mapbox never remounts.
 *
 * MapShell suppresses its own AppMap when mode==='free_run' to prevent a
 * hidden duplicate Mapbox instance running concurrently.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Play, Navigation, MapPin } from 'lucide-react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useMapLogic } from '@/features/parks';
import type { Route } from '@/features/parks';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import HybridStationLayer from '@/features/workout-engine/hybrid/HybridStationLayer';
import GpsDebugHud from '@/features/workout-engine/players/running/components/FreeRun/GpsDebugHud';
import LiveSessionShell from '@/features/workout-engine/shared/components/LiveSessionShell';
import FreeRunOverlay, { RunMiniDockContent } from '@/features/workout-engine/players/running/components/FreeRun/FreeRunOverlay';
import RunLapsList from '@/features/workout-engine/players/running/components/FreeRun/RunLapsList';
import type { SessionPolicy, Participant } from '@/features/workout-engine/shared/types/session-policy';
import { useGroupPresenceListener } from '@/features/workout-engine/shared/hooks/useGroupPresenceListener';
import InviteRunButton from '@/features/workout-engine/players/running/components/FreeRun/InviteRunButton';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import MainMetrics from '@/features/workout-engine/players/running/components/FreeRun/StatsCarousel/MainMetrics';
import LapMetrics from '@/features/workout-engine/players/running/components/FreeRun/StatsCarousel/LapMetrics';
import VSSlide from '@/features/workout-engine/players/running/components/FreeRun/StatsCarousel/VSSlide';
import type { DrawerSlide } from '@/features/workout-engine/players/running/types/story-spec';

// ── AppMap — separate JS chunk, SSR disabled ──────────────────────────────────
const AppMap = dynamicImport(() => import('@/features/parks/core/components/AppMap'), {
  loading: () => <div className="h-full w-full bg-[#1a1a2e]" />,
  ssr: false,
});

// ─────────────────────────────────────────────────────────────────────────────

type MapLogic = ReturnType<typeof useMapLogic>;

interface FreeRunLayerProps {
  logic: MapLogic;
  /** GPS position (devSim.effectiveLocation applied) from MapShellInner. */
  effectivePos: { lat: number; lng: number } | null;
  /** Center the camera on the best-available fix (live GPS or fallback dot). */
  onRecenter?: () => void;
}

const BRAND_COLOR = '#00E5FF';

export default function FreeRunLayer({ logic, effectivePos, onRecenter }: FreeRunLayerProps) {
  const { setMode, activityType } = useMapMode();
  const { isWorkoutActive } = logic;

  // ?debug=gps flag — read once on mount (debug feature, SSR-safe)
  const isDebugGps = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === 'gps';
  }, []);

  const isMapFollowEnabled = useRunningPlayer((s) => s.isMapFollowEnabled);
  const setMapFollowEnabled = useRunningPlayer((s) => s.setMapFollowEnabled);
  const routeZones = useRunningPlayer((s) => s.routeZones);
  const setGuidedRouteId = useRunningPlayer((s) => s.setGuidedRouteId);
  const setGuidedRouteName = useRunningPlayer((s) => s.setGuidedRouteName);
  const setGuidedRouteDistanceKm = useRunningPlayer((s) => s.setGuidedRouteDistanceKm);
  const setActiveRoutePath = useRunningPlayer((s) => s.setActiveRoutePath);

  const { groupId, routeId: sessionRouteId } = useSharedSession();

  // Fetch and wire the group session route into the running player whenever
  // the session changes. Runs during browse (pre-workout) so the route is
  // already loaded when the member taps "start". routeId === undefined means
  // manual meeting-point — falls through as a free run without crashing.
  // The fetched route is also passed to AppMap so the polyline is visible
  // on the map even before the workout begins.
  const [groupRoute, setGroupRoute] = useState<Route | null>(null);
  useEffect(() => {
    if (!groupId || !sessionRouteId) {
      setGroupRoute(null);
      setGuidedRouteId(null);
      setGuidedRouteName(null);
      setGuidedRouteDistanceKm(null);
      setActiveRoutePath([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'official_routes', sessionRouteId));
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as {
          name?: string;
          path?: [number, number][];
          distance?: number;
          duration?: number;
          type?: string;
          difficulty?: string;
          rating?: number;
          calories?: number;
        };
        const path = Array.isArray(data.path) && data.path.length >= 2 ? data.path : null;
        if (!path) return;
        // Minimal Route object for AppMap display — required fields filled with
        // sensible defaults so AppMap never reads undefined where it expects a value.
        const routeForMap: Route = {
          id: snap.id,
          name: data.name ?? '',
          path,
          distance: data.distance ?? 0,
          duration: data.duration ?? 0,
          score: 0,
          type: (data.type ?? 'running') as Route['type'],
          difficulty: (data.difficulty ?? 'easy') as Route['difficulty'],
          rating: data.rating ?? 0,
          calories: data.calories ?? 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          features: {} as any,
          segments: [],
        };
        setGroupRoute(routeForMap);
        setGuidedRouteId(sessionRouteId);
        setGuidedRouteName(data.name ?? null);
        setGuidedRouteDistanceKm(typeof data.distance === 'number' ? data.distance : null);
        setActiveRoutePath(path);
      } catch (err) {
        if (!cancelled) console.warn('[FreeRunLayer] group route load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, sessionRouteId, setGuidedRouteId, setGuidedRouteName, setGuidedRouteDistanceKm, setActiveRoutePath]);

  const { setSelectedParticipantUid, setActiveStoryIndex, setGroupParticipants, selectedParticipantUid } =
    useMapStore();

  // Group presence — must be above the policy object so participants can be wired in.
  const { partnerPositions } = useGroupPresenceListener();
  const sideRailParticipants = React.useMemo<Participant[]>(
    () =>
      partnerPositions.map((p) => ({
        uid: p.uid,
        name: p.name,
        personaImageUrl: p.personaImageUrl,
        color: p.color,
        distanceKm: p.distance ?? 0,
        status: p.activityStatus,
        isRemote: false,
      })),
    [partnerPositions],
  );

  // Keep groupParticipants store in sync so VSSlide / RunStoryBar can read without prop drilling.
  useEffect(() => {
    setGroupParticipants(sideRailParticipants);
    return () => setGroupParticipants([]);
  }, [sideRailParticipants, setGroupParticipants]);

  // Tap-to-select: toggle selectedParticipantUid and auto-jump to VS story (index 2).
  const handleSelectParticipant = useCallback(
    (uid: string) => {
      if (selectedParticipantUid === uid) {
        setSelectedParticipantUid(null);
        setActiveStoryIndex(0);
      } else {
        setSelectedParticipantUid(uid);
        setActiveStoryIndex(2);
      }
    },
    [selectedParticipantUid, setSelectedParticipantUid, setActiveStoryIndex],
  );

  const handleStartFreeRun = () => {
    logic.setWorkoutMode('free');
    logic.startActiveWorkout();
  };

  const handleBackToDiscover = () => {
    logic.setWorkoutMode('discover');
    setMode('discover');
  };

  // Policy drives LiveSessionShell mode routing.
  const policy: SessionPolicy = {
    mode: groupId ? 'group' : 'solo',
    entry: 'discover',
    coLocation: 'none',
    goal: { type: 'none' },
    participants: sideRailParticipants,
    selectedUid: null,
    route: null,
  };

  // Drawer slides: always main + laps; VS added when a rival is selected.
  // Built inline (not via buildDrawerSlides) so component references are
  // unambiguously in the client bundle of this 'use client' file.
  const drawerSlides = React.useMemo<DrawerSlide[]>(
    () => [
      { id: 'main', component: MainMetrics },
      { id: 'laps', component: LapMetrics },
      ...(selectedParticipantUid ? [{ id: 'vs', component: VSSlide }] : []),
    ],
    [selectedParticipantUid],
  );

  return (
    <LiveSessionShell
      policy={policy}
      dockH={66}
      isActive={isWorkoutActive}
      behindContent={<RunLapsList />}
      miniContent={({ onExpand }) => (
        /* Fix #4 — dark bar with drag indicator + RunMiniDockContent.
           Not wrapped in MiniDock: drag affordance is the indicator pill,
           not ChevronUp. The TwoLayerShell MINI strip already handles
           drag-start (onPointerDown → dragControls.start) and the onClick
           here covers tap-to-expand. */
        <div
          className="flex flex-col h-full rounded-t-2xl"
          onClick={onExpand}
          style={{ cursor: 'pointer', background: '#0d0d0f' }}
        >
          {/* Drag indicator — thin pill at top center */}
          <div className="flex justify-center" style={{ paddingTop: 5 }}>
            <div
              className="rounded-full"
              style={{ width: 36, height: 3, background: 'rgba(255,255,255,0.18)' }}
              aria-hidden="true"
            />
          </div>
          {/* Stats + mini-map + stop glyph */}
          <div className="flex-1 flex items-center min-w-0">
            <RunMiniDockContent isLapsOpen />
          </div>
        </div>
      )}
    >
      {({ dragControls, isMinimized, onExpand }) => (
        <>
          {/* AppMap — always mounted here; never remounts between browse and workout */}
          <div className="absolute inset-0 z-0">
            <AppMap
              currentLocation={effectivePos}
              initialCenter={effectivePos}
              isActiveWorkout={isWorkoutActive}
              livePath={isWorkoutActive ? logic.livePath : undefined}
              livePathZones={isWorkoutActive ? routeZones : undefined}
              focusedRoute={groupRoute ?? logic.focusedRoute}
              routes={groupRoute ? [groupRoute] : logic.focusedRoute ? [logic.focusedRoute] : []}
              userBearing={logic.userBearing ?? 0}
              isAutoFollowEnabled={isMapFollowEnabled}
              onUserPanDetected={() => setMapFollowEnabled(false)}
              mapMode="free_run"
              activityType={activityType}
              isNavigationMode={logic.isNavigationMode}
              partnerPositions={partnerPositions}
            />
          </div>

          {/* Hybrid station overlay — inert (null) unless a hybrid session is active. */}
          {isWorkoutActive && <HybridStationLayer />}

          {isWorkoutActive ? (
            /* ── Workout mode ─────────────────────────────────────────────── */
            <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
              {/* Everything hidden when minimized — laps list must be unobstructed. */}
              {!isMinimized && (
                <>
                  <FreeRunOverlay
                    dragControls={dragControls}
                    isMinimized={isMinimized}
                    onExpand={onExpand}
                    drawerSlides={drawerSlides}
                    sideRailParticipants={sideRailParticipants}
                    onSelectParticipant={handleSelectParticipant}
                  />
                  <InviteRunButton activityType={logic.preferences.activity === 'walking' ? 'walking' : 'running'} />
                  {/* Group count badge — below RouteStoryBar (~68px from top). */}
                  {sideRailParticipants.length > 0 && (
                    <div
                      className="absolute left-0 right-0 z-[60] flex justify-center pointer-events-none"
                      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 68px)' }}
                    >
                      <div
                        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white"
                        style={{ background: 'rgba(0,122,255,0.82)', backdropFilter: 'blur(8px)' }}
                      >
                        <span>🏃</span>
                        <span>{sideRailParticipants.length + 1} רצים יחד</span>
                      </div>
                    </div>
                  )}
                  {/* Fix #3 — center-me button.
                      Gated by !isMinimized so it never leaks onto the laps list
                      when the TOP LAYER is at minimizedY. */}
                  <div className="absolute right-4 bottom-40 z-[55] pointer-events-auto">
                    <button
                      onClick={() => { logic.handleLocationClick(); onRecenter?.(); }}
                      className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center bg-white active:scale-95 transition-all"
                    >
                      <Navigation
                        size={20}
                        fill={logic.isFollowing ? BRAND_COLOR : 'none'}
                        color={logic.isFollowing ? BRAND_COLOR : '#6B7280'}
                      />
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── Browse mode — pre-run UI ─────────────────────────────────── */
            <div className="absolute inset-0 z-10 pointer-events-none">
              {/* Mode toggle (discover / free) */}
              <div className="absolute top-[max(1.5rem,env(safe-area-inset-top))] left-0 right-0 z-30 px-4 pointer-events-auto">
                <div className="max-w-xs mx-auto flex bg-white/90 backdrop-blur-sm rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                  <button
                    onClick={handleBackToDiscover}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <MapPin size={14} />
                    <span>גלה</span>
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold bg-[#00E5FF] text-white transition-colors">
                    <Navigation size={14} />
                    <span>חופשי</span>
                  </button>
                </div>
              </div>

              {/* Location button */}
              <div className="absolute right-4 z-40 bottom-40 pointer-events-auto">
                <button
                  onClick={() => { logic.handleLocationClick(); onRecenter?.(); }}
                  className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center bg-white active:scale-95 transition-all"
                >
                  <Navigation
                    size={20}
                    fill={logic.isFollowing ? BRAND_COLOR : 'none'}
                    color={logic.isFollowing ? BRAND_COLOR : '#6B7280'}
                  />
                </button>
              </div>

              {/* Start Free Run button */}
              <div className="absolute bottom-[max(6rem,env(safe-area-inset-bottom))] left-4 right-4 z-20 flex justify-center pointer-events-auto">
                <button
                  onClick={handleStartFreeRun}
                  className="px-10 py-4 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#00BAF7] text-white font-black text-lg shadow-2xl active:scale-[0.97] transition-all flex items-center gap-3"
                >
                  <Play size={22} fill="white" />
                  <span>התחל ריצה חופשית</span>
                </button>
              </div>
            </div>
          )}
        {/* GPS debug HUD — only when URL contains ?debug=gps */}
        {isDebugGps && <GpsDebugHud />}
      </>
      )}
    </LiveSessionShell>
  );
}

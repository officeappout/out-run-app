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
import { normalizeStoredRoutePath } from '@/features/parks/core/utils/routePath';
import { Play, Navigation, MapPin } from 'lucide-react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useMapLogic } from '@/features/parks';
import type { Route } from '@/features/parks';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import HybridStationLayer from '@/features/workout-engine/hybrid/HybridStationLayer';
import { useHybridRun } from '@/features/workout-engine/hybrid/useHybridRun';
import { useRouteDirectionAdapt } from './useRouteDirectionAdapt';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { isApproachingStation } from '@/features/workout-engine/hybrid/hybrid-orchestrator';
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
import FreeRunOverlayV2 from '@/features/workout-engine/players/running/components/FreeRun/v2/FreeRunOverlayV2';
import FreeRunLapsLayerV2 from '@/features/workout-engine/players/running/components/FreeRun/v2/FreeRunLapsLayerV2';
import FreeRunMiniV2 from '@/features/workout-engine/players/running/components/FreeRun/v2/FreeRunMiniV2';

// ── AppMap — separate JS chunk, SSR disabled ──────────────────────────────────
const AppMap = dynamicImport(() => import('@/features/parks/core/components/AppMap'), {
  loading: () => <div className="h-full w-full bg-[#1a1a2e]" />,
  ssr: false,
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publishes "the laps list (BASE layer) is showing" to useMapStore.isLapsOpen.
 *
 * Active-run-map fix (17.10.2026): TurnCarousel and the "מרכז אותי" recenter
 * pill render at MapShell's ROOT (z-30 / z-40), above this whole layer's z-10
 * stacking context, and both already hide on isLapsOpen. Only the legacy
 * FreeRunActive path ever published it — so dragging this layer's TOP down to
 * the laps list left the turn card + recenter pill floating over the laps.
 * Rendered inside the shell's render-prop because that's where the drag state lives.
 */
function LapsOpenPublisher({ open }: { open: boolean }) {
  const setIsLapsOpen = useMapStore((s) => s.setIsLapsOpen);
  useEffect(() => {
    setIsLapsOpen(open);
  }, [open, setIsLapsOpen]);
  useEffect(() => () => setIsLapsOpen(false), [setIsLapsOpen]);
  return null;
}

type MapLogic = ReturnType<typeof useMapLogic>;

interface FreeRunLayerProps {
  logic: MapLogic;
  /** GPS position (devSim.effectiveLocation applied) from MapShellInner. */
  effectivePos: { lat: number; lng: number } | null;
}

export default function FreeRunLayer({ logic, effectivePos }: FreeRunLayerProps) {
  const { setMode, activityType } = useMapMode();
  const { isWorkoutActive } = logic;

  // ?debug=gps flag — read once on mount (debug feature, SSR-safe)
  const isDebugGps = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === 'gps';
  }, []);

  // G3.2 (flag enable_route_direction_adapt, fail-closed): adapt a loop to the walked direction.
  const { flags: runFlags } = useFeatureFlags();
  const runnerGender = useUserStore((s) => s.profile?.core?.gender) as 'male' | 'female' | 'other' | undefined;
  // Home v2 (enable_home_v2): the continuous-run player (R2-prop-easy / U-B / U-C).
  // Commute keeps today's UI (its own ETA carousel). Off ⇒ today's UI, unchanged.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const homeV2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  const sessionMode = useRunningPlayer((s) => s.sessionMode);
  const v2 = homeV2 && sessionMode !== 'commute';
  const { startArrow } = useRouteDirectionAdapt({
    enabled: runFlags.enableRouteDirectionAdapt,
    focusedRoute: logic.focusedRoute,
    setFocusedRoute: logic.setFocusedRoute,
    gender: runnerGender,
  });

  const isMapFollowEnabled = useRunningPlayer((s) => s.isMapFollowEnabled);
  const mapHeadingMode = useRunningPlayer((s) => s.mapHeadingMode);
  const setMapFollowEnabled = useRunningPlayer((s) => s.setMapFollowEnabled);
  const routeZones = useRunningPlayer((s) => s.routeZones);
  const setGuidedRouteId = useRunningPlayer((s) => s.setGuidedRouteId);
  const setGuidedRouteName = useRunningPlayer((s) => s.setGuidedRouteName);
  const setGuidedRouteDistanceKm = useRunningPlayer((s) => s.setGuidedRouteDistanceKm);
  const setActiveRoutePath = useRunningPlayer((s) => s.setActiveRoutePath);

  // Station-approach moment, map-pin blink (David, 25.09.2026): same
  // approach computation as HybridStationLayer's CTA gate, threaded here as
  // a plain id because AppMap has no store access of its own — it only
  // takes props. null whenever there's no active hybrid session or no
  // station currently in the approach window (the common case).
  const hybridPhase = useHybridRun((s) => s.phase);
  const hybridUpcomingStation = useHybridRun((s) => s.upcomingStation);
  const hybridLastPosition = useRunningPlayer((s) => s.lastPosition);
  const approachingStationId =
    hybridPhase === 'aerobic' && hybridUpcomingStation != null && hybridLastPosition != null &&
    isApproachingStation(
      hybridLastPosition.lat, hybridLastPosition.lng,
      hybridUpcomingStation.lat, hybridUpcomingStation.lng,
      hybridUpcomingStation.aerobicType,
    )
      ? hybridUpcomingStation.parkId ?? null
      : null;

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
          // Raw Firestore storage — NOT [number,number][] despite the runtime
          // Route.path type. official_routes.path is written as {lng,lat}
          // OBJECTS (InventoryService.saveRoutes); a manually-drawn route may
          // store [lng,lat] tuples instead. Must go through
          // normalizeStoredRoutePath below, exactly like every other reader
          // of this field — a raw cast here previously fed Mapbox/
          // buildLaneOffsetPath object-shaped points instead of tuples,
          // crashing on any odd-length path (route-odd-geometry fix,
          // 22.09.2026 — see docs/field-test in the sderot-walking-field-test
          // worktree for the full incident writeup).
          path?: unknown;
          distance?: number;
          duration?: number;
          type?: string;
          difficulty?: string;
          rating?: number;
          calories?: number;
        };
        const path = normalizeStoredRoutePath(data.path);
        if (path.length < 2) return;
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
  // Group badge sits below the story bar, the turn card (when a route is
  // navigated) AND the recenter pill's row (storyBar + navCard + 16, ~40 px
  // tall) — those render at MapShell's root, above this layer, and used to
  // cover the badge at its fixed 68 px.
  const storyBarH = useMapStore((s) => s.storyBarHeight);
  const navCardH = useMapStore((s) => s.navCardHeight);
  const groupBadgeTop = storyBarH > 0
    ? `calc(env(safe-area-inset-top, 0px) + ${storyBarH + navCardH + 64}px)`
    : 'calc(env(safe-area-inset-top, 0px) + 68px)';

  // Group presence — must be above the policy object so participants can be wired in.
  const { partnerPositions } = useGroupPresenceListener(effectivePos);
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
      behindBg={v2 ? 'bg-v2-surface' : undefined}
      behindContent={v2 ? ({ onExpand }) => <FreeRunLapsLayerV2 onClose={onExpand} /> : <RunLapsList />}
      miniContent={({ onExpand }) => v2 ? <FreeRunMiniV2 onExpand={onExpand} height={66} /> : (
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
      {({ dragControls, isMinimized, onExpand, onMinimize, isDragging }) => (
        <>
          <LapsOpenPublisher open={isWorkoutActive && (isMinimized || isDragging)} />
          {/* AppMap — always mounted here; never remounts between browse and workout */}
          <div className="absolute inset-0 z-0">
            <AppMap
              currentLocation={effectivePos}
              initialCenter={effectivePos}
              isActiveWorkout={isWorkoutActive}
              livePath={isWorkoutActive ? logic.livePath : undefined}
              livePathZones={isWorkoutActive ? routeZones : undefined}
              focusedRoute={groupRoute ?? logic.focusedRoute}
              hybridStations={((groupRoute ?? logic.focusedRoute) as any)?.stationMarkers ?? null}
              approachingStationId={approachingStationId}
              routes={groupRoute ? [groupRoute] : logic.focusedRoute ? [logic.focusedRoute] : []}
              userBearing={logic.userBearing ?? 0}
              isAutoFollowEnabled={isMapFollowEnabled}
              onUserPanDetected={() => setMapFollowEnabled(false)}
              headingMode={mapHeadingMode}
              onFollowRestored={() => setMapFollowEnabled(true)}
              mapMode="free_run"
              startDirectionArrow={startArrow}
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
              {!isMinimized && v2 && (
                <>
                  <FreeRunOverlayV2
                    dragControls={dragControls}
                    onMinimize={onMinimize}
                    sideRailParticipants={sideRailParticipants}
                    onSelectParticipant={handleSelectParticipant}
                    activityType={logic.preferences.activity === 'walking' ? 'walking' : 'running'}
                  />
                  {sideRailParticipants.length > 0 && (
                    <div
                      className="absolute left-0 right-0 z-[60] flex justify-center pointer-events-none"
                      style={{ top: groupBadgeTop }}
                    >
                      <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1 text-[12.5px] font-extrabold text-v2-deep shadow-v2-ring" dir="rtl">
                        {`${sideRailParticipants.length + 1} רצים יחד`}
                      </div>
                    </div>
                  )}
                </>
              )}
              {!isMinimized && !v2 && (
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
                  {/* Group count badge — below the story bar / turn card / recenter row (groupBadgeTop). */}
                  {sideRailParticipants.length > 0 && (
                    <div
                      className="absolute left-0 right-0 z-[60] flex justify-center pointer-events-none"
                      style={{ top: groupBadgeTop }}
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

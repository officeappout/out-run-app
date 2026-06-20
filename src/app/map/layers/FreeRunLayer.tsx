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

import React from 'react';
import dynamicImport from 'next/dynamic';
import { Play, Navigation, MapPin } from 'lucide-react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useMapLogic } from '@/features/parks';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import TwoLayerShell from '@/features/workout-engine/shared/components/TwoLayerShell';
import FreeRunOverlay, { RunMiniDockContent } from '@/features/workout-engine/players/running/components/FreeRun/FreeRunOverlay';
import RunLapsList from '@/features/workout-engine/players/running/components/FreeRun/RunLapsList';

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
}

const BRAND_COLOR = '#00E5FF';

export default function FreeRunLayer({ logic, effectivePos }: FreeRunLayerProps) {
  const { setMode, activityType } = useMapMode();
  const { isWorkoutActive } = logic;

  const isMapFollowEnabled = useRunningPlayer((s) => s.isMapFollowEnabled);
  const setMapFollowEnabled = useRunningPlayer((s) => s.setMapFollowEnabled);
  const routeZones = useRunningPlayer((s) => s.routeZones);

  // DEBUG — remove after routing confirmed
  React.useEffect(() => {
    console.log('[FreeRunLayer NEW] isWorkoutActive:', isWorkoutActive);
  }, [isWorkoutActive]);

  const handleStartFreeRun = () => {
    logic.setWorkoutMode('free');
    logic.startActiveWorkout();
  };

  const handleBackToDiscover = () => {
    logic.setWorkoutMode('discover');
    setMode('discover');
  };

  return (
    <TwoLayerShell
      dockH={56}
      isActive={isWorkoutActive}
      behindContent={<RunLapsList />}
      miniContent={({ onExpand }) => (
        /* Fix #4 — dark bar with drag indicator + RunMiniDockContent.
           Not wrapped in MiniDock: drag affordance is the indicator pill,
           not ChevronUp. The TwoLayerShell MINI strip already handles
           drag-start (onPointerDown → dragControls.start) and the onClick
           here covers tap-to-expand. */
        <div
          className="flex flex-col h-full"
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
              focusedRoute={logic.focusedRoute}
              routes={logic.focusedRoute ? [logic.focusedRoute] : []}
              userBearing={logic.userBearing ?? 0}
              isAutoFollowEnabled={isMapFollowEnabled}
              onUserPanDetected={() => setMapFollowEnabled(false)}
              mapMode="free_run"
              activityType={activityType}
              isNavigationMode={logic.isNavigationMode}
            />
          </div>

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
                  />
                  {/* Fix #3 — center-me button.
                      Gated by !isMinimized so it never leaks onto the laps list
                      when the TOP LAYER is at minimizedY. */}
                  <div className="absolute right-4 bottom-40 z-[55] pointer-events-auto">
                    <button
                      onClick={logic.handleLocationClick}
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
                  onClick={logic.handleLocationClick}
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
        </>
      )}
    </TwoLayerShell>
  );
}

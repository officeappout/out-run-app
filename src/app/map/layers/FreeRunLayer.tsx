'use client';

/**
 * FreeRunLayer — StrengthRunner 1:1 two-layer architecture for free-run mode.
 *
 * Two-layer model (AppMap is inside the draggable TOP LAYER):
 *
 *   BASE LAYER (z-0)  — RunLapsList: always mounted, opacity-toggled.
 *                        Visible only when TOP is minimized (laps open).
 *
 *   TOP LAYER  (z-10) — motion.div: the draggable unit.
 *                        Contains AppMap + FreeRunOverlay (browse mode UI).
 *                        Drags as ONE UNIT — map moves with the finger.
 *
 * States:
 *   peek          — isMinimized=false, y=0, MetricsDrawer at peek
 *   map-dominant  — isMinimized=false, y=0, MetricsDrawer at dock (user dragged)
 *   laps          — isMinimized=true,  y=minimizedY, MiniDock visible, RunLapsList exposed
 *
 * Drag mechanics:
 *   drag="y" dragListener=false — only dragControls.start(e) initiates drag.
 *   Story bar's onPointerDown calls dragControls.start(e) (the drag handle).
 *   AppMap pan/zoom events pass through (they never call dragControls.start).
 *   MetricsDrawer uses its own separate dragControls (no conflict).
 *
 * AppMap remount prevention:
 *   AppMap is always inside motion.div (even in browse mode).
 *   isWorkoutActive false→true does NOT move AppMap in the tree → no remount.
 *   Only the first entry into free_run mode causes an AppMap mount.
 *
 * MapShell suppresses its own AppMap when mode === 'free_run' to avoid
 * a hidden duplicate Mapbox instance running concurrently.
 */

import React from 'react';
import { motion } from 'framer-motion';
import dynamicImport from 'next/dynamic';
import { Play, Navigation, MapPin } from 'lucide-react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useMapLogic } from '@/features/parks';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { usePlayerDragRunner } from '@/features/workout-engine/players/running/hooks/usePlayerDragRunner';
import FreeRunOverlay, { RunMiniDockContent } from '@/features/workout-engine/players/running/components/FreeRun/FreeRunOverlay';
import RunLapsList from '@/features/workout-engine/players/running/components/FreeRun/RunLapsList';
import MiniDock from '@/features/workout-engine/shared/components/MiniDock';

// ── AppMap — dynamically imported to keep Mapbox in its own JS chunk ─────────
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

  const { dragControls, isMinimized, setIsMinimized, minimizedY, handleDragEnd } =
    usePlayerDragRunner(isWorkoutActive);

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
    <div className="absolute inset-0 z-10 overflow-hidden">
      {/* ── BASE LAYER — RunLapsList ──────────────────────────────────────────
          Sits behind the TOP LAYER. Revealed when motion.div drags down to
          minimizedY, exposing laps content from screen top to MiniDock. */}
      <div
        className="absolute inset-0 z-0 bg-white"
        style={{
          opacity: isWorkoutActive ? 1 : 0,
          pointerEvents: isWorkoutActive && isMinimized ? 'auto' : 'none',
          transition: 'opacity 0.15s ease',
        }}
        aria-hidden={!(isWorkoutActive && isMinimized)}
      >
        <div
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <RunLapsList />
        </div>
      </div>

      {/* ── TOP LAYER — motion.div ────────────────────────────────────────────
          Contains AppMap + all running UI. Drags as one unit so the map
          moves with the finger, revealing the BASE LAYER above.
          drag=false in browse mode (no story bar to drag from). */}
      <motion.div
        className="absolute inset-0 z-10"
        drag={isWorkoutActive ? 'y' : false}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: minimizedY }}
        dragElastic={0.12}
        dragMomentum={false}
        animate={{ y: isWorkoutActive && isMinimized ? minimizedY : 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        onDragEnd={isWorkoutActive ? handleDragEnd : undefined}
      >
        {/* AppMap — ALWAYS here. Never remounts between browse and workout.
            isWorkoutActive false→true only changes overlay, not AppMap position. */}
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
            {/* FreeRunOverlay — story bar + MetricsDrawer + WorkoutControlCluster.
                Hidden when minimized (MiniDock replaces it). */}
            {!isMinimized && (
              <FreeRunOverlay
                dragControls={dragControls}
                isMinimized={isMinimized}
                onExpand={() => setIsMinimized(false)}
              />
            )}

            {/* MiniDock — visible when minimized.
                absolute top-0 z-20 so it covers AppMap and sits at the
                top of the viewport (motion.div is at y=minimizedY, so
                top-0 of the motion.div = screen bottom - 56px). */}
            {isMinimized && (
              <div
                className="absolute top-0 left-0 right-0 z-20 bg-black pointer-events-auto"
                style={{ height: 56, borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  dragControls.start(e);
                }}
              >
                <MiniDock onExpand={() => setIsMinimized(false)}>
                  <RunMiniDockContent isLapsOpen />
                </MiniDock>
              </div>
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
                <button
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold bg-[#00E5FF] text-white transition-colors"
                >
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
      </motion.div>
    </div>
  );
}

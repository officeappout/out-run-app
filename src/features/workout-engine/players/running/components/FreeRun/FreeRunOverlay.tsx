'use client';

/**
 * FreeRunOverlay — UI overlay for FreeRunLayer's TOP motion.div.
 *
 * Replaces FreeRunActive in the new two-layer architecture where AppMap
 * is physically inside the draggable motion.div (FreeRunLayer owns drag).
 *
 * Responsibilities:
 *   • Story bar (drag handle → caller's dragControls)
 *   • GPS / goal toasts
 *   • MetricsDrawer (no lockToAnchor — laps state lives in FreeRunLayer)
 *   • WorkoutControlCluster, LapSnapshotOverlay, WorkoutSettingsDrawer
 *
 * Three-state rendering (controlled by parent FreeRunLayer):
 *   1. peek        — isMinimized=false, MetricsDrawer at peek
 *   2. map-dominant — isMinimized=false, MetricsDrawer at dock (user dragged it)
 *   3. laps (minimized) — parent renders MiniDock; this component hidden via {!isMinimized}
 *
 * Corrections applied:
 *   • dock render-prop → <MiniDock><RunMiniDockContent isLapsOpen={false}/></MiniDock>
 *     (state 2: map-dominant + black strip, laps closed)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { useDragControls } from 'framer-motion';
import { Square, RotateCcw, Pause, Play, ChevronDown } from 'lucide-react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import RunStoryBar from '../shared/RunStoryBar';
import MetricsDrawer from '@/features/workout-engine/shared/components/MetricsDrawer';
import MiniDock from '@/features/workout-engine/shared/components/MiniDock';
import StatsCarousel, { type DrawerSlide } from './StatsCarousel';
import SideRail from './SideRail';
import type { Participant } from '@/features/workout-engine/shared/types/session-policy';
import CommuteStatsCarousel from '../Commute/CommuteStatsCarousel';
import LapSnapshotOverlay from './LapSnapshotOverlay';
import WorkoutSettingsDrawer from './WorkoutSettingsDrawer';
import WorkoutControlCluster from './WorkoutControlCluster';
import { useSessionGoalProgress } from '../../hooks/useSessionGoalProgress';
import { useGroupSessionGoal } from '../../hooks/useGroupSessionGoal';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STORY_BAR_FALLBACK_PX = 56;

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MiniRouteMap — SVG thumbnail of the GPS trail recorded so far.
// coords: number[][] where each element is [lng, lat] (GeoJSON order, same as
// useRunningPlayer.routeCoords). Shown only when isLapsOpen=true (map hidden).
// ─────────────────────────────────────────────────────────────────────────────

const MINI_MAP_SAMPLE = 150;

function MiniRouteMap({ coords, size = 40 }: { coords: number[][]; size?: number }) {
  if (!coords || coords.length < 2) {
    return (
      <div
        className="rounded-lg overflow-hidden flex-shrink-0"
        style={{
          width: size, height: size,
          background: '#ffffff',
          border: '0.5px solid rgba(0,0,0,0.13)',
        }}
      >
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r="3" fill="#004E8A" />
        </svg>
      </div>
    );
  }

  const step = Math.max(1, Math.floor(coords.length / MINI_MAP_SAMPLE));
  const sampled: number[][] = [];
  for (let i = 0; i < coords.length; i += step) sampled.push(coords[i]);
  const lastCoord = coords[coords.length - 1];
  if (sampled[sampled.length - 1] !== lastCoord) sampled.push(lastCoord);

  const pad = 5;
  const inner = size - pad * 2;

  const lngs = sampled.map(c => c[0]);
  const lats = sampled.map(c => c[1]);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const dLng = maxLng - minLng || 1e-5;
  const dLat = maxLat - minLat || 1e-5;

  const pts = sampled
    .map(c => {
      const x = ((c[0] - minLng) / dLng) * inner + pad;
      const y = ((maxLat - c[1]) / dLat) * inner + pad; // lat axis flipped (up = larger)
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const cx = ((lastCoord[0] - minLng) / dLng) * inner + pad;
  const cy = ((maxLat - lastCoord[1]) / dLat) * inner + pad;

  return (
    <div
      className="rounded-lg overflow-hidden flex-shrink-0"
      style={{
        width: size, height: size,
        background: '#ffffff',
        border: '0.5px solid rgba(0,0,0,0.13)',
      }}
    >
      <svg width={size} height={size}>
        <polyline
          points={pts}
          fill="none"
          stroke="#0088BB"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
        <circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r="2.5" fill="#004E8A" />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RunMiniDockContent — exported so FreeRunLayer can use it for the minimized bar.
//
// Controls ALWAYS shown (mirrors WorkoutControlCluster — single source of truth):
//   running → [Lap (RotateCcw)] [Pause (||)]
//   paused  → [Resume (▶)]     [Stop  (■)]
//
// isLapsOpen=true  → MINI STRIP (laps visible, map hidden):
//   mini-map thumbnail shown on the right.
// isLapsOpen=false → MetricsDrawer dock (map visible, WorkoutControlCluster hidden):
//   no mini-map (map is already the background); stats + inline controls only.
// ─────────────────────────────────────────────────────────────────────────────

export function RunMiniDockContent({ isLapsOpen }: { isLapsOpen: boolean }) {
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const totalDuration = useSessionStore((s) => s.totalDuration);
  // status is the single source of truth shared with WorkoutControlCluster.
  const sessionStatus = useSessionStore((s) => s.status);
  const pauseSession  = useSessionStore((s) => s.pauseSession);
  const resumeSession = useSessionStore((s) => s.resumeSession);
  const isPaused = sessionStatus === 'paused';

  const goalProgress = useSessionGoalProgress();
  const routeCoords = useRunningPlayer((s) => s.routeCoords);

  const safeDistance = Number.isFinite(totalDistance) && totalDistance > 0 ? totalDistance : 0;

  const handleStop = useCallback(async () => {
    const { finishWorkout } = useRunningPlayer.getState();
    await finishWorkout();
  }, []);

  const handleLap = useCallback(() => {
    const state = useRunningPlayer.getState();
    state.triggerLap();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(15);
    }
  }, []);

  const handlePause = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
    pauseSession();
  }, [pauseSession]);

  const handleResume = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
    resumeSession();
  }, [resumeSession]);

  return (
    /* dir="rtl": first child → RIGHT edge, last child → LEFT edge.
       Layout: [mini-map]:RIGHT … [stats] … [spacer] … [lap][stop]:LEFT */
    <div
      className="flex items-center gap-2 w-full px-3"
      style={{ fontFamily: 'var(--font-simpler)' }}
      dir="rtl"
    >
      {/* Mini-map — RIGHT (first in RTL). Only when map is hidden behind laps. */}
      {isLapsOpen && (
        <MiniRouteMap coords={routeCoords} size={48} />
      )}

      <div className="flex items-baseline gap-1 flex-shrink-0">
        <span className="text-2xl font-black tabular-nums text-white leading-none">
          {safeDistance.toFixed(2)}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#00ADEF]">
          KM
        </span>
      </div>
      <span className="text-white/40 text-sm">·</span>
      <span className="text-2xl font-black tabular-nums text-white leading-none flex-shrink-0">
        {formatDuration(totalDuration)}
      </span>

      {goalProgress && goalProgress.progress > 0 && (
        <div
          className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black"
          style={{
            background: goalProgress.isComplete ? '#10B981' : 'rgba(255,255,255,0.15)',
            color: goalProgress.isComplete ? '#fff' : '#00ADEF',
          }}
        >
          {Math.round(goalProgress.progress * 100)}%
        </div>
      )}

      <div className="flex-1" />

      {/* Controls — LEFT (last in RTL). Always shown regardless of isLapsOpen.
          dir="ltr" inner: [secondary (left)] [primary (right)]
            running → [Lap] [Pause]    paused → [Resume] [Stop]               */}
      <div className="flex items-center gap-1 flex-shrink-0" dir="ltr">
          {isPaused ? (
            <>
              {/* Resume — secondary */}
              <button
                type="button"
                aria-label="המשך אימון"
                onClick={(e) => { e.stopPropagation(); handleResume(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Play size={26} fill="white" className="text-white" />
              </button>
              {/* Stop — primary */}
              <button
                type="button"
                aria-label="סיים אימון"
                onClick={(e) => { e.stopPropagation(); handleStop(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Square size={26} fill="white" className="text-white" />
              </button>
            </>
          ) : (
            <>
              {/* Lap — secondary */}
              <button
                type="button"
                aria-label="הקפה"
                onClick={(e) => { e.stopPropagation(); handleLap(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
              >
                <RotateCcw size={26} strokeWidth={2.5} className="text-white" />
              </button>
              {/* Pause — primary */}
              <button
                type="button"
                aria-label="השהה אימון"
                onClick={(e) => { e.stopPropagation(); handlePause(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Pause size={26} fill="white" className="text-white" />
              </button>
            </>
          )}
        </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FreeRunOverlay
// ─────────────────────────────────────────────────────────────────────────────

interface FreeRunOverlayProps {
  /** Framer-motion drag controls from FreeRunLayer — story bar uses these to initiate drag. */
  dragControls: ReturnType<typeof useDragControls>;
  /** When true, this entire overlay is hidden (parent shows MiniDock instead). */
  isMinimized: boolean;
  /** Callback to expand from minimized state (passed to MiniDock when needed). */
  onExpand: () => void;
  /** Policy-driven slides from FreeRunLayer. Defaults to [main, laps] when absent. */
  drawerSlides?: DrawerSlide[];
  /** Presence participants for the vertical SideRail. Empty array = no rail rendered. */
  sideRailParticipants?: Participant[];
  /** Called when the user taps a participant avatar — drives selectedParticipantUid in useMapStore. */
  onSelectParticipant?: (uid: string) => void;
}

export default function FreeRunOverlay({ dragControls, isMinimized, onExpand, drawerSlides, sideRailParticipants, onSelectParticipant }: FreeRunOverlayProps) {
  const gpsStatus = useRunningPlayer((s) => s.gpsStatus);
  const sessionMode = useRunningPlayer((s) => s.sessionMode);
  const isCommute = sessionMode === 'commute';

  const isNavigationActive = useRunningPlayer(
    (s) =>
      !!s.guidedRouteId ||
      (Array.isArray(s.activeRoutePath) && s.activeRoutePath.length >= 2),
  );

  // Bridge: reads sessionGoal + myPersonalGoal from shared session store,
  // resolves effective goal, and writes it into useRunningPlayer.
  useGroupSessionGoal();

  // Safety-clear: remove stale group session context if this overlay mounts
  // while a group session is stored but no longer active (force-quit / abnormal exit).
  useEffect(() => {
    const s = useSharedSession.getState();
    if (s.groupId && s.phase !== 'active') {
      s.clearGroupSession();
    }
  }, []);

  const goalProgress = useSessionGoalProgress();
  const sessionStatus = useSessionStore((s) => s.status);
  const isPaused = sessionStatus === 'paused';

  // RunStoryBar always shows during active sessions — distance/time/VS regardless of goal.
  const shouldShowStoryBar = true;

  // Track MetricsDrawer anchor so WorkoutControlCluster can be hidden at dock.
  // Initialised to 'peek' (matches MetricsDrawer defaultAnchor) so the cluster
  // is visible on mount. onAnchorChange updates this whenever drawer snaps.
  const [metricsAnchor, setMetricsAnchor] = useState('peek');
  const metricsAtDock = metricsAnchor === 'dock';

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ── Goal-reached celebration ─────────────────────────────────────────────
  const prevIsCompleteRef = useRef(false);
  const [showGoalToast, setShowGoalToast] = useState(false);
  useEffect(() => {
    const isNowComplete = goalProgress?.isComplete ?? false;
    if (isNowComplete && !prevIsCompleteRef.current) {
      setShowGoalToast(true);
      const t = setTimeout(() => setShowGoalToast(false), 3000);
      prevIsCompleteRef.current = true;
      return () => clearTimeout(t);
    }
    if (!isNowComplete) prevIsCompleteRef.current = false;
  }, [goalProgress?.isComplete]);

  // ── GPS status toast ─────────────────────────────────────────────────────
  const [gpsToast, setGpsToast] = useState<string | null>(null);
  const prevGpsStatusRef = useRef(gpsStatus);
  useEffect(() => {
    if (gpsStatus === prevGpsStatusRef.current) return;
    prevGpsStatusRef.current = gpsStatus;
    if (gpsStatus === 'searching')        setGpsToast('מחפש GPS…');
    else if (gpsStatus === 'poor')        setGpsToast('GPS חלש — ממשיך לחפש');
    else if (gpsStatus === 'good' || gpsStatus === 'perfect') setGpsToast('GPS תקין ✓');
  }, [gpsStatus]);
  useEffect(() => {
    if (!gpsToast) return;
    const t = setTimeout(() => setGpsToast(null), 4000);
    return () => clearTimeout(t);
  }, [gpsToast]);

  // ── Story-bar height → map camera padding ────────────────────────────────
  const storyBarInnerRef = useRef<HTMLDivElement>(null);
  const [storyBarHeight, setStoryBarHeight] = useState(STORY_BAR_FALLBACK_PX);
  const setStoreStoryBarHeight = useMapStore((s) => s.setStoryBarHeight);

  useEffect(() => {
    const node = storyBarInnerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([entry]) => {
      const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (Number.isFinite(h) && h > 0) setStoryBarHeight(Math.round(h));
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const h = shouldShowStoryBar && !isMinimized ? storyBarHeight : 0;
    setStoreStoryBarHeight(h);
    return () => setStoreStoryBarHeight(0);
  }, [shouldShowStoryBar, isMinimized, storyBarHeight, setStoreStoryBarHeight]);

  // 1 Hz tick for HUD timer elements
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // DEBUG — remove after routing confirmed
  useEffect(() => {
    console.log('[FreeRunOverlay NEW] mounted');
    return () => console.log('[FreeRunOverlay NEW] unmounted');
  }, []);

  return (
    <>
      {/* Story bar — drag handle for the outer motion.div (FreeRunLayer).
          Only rendered when there's a goal or navigation route to show.
          onPointerDown → dragControls.start(e) initiates the drag on the
          parent motion.div, making the entire TOP LAYER (AppMap + UI) move. */}
      {shouldShowStoryBar && (
        <div
          className="absolute top-0 left-0 right-0 z-10 pointer-events-auto"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            background: 'linear-gradient(to bottom, #fff 0%, #fff 72%, rgba(255,255,255,0.45) 86%, rgba(255,255,255,0) 100%)',
            paddingBottom: 20,
            touchAction: 'none',
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            dragControls.start(e);
          }}
        >
          <div ref={storyBarInnerRef} className="relative">
            <RunStoryBar isPaused={isPaused} />
            <div
              className="absolute left-3 top-3 pointer-events-none"
              aria-hidden="true"
            >
              <ChevronDown size={14} strokeWidth={2} style={{ color: '#000' }} />
            </div>
          </div>
        </div>
      )}

      {/* GPS toast */}
      {gpsToast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-[55] pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 62px)' }}
        >
          <div
            className="px-4 py-1.5 rounded-full text-xs font-bold text-white"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            dir="rtl"
          >
            {gpsToast}
          </div>
        </div>
      )}

      {/* Goal toast */}
      {showGoalToast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-[55] pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 62px)' }}
          role="status"
          aria-live="polite"
        >
          <div
            className="px-5 py-2 rounded-full text-sm font-black text-white"
            style={{ background: '#10B981', boxShadow: '0 4px 16px rgba(16,185,129,0.45)' }}
            dir="rtl"
          >
            🎯 הגעת ליעד!
          </div>
        </div>
      )}

      {/* SideRail — vertical participant strip, left side. Returns null when empty (solo). */}
      <SideRail
        participants={sideRailParticipants ?? []}
        storyBarHeight={storyBarHeight}
        onSelect={onSelectParticipant}
      />

      {/* MetricsDrawer — no lockToAnchor (laps controlled by FreeRunLayer).
          Render-prop per correction 3:
            dock  → MiniDock with RunMiniDockContent (isLapsOpen=false = no stop button)
            peek  → StatsCarousel / CommuteStatsCarousel */}
      {/* MetricsDrawer — onAnchorChange keeps metricsAnchor in sync so the
          floating WorkoutControlCluster can hide when the drawer is at dock. */}
      <MetricsDrawer
        defaultAnchor="peek"
        onAnchorChange={setMetricsAnchor}
        onOpenSettings={() => setIsSettingsOpen(true)}
      >
        {(anchor) =>
          anchor === 'dock' ? (
            <MiniDock>
              {/* isLapsOpen=false: no mini-map (map visible); controls shown inline */}
              <RunMiniDockContent isLapsOpen={false} />
            </MiniDock>
          ) : isCommute ? (
            <CommuteStatsCarousel />
          ) : (
            <StatsCarousel slides={drawerSlides} />
          )
        }
      </MetricsDrawer>

      {/* Floating cluster: hidden when MetricsDrawer is at dock — controls are
          then served inline by RunMiniDockContent inside the dock strip. */}
      {!metricsAtDock && <WorkoutControlCluster />}
      <LapSnapshotOverlay />
      <WorkoutSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}

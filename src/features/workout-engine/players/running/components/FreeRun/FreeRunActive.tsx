'use client';

/**
 * FreeRunActive — interaction model (v4)
 * ----------------------------------------
 * Exact replica of StrengthRunner's two-layer drag architecture:
 *
 *   BASE LAYER (z-49)  — RunLapsList: always at screen top, revealed when the
 *                        story-bar panel slides away (like the workout playlist).
 *   TOP LAYER (z-50)   — Story-bar motion.div: the draggable panel. Starts at y=0
 *                        covering the base layer. Dragging DOWN slides the bar
 *                        away, revealing the laps content beneath it.
 *   METRICS (z-40)     — MetricsDrawer bottom sheet (dock / peek).
 *
 * Drag mechanics (mirrors StrengthRunner exactly):
 *   motion.div drag="y", dragListener=false.
 *   Story-bar div: onPointerDown → lapsDragControls.start(e) — the drag handle.
 *   dragConstraints: { top: 0, bottom: lapsContentH }.
 *   onDragEnd: offset>30 or velocity>300 → open; offset<-50 or velocity<-400 → close.
 *   useAnimation controls the spring snap (stiffness 280/320, damping 28/32).
 *
 * When laps open: MetricsDrawer locks to dock (56 px black strip at bottom).
 * When navigation active: MetricsDrawer locks to peek.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDragControls } from 'framer-motion';
import { Square } from 'lucide-react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import RouteStoryBar from '../shared/RouteStoryBar';
import MetricsDrawer from '@/features/workout-engine/shared/components/MetricsDrawer';
import MiniDock from '@/features/workout-engine/shared/components/MiniDock';
import WorkoutFlowLayer from '@/features/workout-engine/shared/components/WorkoutFlowLayer';
import StatsCarousel from './StatsCarousel';
import CommuteStatsCarousel from '../Commute/CommuteStatsCarousel';
import RunLapsList from './RunLapsList';
import LapSnapshotOverlay from './LapSnapshotOverlay';
import WorkoutSettingsDrawer from './WorkoutSettingsDrawer';
import WorkoutControlCluster from './WorkoutControlCluster';
import InviteRunButton from './InviteRunButton';
import { useSessionGoalProgress } from '../../hooks/useSessionGoalProgress';
import { useGroupSessionGoal } from '../../hooks/useGroupSessionGoal';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { useT, type ReactTFunction } from '@/hooks/useT';
import { player, type PlayerKey } from '@/messages/ns/player';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STORY_BAR_FALLBACK_PX = 56;

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function goalLabel(type: 'distance' | 'time' | 'calories', t: ReactTFunction<PlayerKey>): string {
  switch (type) {
    case 'distance': return t('run.free.classic.goal.distance');
    case 'time':     return t('run.free.classic.goal.time');
    case 'calories': return t('run.free.classic.goal.calories');
  }
}

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

function formatGoalValue(p: {
  type: 'distance' | 'time' | 'calories';
  currentValue: number;
  targetValue: number;
}, t: ReactTFunction<PlayerKey>): string {
  switch (p.type) {
    case 'distance':
      return t('run.free.classic.goal.distanceValue', { current: p.currentValue.toFixed(2), target: p.targetValue.toFixed(1) });
    case 'time':
      return `${formatDuration(p.currentValue)} / ${formatDuration(p.targetValue)}`;
    case 'calories':
      return t('run.free.classic.goal.caloriesValue', { current: String(Math.round(p.currentValue)), target: String(Math.round(p.targetValue)) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RunMiniDockContent — content for the dock (56 px) anchor
// ─────────────────────────────────────────────────────────────────────────────

function RunMiniDockContent({ isLapsOpen }: { isLapsOpen: boolean }) {
  const t = useT(player);
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const totalDuration = useSessionStore((s) => s.totalDuration);
  const goalProgress = useSessionGoalProgress();

  const safeDistance = Number.isFinite(totalDistance) && totalDistance > 0 ? totalDistance : 0;

  const handleStop = useCallback(async () => {
    const { finishWorkout } = useRunningPlayer.getState();
    await finishWorkout();
  }, []);

  return (
    <div
      className="flex items-center h-full px-3 gap-2 w-full"
      style={{ fontFamily: 'var(--font-simpler)' }}
      dir="ltr"
    >
      {/* Stats — distance · time */}
      <div className="flex items-baseline gap-1 flex-shrink-0">
        <span className="text-xl font-black tabular-nums text-white leading-none">
          {safeDistance.toFixed(2)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#00ADEF]">
          KM
        </span>
      </div>
      <span className="text-white/40 text-sm">|</span>
      <span className="text-xl font-black tabular-nums text-white leading-none flex-shrink-0">
        {formatDuration(totalDuration)}
      </span>

      {/* Goal pill — middle */}
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stop button — only when laps panel is open (map covered) */}
      {isLapsOpen && (
        <button
          type="button"
          aria-label={t('run.free.classic.finish')}
          onClick={(e) => { e.stopPropagation(); handleStop(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: '#EF4444' }}
        >
          <Square size={14} fill="white" className="text-white" />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface FreeRunActiveProps {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onBack: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function FreeRunActive({ onBack: _onBack }: FreeRunActiveProps) {
  const t = useT(player);
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

  const goalProgress = useSessionGoalProgress();
  const sessionStatus = useSessionStore((s) => s.status);
  const isPaused = sessionStatus === 'paused';

  // Safety-clear: if FreeRun mounts while a group session is stored but no longer
  // active, remove the stale context (handles force-quit / abnormal exit from
  // a previous group run).
  useEffect(() => {
    const s = useSharedSession.getState();
    if (s.groupId && s.phase !== 'active') {
      s.clearGroupSession();
    }
  }, []);

  const shouldShowStoryBar = goalProgress !== null || isNavigationActive;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLapsOpen, setIsLapsOpen] = useState(false);

  // ── Laps panel drag — WorkoutFlowLayer owns animation + measurement ──────
  const lapsDragControls = useDragControls();
  const [lapsContentH, setLapsContentH] = useState(0);

  // Force-close laps when the story bar disappears (goal cleared mid-run).
  useEffect(() => {
    if (!shouldShowStoryBar) setIsLapsOpen(false);
  }, [shouldShowStoryBar]);

  // ── Goal-reached celebration ─────────────────────────────────────────────
  const prevIsCompleteRef = useRef(false);
  const [showGoalToast, setShowGoalToast] = useState(false);
  useEffect(() => {
    const isNowComplete = goalProgress?.isComplete ?? false;
    if (isNowComplete && !prevIsCompleteRef.current) {
      setShowGoalToast(true);
      const timer = setTimeout(() => setShowGoalToast(false), 3000);
      prevIsCompleteRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!isNowComplete) prevIsCompleteRef.current = false;
  }, [goalProgress?.isComplete]);

  // ── GPS status toast ─────────────────────────────────────────────────────
  const [gpsToast, setGpsToast] = useState<PlayerKey | null>(null);
  const prevGpsStatusRef = useRef(gpsStatus);
  useEffect(() => {
    if (gpsStatus === prevGpsStatusRef.current) return;
    prevGpsStatusRef.current = gpsStatus;
    if (gpsStatus === 'searching')        setGpsToast('run.free.classic.gps.searching');
    else if (gpsStatus === 'poor')        setGpsToast('run.free.classic.gps.poor');
    else if (gpsStatus === 'good' || gpsStatus === 'perfect') setGpsToast('run.free.classic.gps.good');
  }, [gpsStatus]);
  useEffect(() => {
    if (!gpsToast) return;
    const timer = setTimeout(() => setGpsToast(null), 4000);
    return () => clearTimeout(timer);
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

  // When laps are open the story bar has moved down — pad the map camera for both layers.
  useEffect(() => {
    const h = shouldShowStoryBar
      ? (isLapsOpen ? storyBarHeight + lapsContentH : storyBarHeight)
      : 0;
    setStoreStoryBarHeight(h);
    return () => setStoreStoryBarHeight(0);
  }, [shouldShowStoryBar, isLapsOpen, storyBarHeight, lapsContentH, setStoreStoryBarHeight]);

  // Publish laps-open state to MapStore so TurnCarousel can hide itself.
  const setStoreIsLapsOpen = useMapStore((s) => s.setIsLapsOpen);
  useEffect(() => {
    console.log('[FreeRunActive] isLapsOpen →', isLapsOpen, '(guided-route path)');
    setStoreIsLapsOpen(isLapsOpen);
    return () => setStoreIsLapsOpen(false);
  }, [isLapsOpen, setStoreIsLapsOpen]);

  // MetricsDrawer lock: laps open → dock, navigation → peek, else free.
  const drawerLock: string | null =
    isLapsOpen ? 'dock'
    : isNavigationActive ? 'peek'
    : null;

  // 1 Hz tick for HUD timer elements.
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // DEBUG — remove after routing confirmed
  useEffect(() => {
    console.log('[FreeRunActive OLD] mounted — should NOT appear during free_run mode');
    return () => console.log('[FreeRunActive OLD] unmounted');
  }, []);

  return (
    <div
      className="absolute inset-0 z-40 overflow-hidden pointer-events-none"
      style={{ fontFamily: 'var(--font-simpler)' }}
      aria-label={isNavigationActive ? t('run.free.classic.aria.guided') : t('run.free.classic.aria.free')}
      role="region"
    >
      {/*
        ── LAPS PANEL + STORY BAR ───────────────────────────────────────────
        Two-layer architecture mirrors StrengthRunner exactly:

          BASE (z-49): RunLapsList — positioned at screen top, always rendered.
                       Covered by the story bar motion.div when laps are closed.
          TOP  (z-50): motion.div story bar — the draggable element.
                       At y=0: covers the laps (story bar is at top). Normal state.
                       At y=lapsContentH: story bar has slid DOWN, laps are fully visible.

        The story bar div inside the motion.div is the drag handle:
          onPointerDown → lapsDragControls.start(e)  (skips button targets)
      */}
      {shouldShowStoryBar && (
        <>
          {/* WorkoutFlowLayer — notification-shade: RunLapsList behind story bar */}
          <WorkoutFlowLayer
            isOpen={isLapsOpen}
            onClose={() => setIsLapsOpen(false)}
            onOpen={() => setIsLapsOpen(true)}
            externalDragControls={lapsDragControls}
            revealContent={<RunLapsList />}
            onRevealHeightChange={setLapsContentH}
          >
            {/* Drag handle — story bar; motion.div owns top: safe-area so no padding here */}
            <div
              className="pointer-events-auto"
              style={{ background: '#ffffff', touchAction: 'none' }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                lapsDragControls.start(e);
              }}
            >
              <div ref={storyBarInnerRef}>
                <RouteStoryBar
                  progress={
                    goalProgress
                      ? goalProgress.isComplete
                        ? Math.min(goalProgress.rawRatio, 1.05)
                        : Math.max(0.01, goalProgress.progress)
                      : 0.01
                  }
                  color={goalProgress?.isComplete ? '#10B981' : undefined}
                  allowOverflow={goalProgress?.isComplete}
                  isPaused={isPaused}
                  label={
                    goalProgress?.isComplete
                      ? t('run.free.classic.goal.beyond')
                      : goalProgress ? goalLabel(goalProgress.type, t) : t('run.free.classic.goal.distance')
                  }
                  valueText={goalProgress ? formatGoalValue(goalProgress, t) : ''}
                />
              </div>
            </div>
          </WorkoutFlowLayer>

          {/* Toasts — z-[55], above WorkoutFlowLayer */}
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
                {t(gpsToast)}
              </div>
            </div>
          )}

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
                {t('run.free.classic.goalReached')}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── METRICS DRAWER (z-40) ────────────────────────────────────────────
          Locks to dock when laps open, to peek during navigation, else free. */}
      <MetricsDrawer
        lockToAnchor={drawerLock}
        defaultAnchor="peek"
        onOpenSettings={() => setIsSettingsOpen(true)}
      >
        {(anchor) =>
          anchor === 'dock' ? (
            <MiniDock>
              <RunMiniDockContent isLapsOpen={isLapsOpen} />
            </MiniDock>
          ) : isCommute ? (
            <CommuteStatsCarousel />
          ) : (
            <StatsCarousel />
          )
        }
      </MetricsDrawer>

      <InviteRunButton />
      <WorkoutControlCluster />
      <LapSnapshotOverlay />
      <WorkoutSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

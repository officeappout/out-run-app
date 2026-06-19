'use client';

/**
 * FreeRunActive — interaction model (v2)
 * ----------------------------------------
 * Mirrors StrengthRunner's two-layer architecture:
 *
 *   BASE LAYER  — MapShell (map, always visible below everything)
 *   TOP LAYER   — MetricsDrawer bottom sheet (slides between dock/peek/full)
 *   FLOW LAYER  — RunLapsList (slides DOWN from top when triggered)
 *
 * Drag mechanics:
 *   MetricsDrawer:  grabber at sheet top → drag UP/DOWN → dock/peek/full
 *   WorkoutFlowLayer: handle below story bar → tap → laps slide down
 *   When FlowLayer open: MetricsDrawer locks to dock (56 px strip)
 *
 * Navigation (guided route):
 *   isNavigationActive → MetricsDrawer locks to 'peek' (same as original
 *   lockToBottom: never cover TurnCarousel at top).
 *
 * No bottom nav tabs — removed. FlowLayer trigger replaces laps tab.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import RouteStoryBar from '../shared/RouteStoryBar';
import MetricsDrawer from '@/features/workout-engine/shared/components/MetricsDrawer';
import WorkoutFlowLayer from '@/features/workout-engine/shared/components/WorkoutFlowLayer';
import MiniDock from '@/features/workout-engine/shared/components/MiniDock';
import StatsCarousel from './StatsCarousel';
import CommuteStatsCarousel from '../Commute/CommuteStatsCarousel';
import RunLapsList from './RunLapsList';
import LapSnapshotOverlay from './LapSnapshotOverlay';
import WorkoutSettingsDrawer from './WorkoutSettingsDrawer';
import WorkoutControlCluster from './WorkoutControlCluster';
import { useSessionGoalProgress } from '../../hooks/useSessionGoalProgress';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STORY_BAR_FALLBACK_PX = 56;

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function goalLabel(type: 'distance' | 'time' | 'calories'): string {
  switch (type) {
    case 'distance': return 'מרחק';
    case 'time':     return 'זמן';
    case 'calories': return 'קלוריות';
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
}): string {
  switch (p.type) {
    case 'distance':
      return `${p.currentValue.toFixed(2)} / ${p.targetValue.toFixed(1)} ק״מ`;
    case 'time':
      return `${formatDuration(p.currentValue)} / ${formatDuration(p.targetValue)}`;
    case 'calories':
      return `${Math.round(p.currentValue)} / ${Math.round(p.targetValue)} קק״ל`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RunMiniDockContent — content for the dock (56 px) anchor
// ─────────────────────────────────────────────────────────────────────────────

function RunMiniDockContent() {
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const totalDuration = useSessionStore((s) => s.totalDuration);
  const goalProgress = useSessionGoalProgress();

  const safeDistance = Number.isFinite(totalDistance) && totalDistance > 0 ? totalDistance : 0;

  return (
    <div
      className="flex items-center h-full px-4 gap-2 w-full"
      style={{ fontFamily: 'var(--font-simpler)' }}
      dir="ltr"
    >
      {/* Distance */}
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-black tabular-nums text-white leading-none">
          {safeDistance.toFixed(2)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#00ADEF]">
          KM
        </span>
      </div>

      <span className="text-white/40 mx-1 text-sm">|</span>

      {/* Duration */}
      <span className="text-xl font-black tabular-nums text-white leading-none">
        {formatDuration(totalDuration)}
      </span>

      {/* Goal pill */}
      {goalProgress && goalProgress.progress > 0 && (
        <div
          className="ml-auto flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black"
          style={{
            background: goalProgress.isComplete ? '#10B981' : 'rgba(255,255,255,0.15)',
            color: goalProgress.isComplete ? '#fff' : '#00ADEF',
          }}
        >
          {Math.round(goalProgress.progress * 100)}%
        </div>
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
  const gpsStatus = useRunningPlayer((s) => s.gpsStatus);
  const sessionMode = useRunningPlayer((s) => s.sessionMode);
  const isCommute = sessionMode === 'commute';

  // Two-source navigation intent: earliest possible signal.
  const isNavigationActive = useRunningPlayer(
    (s) =>
      !!s.guidedRouteId ||
      (Array.isArray(s.activeRoutePath) && s.activeRoutePath.length >= 2),
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFlowLayerOpen, setIsFlowLayerOpen] = useState(false);

  const goalProgress = useSessionGoalProgress();
  const sessionStatus = useSessionStore((s) => s.status);
  const isPaused = sessionStatus === 'paused';

  // ── Goal-reached celebration ────────────────────────────────────────────
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

  const shouldShowStoryBar = goalProgress !== null || isNavigationActive;

  // ── GPS status toast ────────────────────────────────────────────────────
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

  // ── Dynamic story-bar height ─────────────────────────────────────────────
  const storyBarInnerRef = useRef<HTMLDivElement>(null);
  const [storyBarHeight, setStoryBarHeight] = useState(STORY_BAR_FALLBACK_PX);
  const setStoreStoryBarHeight = useMapStore((s) => s.setStoryBarHeight);
  useEffect(() => {
    const node = storyBarInnerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (Number.isFinite(h) && h > 0) {
        const rounded = Math.round(h);
        setStoryBarHeight(rounded);
        setStoreStoryBarHeight(rounded);
      }
    });
    observer.observe(node);
    return () => { observer.disconnect(); setStoreStoryBarHeight(0); };
  }, [setStoreStoryBarHeight]);

  // ── FlowLayer open/close ─────────────────────────────────────────────────
  const handleFlowLayerOpen = useCallback(() => setIsFlowLayerOpen(true), []);
  const handleFlowLayerClose = useCallback(() => setIsFlowLayerOpen(false), []);

  // MetricsDrawer lock priority: FlowLayer > navigation > free
  const drawerLock: string | null =
    isFlowLayerOpen ? 'dock'
    : isNavigationActive ? 'peek'
    : null;

  // FlowLayer topOffset — below safe-area + story bar.
  const flowLayerTopOffset = shouldShowStoryBar
    ? `calc(env(safe-area-inset-top, 0px) + ${storyBarHeight}px)`
    : 'env(safe-area-inset-top, 0px)';

  // 1 Hz tick for HUD timer elements.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="absolute inset-0 z-40 overflow-hidden pointer-events-none"
      style={{ fontFamily: 'var(--font-simpler)' }}
      aria-label={isNavigationActive ? 'מסלול מודרך' : 'אימון חופשי'}
      role="region"
    >
      {/* ── STORY BAR (z-50) ───────────────────────────────────────────────── */}
      {shouldShowStoryBar && (
        <>
          <div
            className="absolute top-0 left-0 right-0 z-50 pointer-events-none"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)', background: '#ffffff' }}
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
                    ? 'מעבר ליעד'
                    : goalProgress ? goalLabel(goalProgress.type) : 'מרחק'
                }
                valueText={goalProgress ? formatGoalValue(goalProgress) : ''}
              />
            </div>
          </div>

          {/* Fade strip */}
          <div
            className="absolute left-0 right-0 z-50 pointer-events-none"
            style={{
              top: `calc(env(safe-area-inset-top, 0px) + ${storyBarHeight}px)`,
              height: 18,
              background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)',
            }}
            aria-hidden="true"
          />

          {/* GPS toast */}
          {gpsToast && (
            <div
              className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none"
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

          {/* Goal-reached toast */}
          {showGoalToast && (
            <div
              className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none"
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
        </>
      )}

      {/* ── FLOW LAYER (z-45): RunLapsList slides down from top ─────────────
          The trigger (laps handle) is always visible just below the story
          bar. Tapping it opens the full laps list over the map. When open,
          MetricsDrawer locks to dock so the two surfaces never overlap. */}
      <WorkoutFlowLayer
        isOpen={isFlowLayerOpen}
        onClose={handleFlowLayerClose}
        topOffset={flowLayerTopOffset}
        trigger={
          <LapsHandle
            isOpen={isFlowLayerOpen}
            onOpen={handleFlowLayerOpen}
            onClose={handleFlowLayerClose}
          />
        }
      >
        {/* Constrain laps list so it never covers the dock */}
        <div
          style={{
            paddingTop: 8,
            paddingBottom: 8,
            maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 56px - 56px)',
            overflowY: 'auto',
          }}
        >
          <RunLapsList />
        </div>
      </WorkoutFlowLayer>

      {/* ── METRICS DRAWER (z-40): real bottom sheet ──────────────────────────
          absolute inset-0, translateY drives visible area from top edge to
          screen bottom. dragListener=false — drag only from grabber/strip.
          When docked: only 56 px (RunMiniDockContent) visible at bottom.
          When full: sheet covers from story-bar down to screen bottom. */}
      <MetricsDrawer
        topBarOffset={shouldShowStoryBar ? storyBarHeight : 0}
        lockToAnchor={drawerLock}
        defaultAnchor="peek"
        onOpenSettings={() => setIsSettingsOpen(true)}
      >
        {(anchor) =>
          anchor === 'dock' ? (
            <MiniDock>
              <RunMiniDockContent />
            </MiniDock>
          ) : isCommute ? (
            <CommuteStatsCarousel />
          ) : (
            <StatsCarousel />
          )
        }
      </MetricsDrawer>

      {/* ── PRIMARY CONTROLS ──────────────────────────────────────────────── */}
      <WorkoutControlCluster />

      {/* ── GLOBAL OVERLAYS ───────────────────────────────────────────────── */}
      <LapSnapshotOverlay />
      <WorkoutSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LapsHandle — the drag/tap affordance just below the story bar.
// When closed: dark pill "הקפות ▼" hint.
// When open: lighter close handle at the bottom of the laps panel.
// ─────────────────────────────────────────────────────────────────────────────

function LapsHandle({
  isOpen,
  onOpen,
  onClose,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 px-3 py-1 rounded-full pointer-events-auto active:scale-95 transition-all"
      style={{
        background: isOpen ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)',
        backdropFilter: isOpen ? undefined : 'blur(8px)',
        WebkitBackdropFilter: isOpen ? undefined : 'blur(8px)',
        boxShadow: isOpen ? '0 1px 8px rgba(0,0,0,0.12)' : undefined,
      }}
      onClick={isOpen ? onClose : onOpen}
      aria-label={isOpen ? 'סגור הקפות' : 'פתח הקפות'}
    >
      <span
        className="text-xs font-bold tracking-wide"
        style={{ color: isOpen ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)', direction: 'rtl' }}
      >
        הקפות
      </span>
      <ChevronDown
        size={12}
        style={{
          color: isOpen ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.7)',
          transform: isOpen ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s ease',
        }}
      />
    </button>
  );
}

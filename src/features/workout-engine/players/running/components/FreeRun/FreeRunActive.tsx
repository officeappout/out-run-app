'use client';

/**
 * FreeRunActive — orchestration shell (post-LEGO refactor)
 * ---------------------------------------------------------
 * Composes the 5 shared LEGO bricks for free-run and walk sessions:
 *
 *   StoryProgressBar  → RouteStoryBar (above the drawer)
 *   WorkoutCanvas     → MapShell (unchanged, map extends to top)
 *   useSheetDrag      → inside MetricsDrawer
 *   MetricsDrawer     → replaces AdaptiveMetricsWrapper
 *   WorkoutFlowLayer  → replaces the laps full-screen overlay
 *   MiniDock          → rendered as dock content inside MetricsDrawer
 *
 * This file is the "thin conductor" — no drag logic, no snap math, no
 * layout constants. All of that lives in the shared bricks.
 *
 * Laps tab: now opens WorkoutFlowLayer from the top (slide-down) instead
 * of replacing the map view. MetricsDrawer auto-locks to 'dock' when the
 * FlowLayer is open so the two surfaces never overlap.
 *
 * PlannedRunActive and StrengthRunner are intentionally untouched.
 */

import { useEffect, useRef, useState } from 'react';
import { Map, List } from 'lucide-react';
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
import { BOTTOM_NAV_HEIGHT_PX } from '../../hooks/useDraggableMetrics';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STORY_BAR_FALLBACK_PX = 56;
const PRIMARY = '#0EA5E9';
const PRIMARY_DARK = '#0284C7';
const DEFAULT_NUM = '#000000';
const DEFAULT_ACCENT = '#00ADEF';

// ─────────────────────────────────────────────────────────────────────────────
// Formatters (kept co-located — no Hebrew in shared components)
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
// RunMiniDockContent — pill content for the dock anchor
// ─────────────────────────────────────────────────────────────────────────────

function RunMiniDockContent() {
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const totalDuration = useSessionStore((s) => s.totalDuration);
  const goalProgress = useSessionGoalProgress();

  const safeDistance = Number.isFinite(totalDistance) && totalDistance > 0 ? totalDistance : 0;

  return (
    <div
      className="flex items-center h-[56px] px-4 gap-2 w-full"
      style={{ fontFamily: 'var(--font-simpler)' }}
      dir="ltr"
    >
      {/* Distance */}
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-black tabular-nums text-white leading-none">
          {safeDistance.toFixed(2)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: DEFAULT_ACCENT }}>
          KM
        </span>
      </div>

      <span className="text-white/40 mx-1 text-sm">|</span>

      {/* Duration */}
      <span className="text-xl font-black tabular-nums text-white leading-none">
        {formatDuration(totalDuration)}
      </span>

      {/* Optional goal pill */}
      {goalProgress && goalProgress.progress > 0 && (
        <div
          className="ml-auto flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black"
          style={{
            background: goalProgress.isComplete ? '#10B981' : 'rgba(255,255,255,0.15)',
            color: goalProgress.isComplete ? '#fff' : DEFAULT_ACCENT,
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

  // Two-source navigation intent check (see original file header docs).
  const isNavigationActive = useRunningPlayer(
    (s) =>
      !!s.guidedRouteId ||
      (Array.isArray(s.activeRoutePath) && s.activeRoutePath.length >= 2),
  );

  // Local UI state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFlowLayerOpen, setIsFlowLayerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'laps'>('map');

  // Goal progress — drives the floating story bar.
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
    if (!isNowComplete) {
      prevIsCompleteRef.current = false;
    }
  }, [goalProgress?.isComplete]);

  // ── Story bar visibility ────────────────────────────────────────────────
  const shouldShowStoryBar = goalProgress !== null || isNavigationActive;

  // ── GPS status toast ────────────────────────────────────────────────────
  const [gpsToast, setGpsToast] = useState<string | null>(null);
  const prevGpsStatusRef = useRef(gpsStatus);
  useEffect(() => {
    if (gpsStatus === prevGpsStatusRef.current) return;
    prevGpsStatusRef.current = gpsStatus;
    if (gpsStatus === 'searching')         setGpsToast('מחפש GPS…');
    else if (gpsStatus === 'poor')         setGpsToast('GPS חלש — ממשיך לחפש');
    else if (gpsStatus === 'good' || gpsStatus === 'perfect') setGpsToast('GPS תקין ✓');
  }, [gpsStatus]);
  useEffect(() => {
    if (!gpsToast) return;
    const t = setTimeout(() => setGpsToast(null), 4000);
    return () => clearTimeout(t);
  }, [gpsToast]);

  // ── Dynamic story-bar height ────────────────────────────────────────────
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

  // ── Laps tab → WorkoutFlowLayer ─────────────────────────────────────────
  const handleLapsTab = () => {
    setActiveTab('laps');
    setIsFlowLayerOpen(true);
  };
  const handleMapTab = () => {
    setActiveTab('map');
    setIsFlowLayerOpen(false);
  };
  const handleFlowLayerClose = () => {
    setIsFlowLayerOpen(false);
    setActiveTab('map');
  };

  // Lock MetricsDrawer during FlowLayer (dock only) or navigation (peek).
  const drawerLock: string | null =
    isFlowLayerOpen ? 'dock'
    : isNavigationActive ? 'peek'
    : null;

  // 1 Hz tick for timer-derived HUD elements (matches original approach).
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
      {/* ── STORY BAR ─────────────────────────────────────────────────────── */}
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
                    : goalProgress
                    ? goalLabel(goalProgress.type)
                    : 'מרחק'
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
                style={{
                  background: 'rgba(0,0,0,0.72)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  letterSpacing: '0.01em',
                }}
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
                style={{
                  background: '#10B981',
                  boxShadow: '0 4px 16px rgba(16,185,129,0.45)',
                  letterSpacing: '0.01em',
                }}
                dir="rtl"
              >
                🎯 הגעת ליעד!
              </div>
            </div>
          )}
        </>
      )}

      {/* ── WORKOUT FLOW LAYER (laps slide-down) ──────────────────────────── */}
      <WorkoutFlowLayer
        isOpen={isFlowLayerOpen}
        onClose={handleFlowLayerClose}
        triggerLabel="הקפות"
        topOffset={
          shouldShowStoryBar
            ? `calc(env(safe-area-inset-top, 0px) + ${storyBarHeight}px)`
            : 'env(safe-area-inset-top, 0px)'
        }
      >
        <div
          style={{
            paddingTop: 12,
            paddingBottom: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <RunLapsList />
        </div>
      </WorkoutFlowLayer>

      {/* ── METRICS DRAWER (replaces AdaptiveMetricsWrapper) ───────────────── */}
      <MetricsDrawer
        topBarOffset={shouldShowStoryBar ? storyBarHeight : 0}
        lockToAnchor={drawerLock}
        defaultAnchor="peek"
        onOpenSettings={() => setIsSettingsOpen(true)}
      >
        {(anchor) =>
          anchor === 'dock' ? (
            <MiniDock onExpand={() => { /* MetricsDrawer handles snap internally */ }}>
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

      {/* ── BOTTOM NAV ────────────────────────────────────────────────────── */}
      <nav
        className="absolute bottom-0 left-0 right-0 z-30 flex pointer-events-auto bg-white"
        style={{
          minHeight: `${BOTTOM_NAV_HEIGHT_PX}px`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          borderTop: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 -2px 16px rgba(0, 0, 0, 0.06)',
        }}
      >
        <button
          onClick={handleMapTab}
          className="relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] active:bg-black/5 transition-colors"
        >
          {activeTab === 'map' && (
            <span
              className="absolute top-0 left-[25%] right-[25%] h-[2px] rounded-b-full"
              style={{ background: PRIMARY }}
            />
          )}
          <Map
            size={22}
            style={{ color: activeTab === 'map' ? PRIMARY_DARK : 'rgba(0,0,0,0.45)' }}
          />
          <span
            className="font-medium text-xs"
            style={{ color: activeTab === 'map' ? PRIMARY_DARK : 'rgba(0,0,0,0.45)' }}
          >
            מפה
          </span>
        </button>

        <button
          onClick={handleLapsTab}
          className="relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] active:bg-black/5 transition-colors"
        >
          {activeTab === 'laps' && (
            <span
              className="absolute top-0 left-[25%] right-[25%] h-[2px] rounded-b-full"
              style={{ background: PRIMARY }}
            />
          )}
          <List
            size={22}
            className="rotate-90"
            style={{ color: activeTab === 'laps' ? PRIMARY_DARK : 'rgba(0,0,0,0.45)' }}
          />
          <span
            className="font-medium text-xs"
            style={{ color: activeTab === 'laps' ? PRIMARY_DARK : 'rgba(0,0,0,0.45)' }}
          >
            הקפות
          </span>
        </button>
      </nav>

      {/* Global overlays */}
      <LapSnapshotOverlay />
      <WorkoutSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

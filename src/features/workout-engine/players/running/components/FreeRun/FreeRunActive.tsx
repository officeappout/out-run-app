'use client';

/**
 * FreeRunActive — orchestration shell
 * -----------------------------------
 * After the modularisation refactor + chrome de-clutter, this file does
 * ONE thing: lay out the active-workout chrome (floating settings / GPS
 * pill / map slot / bottom nav) and slot in the right view for the
 * current player state. Everything else has its own home:
 *
 *   • Drag + snap state machine          → `useDraggableMetrics.ts`
 *   • Metrics card layout + overlap fix  → `AdaptiveMetricsWrapper.tsx`
 *   • Coordinate validation              → `src/utils/geoValidation.ts`
 *   • Pause / Stop / Lap controls        → `<SessionControlBar />`
 *                                          (mounted globally by MapShell)
 *
 * Chrome philosophy ("Maximise map visibility"):
 *   The opaque white header that USED to occupy the top of this view
 *   was removed in the de-clutter pass — the map now extends to the
 *   very top of the screen (behind the status bar). The two top-bar
 *   actions migrated as follows:
 *
 *     • Settings → MOVED INSIDE the metrics card (top-right corner of
 *                  AdaptiveMetricsWrapper). Centralising the gear with
 *                  the numbers it controls eliminates the floating-icon
 *                  density on the map and keeps every mid-workout
 *                  control on a single surface that the user can drag
 *                  to either the top or the bottom of the screen.
 *     • Back     → REMOVED. The user exits the workout via the global
 *                  SessionControlBar's stop button (mounted by MapShell).
 *                  Removing the duplicate eliminates a confusing UI
 *                  fork ("which button leaves the workout?").
 *
 *   The `onBack` prop is kept on the component signature for back-compat
 *   with FreeRunPaused (which still uses it) — it is intentionally
 *   unused by this active view.
 *
 * Layout source of truth:
 *   `isNavigationActive` is the SINGLE clean derived state that drives
 *   every layout decision in this subtree. It fires the moment the user
 *   has SELECTED a route (intent), not when the path finishes drawing,
 *   so the metrics card is already at the bottom by the time the polyline
 *   appears. Two-source check:
 *
 *     1. `guidedRouteId` — set by useWorkoutSession the instant the
 *        focused route is bound to the workout. This is the EARLIEST
 *        intent signal: it goes non-null BEFORE the path is published,
 *        and stays non-null across deviation reroutes (the id refers to
 *        the official route the user committed to).
 *     2. `activeRoutePath.length >= 2` — fallback for the rare case
 *        where the path is published without a route id (e.g. a purely
 *        synthetic generated route during free-run mode).
 *
 *   OR-ing the two means: as soon as EITHER fires, the layout flips to
 *   bottom. As long as EITHER stays true, the layout stays at bottom.
 *
 * Light theme only — solid white surfaces, black numbers, app-primary
 * cyan/blue accents. With the Settings gear now living inside the
 * metrics card, there are no permanent floating buttons on the map at
 * all — only the live pulse dot (top-left), the GPS pill (top-centre),
 * and the global SessionControlBar.
 *
 * `PlannedRunActive.tsx` is a separate component for guided workouts
 * and is INTENTIONALLY untouched by this refactor.
 */

import { useEffect, useState } from 'react';
import { Map, List } from 'lucide-react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import GpsIndicator from '@/features/workout-engine/components/GpsIndicator';
import RouteStoryBar from '../shared/RouteStoryBar';
import AdaptiveMetricsWrapper from './AdaptiveMetricsWrapper';
import RunLapsList from './RunLapsList';
import LapSnapshotOverlay from './LapSnapshotOverlay';
import WorkoutSettingsDrawer from './WorkoutSettingsDrawer';
import WorkoutControlCluster from './WorkoutControlCluster';
import { useSessionGoalProgress } from '../../hooks/useSessionGoalProgress';
import { BOTTOM_NAV_HEIGHT_PX } from '../../hooks/useDraggableMetrics';

// ── Story-bar header height ──────────────────────────────────────────────────
// The white header strip that holds the RouteStoryBar sits above the
// draggable metrics card. Its content below env(safe-area-inset-top) is:
//   • Top info row (pulse dot + GPS pill): ~28 px
//   • RouteStoryBar (pt-3 + labels row + 12 px bar + pb-2): ~52 px
// Total: 80 px. This constant is fed into useDraggableMetrics so the
// card's top snap sits flush below the header, never behind it.
const STORY_BAR_HEADER_BELOW_SAFE_AREA_PX = 80;

const PRIMARY = '#0EA5E9';
const PRIMARY_DARK = '#0284C7';

// ── Goal-bar formatters ──────────────────────────────────────────────────────
// Kept here so RouteStoryBar stays a generic component with no Hebrew.

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

interface FreeRunActiveProps {
  /**
   * Back-compat hook for FreeRunPaused (sibling view that DOES expose a
   * "back to map" CTA). Intentionally unused by this active view — the
   * top header was stripped to maximise map visibility, and the Stop
   * action lives on the global SessionControlBar.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onBack: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function FreeRunActive({ onBack: _onBack }: FreeRunActiveProps) {
  const playerView = useRunningPlayer((s) => s.view);
  const setPlayerView = useRunningPlayer((s) => s.setView);
  const gpsAccuracy = useRunningPlayer((s) => s.gpsAccuracy);
  const gpsStatus = useRunningPlayer((s) => s.gpsStatus);

  // ── Single clean derived state for layout ────────────────────────────────
  // Two-source intent check (see file-header docs). The OR catches the
  // earliest possible signal — `guidedRouteId` flips first because
  // useWorkoutSession sets it BEFORE setActiveRoutePath, eliminating the
  // 150 ms race where the card used to flicker through 'top' before
  // snapping down. Returns a primitive boolean so the component re-renders
  // ONLY when the answer flips, not on every routeCoords push.
  const isNavigationActive = useRunningPlayer(
    (s) =>
      !!s.guidedRouteId ||
      (Array.isArray(s.activeRoutePath) && s.activeRoutePath.length >= 2),
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Goal progress — drives the header story bar.
  const goalProgress = useSessionGoalProgress();
  const sessionStatus = useSessionStore((s) => s.status);
  const isPaused = sessionStatus === 'paused';

  // Force re-render each second to keep any timer-derived UI live.
  // (StatsCarousel reads from useSessionStore directly; this tick is for
  // derived UI that hasn't been ported to a store yet — kept small to
  // avoid waste.)
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="absolute inset-0 z-20 overflow-hidden pointer-events-none"
      style={{ fontFamily: 'var(--font-simpler)' }}
      // Title is now expressed semantically via the live region below
      // since the visible header is gone — keeps screen readers informed
      // about the current workout mode without taking pixels from the map.
      aria-label={isNavigationActive ? 'מסלול מודרך' : 'אימון חופשי'}
      role="region"
    >
      {/* ── STORY BAR HEADER ─────────────────────────────────────────────────
          Mirrors the `<header>` in PlannedRunActive exactly:
            • z-40 — always above the draggable card (z-20)
            • bg-white — same surface as the card so they merge when the
              card is at its top snap, creating a seamless unified panel
            • paddingTop: safe-area — respects the notch / Dynamic Island
            • boxShadow — the same downward glow PlannedRunActive's stats
              card uses; gives the "floating header" look without a hard edge
          Contains:
            • Info row (pulse dot left, GPS pill right) — visual HUD
            • RouteStoryBar — goal progress, always visible for debugging
              (gate on `goalProgress &&` once verified working)
          pointer-events-none: the header is display-only; all taps pass
          through to the map. */}
      {playerView === 'main' && (
        <div
          className="absolute top-0 left-0 right-0 z-40 bg-white pointer-events-none"
          style={{
            boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
          }}
        >
          {/* Info row: pulse dot (left) + GPS (right) */}
          <div
            className="flex items-center justify-between px-4"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)', paddingBottom: 2 }}
            aria-hidden="true"
          >
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ background: PRIMARY, boxShadow: `0 0 10px ${PRIMARY}` }}
            />
            <GpsIndicator accuracy={gpsAccuracy} status={gpsStatus} />
          </div>

          {/* Goal progress bar — DEBUG: always shown at 50 % fallback.
              Restore `goalProgress &&` gate after confirming it renders. */}
          <RouteStoryBar
            progress={goalProgress ? goalProgress.progress : 0.5}
            isPaused={isPaused}
            label={goalProgress ? goalLabel(goalProgress.type) : 'מרחק'}
            valueText={goalProgress ? formatGoalValue(goalProgress) : '2.50 / 5.0 ק״מ'}
          />
        </div>
      )}

      {/* ── LAPS LIST — light overlay, scrollable. ───────────────────────── */}
      {playerView === 'laps' && (
        <div
          className="absolute inset-0 z-10 pointer-events-auto bg-white"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            paddingBottom: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <RunLapsList />
        </div>
      )}

      {/* ── MAP VIEW: smart, draggable metrics card ──────────────────────── */}
      {playerView === 'main' && (
        <AdaptiveMetricsWrapper
          isNavigationActive={isNavigationActive}
          onOpenSettings={() => setIsSettingsOpen(true)}
          topBarOffset={STORY_BAR_HEADER_BELOW_SAFE_AREA_PX}
        />
      )}

      {/* ── PRIMARY CONTROLS: circular Lap / Pause / Stop cluster ────────
          Replaces the global SessionControlBar for free-run sessions
          (suppressed in MapShell by `runMode !== 'free' && runMode !==
          'my_routes'`). Long-press for Pause + Stop matches the
          structured-workout language in PlannedRunActive so the user
          builds one mental model for "destructive action = hold to
          confirm". The Lap button stays single-tap (a missed lap is
          cheap; a stopped workout is not). */}
      {playerView === 'main' && <WorkoutControlCluster />}

      {/* ── BOTTOM NAV — solid white, hairline divider ───────────────────── */}
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
          onClick={() => setPlayerView('main')}
          className="relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] active:bg-black/5 transition-colors"
        >
          {playerView === 'main' && (
            <span
              className="absolute top-0 left-[25%] right-[25%] h-[2px] rounded-b-full"
              style={{ background: PRIMARY }}
            />
          )}
          <Map
            size={22}
            style={{ color: playerView === 'main' ? PRIMARY_DARK : 'rgba(0,0,0,0.45)' }}
          />
          <span
            className="font-medium text-xs"
            style={{ color: playerView === 'main' ? PRIMARY_DARK : 'rgba(0,0,0,0.45)' }}
          >
            מפה
          </span>
        </button>

        <button
          onClick={() => setPlayerView('laps')}
          className="relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] active:bg-black/5 transition-colors"
        >
          {playerView === 'laps' && (
            <span
              className="absolute top-0 left-[25%] right-[25%] h-[2px] rounded-b-full"
              style={{ background: PRIMARY }}
            />
          )}
          <List
            size={22}
            className="rotate-90"
            style={{ color: playerView === 'laps' ? PRIMARY_DARK : 'rgba(0,0,0,0.45)' }}
          />
          <span
            className="font-medium text-xs"
            style={{ color: playerView === 'laps' ? PRIMARY_DARK : 'rgba(0,0,0,0.45)' }}
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

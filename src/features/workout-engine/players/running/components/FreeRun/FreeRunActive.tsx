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

import { useEffect, useRef, useState } from 'react';
import { Map, List } from 'lucide-react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import RouteStoryBar from '../shared/RouteStoryBar';
import AdaptiveMetricsWrapper from './AdaptiveMetricsWrapper';
import RunLapsList from './RunLapsList';
import LapSnapshotOverlay from './LapSnapshotOverlay';
import WorkoutSettingsDrawer from './WorkoutSettingsDrawer';
import WorkoutControlCluster from './WorkoutControlCluster';
import { useSessionGoalProgress } from '../../hooks/useSessionGoalProgress';
import { BOTTOM_NAV_HEIGHT_PX } from '../../hooks/useDraggableMetrics';

// ── Story-bar floating height ────────────────────────────────────────────────
// Previously this was a hardcoded constant (56 px). It is now measured at
// runtime via a ResizeObserver on the inner RouteStoryBar wrapper so that any
// future layout change to the bar is automatically reflected in the metrics
// card's top snap position. The constant is kept as the initial/fallback value
// for the first render (before the observer fires) so the snap is never wrong
// by more than one frame.
const STORY_BAR_FALLBACK_PX = 56;

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

  // Goal progress — drives the floating story bar.
  const goalProgress = useSessionGoalProgress();
  const sessionStatus = useSessionStore((s) => s.status);
  const isPaused = sessionStatus === 'paused';

  // ── Smart story-bar visibility ─────────────────────────────────────────
  // Field-test feedback: a freshly-started Free Run with NO goal AND no
  // pre-built route showed an empty progress bar at the top of the
  // screen, which read as "stalled" to the user. The bar is now hidden
  // entirely whenever there is nothing to track:
  //
  //   • goalProgress !== null → user picked a time/distance/calories
  //                             goal in FreeRunDrawer.
  //   • isNavigationActive    → there's a guided route or active path
  //                             (commute, generated route, etc.) that
  //                             gives the bar a meaningful target.
  //
  // If neither fires the chrome is fully suppressed — map extends to
  // the very top edge, the user only sees the metrics card and the
  // map. The same gate downstream short-circuits the ResizeObserver
  // and the topBarOffset prop into AdaptiveMetricsWrapper.
  const shouldShowStoryBar = goalProgress !== null || isNavigationActive;

  // ── GPS status toast ────────────────────────────────────────────────────────
  // Shows a brief pill toast when GPS degrades / recovers. Disappears after
  // 4 s so it never becomes permanent chrome. No persistent indicator.
  const [gpsToast, setGpsToast] = useState<string | null>(null);
  const prevGpsStatusRef = useRef(gpsStatus);
  useEffect(() => {
    if (gpsStatus === prevGpsStatusRef.current) return;
    prevGpsStatusRef.current = gpsStatus;
    if (gpsStatus === 'searching') {
      setGpsToast('מחפש GPS…');
    } else if (gpsStatus === 'poor') {
      setGpsToast('GPS חלש — ממשיך לחפש');
    } else if (gpsStatus === 'good' || gpsStatus === 'perfect') {
      setGpsToast('GPS תקין ✓');
    }
  }, [gpsStatus]);
  useEffect(() => {
    if (!gpsToast) return;
    const t = setTimeout(() => setGpsToast(null), 4000);
    return () => clearTimeout(t);
  }, [gpsToast]);

  // ── Dynamic story-bar height ─────────────────────────────────────────────
  // Measure the actual rendered height of RouteStoryBar (below the safe-area
  // padding) so the metrics card's top snap is always flush under it AND so
  // TurnCarousel can position itself directly below the bar. The measured
  // value is kept in local state for AdaptiveMetricsWrapper and ALSO mirrored
  // into useMapStore so TurnCarousel (a different subtree) can read it.
  const storyBarInnerRef = useRef<HTMLDivElement>(null);
  const [storyBarHeight, setStoryBarHeight] = useState(STORY_BAR_FALLBACK_PX);
  const setStoreStoryBarHeight = useMapStore((s) => s.setStoryBarHeight);
  useEffect(() => {
    const node = storyBarInnerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const h =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (Number.isFinite(h) && h > 0) {
        const rounded = Math.round(h);
        setStoryBarHeight(rounded);
        setStoreStoryBarHeight(rounded);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      setStoreStoryBarHeight(0);
    };
  }, [setStoreStoryBarHeight]);

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
      // z-40 raises the entire active-workout subtree (story bar, metrics
      // card, etc.) above the TurnCarousel (z-30, rendered as a sibling by
      // MapShell).  Without this, AdaptiveMetricsWrapper's inner z-index
      // would be clamped by this stacking context and the metrics card
      // would paint behind the navigation cards.
      className="absolute inset-0 z-40 overflow-hidden pointer-events-none"
      style={{ fontFamily: 'var(--font-simpler)' }}
      // Title is now expressed semantically via the live region below
      // since the visible header is gone — keeps screen readers informed
      // about the current workout mode without taking pixels from the map.
      aria-label={isNavigationActive ? 'מסלול מודרך' : 'אימון חופשי'}
      role="region"
    >
      {playerView === 'main' && shouldShowStoryBar && (
        <>
          {/* ── STORY BAR HEADER ───────────────────────────────────────────────
              Solid white container that wraps RouteStoryBar.  Provides a
              clean, opaque surface for the goal-progress bar so dark text
              reads on white instead of fighting a gradient.  Below the bar
              a separate `aria-hidden` strip fades white → transparent over
              16 px so the container blends smoothly into the map without a
              hard horizontal seam.  z-50 keeps it as the top-most layer of
              the active-workout chrome (above the metrics card at z-40).
              Entire block is gated on `shouldShowStoryBar` so a goal-less
              free run skips the chrome entirely and the map extends to
              the top edge. */}
          <div
            className="absolute top-0 left-0 right-0 z-50 pointer-events-none"
            style={{
              paddingTop: 'env(safe-area-inset-top, 0px)',
              background: '#ffffff',
            }}
          >
            <div ref={storyBarInnerRef}>
              <RouteStoryBar
                // ── Dynamic progress with a 1% floor ────────────────────
                // `goalProgress.progress` is `currentValue / targetValue`
                // already clamped to [0, 1] inside useSessionGoalProgress.
                // We floor it at 0.01 (1 %) so the bar shows a tiny sliver
                // the moment the workout starts — the user gets immediate
                // visual feedback that the HUD is live, instead of staring
                // at an empty track during the first few GPS samples.
                // Equivalent to the spec form
                //   Math.max(1, (currentDistance / targetDistance) * 100)
                // expressed in the 0–1 fraction space the bar consumes.
                //
                // Without a session goal there is no current/target ratio
                // to compute. We keep the bar visible at the 1 % minimum
                // so the chrome doesn't pop in/out depending on whether
                // the user set a goal.
                progress={
                  goalProgress
                    ? Math.max(0.01, goalProgress.progress)
                    : 0.01
                }
                isPaused={isPaused}
                label={goalProgress ? goalLabel(goalProgress.type) : 'מרחק'}
                // valueText is empty when no goal is set — the prior
                // '2.50 / 5.0 ק״מ' was a layout placeholder for testing
                // that read as live data and confused the user.
                valueText={goalProgress ? formatGoalValue(goalProgress) : ''}
              />
            </div>
          </div>

          {/* Bottom fade strip — sits IMMEDIATELY below the white container
              so the white surface dissolves into the map.  Positioned
              absolutely from the top using the live storyBarHeight + safe
              area so the strip stays attached as the bar resizes
              (orientation, dynamic-island devices, future layout changes).
              Height 18 px is enough to read as a soft fade without
              wasting prime map real-estate. */}
          <div
            className="absolute left-0 right-0 z-50 pointer-events-none"
            style={{
              top: `calc(env(safe-area-inset-top, 0px) + ${storyBarHeight}px)`,
              height: 18,
              background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)',
            }}
            aria-hidden="true"
          />

          {/* ── GPS STATUS TOAST ───────────────────────────────────────────────
              Temporary pill that appears for 4 s when GPS degrades or
              recovers. No permanent indicator — keeps the top of the map
              clean. Positioned just below the story bar. */}
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
        </>
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

      {/* ── MAP VIEW: smart, draggable metrics card ────────────────────────
          `topBarOffset` collapses to 0 when the story bar is hidden so
          the metrics card's top snap sits flush with the map edge —
          otherwise the user would see a phantom 56 px gap reserved
          for a header that never paints. */}
      {playerView === 'main' && (
        <AdaptiveMetricsWrapper
          isNavigationActive={isNavigationActive}
          onOpenSettings={() => setIsSettingsOpen(true)}
          topBarOffset={shouldShowStoryBar ? storyBarHeight : 0}
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

'use client';

/**
 * AdaptiveMetricsWrapper
 * ----------------------
 * The metrics card with all of the following packed into ONE responsibility:
 *
 *   • Smart positioning (top vs bottom) driven by `isNavigationActive`.
 *   • Drag + snap interaction (delegated to `useDraggableMetrics`).
 *   • Two content variants (full StatsCarousel vs minimised pill).
 *   • Overlap prevention vs TurnCarousel during navigation.
 *   • Grabber visual affordance.
 *
 * `isNavigationActive` is the SINGLE clean derived state that replaces
 * every previous "is the user on a route" heuristic. It is computed as
 * the running-player-side proxy for `MapShell.focusedRoute` (see the
 * jsdoc on the prop below) so the wrapper doesn't depend on any
 * MapShell-owned context that would force a prop drill.
 *
 *   isNavigationActive === true  → BOTTOM-ANCHORED, no exceptions.
 *                                  (TurnCarousel owns the top region;
 *                                   the card cannot drag into it.)
 *   isNavigationActive === false → TOP-ANCHORED by default. The user
 *                                  can drag freely between top, bottom,
 *                                  and either pill anchor.
 *
 * Overlap prevention:
 *   The hook locks the card to the bottom region during navigation. Even
 *   if the user violently flicks upward, the dragConstraints clamp at
 *   `NAVIGATION_TOP_RESERVED_PX` (the carousel's bottom + 12 px), and
 *   the snap target is force-mapped back to bottom. So the carousel and
 *   the metrics card can NEVER physically touch.
 */

import { motion } from 'framer-motion';
import { Settings } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import StatsCarousel from './StatsCarousel';
import RouteStoryBar from '../shared/RouteStoryBar';
import { useDraggableMetrics } from '../../hooks/useDraggableMetrics';
import { useSessionGoalProgress } from '../../hooks/useSessionGoalProgress';

const PRIMARY_DARK = '#0284C7';

interface AdaptiveMetricsWrapperProps {
  /**
   * The single source of truth for layout. `true` → card lives in the
   * bottom region and cannot escape it. `false` → card defaults to top
   * but is freely draggable.
   *
   * Conceptually this IS `!!focusedRoute` — when MapShell focuses a
   * route, useWorkoutSession mirrors `focusedRoute.path` into
   * `useRunningPlayer.activeRoutePath`, and the FreeRunActive parent
   * derives this prop from that. We accept it as a prop (not subscribe
   * here) so the wrapper stays trivially testable and the parent owns
   * the source-of-truth choice.
   */
  isNavigationActive: boolean;
  /**
   * Opens the workout-settings drawer. Wired here (instead of as a
   * floating map button) so the gear lives WITH the metrics it controls
   * — one persistent surface for everything the user needs mid-workout.
   * The parent owns the open/close state because the drawer itself is
   * also rendered by the parent (singleton mounted by FreeRunActive).
   */
  onOpenSettings: () => void;
}

export default function AdaptiveMetricsWrapper({
  isNavigationActive,
  onOpenSettings,
}: AdaptiveMetricsWrapperProps) {
  // Drag + snap state machine — pure logic, no JSX. The hook also drives
  // `--session-bar-clearance` so SessionControlBar's bottom offset stays
  // in lockstep with this card.
  const {
    cardRef,
    cardState,
    controls,
    handleDragEnd,
    dragConstraints,
    isPill,
  } = useDraggableMetrics({
    defaultPosition: isNavigationActive ? 'bottom' : 'top',
    lockToBottom: isNavigationActive,
  });

  // Pill-only data. Pulled fresh per render so the pill stays in lockstep
  // with the StatsCarousel above (same store, same numbers).
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const totalDuration = useSessionStore((s) => s.totalDuration);

  // Goal progress for the single-segment story bar at the top of the
  // card. `null` when the user didn't pick a goal in FreeRunDrawer →
  // the bar is omitted (rather than painted at 0%) so the chrome stays
  // honest about whether there's a target to chase.
  const goalProgress = useSessionGoalProgress();
  const sessionStatus = useSessionStore((s) => s.status);
  const isPaused = sessionStatus === 'paused';

  return (
    <motion.div
      drag="y"
      dragConstraints={dragConstraints}
      dragElastic={0.12}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      animate={controls}
      className="absolute left-0 right-0 z-20 px-3 pointer-events-auto"
      style={{ top: 0, touchAction: 'pan-y' }}
    >
      <div
        ref={cardRef}
        className="relative rounded-3xl overflow-hidden bg-white"
        style={{
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow:
            '0 4px 20px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)',
          // Pill mode locks the card to a fixed compact height; the
          // 0.25 s ease keeps the expand/collapse feeling continuous.
          height: isPill ? 56 : 'auto',
          transition: 'height 0.25s ease',
        }}
      >
        {/* ── Settings gear (top-right corner of card) ─────────────────────
            Replaces the previously floating map button so the card holds
            EVERY mid-workout control in one place. Subtle by design:
            light gray, low opacity at rest, brightens on tap. The gear
            sits at z-10 inside the card and stops drag/click propagation
            so a tap fires `onOpenSettings` instead of being absorbed by
            the card's drag handler. */}
        <button
          type="button"
          aria-label="הגדרות אימון"
          onClick={(e) => {
            // Stop the synthetic event AND any underlying pointer event
            // from bubbling to framer-motion's drag listener — without
            // this, framer would interpret the tap as a 0-distance drag
            // and keep its drag-active flag for one frame, which would
            // visibly nudge the card.
            e.stopPropagation();
            onOpenSettings();
          }}
          // pointer/touch handlers also stop propagation so the drag
          // listener never sees the press at all (belt-and-braces vs
          // the click handler above).
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="absolute z-10 flex items-center justify-center w-9 h-9 rounded-full active:scale-95 transition-all"
          style={{
            top: 8,
            right: 10,
            background: 'rgba(0, 0, 0, 0.04)',
            color: 'rgba(0, 0, 0, 0.55)',
          }}
        >
          <Settings size={18} strokeWidth={2.25} />
        </button>

        {/* Grabber handle — visible in all states so the affordance is
            always discoverable. Whole card is the drag target; this is
            purely visual. */}
        <div className="flex justify-center pt-2 pb-1">
          <div
            className="rounded-full"
            style={{
              width: 36,
              height: 4,
              background: 'rgba(0, 0, 0, 0.18)',
            }}
            aria-hidden="true"
          />
        </div>

        {/* Story-style goal bar — high-end, single-segment progress
            indicator. Only renders when the user set a goal in
            FreeRunDrawer AND the card is expanded (the pill is the
            "I want max map" mode and stays clean). The bar lives
            INSIDE the card so it inherits the same surface, the same
            ResizeObserver-driven `--session-bar-clearance`, and never
            collides with TurnCarousel up top. */}
        {goalProgress && !isPill && (
          <RouteStoryBar
            progress={goalProgress.progress}
            isPaused={isPaused}
            label={goalLabel(goalProgress.type)}
            valueText={formatGoalValue(goalProgress)}
          />
        )}

        {isPill ? (
          <PillContent
            distanceKm={totalDistance}
            durationSec={totalDuration}
          />
        ) : (
          <StatsCarousel />
        )}
      </div>

      {/* Debug aria-label so QA + screen readers can verify the layout
          decision without inspecting CSS. The visual element is the
          card itself; this is a pure semantic annotation. */}
      <span
        className="sr-only"
        aria-live="polite"
        data-card-position={cardState.position}
        data-card-size={cardState.size}
        data-navigation-active={isNavigationActive}
      >
        {`Metrics card: ${cardState.position}-${cardState.size}`}
      </span>
    </motion.div>
  );
}

/**
 * Inline pill content. Distance + Time only, per spec. Reads from the
 * same store the StatsCarousel uses, so the numbers match exactly across
 * the expand/collapse transition.
 */
function PillContent({
  distanceKm,
  durationSec,
}: {
  distanceKm: number;
  durationSec: number;
}) {
  const safeDistance =
    Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;

  return (
    <div className="flex items-center justify-around w-full px-4 h-full">
      <div className="flex items-baseline gap-1.5" dir="ltr">
        <span className="text-xl font-black text-black tabular-nums leading-none">
          {safeDistance.toFixed(2)}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: PRIMARY_DARK }}
        >
          KM
        </span>
      </div>
      <div className="w-px h-6" style={{ background: 'rgba(0,0,0,0.10)' }} />
      <div className="flex items-baseline gap-1.5" dir="ltr">
        <span className="text-xl font-black text-black tabular-nums leading-none">
          {formatDuration(durationSec)}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: PRIMARY_DARK }}
        >
          TIME
        </span>
      </div>
    </div>
  );
}

/**
 * Mirrors the formatter inside StatsCarousel/MainMetrics so the two reads
 * stay visually consistent. Kept inline (not factored out) because the
 * pill is the only consumer in this file.
 */
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
// Goal-bar formatters
// Kept here (not exported) because RouteStoryBar is a generic component
// and shouldn't know about Hebrew unit labels.
// ─────────────────────────────────────────────────────────────────────────────

function goalLabel(type: 'distance' | 'time' | 'calories'): string {
  switch (type) {
    case 'distance': return 'מרחק';
    case 'time':     return 'זמן';
    case 'calories': return 'קלוריות';
  }
}

/**
 * Render the live "current / target unit" pair next to the bar's label.
 * Distance: 1 decimal km, time: m:ss, calories: integer kcal — matches
 * the precision FreeRunDrawer uses to set the goal so the user reads the
 * SAME number they typed in.
 */
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

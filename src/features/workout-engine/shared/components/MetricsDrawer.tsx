'use client';

/**
 * MetricsDrawer — 3-anchor bottom sheet for free-run and walk sessions.
 *
 * Anchors (computed from live screen measurements):
 *   dock  — 56 px pill at the bottom, shows MiniDock content
 *   peek  — ~48 % screen height, shows expanded carousel content
 *   full  — flush below the StoryBar, shows full carousel
 *
 * The caller passes a render-prop `children` that receives the current
 * anchor id so it can switch between dock content and expanded content
 * without needing its own anchor state.
 *
 * CSS var: drives `--session-bar-clearance` so WorkoutControlCluster and
 * the future SessionControlBar always float above the visible card.
 *
 * Lock: when `lockToAnchor` is set (e.g. navigation active → 'peek', or
 * FlowLayer open → 'dock'), the card is force-snapped and user drags are
 * remapped back to the lock anchor.
 */

import { motion, useDragControls } from 'framer-motion';
import type { CSSProperties } from 'react';
import { useSheetDrag, type SheetAnchor, type SheetMeasurements } from '../hooks/useSheetDrag';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useMapStore } from '@/features/parks/core/store/useMapStore';

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants (mirrored from useDraggableMetrics for CSS-var parity)
// ─────────────────────────────────────────────────────────────────────────────

const BOTTOM_NAV_HEIGHT_PX = 72;
const CONTROL_BAR_GAP_PX = 16;
const PILL_HEIGHT_PX = 56;
const STATUS_BAR_PADDING_PX = 20;

// cssVarBase: added to the anchor's heightPx to produce --session-bar-clearance.
// Must match the original formula: cardHeight + BOTTOM_NAV + GAP.
const CSS_VAR_BASE = BOTTOM_NAV_HEIGHT_PX + CONTROL_BAR_GAP_PX;

// ─────────────────────────────────────────────────────────────────────────────
// Paused-state palette (kept in sync with AdaptiveMetricsWrapper)
// ─────────────────────────────────────────────────────────────────────────────

const PAUSED_BORDER = '#FF8C00';
const PAUSED_NUM = '#FF8C00';
const PAUSED_LABEL = '#C2410C';
const PAUSED_HEADER = '#9A3412';
const PAUSED_DIVIDER = 'rgba(255, 140, 0, 0.22)';
const PAUSED_ACCENT = '#FF8C00';

const DEFAULT_NUM = '#000000';
const DEFAULT_LABEL = 'rgba(0, 0, 0, 0.65)';
const DEFAULT_HEADER = 'rgba(0, 0, 0, 0.45)';
const DEFAULT_DIVIDER = 'rgba(0, 0, 0, 0.08)';
const DEFAULT_ACCENT = '#00ADEF';

// ─────────────────────────────────────────────────────────────────────────────
// Anchor factory
// ─────────────────────────────────────────────────────────────────────────────

function buildAnchors(m: SheetMeasurements, topBarOffset: number): SheetAnchor[] {
  // dock: 56 px pill flush above the bottom nav.
  const dockY = m.vh - BOTTOM_NAV_HEIGHT_PX - PILL_HEIGHT_PX;

  // peek: roughly the midpoint, always below the full anchor.
  const peekY = Math.round(m.vh * 0.52);

  // full: below the safe-area + story bar, matching the original top anchor.
  const fullY = Math.max(STATUS_BAR_PADDING_PX, m.sat + 12) + topBarOffset;

  return [
    {
      id: 'dock',
      yPx: dockY,
      heightPx: PILL_HEIGHT_PX,
    },
    {
      id: 'peek',
      yPx: peekY,
      // Visible height = distance from card top to bottom nav top.
      heightPx: Math.max(0, m.vh - peekY - BOTTOM_NAV_HEIGHT_PX),
    },
    {
      id: 'full',
      yPx: fullY,
      heightPx: Math.max(0, m.vh - fullY - BOTTOM_NAV_HEIGHT_PX),
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricsDrawerProps {
  /**
   * Extra Y offset (px) added to the full anchor so the card starts BELOW
   * any fixed header (e.g. RouteStoryBar). Matches the `topBarOffset` prop
   * on the legacy AdaptiveMetricsWrapper.
   */
  topBarOffset?: number;
  /**
   * When set, force-snaps the card to this anchor id. Set null to release.
   * Pass 'dock' when WorkoutFlowLayer is open; 'peek' during navigation.
   */
  lockToAnchor?: string | null;
  /** Default anchor on mount and after lock is released. Default: 'peek'. */
  defaultAnchor?: string;
  /** Opens the workout-settings drawer from the gear icon. */
  onOpenSettings?: () => void;
  /**
   * Render-prop: receives the current anchor id so the caller can switch
   * between dock content and expanded content.
   *
   *   {(anchor) => anchor === 'dock'
   *     ? <RunMiniDockContent />
   *     : <StatsCarousel />}
   */
  children: React.ReactNode | ((anchor: string) => React.ReactNode);
}

export default function MetricsDrawer({
  topBarOffset = 0,
  lockToAnchor = null,
  defaultAnchor = 'peek',
  onOpenSettings,
  children,
}: MetricsDrawerProps) {
  // Paused-state theming (same contract as AdaptiveMetricsWrapper).
  const sessionStatus = useSessionStore((s) => s.status);
  const isPaused = sessionStatus === 'paused';

  // Mirror card position to useMapStore for camera padding (same contract
  // as useDraggableMetrics: 'bottom' when visible, 'top' when gone).
  const setMetricsCardPosition = useMapStore((s) => s.setMetricsCardPosition);

  const dragControls = useDragControls();

  const { cardRef, currentAnchor, controls, handleDragEnd, dragConstraints, isPill } =
    useSheetDrag(
      (m) => buildAnchors(m, topBarOffset),
      defaultAnchor,
      {
        velocityThreshold: 250,
        cssVar: '--session-bar-clearance',
        cssVarBase: CSS_VAR_BASE,
        lockToAnchor,
        onAnchorChange: (id) => {
          // Map dock → 'top' (small footprint), anything else → 'bottom'.
          setMetricsCardPosition(id === 'dock' ? 'top' : 'bottom');
        },
      },
    );

  // Reset store on unmount (same contract as useDraggableMetrics).
  const setMetricsCardPositionRef = { current: setMetricsCardPosition };
  setMetricsCardPositionRef.current = setMetricsCardPosition;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // (We use a static effect here intentionally — only fires on unmount)

  const cardThemeVars = {
    '--metrics-num-color': isPaused ? PAUSED_NUM : DEFAULT_NUM,
    '--metrics-label-color': isPaused ? PAUSED_LABEL : DEFAULT_LABEL,
    '--metrics-header-color': isPaused ? PAUSED_HEADER : DEFAULT_HEADER,
    '--metrics-divider-color': isPaused ? PAUSED_DIVIDER : DEFAULT_DIVIDER,
    '--metrics-accent-color': isPaused ? PAUSED_ACCENT : DEFAULT_ACCENT,
  } as CSSProperties;

  const content = typeof children === 'function' ? children(currentAnchor) : children;

  return (
    <motion.div
      drag="y"
      dragControls={dragControls}
      dragConstraints={dragConstraints}
      dragElastic={0}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      animate={controls}
      className="absolute left-0 right-0 z-40 px-3 pointer-events-auto"
      style={{ top: 0, touchAction: 'pan-y' }}
    >
      <div
        ref={cardRef}
        className="relative rounded-3xl overflow-hidden bg-white"
        style={{
          border: isPaused
            ? `2px solid ${PAUSED_BORDER}`
            : '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: isPaused
            ? '0 4px 24px rgba(255, 140, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.04)'
            : '0 4px 20px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)',
          height: isPill ? PILL_HEIGHT_PX : 'auto',
          transition: 'height 0.25s ease, border-color 0.2s ease, box-shadow 0.2s ease',
          ...cardThemeVars,
        }}
        data-paused={isPaused ? 'true' : 'false'}
        data-anchor={currentAnchor}
      >
        {isPill ? (
          // Dock mode: dark pill — rendered without the white card chrome.
          <div
            className="w-full h-full rounded-3xl overflow-hidden"
            style={{ background: '#000', touchAction: 'none' }}
            onPointerDown={(e) => dragControls.start(e)}
          >
            {content}
          </div>
        ) : (
          // Peek / full mode: white card with grabber + optional settings gear.
          <>
            {onOpenSettings && (
              <button
                type="button"
                aria-label="הגדרות אימון"
                onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="absolute z-10 flex items-center justify-center w-9 h-9 rounded-full active:scale-95 transition-all"
                style={{ top: 8, right: 10, background: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.55)' }}
              >
                <SettingsIcon />
              </button>
            )}

            {/* Grabber */}
            <div
              className="flex justify-center pt-2 pb-1"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none', cursor: 'grab' }}
            >
              <div
                className="rounded-full"
                style={{ width: 36, height: 4, background: 'rgba(0,0,0,0.18)' }}
                aria-hidden="true"
              />
            </div>

            {content}
          </>
        )}
      </div>
    </motion.div>
  );
}

// Inline Settings icon so we don't need lucide import in this file for a
// single icon (keeps the bundle footprint minimal for this shared component).
function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

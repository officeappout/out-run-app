'use client';

/**
 * MetricsDrawer — 2-anchor bottom sheet for free-run and walk sessions.
 *
 * Anchors (computed from live screen measurements):
 *   dock  — 56 px pill at the bottom (Spotify-style black strip), shows MiniDock content
 *   peek  — ~48 % screen height, shows expanded carousel content
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
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────

const CONTROL_BAR_GAP_PX = 16;
const PILL_HEIGHT_PX = 56;

// cssVarBase: added to the anchor's heightPx to produce --session-bar-clearance.
// Without a bottom nav, this is just the gap between the visible card edge
// and the WorkoutControlCluster buttons.
const CSS_VAR_BASE = CONTROL_BAR_GAP_PX;

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

function buildAnchors(m: SheetMeasurements): SheetAnchor[] {
  // dock: 56 px pill flush at screen bottom, respecting safe-area-inset-bottom.
  const dockY = m.vh - PILL_HEIGHT_PX - m.sab;

  // peek: roughly the midpoint of the screen.
  const peekY = Math.round(m.vh * 0.52);

  return [
    {
      id: 'dock',
      yPx: dockY,
      heightPx: PILL_HEIGHT_PX,
    },
    {
      id: 'peek',
      // Visible height = full screen below card top.
      yPx: peekY,
      heightPx: Math.max(0, m.vh - peekY),
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricsDrawerProps {
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
      buildAnchors,
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
    /*
     * Bottom-sheet layout (mirrors StrengthRunner's top-layer pattern):
     *   • motion.div fills the entire parent (absolute inset-0) — framer-motion
     *     drives translateY so the visible portion = (viewportH − translateY).
     *   • pointer-events-none on the outer div so the map above the sheet is
     *     tappable; the inner card is pointer-events-auto.
     *   • dragListener={false} — drag only starts from the explicit handle,
     *     exactly like StrengthRunner's dragListener={false} + RunnerHeader.
     */
    <motion.div
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={dragConstraints}
      dragElastic={0}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      animate={controls}
      className="absolute top-0 left-0 right-0 bottom-0 z-[52] pointer-events-none"
      style={{ touchAction: 'none' }}
    >
      <div
        ref={cardRef}
        className="absolute top-0 left-0 right-0 bottom-0 overflow-hidden pointer-events-auto flex flex-col"
        style={{
          // Rounded only at the top — flush with screen edges on all sides.
          borderRadius: '20px 20px 0 0',
          // Dock = Spotify-style black pill; expanded = white card.
          background: isPill ? '#000000' : '#ffffff',
          borderTop: isPill
            ? 'none'
            : isPaused
              ? `2px solid ${PAUSED_BORDER}`
              : '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: isPill
            ? '0 -4px 24px rgba(0,0,0,0.35)'
            : isPaused
              ? '0 -4px 24px rgba(255, 140, 0, 0.22)'
              : '0 -2px 20px rgba(0, 0, 0, 0.07)',
          transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
          ...cardThemeVars,
        }}
        data-paused={isPaused ? 'true' : 'false'}
        data-anchor={currentAnchor}
      >
        {isPill ? (
          // Dock mode: entire strip is the drag handle (no grabber pill).
          // The MiniDock chevron-up serves as the visual affordance.
          <div
            style={{ height: PILL_HEIGHT_PX, touchAction: 'none' }}
            onPointerDown={(e) => dragControls.start(e)}
          >
            {content}
          </div>
        ) : (
          // Peek / full mode: grabber at top is the drag handle.
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

            {/* Grabber — the only drag entry point in peek/full mode */}
            <div
              className="flex justify-center pt-2 pb-1 flex-shrink-0"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none', cursor: 'grab' }}
            >
              <div
                className="rounded-full"
                style={{ width: 36, height: 4, background: 'rgba(0,0,0,0.18)' }}
                aria-hidden="true"
              />
            </div>

            <div className="flex-1 overflow-hidden">
              {content}
            </div>
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

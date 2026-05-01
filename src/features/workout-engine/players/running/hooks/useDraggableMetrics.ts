'use client';

/**
 * useDraggableMetrics
 * -------------------
 * Owns the entire drag + snap state machine for the metrics card. The
 * AdaptiveMetricsWrapper just consumes the returned values and renders;
 * the gesture math lives here so it can be unit-reasoned-about without
 * the layout JSX in the way.
 *
 * Responsibilities:
 *   • Track (position × size) state — the four logical anchors:
 *       top-expanded, bottom-expanded, top-pill, bottom-pill
 *   • Compute the framer-motion target Y for each anchor based on the
 *     LIVE viewport height and the LIVE measured card height.
 *   • Decide the next state from a drag-end gesture (`handleDragEnd`)
 *     using ONLY the pointer's screen-Y at release — drag elasticity is
 *     ignored on purpose so the snap doesn't "fight" the user's intent.
 *   • Re-snap to a default when an upstream signal flips
 *     (`isNavigationActive` toggles → re-snap to bottom-expanded /
 *     top-expanded respectively). Caller passes `defaultPosition`.
 *   • Lock to bottom when navigation is active. Per spec:
 *       "If isNavigationActive is true, the layout must be at the
 *        bottom. No exceptions."
 *     We implement this as a snap-clamp: a top drag during nav silently
 *     re-anchors to the bottom rather than snapping to a top anchor.
 *     This makes the carousel↔card overlap impossible by construction.
 *   • Drive `--session-bar-clearance` on <html> from the measured card
 *     height + position so SessionControlBar's bottom offset stays in
 *     lockstep with the card.
 *
 * What this hook is NOT:
 *   • A presentational component — it returns motion controls + state
 *     for the caller to apply to its own JSX.
 *   • A coordinate validator — that lives in `src/utils/geoValidation.ts`.
 *   • An audio / haptics hook — drag end is silent by design (per UX
 *     spec for active workouts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnimation, type PanInfo } from 'framer-motion';
import { useMapStore } from '@/features/parks/core/store/useMapStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CardPosition = 'top' | 'bottom';
export type CardSize = 'expanded' | 'pill';
export interface CardState {
  position: CardPosition;
  size: CardSize;
}

interface UseDraggableMetricsOptions {
  /**
   * Default ANCHOR for the card whenever an upstream signal changes
   * (e.g. navigation starts). When this flips, the hook re-snaps the
   * card back to its default — overriding any manual drag the user
   * had applied.
   */
  defaultPosition: CardPosition;
  /**
   * When true, the card is LOCKED to the bottom region. Top-anchor
   * snap targets are remapped to the closest bottom equivalent. Used
   * by AdaptiveMetricsWrapper during navigation so the card can never
   * overlap the TurnCarousel up top.
   */
  lockToBottom: boolean;
  /**
   * Extra vertical offset (px) added to the top anchor so the card
   * starts BELOW a fixed header that lives above it (e.g. the
   * RouteStoryBar header in FreeRunActive). Default: 0.
   *
   * The value should equal the header's content height below the
   * safe-area inset (i.e. the header's total height minus
   * `env(safe-area-inset-top)`).
   */
  topBarOffset?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants — kept here so the hook stays self-contained.
// AdaptiveMetricsWrapper re-exports them for any caller that needs to
// align other UI elements (header, GPS pill, etc.) to the same grid.
// ─────────────────────────────────────────────────────────────────────────────

/** Bottom-nav (Map / Laps tabs) height. Floor for the SessionControlBar
 *  clearance and base for the bottom anchor. */
export const BOTTOM_NAV_HEIGHT_PX = 72;

/** Vertical breathing room between the metrics card and the control bar
 *  per the design spec ("bottom margin equal to the card's height + 16px"). */
export const CONTROL_BAR_GAP_PX = 16;

/**
 * Minimum visual gap the pill keeps below the safe-area top. The card
 * gets `Math.max(STATUS_BAR_PADDING_PX, safeAreaInsetTop + 12)` as its
 * top anchor — see `topAnchorPx` inside the hook.
 *
 * Why 20 px: matches the spec ("y: 20 from the top"). On a non-notched
 * device (safeAreaInsetTop = 0), the card sits 20 px down — visually
 * floats below the status bar without crowding it. On a notched device
 * (safeAreaInsetTop = 44 px on iPhone Pro), the runtime branch wins
 * and the card sits at 56 px (44 + 12 gap) — never behind the notch.
 */
export const STATUS_BAR_PADDING_PX = 20;

/**
 * Conservative fallback for `safeAreaInsetTop` used during SSR / before
 * the runtime probe runs. Picked to clear the iPhone notch even on the
 * first render — better to over-pad by a few pixels for one frame than
 * to flash the pill behind the notch.
 */
export const FALLBACK_SAFE_AREA_TOP_PX = 44;

/** Pill dimensions. Tall enough for two big numbers, short enough that
 *  the user instantly reads it as "minimised". */
export const PILL_HEIGHT_PX = 56;

/** During navigation we reserve the top of the screen for TurnCarousel.
 *  This is the carousel's bottom edge plus a 12 px safety gap. The card
 *  is forbidden from passing above this Y, eliminating overlap. */
export const NAVIGATION_TOP_RESERVED_PX = 132;

/**
 * Legacy alias for the top anchor inset. Previously hard-coded as
 * `header (56) + GPS pill (~32) = 88`; the active-workout header was
 * removed in the chrome de-clutter pass, so this constant is now
 * computed dynamically inside the hook. Kept exported as a safe minimum
 * for callers that need a static rough estimate (e.g. AdaptiveMetricsWrapper
 * doesn't currently consume it but the export contract is preserved).
 *
 * @deprecated Use the runtime `topAnchorPx` from the hook instead.
 */
export const HEADER_INSET_PX = STATUS_BAR_PADDING_PX + FALLBACK_SAFE_AREA_TOP_PX;

/** Drag-end edge thresholds. Releasing within EDGE_PILL_FRAC of the
 *  top OR bottom edge snaps to a pill at that edge. */
export const EDGE_PILL_FRAC = 0.12;

// ─────────────────────────────────────────────────────────────────────────────
// Safe-area helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the device's `env(safe-area-inset-top)` value at runtime.
 *
 * CSS env() values can't be queried directly from JS — they're only
 * resolved when applied to a mounted element. So we mount a hidden
 * probe, read its computed `padding-top`, and tear it down. Cheap
 * enough to run once on mount; we cache the result in hook state.
 *
 * Returns 0 on SSR (no DOM) or when the browser doesn't support
 * env() — both cases are handled by the `Math.max(STATUS_BAR_PADDING_PX, ...)`
 * floor at the call site.
 */
function readSafeAreaInsetTop(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top)',
  ].join(';');
  document.body.appendChild(probe);
  const px = parseInt(window.getComputedStyle(probe).paddingTop, 10);
  document.body.removeChild(probe);
  return Number.isFinite(px) && px > 0 ? px : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useDraggableMetrics({
  defaultPosition,
  lockToBottom,
  topBarOffset = 0,
}: UseDraggableMetricsOptions) {
  // ── State ────────────────────────────────────────────────────────────────
  const defaultState: CardState = useMemo(
    () => ({ position: defaultPosition, size: 'expanded' }),
    [defaultPosition],
  );
  const [cardState, setCardState] = useState<CardState>(defaultState);

  // Re-snap whenever the upstream default changes (e.g. navigation flips).
  // The console log is the verification handle requested in the design spec.
  useEffect(() => {
    if (defaultPosition === 'bottom') {
      console.log('[UI Layout] Switching to BOTTOM mode because route is active.');
    } else {
      console.log('[UI Layout] Switching to TOP mode because no route is active.');
    }
    setCardState(defaultState);
  }, [defaultPosition, defaultState]);

  // ── HARD LOCK: navigation forbids `position === 'top'` ────────────────────
  // Even with the snap remap inside `handleDragEnd`, a stale state from a
  // previous render (or a future bug that calls `setCardState` directly
  // with a 'top' anchor) could leave the card at the top for one frame.
  // That single frame would visibly overlap TurnCarousel.
  //
  // This effect is the "no exceptions" enforcement layer: whenever
  // `lockToBottom` is true AND the position is somehow 'top', we IMMEDIATELY
  // snap it back to 'bottom' on the next render. There is no UI in the
  // app that can leave the card at the top during navigation, period.
  useEffect(() => {
    if (lockToBottom && cardState.position !== 'bottom') {
      console.log('[UI] Layout locked to BOTTOM due to navigation intent.');
      setCardState((prev) => ({ ...prev, position: 'bottom' }));
    }
  }, [lockToBottom, cardState.position]);

  // ── Viewport tracking ────────────────────────────────────────────────────
  const [viewportH, setViewportH] = useState<number>(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // ── Safe-area inset (status bar / notch / dynamic island) ────────────────
  // Read once on mount with a conservative SSR fallback so the very
  // first render never lands the pill behind the iPhone notch. We
  // re-read on orientation change because rotating an iPhone swaps
  // the notch's effective inset (top inset becomes left/right inset).
  const [safeAreaTop, setSafeAreaTop] = useState<number>(FALLBACK_SAFE_AREA_TOP_PX);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setSafeAreaTop(readSafeAreaInsetTop());
    sync();
    window.addEventListener('orientationchange', sync);
    return () => window.removeEventListener('orientationchange', sync);
  }, []);

  /**
   * Single canonical "top anchor" Y, computed as
   *   max(STATUS_BAR_PADDING_PX, safeAreaTop + 12)
   * so that:
   *   • On non-notched devices the card sits 20 px below the screen top
   *     (matches the spec's "y: 20 from the top" example).
   *   • On notched devices the runtime branch wins and the card sits
   *     12 px BELOW the notch — never behind it, never clipped.
   *
   * This is the SAME value for both `top-pill` and `top-expanded`
   * states. Anchoring the pill to this single value is the fix for the
   * "disappearing pill at the top" bug — the previous HEADER_INSET_PX
   * (88) assumed a 56 px opaque header that no longer exists, which
   * left an awkward gap above the pill on notched devices and a
   * clipped pill above the GPS bubble on others.
   */
  const topAnchorPx = useMemo(
    () => Math.max(STATUS_BAR_PADDING_PX, safeAreaTop + 12) + topBarOffset,
    [safeAreaTop, topBarOffset],
  );

  // ── Card measurement ─────────────────────────────────────────────────────
  // The card writes its own height into a ref; we re-read it from the
  // ResizeObserver below. The fallback 240 px is close enough that the
  // first frame lands at a reasonable visual position even before the
  // observer fires.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [measuredCardHeight, setMeasuredCardHeight] = useState<number>(240);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof window === 'undefined') return;

    const update = () => {
      const h = node.getBoundingClientRect().height;
      if (Number.isFinite(h) && h > 0) setMeasuredCardHeight(h);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [cardState.size]); // re-attach when size changes (DOM swap may rebuild node)

  // ── --session-bar-clearance bridge ──────────────────────────────────────
  // SessionControlBar reads this CSS variable for its bottom offset. The
  // value depends on:
  //   • position === 'top'   → only clear the bottom nav + 16 px gap.
  //   • position === 'bottom' → clear nav + gap + the card's height.
  // Updates fire whenever cardState OR measuredCardHeight changes (the
  // ResizeObserver above keeps measuredCardHeight live).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;

    if (cardState.position === 'top') {
      root.style.setProperty(
        '--session-bar-clearance',
        `${BOTTOM_NAV_HEIGHT_PX + CONTROL_BAR_GAP_PX}px`,
      );
    } else {
      root.style.setProperty(
        '--session-bar-clearance',
        `${Math.round(measuredCardHeight) + BOTTOM_NAV_HEIGHT_PX + CONTROL_BAR_GAP_PX}px`,
      );
    }
    return () => {
      root.style.removeProperty('--session-bar-clearance');
    };
  }, [cardState.position, measuredCardHeight]);

  // ── Mirror card position into useMapStore ────────────────────────────────
  // The camera controller reads this to compute adaptive padding so the
  // user's blue dot is never obscured by the metrics card. We write here
  // (rather than in AdaptiveMetricsWrapper) so any future consumer of
  // the hook gets the same store-side contract for free.
  //
  // On unmount we deliberately reset to 'top' — when the running player
  // unmounts (workout ended, screen change), the card is gone and the
  // camera should fall back to its standard Waze padding.
  const setMetricsCardPosition = useMapStore((s) => s.setMetricsCardPosition);
  useEffect(() => {
    setMetricsCardPosition(cardState.position);
  }, [cardState.position, setMetricsCardPosition]);
  useEffect(() => {
    return () => setMetricsCardPosition('top');
  }, [setMetricsCardPosition]);

  // ── Target Y for each state ──────────────────────────────────────────────
  // Y is measured from the screen's top in pixels. The motion.div is
  // positioned at top:0 so its translateY directly equals "distance from
  // the screen top".
  const cardHeightForState =
    cardState.size === 'pill' ? PILL_HEIGHT_PX : measuredCardHeight;

  const targetY = useMemo(() => {
    if (cardState.position === 'top') {
      // During navigation the top anchor is below the carousel safety
      // gap, NOT just below the status bar — that's how we guarantee
      // no physical overlap with TurnCarousel.
      //
      // Outside navigation, the safe-area-aware `topAnchorPx` is the
      // floor: the pill / expanded card sits 12 px below the notch (or
      // 20 px below the screen top on non-notched devices). This is
      // the fix for the "disappearing pill" bug — the value can never
      // go negative or land behind the status bar.
      return lockToBottom
        ? NAVIGATION_TOP_RESERVED_PX
        : topAnchorPx;
    }
    // Bottom anchor: card sits flush above the bottom-nav with a 16 px
    // gap. Floor of `topAnchorPx` defends against degenerate viewports
    // (split-screen, very short windows) where the bottom anchor
    // calculation would otherwise overlap the top safe area.
    return Math.max(
      topAnchorPx,
      viewportH - BOTTOM_NAV_HEIGHT_PX - CONTROL_BAR_GAP_PX - cardHeightForState,
    );
  }, [cardState.position, viewportH, cardHeightForState, lockToBottom, topAnchorPx]);

  // ── Animation controls ───────────────────────────────────────────────────
  // useAnimation + drag="y" combo: we manually animate to the new anchor
  // after the user releases. Without explicit controls, framer-motion's
  // drag offset and our `animate.y` would race on the same axis and
  // produce a visible double-jump.
  const controls = useAnimation();
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    if (isInitialMountRef.current) {
      controls.set({ y: targetY });
      isInitialMountRef.current = false;
      return;
    }
    controls.start({
      y: targetY,
      transition: { type: 'spring', stiffness: 320, damping: 30 },
    });
  }, [targetY, controls]);

  // ── Drag end → snap decision ─────────────────────────────────────────────
  /**
   * Algorithm:
   *   • Released within EDGE_PILL_FRAC of the top edge → top-pill
   *   • Released within EDGE_PILL_FRAC of the bottom edge → bottom-pill
   *   • Otherwise: position = which half the gesture ended on; size
   *     preserved (so dragging an expanded card top↔bottom doesn't
   *     accidentally minimise it).
   *   • If `lockToBottom`, every "top" snap target is remapped to its
   *     bottom equivalent. The card BOUNCES BACK to the bottom rather
   *     than escaping to overlap the carousel.
   *
   * `info.point.y` is the pointer's screen-Y at release. We use THAT
   * instead of the card's translate Y because the pointer is what the
   * user was thinking about; the card transform may include drag
   * elasticity that would mislead the snap.
   */
  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const releasedAt = info.point.y;
      const topEdge = viewportH * EDGE_PILL_FRAC;
      const bottomEdge = viewportH * (1 - EDGE_PILL_FRAC);

      // Edge-pill snaps.
      if (releasedAt < topEdge) {
        setCardState({
          position: lockToBottom ? 'bottom' : 'top',
          size: 'pill',
        });
        return;
      }
      if (releasedAt > bottomEdge) {
        setCardState({ position: 'bottom', size: 'pill' });
        return;
      }

      // Mid-screen → decide by half.
      const wantPosition: CardPosition =
        releasedAt < viewportH / 2 ? 'top' : 'bottom';
      const nextPosition: CardPosition = lockToBottom ? 'bottom' : wantPosition;
      const nextSize: CardSize =
        cardState.size === 'pill' ? 'expanded' : cardState.size;
      setCardState({ position: nextPosition, size: nextSize });
    },
    [viewportH, lockToBottom, cardState.size],
  );

  // ── Drag constraints ─────────────────────────────────────────────────────
  // Bottom is always clamped to the viewport floor so the card can't be
  // flung off-screen. Top is clamped at:
  //   • NAVIGATION_TOP_RESERVED_PX during nav (no overlap with carousel).
  //   • topAnchorPx otherwise — same value the snap target uses, so an
  //     upward drag can't push the pill behind the notch even mid-
  //     gesture. (Previously hard-coded as 0, which let the user drag
  //     the pill into the notch on iPhone Pros where it visibly
  //     "disappeared" until release.)
  const dragConstraints = useMemo(
    () => ({
      top: lockToBottom ? NAVIGATION_TOP_RESERVED_PX : topAnchorPx,
      bottom: Math.max(
        0,
        viewportH - cardHeightForState - BOTTOM_NAV_HEIGHT_PX,
      ),
    }),
    [lockToBottom, viewportH, cardHeightForState, topAnchorPx],
  );

  return {
    /** Attach to the rendered card root so the hook can measure it. */
    cardRef,
    /** Current logical state of the card. */
    cardState,
    /** Live viewport + measured card height — exposed for callers that
     *  need to add their own margins (e.g. an overlap-safety padding). */
    viewportH,
    measuredCardHeight,
    cardHeightForState,
    /** Safe-area-aware top anchor (max of STATUS_BAR_PADDING_PX and the
     *  device's `env(safe-area-inset-top) + 12`). Useful for any sibling
     *  floating UI that wants to share the same "below the notch" baseline. */
    topAnchorPx,
    /** Drive a `<motion.div>` with these values. */
    controls,
    handleDragEnd,
    dragConstraints,
    /** Convenience: true when card is in pill mode (caller decides
     *  which content variant to render). */
    isPill: cardState.size === 'pill',
  } as const;
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnimation, type PanInfo } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SheetAnchor {
  /** Stable string identifier (e.g. 'dock' | 'peek' | 'full'). */
  id: string;
  /** Y position in px from the top of the screen. Lower = taller card. */
  yPx: number;
  /**
   * Visible card height in px (excluding anything below, e.g. bottom-nav).
   * Used by the optional `cssVar` side-effect to set the clearance variable.
   * When omitted the hook uses (viewportH − yPx) as a conservative fallback.
   */
  heightPx?: number;
}

export interface SheetMeasurements {
  /** Live window.innerHeight (px). */
  vh: number;
  /** env(safe-area-inset-top) in px. Falls back to 44 before first probe. */
  sat: number;
  /** env(safe-area-inset-bottom) in px. 0 before first probe. */
  sab: number;
  /** Measured card height from ResizeObserver (only when measureHeight=true). */
  mh: number;
}

export interface UseSheetDragOptions {
  /** Velocity (px/s) above which a flick wins regardless of release position. Default: 250. */
  velocityThreshold?: number;
  /**
   * CSS custom-property name to drive from the current anchor's visible
   * height (e.g. `'--session-bar-clearance'`). Updated on every anchor
   * change; removed on unmount.
   */
  cssVar?: string;
  /**
   * Base value (px) added to the anchor's `heightPx` when computing the
   * CSS var. Typically `BOTTOM_NAV_HEIGHT_PX + CONTROL_BAR_GAP_PX`.
   */
  cssVarBase?: number;
  /** Fired whenever the snapped anchor changes. Use to update stores. */
  onAnchorChange?: (id: string) => void;
  /**
   * When set, the card is force-snapped to this anchor id and user drags
   * are remapped back to it. Set to null to release the lock.
   */
  lockToAnchor?: string | null;
  /**
   * When true, attaches a ResizeObserver to `cardRef` and exposes the live
   * measured height as `mh` in the anchor factory. Useful when card height
   * varies (e.g. strength rest screen). Default: false.
   */
  measureHeight?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe-area probe — identical to useDraggableMetrics, extracted here so both
// hooks share the same reading strategy without a shared import.
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_SAT_PX = 44;

function readSafeAreaInsetTop(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'visibility:hidden', 'pointer-events:none',
    'padding-top:env(safe-area-inset-top)',
  ].join(';');
  document.body.appendChild(probe);
  const px = parseInt(window.getComputedStyle(probe).paddingTop, 10);
  document.body.removeChild(probe);
  return Number.isFinite(px) && px > 0 ? px : 0;
}

function readSafeAreaInsetBottom(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed', 'bottom:0', 'left:0',
    'visibility:hidden', 'pointer-events:none',
    'padding-bottom:env(safe-area-inset-bottom)',
  ].join(';');
  document.body.appendChild(probe);
  const px = parseInt(window.getComputedStyle(probe).paddingBottom, 10);
  document.body.removeChild(probe);
  return Number.isFinite(px) && px > 0 ? px : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useSheetDrag — unified bottom-sheet drag + snap state machine.
 *
 * Accepts an anchor factory that maps live screen measurements to a list of
 * named snap points. The hook handles:
 *   • Viewport + safe-area tracking
 *   • Optional card height measurement (ResizeObserver)
 *   • Velocity-first snap (flick wins regardless of release Y)
 *   • Position fallback snap (closest anchor when gesture is slow)
 *   • Spring animation to the target anchor
 *   • Optional CSS-var side-effect for layout clearance
 *   • Optional lock-to-anchor during navigation or content overlay
 *
 * The caller is responsible for computing anchor Y values — the hook only
 * manages the snap + animation machinery. This keeps the hook generic and
 * lets MetricsDrawer, StrengthRunner, etc. each describe their own grid.
 *
 * `getAnchors` is called via a ref so callers don't need to useCallback it.
 */
export function useSheetDrag(
  getAnchors: (m: SheetMeasurements) => SheetAnchor[],
  defaultId: string,
  options: UseSheetDragOptions = {},
) {
  const {
    velocityThreshold = 250,
    cssVar,
    cssVarBase = 0,
    onAnchorChange,
    lockToAnchor = null,
    measureHeight = false,
  } = options;

  // ── Viewport ───────────────────────────────────────────────────────────────
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

  // ── Safe-area inset ────────────────────────────────────────────────────────
  const [safeAreaTop, setSafeAreaTop] = useState<number>(FALLBACK_SAT_PX);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setSafeAreaTop(readSafeAreaInsetTop());
    sync();
    window.addEventListener('orientationchange', sync);
    return () => window.removeEventListener('orientationchange', sync);
  }, []);

  const [safeAreaBottom, setSafeAreaBottom] = useState<number>(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setSafeAreaBottom(readSafeAreaInsetBottom());
    sync();
    window.addEventListener('orientationchange', sync);
    return () => window.removeEventListener('orientationchange', sync);
  }, []);

  // ── Card height (optional) ─────────────────────────────────────────────────
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [measuredH, setMeasuredH] = useState<number>(240);
  useEffect(() => {
    if (!measureHeight) return;
    const node = cardRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([e]) => {
      const h = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height;
      if (Number.isFinite(h) && h > 0) setMeasuredH(Math.round(h));
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, [measureHeight]);

  // ── Anchor computation ─────────────────────────────────────────────────────
  // Use a ref so callers don't need useCallback on getAnchors.
  const getAnchorsRef = useRef(getAnchors);
  getAnchorsRef.current = getAnchors;

  const anchors = useMemo(
    () => getAnchorsRef.current({ vh: viewportH, sat: safeAreaTop, sab: safeAreaBottom, mh: measuredH }),
    [viewportH, safeAreaTop, safeAreaBottom, measuredH],
  );

  // ── Current anchor id ──────────────────────────────────────────────────────
  const [currentId, setCurrentId] = useState<string>(lockToAnchor ?? defaultId);

  // Lock enforcement — immediate re-snap when lock changes.
  useEffect(() => {
    if (lockToAnchor != null) setCurrentId(lockToAnchor);
  }, [lockToAnchor]);

  // Default re-snap when defaultId changes (e.g. navigation start/end) but
  // only when not locked so a locked card isn't overridden.
  const prevDefaultRef = useRef(defaultId);
  useEffect(() => {
    if (lockToAnchor == null && defaultId !== prevDefaultRef.current) {
      setCurrentId(defaultId);
    }
    prevDefaultRef.current = defaultId;
  }, [defaultId, lockToAnchor]);

  const currentAnchor = anchors.find((a) => a.id === currentId) ?? anchors[0];
  const targetY = currentAnchor?.yPx ?? 0;

  // ── Spring animation ───────────────────────────────────────────────────────
  const controls = useAnimation();
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      controls.set({ y: targetY });
      isInitialMountRef.current = false;
      return;
    }
    controls.start({ y: targetY, transition: { type: 'spring', stiffness: 320, damping: 30 } });
  }, [targetY, controls]);

  // ── onAnchorChange callback ────────────────────────────────────────────────
  const onAnchorChangeRef = useRef(onAnchorChange);
  onAnchorChangeRef.current = onAnchorChange;
  useEffect(() => {
    onAnchorChangeRef.current?.(currentId);
  }, [currentId]);

  // ── CSS variable side-effect ───────────────────────────────────────────────
  useEffect(() => {
    if (!cssVar || typeof window === 'undefined') return;
    const h = currentAnchor?.heightPx ?? Math.max(0, viewportH - targetY);
    document.documentElement.style.setProperty(cssVar, `${Math.round(h) + cssVarBase}px`);
    return () => {
      document.documentElement.style.removeProperty(cssVar);
    };
  }, [cssVar, cssVarBase, currentAnchor, targetY, viewportH]);

  // ── Drag constraints ───────────────────────────────────────────────────────
  const minY = anchors.length > 0 ? Math.min(...anchors.map((a) => a.yPx)) : 0;
  const maxY = anchors.length > 0 ? Math.max(...anchors.map((a) => a.yPx)) : viewportH;
  const dragConstraints = useMemo(() => ({ top: minY, bottom: maxY }), [minY, maxY]);

  // ── Snap decision ──────────────────────────────────────────────────────────
  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      // When locked, always snap back to the lock anchor.
      if (lockToAnchor != null) {
        setCurrentId(lockToAnchor);
        return;
      }

      const vy = info.velocity.y;

      if (vy > velocityThreshold) {
        // Flick DOWN → largest Y = most docked / lowest anchor.
        const sorted = [...anchors].sort((a, b) => b.yPx - a.yPx);
        if (sorted[0]) setCurrentId(sorted[0].id);
        return;
      }

      if (vy < -velocityThreshold) {
        // Flick UP → smallest Y = most expanded / highest anchor.
        const sorted = [...anchors].sort((a, b) => a.yPx - b.yPx);
        if (sorted[0]) setCurrentId(sorted[0].id);
        return;
      }

      // Slow/deliberate drag: closest anchor by release Y.
      const releaseY = info.point.y;
      let best: SheetAnchor | null = null;
      for (const a of anchors) {
        if (!best || Math.abs(a.yPx - releaseY) < Math.abs(best.yPx - releaseY)) {
          best = a;
        }
      }
      if (best) setCurrentId(best.id);
    },
    [anchors, velocityThreshold, lockToAnchor],
  );

  return {
    /** Attach to the card root element for optional ResizeObserver measurement. */
    cardRef,
    /** Current anchor id (e.g. 'dock' | 'peek' | 'full'). */
    currentAnchor: currentId,
    /** Programmatically snap to an anchor (skips animation when equal). */
    setAnchor: setCurrentId,
    /** Pass to `<motion.div animate={controls}>`. */
    controls,
    /** Pass to `<motion.div onDragEnd={handleDragEnd}>`. */
    handleDragEnd,
    /** Pass to `<motion.div dragConstraints={dragConstraints}>`. */
    dragConstraints,
    /** Live viewport height (useful for callers computing anchor positions). */
    viewportH,
    /** Live safe-area inset top (useful for callers computing full anchor). */
    safeAreaTop,
    /** Live safe-area inset bottom (useful for callers computing dock anchor). */
    safeAreaBottom,
    /** Measured card height when measureHeight=true; 240 fallback otherwise. */
    measuredH,
    /** True when the current anchor id is 'dock' (pill mode). */
    isPill: currentId === 'dock',
  } as const;
}

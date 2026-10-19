'use client';

/**
 * useOverviewSheet — the 3-detent drag machinery of the overview drawer
 * (peek ~220px · half ~55% · full ~90%), moved verbatim from
 * HybridOverviewScreen (19.10.2026) so every overview consumer shares it.
 *
 * Owns: the shared useSheetDrag anchors, the visible `sheetY` MotionValue and
 * the live card height derived from it, the directional-step snap (point 14),
 * the content-scroll ↔ sheet-drag arbitration (point 2/16), and the map sync
 * channel (settled sheet height + route-preview chrome flag). Consumer-specific
 * map writes (hybrid station fractions, walk legs) stay in the consumer.
 */

import { useRef, useEffect, useLayoutEffect } from 'react';
import { useDragControls, useMotionValue, useTransform, animate } from 'framer-motion';
import { useSheetDrag } from '@/features/workout-engine/shared/hooks/useSheetDrag';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { MAP_OVERVIEW_CHROME_V1 } from '@/config/feature-flags';
import { buildAnchors, detentHeightPx, detentTopY, nextDetent, DETENT_ORDER, type DetentId } from './overview-detents';

export function useOverviewSheet() {
  const dragControls = useDragControls();
  const { cardRef, currentAnchor, controls, setAnchor, dragConstraints, viewportH } =
    useSheetDrag(buildAnchors, 'half', { velocityThreshold: 250 });
  // Card height tracks the LIVE drag position, not the settled detent. The sheet
  // is `absolute top-0` inside a wrapper translated by `y`, so its visible height
  // must be (viewportH − y) for the bottom (CTA) to stay pinned to the screen
  // bottom throughout the gesture. useSheetDrag drives `y` via `controls`; we
  // mirror that into a MotionValue (`sheetY`) on the wrapper's style and derive
  // the height from it (point-3 follow-up). useSheetDrag itself is untouched.
  const sheetY = useMotionValue(detentTopY('half', viewportH));
  const cardHeight = useTransform(sheetY, (v) => Math.max(0, Math.round(viewportH - v)));

  // ── Point 14: directional-step snap (variant B) ───────────────────────────
  // framer's `controls` do NOT drive an explicit style MotionValue, so we drive
  // `sheetY` ourselves with a spring and pick the target by DIRECTION
  // (nextDetent). useSheetDrag's setAnchor/currentAnchor stay in sync.
  const detentY = (id: DetentId) => detentTopY(id, viewportH);
  const springRef = useRef<{ stop: () => void } | null>(null);
  const springTo = (id: DetentId) => {
    springRef.current?.stop();
    springRef.current = animate(sheetY, detentY(id), { type: 'spring', stiffness: 320, damping: 30 });
  };
  const onDragEndSnap = (_e: unknown, info: { velocity: { y: number }; offset: { y: number } }) => {
    const targetId = nextDetent(currentAnchor, info.velocity.y, info.offset.y);
    if (targetId !== currentAnchor) setAnchor(targetId); // keep useSheetDrag anchor in sync
    springTo(targetId);                                  // move the visible sheet (always locks)
  };
  // Re-align sheetY to the current detent on viewport change (resize/rotate).
  const currentAnchorRef = useRef(currentAnchor);
  currentAnchorRef.current = currentAnchor;
  useEffect(() => {
    sheetY.set(detentY((currentAnchorRef.current as DetentId) ?? 'half'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportH]);

  // ── Point 1: map↔drawer sync channel ──────────────────────────────────────
  // Report the settled visible height on every detent LOCK so useCameraController
  // can reframe the route in the free area above the drawer. Cleared on unmount.
  const setOverviewSheetHeightPx = useMapStore((s) => s.setOverviewSheetHeightPx);
  useEffect(() => {
    const id = (DETENT_ORDER.includes(currentAnchor as DetentId) ? currentAnchor : 'half') as DetentId;
    setOverviewSheetHeightPx(detentHeightPx(id, viewportH));
  }, [currentAnchor, viewportH, setOverviewSheetHeightPx]);
  useEffect(() => () => setOverviewSheetHeightPx(null), [setOverviewSheetHeightPx]);

  // Route-preview chrome (MAP_OVERVIEW_CHROME_V1): publish overview-active while the
  // drawer is mounted (MapShell folds the nav bar). useLayoutEffect → before paint.
  const setIsOverviewActive = useMapStore((s) => s.setIsOverviewActive);
  useLayoutEffect(() => {
    if (!MAP_OVERVIEW_CHROME_V1) return; // truly inert when off
    setIsOverviewActive(true);
    return () => setIsOverviewActive(false);
  }, [setIsOverviewActive]);

  // ── Point 2: content-scroll ↔ sheet-drag arbitration ──────────────────────
  // A NON-PASSIVE touchmove on the scroll body claims the gesture (preventDefault
  // + drive `sheetY`). While the sheet is NOT at full every vertical gesture moves
  // the sheet; at full the content scrolls, and only a pull-DOWN at scrollTop 0
  // collapses. Release routes through the SAME onDragEndSnap as the grabber.
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const onDragEndSnapRef = useRef(onDragEndSnap);
  onDragEndSnapRef.current = onDragEndSnap;
  useEffect(() => {
    const el = scrollBodyRef.current;
    if (!el) return;
    const minY = detentY('full'); // most expanded (smallest y)
    const maxY = detentY('peek'); // most docked (largest y)
    let chaining = false;
    let baseSheetY = 0, baseY = 0;
    let lastY = 0, lastT = 0, prevY = 0, prevT = 0;

    const onTouchStart = (e: TouchEvent) => {
      chaining = false;
      baseY = e.touches[0].clientY;
      lastY = prevY = baseY;
      lastT = prevT = performance.now();
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      if (!chaining) {
        const dy = y - baseY;
        const atFull = currentAnchorRef.current === 'full';
        const atTop = el.scrollTop <= 0;
        const claim = atFull ? (dy > 0 && atTop) : (dy !== 0);
        if (claim) {
          chaining = true;
          baseY = y;                 // re-baseline so the sheet doesn't jump
          baseSheetY = sheetY.get();
          springRef.current?.stop();
        } else {
          return;                    // at full, off-top → let the content scroll
        }
      }
      e.preventDefault();            // non-passive → stops native scroll while chaining
      sheetY.set(Math.min(maxY, Math.max(minY, baseSheetY + (y - baseY))));
      prevY = lastY; prevT = lastT;
      lastY = y; lastT = performance.now();
    };
    const onTouchEnd = () => {
      if (!chaining) return;
      chaining = false;
      const dt = Math.max(1, lastT - prevT);
      onDragEndSnapRef.current(null, {
        velocity: { y: (lastY - prevY) / (dt / 1000) }, // px/s, same units as framer
        offset: { y: lastY - baseY },                   // downward positive
      });
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false }); // MUST be non-passive
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportH]);

  return {
    dragControls, cardRef, currentAnchor, controls, dragConstraints,
    sheetY, cardHeight, springRef, onDragEndSnap, scrollBodyRef,
  };
}

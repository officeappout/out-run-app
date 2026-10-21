'use client';

/**
 * usePublishedPlayerChrome — a v2 live player (enable_home_v2) tells the map
 * camera how much of the screen its floating header card and bottom live
 * card cover, so the follow camera keeps the user's marker in the free
 * window between them (see parks/core/hooks/player-follow-padding.ts).
 *
 * Attach `headerRef` to the top card's wrapper and `cardRef` to the bottom
 * card's wrapper. Heights come from ResizeObserver (layout size — unaffected
 * by the player's drag transform); the fixed offsets around them (safe areas
 * + the wrappers' own top/bottom gaps) are added here. Cleared on unmount, so
 * the legacy camera padding comes back as soon as no v2 player is mounted.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { sameChrome } from '@/features/parks/core/hooks/player-follow-padding';

/** env(safe-area-inset-top/bottom) in px (0 outside a notched device / SSR). */
export function readSafeAreaInsets(): { top: number; bottom: number } {
  if (typeof document === 'undefined' || !document.body) return { top: 0, bottom: 0 };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);';
  document.body.appendChild(probe);
  const cs = window.getComputedStyle(probe);
  const top = parseFloat(cs.paddingTop) || 0;
  const bottom = parseFloat(cs.paddingBottom) || 0;
  probe.remove();
  return { top, bottom };
}

/**
 * Callback ref + ResizeObserver: observes whichever node is attached, even
 * when the player renders it after its first paint (e.g. once its data lands).
 */
function useBlockSize(): [(node: HTMLDivElement | null) => void, number] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [h, setH] = useState(0);
  const ref = useCallback((n: HTMLDivElement | null) => setNode(n), []);
  useEffect(() => {
    if (!node) { setH(0); return; }
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([entry]) => {
      const v = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (Number.isFinite(v) && v >= 0) setH(Math.round(v));
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, [node]);
  return [ref, h];
}

export interface PlayerChromeOffsets {
  /** px between the safe-area top and the header wrapper (its CSS `top`). */
  topGapPx?: number;
  /** px between the safe-area bottom and the card wrapper (its CSS `bottom`). */
  bottomGapPx?: number;
  /** The header element pads the safe-area top itself (it's inside its measured height). */
  headerIncludesSafeTop?: boolean;
}

export function usePublishedPlayerChrome({ topGapPx = 0, bottomGapPx = 0, headerIncludesSafeTop = false }: PlayerChromeOffsets = {}) {
  const [headerRef, headerH] = useBlockSize();
  const [cardRef, cardH] = useBlockSize();
  const setPlayerChrome = useMapStore((s) => s.setPlayerChrome);
  const [safe, setSafe] = useState<{ top: number; bottom: number }>({ top: 0, bottom: 0 });

  useEffect(() => {
    const read = () => setSafe(readSafeAreaInsets());
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  useEffect(() => {
    // Nothing measured (yet / any more) → no claim: the camera keeps its default.
    if (headerH <= 0 && cardH <= 0) {
      if (useMapStore.getState().playerChrome !== null) setPlayerChrome(null);
      return;
    }
    const next = {
      top: headerH > 0 ? Math.round((headerIncludesSafeTop ? 0 : safe.top) + topGapPx + headerH) : 0,
      bottom: cardH > 0 ? Math.round(safe.bottom + bottomGapPx + cardH) : 0,
    };
    if (!sameChrome(useMapStore.getState().playerChrome, next)) setPlayerChrome(next);
  }, [headerH, cardH, safe.top, safe.bottom, topGapPx, bottomGapPx, headerIncludesSafeTop, setPlayerChrome]);

  useEffect(() => () => setPlayerChrome(null), [setPlayerChrome]);

  return { headerRef, cardRef };
}

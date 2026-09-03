'use client';

import { useEffect, useState } from 'react';

export interface ViewportBounds {
  /** Distance (px) from the layout viewport's top to the visible viewport's top. */
  top: number;
  /** Height (px) of the currently visible viewport. */
  height: number;
}

/**
 * Tracks `window.visualViewport`'s live rect — it shrinks (and offsets)
 * when the on-screen keyboard opens, unlike `window.innerHeight`/`vh` units,
 * which iOS Safari/WKWebView leave unchanged while the keyboard covers the
 * bottom of the screen.
 *
 * Built for keyboard-aware bottom sheets: a plain `fixed inset-0` sheet is
 * anchored to the (keyboard-covered) bottom of the full layout viewport, so
 * shrinking the SHEET's own height alone doesn't help — it just leaves an
 * equally keyboard-covered gap. Reposition the sheet's fixed container to
 * these bounds instead (`top`/`height`, not `inset-0`) so its bottom edge
 * tracks the top of the keyboard.
 *
 * Returns `undefined` before mount or when `visualViewport` isn't supported
 * — callers should fall back to the full layout viewport (`top: 0`, CSS
 * `100dvh`) in that case.
 */
export function useVisualViewportBounds(): ViewportBounds | undefined {
  const [bounds, setBounds] = useState<ViewportBounds | undefined>(undefined);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => setBounds({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return bounds;
}

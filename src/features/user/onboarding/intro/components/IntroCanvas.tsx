'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * The story screens are laid out on the owner's 390-wide canvas (the mockups'
 * own coordinates, minus the 44 px status-bar strip). This box sits under the
 * safe area and scales that canvas to fit the phone — so the ring, the phone and
 * the characters keep the approved composition on every screen size.
 */
export const CANVAS_W = 390;
export const CANVAS_H = 800;
/** Mockup y of the canvas top (the mockups start under a 44 px status bar). */
export const CANVAS_Y0 = 44;
const MAX_SCALE = 1.12;

export function IntroCanvas({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => {
      const s = Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H, MAX_SCALE);
      if (s > 0) setScale(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      className="absolute inset-x-0 bottom-0"
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        data-intro-canvas=""
        className="absolute left-1/2 top-0"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          marginLeft: -CANVAS_W / 2,
          transform: `scale(${scale})`,
          transformOrigin: '50% 0',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** A mockup y (390×844 frame) → canvas y. */
export const cy = (mockupY: number) => mockupY - CANVAS_Y0;

/**
 * An element's centre in canvas coordinates — layout offsets only, so a
 * transform still running on it (a badge popping in) doesn't skew the result.
 */
export function canvasCenter(el: HTMLElement | null): { x: number; y: number } | null {
  if (!el) return null;
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  let node: HTMLElement | null = el;
  while (node && !node.hasAttribute('data-intro-canvas')) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node ? { x, y } : null;
}

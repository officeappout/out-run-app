'use client';

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { useScrollDirection } from '@/hooks/useScrollDirection';

interface CollapsingHeaderProps {
  children: React.ReactNode;
  /** Tailwind classes appended to the sticky wrapper. */
  className?: string;
  /**
   * z-index for the sticky header. Defaults to 40 (within the documented
   * z-index budget; map-screen overlays own >=50). Override per page if
   * the page has its own stacking requirements.
   * @default 40
   */
  zIndex?: number;
  /**
   * Apply the iOS safe-area inset-top as padding so the header content sits
   * below the status-bar / notch on iPhone (and below the camera cutout on
   * Android edge-to-edge). Set to `false` if the parent already pads the
   * header itself.
   * @default true
   */
  applySafeAreaTop?: boolean;
  /**
   * Distance from the top below which the header is always shown. Pass-thru
   * to `useScrollDirection.topOffset`.
   * @default 80
   */
  topOffset?: number;
}

/**
 * Instagram / X style hiding header.
 *
 * - Stays sticky at the top of the page's scroll container.
 * - Slides up out of view when the user scrolls DOWN past `topOffset`.
 * - Slides back down immediately the moment the user scrolls UP — even
 *   mid-feed — matching native social-app conventions.
 *
 * The whole header (including its safe-area padding) translates together,
 * so the page background flows behind the iOS status bar while hidden,
 * which is the correct edge-to-edge behaviour.
 */
export default function CollapsingHeader({
  children,
  className = '',
  zIndex = 40,
  applySafeAreaTop = true,
  topOffset = 80,
}: CollapsingHeaderProps) {
  // Pass a ref to the hook so it can find the actual scroll container by
  // walking up the DOM from this header — more robust on Android WebView
  // than the document.querySelector('main') fallback alone.
  const headerRef = useRef<HTMLElement>(null);
  const hidden = useScrollDirection({
    topOffset,
    anchorRef: headerRef,
  });

  return (
    <motion.header
      ref={headerRef}
      animate={{ y: hidden ? '-100%' : '0%' }}
      transition={{ type: 'tween', duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className={`sticky top-0 ${className}`}
      style={{
        zIndex,
        paddingTop: applySafeAreaTop
          ? 'env(safe-area-inset-top, 0px)'
          : undefined,
        // willChange hints the compositor to keep this on its own layer,
        // so the slide is GPU-accelerated and doesn't repaint the feed.
        willChange: 'transform',
      }}
    >
      {children}
    </motion.header>
  );
}

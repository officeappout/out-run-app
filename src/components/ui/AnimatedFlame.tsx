'use client';

/**
 * AnimatedFlame — shared dynamic flame indicator that reflects the user's
 * daily activity level.
 *
 * Extracted from `UserHeaderPill` so both the legacy home pill AND the new
 * global `AppHeader` can render the same flame without duplicating the
 * animation logic / colour table.
 *
 * Flame states:
 *   - 'super'    → cyan flame with a soft pulsing glow (full workout)
 *   - 'micro'    → amber flame (adaptive goal hit)
 *   - 'survival' → lime flame (minimal activity)
 *   - 'rest' / 'none' → dim slate placeholder (kept for layout stability)
 *
 * The component animates a one-shot scale/rotate "level-up" pop when the
 * activityType crosses into a higher tier (e.g. none → micro, micro → super).
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Flame } from 'lucide-react';
import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react';
import type { ActivityType } from '@/features/activity/types/activity.types';

// Fix-round §3.5/3.6 (20.08.2026) — first Lottie pass. Same file for all three
// active tiers (micro/survival/super) — deliberately no per-tier color yet
// (the source file has no theming `slots` to swap; David chose to ship this
// now and revisit per-tier color in a future round rather than block on it).
const FLAME_ANIMATION_SRC = '/assets/animations/flame-orange.lottie';

// dotlottie-web defaults to fetching its WASM engine from a version-pinned
// jsdelivr/unpkg CDN URL at runtime — unreliable for a Capacitor WebView
// (CSP, offline, first-cold-launch latency). Self-host it instead; this call
// only needs to happen once per app load, and module top-level code runs
// exactly once regardless of how many AnimatedFlame instances mount.
setWasmUrl('/assets/animations/dotlottie-player.wasm');

interface FlameConfig {
  color: string;
  glowColor: string;
  glowIntensity: string;
  show: boolean;
}

const FLAME_CONFIG: Record<ActivityType, FlameConfig> = {
  super: {
    color: '#06B6D4',
    glowColor: 'transparent', // neutralized (20.08.2026) — was cyan, clashed behind the orange Lottie flame
    glowIntensity: '0 0 20px',
    show: true,
  },
  micro: {
    color: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.3)',
    glowIntensity: '0 0 12px',
    show: true,
  },
  survival: {
    color: '#84CC16',
    glowColor: 'rgba(132, 204, 22, 0.2)',
    glowIntensity: '0 0 8px',
    show: true,
  },
  rest: {
    color: '#94A3B8',
    glowColor: 'transparent',
    glowIntensity: 'none',
    show: false,
  },
  none: {
    color: '#CBD5E1',
    glowColor: 'transparent',
    glowIntensity: 'none',
    show: false,
  },
};

interface AnimatedFlameProps {
  activityType: ActivityType;
  previousType: ActivityType | null;
  /** Icon footprint in pixels. Defaults to 20 (the original w-5/h-5 size) — pass a larger value for call sites that need a bigger flame (e.g. AppHeader). */
  size?: number;
}

export default function AnimatedFlame({ activityType, previousType, size = 20 }: AnimatedFlameProps) {
  const controls = useAnimation();
  const config = FLAME_CONFIG[activityType];

  const isLevelUp =
    previousType &&
    (previousType === 'none' || previousType === 'rest') &&
    (activityType === 'micro' || activityType === 'super');

  const isSuperLevelUp = previousType === 'micro' && activityType === 'super';

  useEffect(() => {
    if (isLevelUp || isSuperLevelUp) {
      controls.start({
        scale: [1, 1.4, 1.2, 1.3, 1],
        rotate: [0, -15, 15, -10, 0],
        transition: {
          duration: 0.6,
          ease: 'easeOut',
          times: [0, 0.2, 0.4, 0.6, 1],
        },
      });
    }
  }, [activityType, isLevelUp, isSuperLevelUp, controls]);

  if (!config.show) {
    return (
      <div
        className="flex items-center justify-center opacity-30"
        style={{ width: size, height: size }}
      >
        <Flame style={{ width: size * 0.8, height: size * 0.8 }} className="text-slate-300" />
      </div>
    );
  }

  // 'super' tier's glow ring, sized relative to the icon (was a fixed 28px/-4px
  // offset for the original 20px icon — kept proportional so it still centers
  // correctly now that `size` is caller-configurable).
  const ringSize = size * 1.4;
  const ringOffset = -(ringSize - size) / 2;

  return (
    <motion.div
      animate={controls}
      className="relative flex items-center justify-center"
      style={{
        filter: `drop-shadow(${config.glowIntensity} ${config.glowColor})`,
      }}
    >
      <AnimatePresence>
        {activityType === 'super' && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 70%)`,
              width: ringSize,
              height: ringSize,
              top: ringOffset,
              left: ringOffset,
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        animate={{
          y: activityType === 'super' ? [0, -2, 0] : 0,
        }}
        transition={{
          duration: 1.5,
          repeat: activityType === 'super' ? Infinity : 0,
          ease: 'easeInOut',
        }}
      >
        {/* No `className` here — dotlottie-react's internal wrapper only
            applies the `style` prop when no className is passed (its outer
            div does `!className && {style: {width:'100%', height:'100%',
            ...yourStyle}}`); passing both silently drops the size entirely
            and the inner canvas's own 100%/100% then resolves against an
            unbounded ancestor. `position`/`zIndex` (for stacking above the
            glow ring below) go through `style` instead, for the same reason. */}
        <DotLottieReact
          src={FLAME_ANIMATION_SRC}
          loop
          autoplay
          style={{ width: size, height: size, position: 'relative', zIndex: 10 }}
        />
      </motion.div>
    </motion.div>
  );
}

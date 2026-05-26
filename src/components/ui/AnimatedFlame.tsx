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
import type { ActivityType } from '@/features/activity/types/activity.types';

interface FlameConfig {
  color: string;
  glowColor: string;
  glowIntensity: string;
  show: boolean;
}

const FLAME_CONFIG: Record<ActivityType, FlameConfig> = {
  super: {
    color: '#06B6D4',
    glowColor: 'rgba(6, 182, 212, 0.4)',
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
}

export default function AnimatedFlame({ activityType, previousType }: AnimatedFlameProps) {
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
      <div className="w-5 h-5 flex items-center justify-center opacity-30">
        <Flame className="w-4 h-4 text-slate-300" />
      </div>
    );
  }

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
              width: '28px',
              height: '28px',
              top: '-4px',
              left: '-4px',
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
        <Flame
          className="w-5 h-5 relative z-10"
          style={{ color: config.color }}
          fill={activityType === 'super' ? config.color : 'none'}
          strokeWidth={activityType === 'super' ? 1.5 : 2}
        />
      </motion.div>
    </motion.div>
  );
}

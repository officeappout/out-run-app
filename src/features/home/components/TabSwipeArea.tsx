'use client';

/**
 * Pilot AI1 (enable_pilot_ah_v1): the home tabs' content area: a horizontal swipe switches the
 * tab (useTabSwipe), and the new tab's content slides in from the swipe's side. Off → a plain
 * wrapper with no handlers and no animation.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useUiDir } from '@/lib/i18n/useUiDir';
import { useTabSwipe } from '../hooks/useTabSwipe';

export default function TabSwipeArea<T extends string>({ enabled, tabs, active, onChange, children }: {
  enabled: boolean;
  tabs: readonly T[];
  active: T;
  onChange: (t: T) => void;
  children: React.ReactNode;
}) {
  const { isRtl } = useUiDir();
  const reduce = !!useReducedMotion();
  const handlers = useTabSwipe({ enabled, tabs, active, isRtl, onChange });
  if (!enabled) return <>{children}</>;
  // Forward = the next tab; it enters from the inline end (RTL: the left).
  const forwardX = isRtl ? -24 : 24;
  const idx = tabs.indexOf(active);
  return (
    <div {...handlers}>
      <motion.div
        key={active}
        initial={reduce ? false : { opacity: 0, x: idx > 0 ? forwardX : -forwardX }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

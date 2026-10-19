'use client';

/**
 * OffRouteToast — one-shot dark pill when the user leaves the route:
 * "השעון ממשיך לרוץ · המרחק נספר" (board R3-prop-route-off). Shown for a few
 * seconds on each off-route ENTRY (useRouteRunV2Store.offRouteToken), below
 * the nav banner and the recenter pill. Decorative: pointer-events none,
 * role="status" so screen readers hear it once.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Clock3 } from 'lucide-react';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useRouteRunV2Store } from '../../../store/useRouteRunV2Store';

const SHOW_MS = 4500;

export default function OffRouteToast() {
  const token = useRouteRunV2Store((s) => s.offRouteToken);
  const storyBarHeight = useMapStore((s) => s.storyBarHeight);
  const navCardHeight = useMapStore((s) => s.navCardHeight);
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const seenRef = useRef(token);

  useEffect(() => {
    if (token === seenRef.current) return;
    seenRef.current = token;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), SHOW_MS);
    return () => clearTimeout(t);
  }, [token]);

  // Below the banner AND below the recenter pill that sits right under it (≈ 44 px).
  const top = `calc(env(safe-area-inset-top, 0px) + ${storyBarHeight + navCardHeight + 16 + 52}px)`;

  return (
    <div className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4" style={{ top }}>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="off-route-toast"
            role="status"
            dir="rtl"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full bg-[rgba(14,20,25,0.78)] px-2.5 text-[12.5px] font-extrabold text-white"
          >
            <Clock3 size={13} strokeWidth={2.5} aria-hidden />
            השעון ממשיך לרוץ · המרחק נספר
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

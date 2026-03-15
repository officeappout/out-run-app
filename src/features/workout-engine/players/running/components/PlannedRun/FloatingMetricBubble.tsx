'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface FloatingMetricBubbleProps {
  elapsedTime: string;
  distanceKm: string;
  onExpand: () => void;
}

export default function FloatingMetricBubble({
  elapsedTime,
  distanceKm,
  onExpand,
}: FloatingMetricBubbleProps) {
  return (
    <motion.button
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -60, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onClick={onExpand}
      className="fixed z-[60] left-1/2 -translate-x-1/2 h-11 rounded-full
                 bg-black/60 backdrop-blur-md px-5 flex items-center gap-0
                 shadow-lg active:scale-95 transition-transform"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        fontFamily: 'var(--font-simpler)',
      }}
      dir="ltr"
    >
      <span className="text-white text-sm font-bold tabular-nums">
        ⏱ {elapsedTime}
      </span>
      <span className="mx-2 text-white/50">•</span>
      <span className="text-white text-sm font-bold tabular-nums">
        {distanceKm}
      </span>
    </motion.button>
  );
}

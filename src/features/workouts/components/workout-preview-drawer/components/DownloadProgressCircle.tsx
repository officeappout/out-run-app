'use client';

import { motion } from 'framer-motion';
import { ArrowDownCircle } from 'lucide-react';

// ── Geometry constants ────────────────────────────────────────────────────
// The arc is drawn inside a 28×28px viewbox.  `RADIUS` is reduced by half
// the stroke width so the line stays fully inside the box.
const SIZE = 28;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface DownloadProgressCircleProps {
  /** Download progress, clamped internally to the [0, 100] range. */
  progress: number;
}

/**
 * Animated SVG arc indicating offline-download progress.
 * The visible portion of the stroke shrinks from a full circle (0%)
 * down to zero offset (100%) as `progress` increases.
 */
export default function DownloadProgressCircle({ progress }: DownloadProgressCircleProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={STROKE}
        />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#06b6d4"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </svg>
      <ArrowDownCircle size={16} strokeWidth={1.8} className="text-cyan-500 relative z-[1]" />
    </div>
  );
}

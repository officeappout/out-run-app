'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { RING_SEGMENTS, labelCenter, segmentPath } from '../ring-geometry';
import type { MotionTrackProps } from '../story-timeline';

type SegMotion = MotionTrackProps;

export interface BarrierRingProps {
  /** The square box, px. */
  size: number;
  r: number;
  stroke: number;
  padDeg?: number;
  colorOf: (i: number) => string;
  /** Per-segment motion (pop-in, fade). Each segment is its own layer so it scales around the ring centre. */
  segMotion?: (i: number) => SegMotion | undefined;
  labels?: {
    texts: readonly string[];
    radius: number;
    width: number;
    className: string;
    motionOf?: (i: number) => SegMotion | undefined;
  };
  /** Drawn above the segments, same box (e.g. the closed gradient circle). */
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The 5-segment barrier ring (enable_entry_intro_v1) — the bridge's grey ring,
 * the story hand-off, the header badge's mini ring and the ring that closes into
 * the logo all draw from here. Each arc is its own absolutely-stacked SVG layer,
 * so a CSS transform on it scales/rotates around the ring centre.
 */
export function BarrierRing({
  size, r, stroke, padDeg = 8, colorOf, segMotion, labels, children, className, style,
}: BarrierRingProps) {
  return (
    <div
      aria-hidden
      className={`relative ${className ?? ''}`}
      style={{ width: size, height: size, ...style }}
    >
      {Array.from({ length: RING_SEGMENTS }, (_, i) => {
        const m = segMotion?.(i);
        return (
          <motion.svg
            key={i}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="absolute inset-0 overflow-visible"
            {...m}
          >
            <path
              d={segmentPath(i, size, r, padDeg)}
              fill="none"
              stroke={colorOf(i)}
              strokeWidth={stroke}
              strokeLinecap="round"
              style={{ transition: 'stroke 0.3s ease' }}
            />
          </motion.svg>
        );
      })}
      {children}
      {labels?.texts.map((t, i) => {
        const c = labelCenter(i, size, labels.radius);
        return (
          <motion.span
            key={t}
            className={`absolute text-center ${labels.className}`}
            style={{ left: c.x - labels.width / 2, top: c.y - 11, width: labels.width, lineHeight: '22px' }}
            {...labels.motionOf?.(i)}
          >
            {t}
          </motion.span>
        );
      })}
    </div>
  );
}

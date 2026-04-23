/**
 * CircularProgress — shared circular progress ring.
 *
 * Single source of truth for the "Strength Programs" ring visual.
 * Originally lived inline in StrengthSummaryPage.tsx; extracted so the
 * Steps Summary Card and any future widget can render a 1:1 identical
 * ring without copy-pasting SVG math.
 *
 * Defaults match the StrengthSummaryPage variant exactly:
 *   size = 80, strokeWidth = 6, primary stroke = `text-primary`,
 *   track = `text-slate-100 dark:text-slate-700`,
 *   center label = `{percentage}%` in extrabold.
 *
 * Pass `children` to override the center label (e.g. show steps icon
 * instead of percentage).
 */

import React from 'react';
import { clsx } from 'clsx';

export interface CircularProgressProps {
  /** 0–100. Values outside the range are clamped. */
  percentage: number;
  /** Outer pixel size of the SVG (width === height). Default 80. */
  size?: number;
  /** Stroke width in pixels. Default 6. */
  strokeWidth?: number;
  /** Tailwind text-color class for the progress arc. Default 'text-primary'. */
  colorClass?: string;
  /** Tailwind text-color class for the background track. Default slate-100 / slate-700. */
  trackClass?: string;
  /** Optional extra classes for the wrapping div. */
  className?: string;
  /** Custom center content. When omitted, renders `{percentage}%`. */
  children?: React.ReactNode;
}

export default function CircularProgress({
  percentage,
  size = 80,
  strokeWidth = 6,
  colorClass = 'text-primary',
  trackClass = 'text-slate-100 dark:text-slate-700',
  className,
  children,
}: CircularProgressProps) {
  const clamped = Math.min(100, Math.max(0, percentage));
  const cx = size / 2;
  const radius = cx - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={clsx(
        'relative flex items-center justify-center',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        className="w-full h-full -rotate-90"
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          className={trackClass}
          cx={cx}
          cy={cx}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
        />
        <circle
          className={colorClass}
          cx={cx}
          cy={cx}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children ?? (
          <span className="text-lg font-extrabold text-slate-800 dark:text-white">
            {Math.round(clamped)}
            <span className="text-xs font-normal">%</span>
          </span>
        )}
      </div>
    </div>
  );
}

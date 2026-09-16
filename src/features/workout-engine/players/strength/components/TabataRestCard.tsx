'use client';

import React from 'react';
import Image from 'next/image';
import { OFFLINE_PLACEHOLDER } from '../hooks/usePlayerMedia';

/**
 * TabataRestCard — tabata REST interval, rendered in the same bottom-sheet
 * time-based-card visual language as the WORK interval (IsometricTimerCard),
 * instead of the full-screen big-number PreparingStateView overlay.
 *
 * Purely presentational — the countdown is owned entirely by the state
 * machine's own rest clock (`restTimeLeft`), which already drives the
 * beeps and auto-advance. No internal timer, no CTA: tabata rest is
 * auto-only, same as the work interval.
 */

const RECT_W = 200;
const RECT_H = 80;
const RECT_RX = 14;
const RECT_STROKE = 3;
const RECT_INSET = RECT_STROKE / 2;
const RECT_PERIMETER = 2 * ((RECT_W - RECT_STROKE) + (RECT_H - RECT_STROKE));

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export interface TabataRestCardProps {
  /** Seconds remaining in the current rest interval (ticks down externally). */
  restTimeLeft: number;
  /** Total rest duration for this block (`blockProtocol.config.restSec`). */
  totalRest: number;
  /** Name of the next exercise, shown under the countdown. */
  nextExerciseName: string;
  /** Resolved (offline-cached) video URL for the blurred background. */
  safeVideoUrl: string | null;
  /** Resolved (offline-cached) image URL — preferred over video for the background. */
  safeImageUrl: string | null;
  /** Whether the parent's fade-in opacity transition is at 1. */
  fadeIn: boolean;
}

export default function TabataRestCard({
  restTimeLeft,
  totalRest,
  nextExerciseName,
  safeVideoUrl,
  safeImageUrl,
  fadeIn,
}: TabataRestCardProps) {
  const clampedRemaining = Math.max(0, restTimeLeft);
  const progress = totalRest > 0
    ? Math.max(0, Math.min((totalRest - clampedRemaining) / totalRest, 1))
    : 1;
  const strokeDashoffset = RECT_PERIMETER * (1 - progress);
  const borderColor = clampedRemaining <= 3 ? '#F97316' : '#93C5FD';

  return (
    <div className={`absolute inset-0 transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
      {/* Background — blurred next-exercise video/image, matches PreparingStateView */}
      {(safeVideoUrl || safeImageUrl) && (
        <div className="absolute inset-0">
          {safeImageUrl && safeImageUrl !== OFFLINE_PLACEHOLDER ? (
            safeImageUrl.startsWith('blob:') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={safeImageUrl}
                alt=""
                className="w-full h-full object-cover blur-2xl scale-110 opacity-30"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <Image
                src={safeImageUrl}
                alt=""
                fill
                className="object-cover blur-2xl scale-110 opacity-30"
                priority
                sizes="100vw"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )
          ) : safeVideoUrl ? (
            <video
              src={safeVideoUrl}
              className="w-full h-full object-cover blur-2xl scale-110 opacity-30"
              autoPlay
              loop
              muted
              playsInline
              {...{ 'webkit-playsinline': 'true' }}
            />
          ) : null}
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {/* Bottom-sheet countdown card — same visual language as IsometricTimerCard */}
      <div
        className="absolute inset-x-0 bottom-0 bg-white dark:bg-[#0F172A] rounded-t-3xl shadow-2xl select-none"
        dir="rtl"
      >
        <div
          className="px-6 pt-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 16px))' }}
        >
          <p
            className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider text-center mb-3"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            מנוחה
          </p>

          <div className="relative flex justify-center mb-2">
            <div className="relative" style={{ width: RECT_W, height: RECT_H }}>
              <svg
                className="absolute inset-0"
                width={RECT_W}
                height={RECT_H}
                viewBox={`0 0 ${RECT_W} ${RECT_H}`}
              >
                <rect
                  x={RECT_INSET} y={RECT_INSET}
                  width={RECT_W - RECT_STROKE} height={RECT_H - RECT_STROKE}
                  rx={RECT_RX} ry={RECT_RX}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth={RECT_STROKE}
                />
                <rect
                  x={RECT_INSET} y={RECT_INSET}
                  width={RECT_W - RECT_STROKE} height={RECT_H - RECT_STROKE}
                  rx={RECT_RX} ry={RECT_RX}
                  fill="none"
                  stroke={borderColor}
                  strokeWidth={RECT_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={RECT_PERIMETER}
                  strokeDashoffset={strokeDashoffset}
                  style={{
                    transition: 'stroke-dashoffset 0.95s linear, stroke 0.4s ease',
                    filter: `drop-shadow(0 0 4px ${borderColor}80)`,
                  }}
                />
              </svg>

              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-5xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {formatTime(clampedRemaining)}
                </span>
              </div>
            </div>
          </div>

          <p
            className="text-sm text-slate-400 dark:text-slate-500 text-center mb-1 tabular-nums"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            / {formatTime(totalRest)}
          </p>

          <p
            className="text-base font-bold text-slate-900 dark:text-white text-center mb-4"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {nextExerciseName}
          </p>
        </div>
      </div>
    </div>
  );
}

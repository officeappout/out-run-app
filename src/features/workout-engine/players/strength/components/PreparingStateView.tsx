'use client';

import React from 'react';
import Image from 'next/image';
import { OFFLINE_PLACEHOLDER } from '../hooks/usePlayerMedia';

/**
 * PreparingStateView — full-screen big-number countdown overlay.
 *
 * Originally the PREPARING-phase "מתכוננים..." screen; generalised (protocol-
 * blocks, tabata) into the shared big-number overlay reused for THREE surfaces,
 * selected by `variant`:
 *   • 'prep' — PREPARING phase before the first set (default, unchanged)
 *   • 'work' — tabata work interval (countdown workSec → 0, over the exercise video)
 *   • 'rest' — tabata rest interval (countdown restSec → 0, over the next-exercise video)
 *
 * Renders:
 *   • An optional blurred / dimmed background (image → video → transparent).
 *     Pass both URLs null to stay transparent and let the caller's video show through.
 *   • A massive centered countdown number, coloured by `variant`.
 *   • A `label` line ("מתכוננים..." / "מנוחה" / …) + the exercise name + optional AI cue.
 *
 * Pure presentational — orchestrator owns the visibility condition and the
 * fade-in opacity flag.  Extracted from StrengthRunner.tsx (Decoupling Step R-9).
 */

/** Big-number colour per surface. prep = white (unchanged); work/rest are the
 *  separate tabata work↔rest tones (logged in color-system.md §4). */
const VARIANT_NUMBER_COLOR: Record<'prep' | 'work' | 'rest', string> = {
  prep: '#FFFFFF',
  work: '#22D3EE', // bright cyan — active effort (strength identity)
  rest: '#93C5FD', // soft blue — recovery / winding down
};

export interface PreparingStateViewProps {
  /** Current countdown value (e.g. 5→1 prep, 20→1 work, 10→1 rest). */
  count: number;
  /** Resolved video URL used as fallback blur background (null = transparent). */
  safeVideoUrl: string | null;
  /** Resolved image URL — preferred blur background (null = fall back to video/transparent). */
  safeImageUrl: string | null;
  /** Name of the exercise shown under the countdown. */
  exerciseName: string;
  /** Whether the parent's fade-in opacity transition is currently 1 (fade gate). */
  fadeIn: boolean;
  /** Optional workout-level AI cue rendered as a small tip line. */
  aiCue?: string;
  /** Caption under the number. Default "מתכוננים..." keeps the PREPARING surface unchanged. */
  label?: string;
  /** Surface selector — drives the big-number colour. Default 'prep' = white. */
  variant?: 'prep' | 'work' | 'rest';
}

export default function PreparingStateView({
  count,
  safeVideoUrl,
  safeImageUrl,
  exerciseName,
  fadeIn,
  aiCue,
  label = 'מתכוננים...',
  variant = 'prep',
}: PreparingStateViewProps) {
  const numberColor = VARIANT_NUMBER_COLOR[variant];
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 ${
        fadeIn ? 'opacity-100' : 'opacity-0'
      }`}
    >
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
              {...{"webkit-playsinline": "true"}}
            />
          ) : null}
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}
      <div className="relative z-10 text-center">
        <div className="text-8xl font-bold mb-4 tabular-nums" style={{ fontFamily: 'var(--font-simpler)', color: numberColor }}>
          {count}
        </div>
        <p className="text-xl text-white/80" style={{ fontFamily: 'var(--font-simpler)' }}>{label}</p>
        <p className="text-lg text-white/60 mt-4" style={{ fontFamily: 'var(--font-simpler)' }}>{exerciseName}</p>
        {aiCue && (
          <p className="text-sm text-white/50 mt-3 max-w-[260px] mx-auto" style={{ fontFamily: 'var(--font-simpler)' }}>
            💡 {aiCue}
          </p>
        )}
      </div>
    </div>
  );
}

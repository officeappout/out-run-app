'use client';

import React from 'react';
import Image from 'next/image';
import { OFFLINE_PLACEHOLDER } from '../hooks/usePlayerMedia';

/**
 * PreparingStateView — full-screen "מתכוננים..." countdown overlay.
 *
 * Shown during the PREPARING phase before the first set.  Renders:
 *   • A blurred / dimmed background (image if available, else video, else solid)
 *   • A massive centered countdown number (5 → 1)
 *   • The active exercise name + an optional AI cue line
 *
 * Pure presentational — orchestrator owns the visibility condition
 * (`workoutState === 'PREPARING'`) and the fade-in opacity flag.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-9).
 */

export interface PreparingStateViewProps {
  /** Current countdown value (typically 5 → 1, then transitions to ACTIVE). */
  preparationCountdown: number;
  /** Resolved video URL of the first exercise — used as fallback blur background. */
  safeVideoUrl: string | null;
  /** Resolved image URL of the first exercise — preferred blur background. */
  safeImageUrl: string | null;
  /** Name of the first exercise shown under the countdown. */
  exerciseName: string;
  /** Whether the parent's fade-in opacity transition is currently 1 (fade gate). */
  fadeIn: boolean;
  /** Optional workout-level AI cue rendered as a small tip line. */
  aiCue?: string;
}

export default function PreparingStateView({
  preparationCountdown,
  safeVideoUrl,
  safeImageUrl,
  exerciseName,
  fadeIn,
  aiCue,
}: PreparingStateViewProps) {
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
            />
          ) : null}
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}
      <div className="relative z-10 text-center">
        <div className="text-8xl font-bold text-white mb-4" style={{ fontFamily: 'var(--font-simpler)' }}>
          {preparationCountdown}
        </div>
        <p className="text-xl text-white/80" style={{ fontFamily: 'var(--font-simpler)' }}>מתכוננים...</p>
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

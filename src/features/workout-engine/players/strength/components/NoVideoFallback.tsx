'use client';

import React, { useEffect, useState } from 'react';
import { PersonStanding } from 'lucide-react';

/**
 * NoVideoFallback — what the live player shows when an exercise has no playable video
 * (S7, pilot wave 2: home stretches with a photo only, or with nothing at all).
 *
 * Photo first (the exercise's own image, offline placeholder included). No photo, or it fails
 * to load → a calm icon + the exercise name. Replaces the old generic stock squats clip, which
 * showed an unrelated exercise (or black, when that remote clip failed).
 */
export interface NoVideoFallbackProps {
  exerciseId: string;
  exerciseName: string;
  imageUrl?: string | null;
  /** Fired once the frame is settled (photo loaded / failed, or the empty state mounted). */
  onReady: () => void;
}

export default function NoVideoFallback({ exerciseId, exerciseName, imageUrl, onReady }: NoVideoFallbackProps) {
  const [failed, setFailed] = useState(false);
  const showImage = !!imageUrl && !failed;

  useEffect(() => {
    if (!showImage) onReady();
  }, [showImage, onReady]);

  if (showImage) {
    return (
      <img
        key={`img-${exerciseId}`}
        src={imageUrl!}
        alt={exerciseName}
        className="absolute inset-0 w-full h-full object-contain"
        onLoad={onReady}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      data-testid="no-video-fallback"
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 pb-[220px] bg-gradient-to-b from-slate-800 to-black"
    >
      <div className="w-20 h-20 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
        <PersonStanding size={40} className="text-white/70" />
      </div>
      <p className="text-lg font-bold text-white/80 text-center" style={{ fontFamily: 'var(--font-simpler)' }}>
        {exerciseName}
      </p>
    </div>
  );
}

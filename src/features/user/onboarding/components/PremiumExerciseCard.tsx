'use client';

/**
 * PremiumExerciseCard — Auto-playing looped video with 4-sided white-fade gradient.
 *
 * Used in onboarding answer cards to show the linked exercise demo.
 * The gradient makes the video "melt" into the white background from every side.
 */

import { useRef, useCallback, useState } from 'react';

interface PremiumExerciseCardProps {
  videoUrl: string;
  posterUrl?: string | null;
  exerciseName?: string;
  className?: string;
}

export default function PremiumExerciseCard({
  videoUrl,
  posterUrl,
  exerciseName,
  className = '',
}: PremiumExerciseCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleCanPlay = useCallback(() => {
    setLoaded(true);
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!error ? (
        <video
          ref={videoRef}
          src={videoUrl}
          poster={posterUrl ?? undefined}
          autoPlay
          loop
          muted
          playsInline
          onCanPlay={handleCanPlay}
          onError={() => setError(true)}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        <div className="w-full aspect-video bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
          <span className="text-4xl opacity-40">🏋️</span>
        </div>
      )}

      {/* 4-sided white fade overlays */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white via-transparent via-30% to-transparent" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-white via-transparent via-25% to-transparent" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-white via-transparent via-20% to-transparent" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-l from-white via-transparent via-20% to-transparent" />

      {/* Loading shimmer */}
      {!loaded && !error && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-100 animate-pulse flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      )}

      {/* Exercise name label */}
      {exerciseName && loaded && (
        <div className="absolute bottom-3 inset-x-0 text-center pointer-events-none">
          <span className="text-xs font-bold text-slate-600 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full">
            {exerciseName}
          </span>
        </div>
      )}
    </div>
  );
}

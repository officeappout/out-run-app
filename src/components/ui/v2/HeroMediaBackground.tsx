'use client';

/**
 * HeroMediaBackground — a workout card's media layer: the thumbnail as the
 * base, the video loop crossfading in once it can play, and the on-brand
 * gradient when no real media resolved (never a stock photo). Moved verbatim
 * from home's HeroWorkoutCard (which re-exports it) so every workout card —
 * home's daily card, the place pages' MediaWorkoutCard — shares one
 * treatment. Fill a `position: relative` parent; pick the media with
 * heroMedia.utils (pickHeroExercise + resolveHeroMedia).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export default function HeroMediaBackground({
  thumbnailUrl,
  videoUrl,
  alt = 'Workout',
}: {
  thumbnailUrl: string;
  videoUrl: string;
  /** The still's alt text (home keeps its historical default). */
  alt?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  const handleCanPlay = useCallback(() => setVideoReady(true), []);

  useEffect(() => {
    setVideoReady(false);
  }, [videoUrl]);

  return (
    <>
      {/* Thumbnail (always rendered as base layer) — falls to an on-brand
          gradient, never a stock photo, when no real exercise media resolved
          at all (hero-image fix, 2026-10-01: see heroMedia.utils.ts's own
          doc comment — this used to be a generic indoor-gym Unsplash bank
          unrelated to the actual workout; removed, not patched). Same
          gradient as this card's own CTA pill below, for brand consistency. */}
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <div
          className="absolute inset-0 w-full h-full"
          style={{ background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)' }}
        />
      )}

      {/* Lazy video loop (fades in when ready) */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
          {...{"webkit-playsinline": "true"}}
          preload="auto"
          onCanPlayThrough={handleCanPlay}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
            videoReady ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Subtle dark vignette at the very top for badge readability */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/20 to-transparent" />
    </>
  );
}

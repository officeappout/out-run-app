'use client';

import { useRef, useCallback } from 'react';

interface VideoPlayerProps {
  /** Legacy / fallback URL. */
  videoUrl: string | null;
  /** HEVC with Alpha for iOS / Safari (.mov). */
  videoUrlMov?: string | null;
  /** VP9 with Alpha for Android / Chrome / Firefox (.webm). */
  videoUrlWebm?: string | null;
  /** Accepted but intentionally unused — kept so callers don't need updating. */
  thumbnailUrl?: string | null;
  className?: string;
  /** When true, renders white gradient overlays on all 4 sides so the video melts into white. */
  whiteGradient?: boolean;
}

export default function VideoPlayer({
  videoUrl,
  videoUrlMov,
  videoUrlWebm,
  className = '',
  whiteGradient = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const sourceKey = `${videoUrlWebm ?? ''}_${videoUrlMov ?? ''}_${videoUrl ?? ''}`;
  const hasSources = !!(videoUrlWebm || videoUrlMov || videoUrl);

  const handleCanPlay = useCallback(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  const handleError = useCallback(() => {
    console.error('[VideoPlayer] video element error — all sources failed to load');
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Fill parent container — height is controlled by the flex-1 parent in VisualSlider */}
      <div className="relative w-full h-full">

        {hasSources && (
          /* ── Video — preload="auto" causes the browser to buffer and paint
               frame 0 directly from cache, with zero overlay or fade flash. ── */
          <video
            ref={videoRef}
            key={sourceKey}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onCanPlay={handleCanPlay}
            onError={handleError}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ background: 'transparent' }}
          >
            {videoUrlWebm && <source src={videoUrlWebm} type="video/webm" />}
            {videoUrlMov  && <source src={videoUrlMov}  type="video/quicktime" />}
            {videoUrl     && <source src={videoUrl} />}
          </video>
        )}

        {/* Bottom gradient only — top gradient lives outside overflow-hidden in VisualSlider */}
        {whiteGradient && hasSources && (
          <div
            className="absolute bottom-[-2px] left-0 right-0 h-[82px] pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(255,255,255,1), rgba(255,255,255,0.9), rgba(255,255,255,0.7), rgba(255,255,255,0))' }}
          />
        )}
      </div>
    </div>
  );
}

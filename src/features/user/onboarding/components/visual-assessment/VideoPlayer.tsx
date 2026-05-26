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
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Fixed aspect-ratio container prevents layout shift while video loads */}
      <div className="relative w-full aspect-[3/4] max-h-[480px]">

        {hasSources ? (
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
            className="absolute inset-0 w-full h-full object-contain"
            style={{ background: 'transparent' }}
          >
            {videoUrlWebm && <source src={videoUrlWebm} type="video/webm" />}
            {videoUrlMov  && <source src={videoUrlMov}  type="video/quicktime" />}
            {videoUrl     && <source src={videoUrl} />}
          </video>
        ) : (
          /* ── No-source / error placeholder ── */
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center rounded-2xl">
            <div className="text-center">
              <div className="text-5xl mb-2 opacity-40">🏋️</div>
              <p className="text-xs text-slate-400 font-medium">
                אין וידאו — הזיזו את הסליידר
              </p>
            </div>
          </div>
        )}

        {/* 4-sided white gradient — video melts into white from every direction */}
        {whiteGradient && hasSources && (
          <>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white via-transparent via-25% to-transparent" />
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-white via-transparent via-20% to-transparent" />
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-white via-transparent via-15% to-transparent" />
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-l from-white via-transparent via-15% to-transparent" />
          </>
        )}
      </div>
    </div>
  );
}

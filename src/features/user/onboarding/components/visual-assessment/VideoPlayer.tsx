'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface VideoPlayerProps {
  /** Legacy / fallback URL. */
  videoUrl: string | null;
  /** HEVC with Alpha for iOS / Safari (.mov). */
  videoUrlMov?: string | null;
  /** VP9 with Alpha for Android / Chrome / Firefox (.webm). */
  videoUrlWebm?: string | null;
  thumbnailUrl?: string | null;
  className?: string;
  /** When true, renders white gradient overlays on all 4 sides so the video melts into white. */
  whiteGradient?: boolean;
}

export default function VideoPlayer({
  videoUrl,
  videoUrlMov,
  videoUrlWebm,
  thumbnailUrl,
  className = '',
  whiteGradient = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const sourceKey = `${videoUrlWebm ?? ''}_${videoUrlMov ?? ''}_${videoUrl ?? ''}`;
  const hasSources = !!(videoUrlWebm || videoUrlMov || videoUrl);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [sourceKey]);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
    videoRef.current?.play().catch(() => {});
  }, []);

  const handleError = useCallback(() => {
    console.error('[VideoPlayer] video element error — all sources failed to load');
    setIsLoading(false);
    setHasError(true);
  }, []);

  const showPlaceholder = !hasSources || hasError;

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Fixed aspect-ratio container prevents layout shift while video loads */}
      <div className="relative w-full aspect-[3/4] max-h-[480px]">

        {/* ── Thumbnail — always rendered as the lowest layer ─────────────
            Visible until the video fades in. Provides seamless coverage
            so there's never a blank/white flash between content changes. */}
        {thumbnailUrl && !showPlaceholder && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
              isLoading ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* ── Fallback skeleton — only shown while loading with no thumbnail ── */}
        {isLoading && hasSources && !hasError && !thumbnailUrl && (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50/80 to-slate-100/80 animate-pulse flex items-center justify-center rounded-2xl">
            <div className="w-10 h-10 border-2 border-slate-300 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        )}

        {/* ── Video — fades in over the thumbnail once buffered ── */}
        {!showPlaceholder ? (
          <video
            ref={videoRef}
            key={sourceKey}
            autoPlay
            loop
            muted
            playsInline
            onCanPlay={handleCanPlay}
            onError={handleError}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
              isLoading ? 'opacity-0' : 'opacity-100'
            }`}
            style={{ background: 'transparent' }}
          >
            {videoUrlWebm && <source src={videoUrlWebm} type="video/webm" />}
            {videoUrlMov && <source src={videoUrlMov} type="video/quicktime" />}
            {videoUrl && <source src={videoUrl} />}
          </video>
        ) : (
          /* ── No-source / error placeholder ── */
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center rounded-2xl">
            <div className="text-center">
              <div className="text-5xl mb-2 opacity-40">🏋️</div>
              <p className="text-xs text-slate-400 font-medium">
                {hasError ? 'שגיאה בטעינת הווידאו' : 'אין וידאו — הזיזו את הסליידר'}
              </p>
            </div>
          </div>
        )}

        {/* 4-sided white gradient — video melts into white from every direction */}
        {whiteGradient && !showPlaceholder && (
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

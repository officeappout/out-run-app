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
}

/**
 * Transparent video player with cross-platform source selection,
 * soft drop-shadow, smooth cross-fade on source change, and loading shimmer.
 *
 * Serves the correct format via `<source>` tags:
 *  - Safari / iOS  → HEVC with Alpha (.mov, video/quicktime)
 *  - Chrome / FF   → VP9 with Alpha (.webm, video/webm)
 *  - Fallback      → Legacy videoUrl
 */
export default function VideoPlayer({
  videoUrl,
  videoUrlMov,
  videoUrlWebm,
  thumbnailUrl,
  className = '',
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Build a composite key so React re-renders when any source changes
  const sourceKey = `${videoUrlWebm ?? ''}_${videoUrlMov ?? ''}_${videoUrl ?? ''}`;
  const hasSources = !!(videoUrlWebm || videoUrlMov || videoUrl);

  useEffect(() => {
    console.log('[VideoPlayer] props received:', {
      videoUrl: videoUrl ?? '(null)',
      videoUrlMov: videoUrlMov ?? '(null)',
      videoUrlWebm: videoUrlWebm ?? '(null)',
      hasSources,
      sourceKey: sourceKey.substring(0, 80) + (sourceKey.length > 80 ? '…' : ''),
    });
  }, [sourceKey, videoUrl, videoUrlMov, videoUrlWebm, hasSources]);

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
      {/* Drop-shadow wrapper — works on transparent content */}
      <div
        className="relative w-full"
        style={{ filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.12))' }}
      >
        {!showPlaceholder ? (
          <video
            ref={videoRef}
            key={sourceKey}
            poster={thumbnailUrl ?? undefined}
            autoPlay
            loop
            muted
            playsInline
            onCanPlay={handleCanPlay}
            onError={handleError}
            className={`w-full object-contain rounded-2xl transition-opacity duration-500 ${
              isLoading ? 'opacity-0' : 'opacity-100'
            }`}
            style={{ maxHeight: '240px', background: 'transparent' }}
          >
            {/* WebM source first — Chrome / Firefox / Android will pick this */}
            {videoUrlWebm && (
              <source src={videoUrlWebm} type="video/webm" />
            )}
            {/* MOV source — Safari / iOS will pick this */}
            {videoUrlMov && (
              <source src={videoUrlMov} type="video/quicktime" />
            )}
            {/* Fallback legacy URL */}
            {videoUrl && (
              <source src={videoUrl} />
            )}
          </video>
        ) : (
          /* Placeholder — no video available */
          <div className="w-full aspect-[4/3] max-h-[240px] rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-2 opacity-60">🏋️</div>
              <p className="text-xs text-slate-400 font-medium">
                {hasError ? 'שגיאה בטעינת הווידאו' : 'אין וידאו — הזיזו את הסליידר'}
              </p>
            </div>
          </div>
        )}

        {/* Loading shimmer overlay */}
        {isLoading && hasSources && !hasError && (
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 animate-pulse flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

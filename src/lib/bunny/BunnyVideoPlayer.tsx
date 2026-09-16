'use client';

/**
 * BunnyVideoPlayer — shared native HLS/MP4 player for a Bunny Stream video.
 *
 * Extracted from EquipmentDetailDrawer.tsx (16.09.2026 unification) so both
 * the machine-detail drawer and the live workout player render Bunny video
 * through ONE component instead of two drifting copies. Every prop besides
 * `videoId`/`poster` defaults to EquipmentDetailDrawer's original,
 * unchanged behavior — its own call site is untouched.
 *
 * Safari/iOS → native HLS (autoplay). Chrome/Android → hls.js. Fallback →
 * 720p MP4. `poster` is shown until the first frame decodes.
 */

import React, { useEffect, useRef } from 'react';
import { buildBunnyHlsUrl, buildBunnyStreamUrl } from './bunny.config';

export interface BunnyVideoPlayerProps {
  videoId: string;
  /** Shown until the first frame decodes (typically the brand's product image). */
  poster?: string;
  /** CSS object-fit. Default 'cover' — EquipmentDetailDrawer's original hero framing. */
  objectFit?: 'cover' | 'contain';
  /** Loop playback. Default false — EquipmentDetailDrawer's original single-clip hero. */
  loop?: boolean;
  /** Native browser video controls. Default true — EquipmentDetailDrawer's original behavior. */
  showControls?: boolean;
  /** Pause/resume playback — the live player uses this to respect workout pause state. Default false. */
  isPaused?: boolean;
  /** Mirrors the native <video> loading events, for callers that manage their own spinner (e.g. the live player). */
  onLoadStart?: () => void;
  onLoadedData?: () => void;
  onError?: () => void;
}

export default function BunnyVideoPlayer({
  videoId,
  poster,
  objectFit = 'cover',
  loop = false,
  showControls = true,
  isPaused = false,
  onLoadStart,
  onLoadedData,
  onError,
}: BunnyVideoPlayerProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // Read inside the mount effect without adding isPaused to its deps — a
  // pause toggle must not re-run HLS/hls.js setup. See the dedicated
  // isPaused effect below for the actual play/pause toggling.
  const isPausedRef = useRef(isPaused);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  useEffect(() => {
    const vid = ref.current;
    if (!vid) return;

    let cancelled = false;
    let hlsInstance: { destroy: () => void } | null = null;

    const hlsUrl = buildBunnyHlsUrl(videoId);
    const mp4Url = buildBunnyStreamUrl(videoId, 720);
    const playIfNotPaused = (v: HTMLVideoElement) => {
      if (!isPausedRef.current) v.play().catch(() => {});
    };

    if (vid.canPlayType('application/vnd.apple.mpegurl')) {
      vid.src = hlsUrl;
      vid.load();
      playIfNotPaused(vid);
      return () => { cancelled = true; };
    }

    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return;
        const v = ref.current;
        if (!v) return;
        if (!Hls.isSupported()) {
          v.src = mp4Url;
          v.load();
          playIfNotPaused(v);
          return;
        }
        const hls = new Hls({ startLevel: 2, maxBufferLength: 20, enableWorker: true });
        hls.loadSource(hlsUrl);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!cancelled) playIfNotPaused(v);
        });
        hlsInstance = hls;
      })
      .catch(() => {
        if (cancelled) return;
        const v = ref.current;
        if (v) { v.src = mp4Url; v.load(); playIfNotPaused(v); }
      });

    return () => {
      cancelled = true;
      hlsInstance?.destroy();
    };
  }, [videoId]);

  // Pause/resume toggling — separate from the mount effect above so an
  // isPaused change never re-triggers HLS/hls.js setup.
  useEffect(() => {
    const vid = ref.current;
    if (!vid) return;
    if (isPaused) vid.pause();
    else vid.play().catch(() => {});
  }, [isPaused]);

  // Re-mute when exiting fullscreen so the inline hero stays silent.
  // Captures `vid` at effect-run time so cleanup removes from the correct element.
  useEffect(() => {
    const vid = ref.current;
    if (!vid) return;
    const onExit = () => { if (ref.current) ref.current.muted = true; };
    const onDocChange = () => { if (!document.fullscreenElement) onExit(); };
    document.addEventListener('fullscreenchange', onDocChange);
    vid.addEventListener('webkitendfullscreen', onExit);
    return () => {
      document.removeEventListener('fullscreenchange', onDocChange);
      vid.removeEventListener('webkitendfullscreen', onExit);
    };
  }, [videoId]);

  const enterFullscreen = () => {
    const vid = ref.current;
    if (!vid) return;
    vid.muted = false;
    if (typeof (vid as any).webkitEnterFullscreen === 'function') {
      (vid as any).webkitEnterFullscreen();
    } else if (vid.requestFullscreen) {
      vid.requestFullscreen().catch(() => {});
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 10) return; // tap — let native controls handle it
    if (Math.abs(dy) >= 50 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      e.preventDefault();
      if (dy < 0) {
        enterFullscreen(); // swipe up → fullscreen
      } else if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {}); // swipe down → exit (Chrome/Android)
      }
    }
  };

  return (
    <div
      className="absolute inset-0 w-full h-full"
      onClick={enterFullscreen}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <video
        key={videoId}
        ref={ref}
        poster={poster}
        className={`absolute inset-0 w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
        muted
        loop={loop}
        playsInline
        {...{ 'webkit-playsinline': 'true' }}
        controls={showControls}
        preload="metadata"
        onLoadStart={onLoadStart}
        onLoadedData={onLoadedData}
        onError={onError}
      />
    </div>
  );
}

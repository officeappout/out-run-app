'use client';

/**
 * ExerciseVideoPlayer — provider-aware video renderer.
 *
 * Renders the right element for the active provider:
 *   - bunny + preview   → muted MP4 loop (lazy-played via IntersectionObserver)
 *   - bunny + tutorial  → native <video> with HLS adaptive streaming:
 *                           Safari/iOS   → native HLS (video.canPlayType check)
 *                           Chrome/Android → hls.js (dynamic import)
 *                           Fallback     → 720p progressive MP4
 *   - youtube           → YouTube iframe (legacy/instructional)
 *   - internal / firebase-storage / fallback → native <video> with the legacy URL
 *
 * Props:
 *   video            — ExternalVideo reference (videoId + provider)
 *   mode             — 'preview' (autoplay loop muted) or 'tutorial' (full player)
 *   legacyVideoUrl   — optional fallback for old `media.videoUrl` strings
 *   className        — wrapper classes (sizing/aspect)
 */

import { useEffect, useRef, useState } from 'react';
import { Video as VideoIcon } from 'lucide-react';
import {
  buildBunnyThumbnailUrl,
  buildBunnyHlsUrl,
  buildBunnyStreamUrl,
} from '@/lib/bunny/bunny.config';
import { useNetworkAwareStreamUrl } from '../hooks/useNetworkAwareStreamUrl';
import type { ExternalVideo } from '../../core/exercise.types';

interface ExerciseVideoPlayerProps {
  video?: ExternalVideo;
  mode: 'preview' | 'tutorial';
  legacyVideoUrl?: string | null;
  className?: string;
  /**
   * For preview mode — when true, the video element is rendered but
   * playback is gated by an IntersectionObserver to keep list scrolling fluid.
   */
  lazyPlay?: boolean;
  /**
   * Static thumbnail shown while the video buffers.
   * For <video> elements this becomes the native `poster` attribute.
   * For iframes (YouTube) a lightweight <img> overlay is rendered on
   * top until the iframe fires its `load` event.
   */
  posterUrl?: string | null;
  /**
   * Controls CSS object-fit on the underlying <video> element.
   * 'cover' (default) fills the container — may crop tall subjects.
   * 'contain' shows the full frame — letterboxes into the container bg.
   */
  objectFit?: 'cover' | 'contain';
}

/** Detect a YouTube video ID from a raw URL (youtube.com/* or youtu.be/*). */
function extractYoutubeId(url: string): string | null {
  const re =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const m = url.match(re);
  return m ? m[1] : null;
}

/**
 * Detect a Bunny CDN video UUID from a raw URL.
 * Matches paths like: /<uuid>/play_360p.mp4 or /<uuid>/playlist.m3u8
 */
function extractBunnyVideoIdFromUrl(url: string): string | null {
  const m = url.match(
    /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i,
  );
  return m ? m[1] : null;
}

export default function ExerciseVideoPlayer({
  video,
  mode,
  legacyVideoUrl,
  className,
  lazyPlay = false,
  posterUrl,
  objectFit = 'cover',
}: ExerciseVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef     = useRef<HTMLVideoElement | null>(null); // preview / internal / legacy
  const tutorialRef  = useRef<HTMLVideoElement | null>(null); // Bunny tutorial HLS player
  const touchStart   = useRef<{ x: number; y: number } | null>(null);

  // `iframeLoaded` is only needed for YouTube iframes (Bunny no longer uses iframes).
  // Resets whenever the video source changes so the poster re-shows on navigation.
  const [iframeLoaded, setIframeLoaded] = useState(false);
  useEffect(() => { setIframeLoaded(false); }, [video?.videoId, legacyVideoUrl]);

  // ── Two-stage lazy state ─────────────────────────────────────────────────
  // `hasBeenVisible` is sticky — once the card appeared we keep <video src> mounted
  // so the player resumes instantly when scrolled back into view.
  // `isOnScreen` toggles on every intersection change — we only play while on-screen.
  const [hasBeenVisible, setHasBeenVisible] = useState(!lazyPlay);
  const [isOnScreen, setIsOnScreen] = useState(!lazyPlay);

  useEffect(() => {
    if (!lazyPlay || mode !== 'preview') return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setHasBeenVisible(true);
      setIsOnScreen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setHasBeenVisible(true);
          setIsOnScreen(entry.isIntersecting);
        }
      },
      { threshold: 0.25, rootMargin: '120px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazyPlay, mode]);

  // Drive play/pause on the preview <video> element.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isOnScreen) {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      v.pause();
    }
  }, [isOnScreen]);

  const allowMount = !lazyPlay || mode === 'tutorial' || hasBeenVisible;

  // ── Pre-detect Bunny UUID from legacyVideoUrl ─────────────────────────
  // Only extract when no ExternalVideo provider is set. MasterExerciseView controls which
  // source is active: it passes video=undefined + legacyVideoUrl=mainVideoUrl when the user
  // has explicitly picked a per-method variant; otherwise it passes video=fullTutorial + no
  // legacyVideoUrl, so this stays null and the fullTutorial plays by default.
  const legacyBunnyId =
    !video?.provider && legacyVideoUrl
      ? extractBunnyVideoIdFromUrl(legacyVideoUrl)
      : null;

  // ── Tutorial video ID ─────────────────────────────────────────────────
  // Priority: legacyBunnyId (per-method, only set after explicit user pick) first,
  // then fullTutorial videoId. Never undefined — null → HLS skips, empty state shows.
  const tutorialVideoId: string | null =
    mode === 'tutorial'
      ? (legacyBunnyId ?? (video?.provider === 'bunny' && video.videoId ? video.videoId : null))
      : null;

  console.log('[VideoPlayer] tutorialVideoId:', tutorialVideoId, '| legacy:', legacyBunnyId, '| video?.videoId:', video?.videoId);

  // ── HLS attachment for Bunny tutorial videos ──────────────────────────
  //
  // Strategy (in priority order):
  //   1. Safari / iOS  → native HLS via <video src="…playlist.m3u8">
  //   2. Chrome / Android / Firefox → hls.js adaptive streaming
  //   3. Fallback      → 720p progressive MP4 (always works, larger initial load)
  //
  // key={videoId} on the <video> element forces a DOM remount when the exercise
  // method changes, ensuring stale buffer state is discarded before this effect
  // re-runs with the new stream URL.
  useEffect(() => {
    if (!tutorialVideoId) return;
    const vid = tutorialRef.current;
    if (!vid) return;

    let cancelled = false;
    let hlsInstance: { destroy: () => void } | null = null;

    const hlsUrl = buildBunnyHlsUrl(tutorialVideoId);
    const mp4Url = buildBunnyStreamUrl(tutorialVideoId, 720);

    // Safari / iOS: native HLS
    if (vid.canPlayType('application/vnd.apple.mpegurl')) {
      vid.src = hlsUrl;
      vid.load();
      vid.play().catch(() => {});
      return () => { cancelled = true; };
    }

    // Chrome / Android / Firefox: hls.js
    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return;
        const v = tutorialRef.current;
        if (!v) return;

        if (!Hls.isSupported()) {
          // Browser cannot play HLS at all — progressive MP4 fallback
          v.src = mp4Url;
          v.load();
          v.play().catch(() => {});
          return;
        }

        const hls = new Hls({
          startLevel: 2,        // start at a mid-range quality level, not the lowest
          maxBufferLength: 20,
          enableWorker: true,
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!cancelled) v.play().catch(() => {});
        });
        hlsInstance = hls;
      })
      .catch(() => {
        // hls.js chunk failed to load — fall back to 720p MP4
        if (cancelled) return;
        const v = tutorialRef.current;
        if (v) { v.src = mp4Url; v.load(); v.play().catch(() => {}); }
      });

    return () => {
      cancelled = true;
      hlsInstance?.destroy();
    };
  }, [tutorialVideoId]);

  // ── Re-mute when exiting fullscreen ───────────────────────────────────
  // enterFullscreen() unmutes the video so the user hears sound in fullscreen.
  // This effect restores muted=true when they exit, so the inline hero stays silent.
  useEffect(() => {
    if (!tutorialVideoId) return;
    const vid = tutorialRef.current;
    if (!vid) return;
    const onExit = () => { if (tutorialRef.current) tutorialRef.current.muted = true; };
    const onDocChange = () => { if (!document.fullscreenElement) onExit(); };
    document.addEventListener('fullscreenchange', onDocChange);
    vid.addEventListener('webkitendfullscreen', onExit);
    return () => {
      document.removeEventListener('fullscreenchange', onDocChange);
      vid.removeEventListener('webkitendfullscreen', onExit);
    };
  }, [tutorialVideoId]);

  // ── Network-aware stream URL ───────────────────────────────────────────
  // Tutorial mode uses HLS (above). Only preview clips go through the
  // network-quality-aware MP4 resolver.
  const effectiveBunnyId =
    (video?.provider === 'bunny' ? (video.videoId ?? null) : null) ?? legacyBunnyId;
  const bunnyPreviewId = effectiveBunnyId && mode === 'preview' ? effectiveBunnyId : null;
  const { streamUrl: bunnyPreviewUrl } = useNetworkAwareStreamUrl(bunnyPreviewId);

  // ── Resolve provider + URLs ────────────────────────────────────────────
  let provider = video?.provider;
  let videoId = video?.videoId;
  let resolvedLegacy = legacyVideoUrl ?? undefined;

  // Auto-detect provider from a legacy URL when no ExternalVideo was passed.
  if (!provider && resolvedLegacy) {
    const yt = extractYoutubeId(resolvedLegacy);
    if (yt) {
      provider = 'youtube';
      videoId = yt;
    } else if (legacyBunnyId) {
      provider = 'bunny';
      videoId = legacyBunnyId;
      resolvedLegacy = undefined;
    } else {
      provider = 'internal';
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (!provider) {
    return (
      <div
        ref={containerRef}
        className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400 ${className ?? ''}`}
      >
        <VideoIcon size={32} />
      </div>
    );
  }

  // ── Bunny ──────────────────────────────────────────────────────────────
  if (provider === 'bunny' && videoId) {
    if (mode === 'tutorial') {
      const heroPoster = posterUrl ?? video?.thumbnailUrl ?? buildBunnyThumbnailUrl(videoId);

      // Native <video> with HLS — the HLS effect (above) sets src + calls play().
      // Key includes both videoId and legacyBunnyId: when two methods share the same
      // fullTutorial but have different mainVideoUrls the key still changes on switch.
      // object-cover fills the container — no black bars, edges may be cropped.
      // muted is required for autoplay to work on mobile without user interaction.
      const tutorialKey = videoId + (legacyBunnyId && legacyBunnyId !== videoId ? '-' + legacyBunnyId : '');

      const enterFullscreen = () => {
        const vid = tutorialRef.current;
        if (!vid) return;
        // Unmute so the user hears sound during fullscreen.
        vid.muted = false;
        // iOS WKWebView uses a non-standard API; standard API for Chrome/Android
        if (typeof (vid as any).webkitEnterFullscreen === 'function') {
          (vid as any).webkitEnterFullscreen();
        } else if (vid.requestFullscreen) {
          vid.requestFullscreen().catch(() => {});
        }
      };

      // Swipe-up → fullscreen; swipe-down → exit fullscreen (Chrome/Android).
      // Horizontal movement is ignored so the scrubber works normally.
      const handleTouchStart = (e: React.TouchEvent) => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      };
      const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStart.current) return;
        const dx = e.changedTouches[0].clientX - touchStart.current.x;
        const dy = e.changedTouches[0].clientY - touchStart.current.y;
        touchStart.current = null;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 10) return; // tap — let onClick handle
        if (Math.abs(dy) >= 50 && Math.abs(dy) > Math.abs(dx) * 1.5) {
          e.preventDefault(); // suppress the synthetic click after swipe
          if (dy < 0) {
            enterFullscreen(); // swipe up → fullscreen
          } else if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {}); // swipe down → exit (Chrome/Android)
          }
        }
      };

      return (
        <div
          ref={containerRef}
          className={`${className ?? ''} relative overflow-hidden`}
          onClick={enterFullscreen}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <video
            key={tutorialKey}
            ref={tutorialRef}
            poster={heroPoster}
            className={`tutorial-player absolute inset-0 w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
            muted
            playsInline
            {...{"webkit-playsinline": "true"}}
            controls
            preload="metadata"
          />
        </div>
      );
    }

    // ── Preview mode — direct CDN MP4 (network-quality-aware, lightweight loop) ──
    const poster = video?.thumbnailUrl ?? buildBunnyThumbnailUrl(videoId);
    return (
      <div ref={containerRef} className={className}>
        {allowMount && bunnyPreviewUrl ? (
          <video
            ref={videoRef}
            src={bunnyPreviewUrl}
            poster={poster}
            className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
            autoPlay
            muted
            loop
            playsInline
            {...{"webkit-playsinline": "true"}}
            preload="none"
            onLoadStart={() => console.log('[Video/preview] ▶ loadstart', bunnyPreviewUrl)}
            onLoadedMetadata={() => console.log('[Video/preview] ✓ loadedmetadata', bunnyPreviewUrl)}
            onCanPlay={() => console.log('[Video/preview] ✓ canplay', bunnyPreviewUrl)}
            onStalled={() => console.warn('[Video/preview] ⚠ stalled', bunnyPreviewUrl)}
            onError={(e) => {
              const v = e.currentTarget;
              const err = v.error;
              console.error('[Video/preview] ✗ error', {
                src: bunnyPreviewUrl,
                errorCode: err?.code,
                errorMessage: err?.message,
                networkState: v.networkState,
                readyState: v.readyState,
              });
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
    );
  }

  // ── YouTube ────────────────────────────────────────────────────────────
  if (provider === 'youtube' && videoId) {
    const ytPoster = posterUrl ?? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    return (
      <div ref={containerRef} className={`${className ?? ''} relative`}>
        {allowMount ? (
          <>
            <iframe
              src={`https://www.youtube.com/embed/${videoId}${
                mode === 'preview' ? '?autoplay=1&mute=1&loop=1&controls=0' : ''
              }`}
              className="absolute inset-0 w-full h-full border-0"
              loading={mode === 'tutorial' ? 'eager' : 'lazy'}
              onLoad={() => setIframeLoaded(true)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Exercise tutorial"
            />
            {mode === 'tutorial' && !iframeLoaded && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ytPoster}
                alt=""
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ zIndex: 1, backgroundColor: '#F8FAFC' }}
                decoding="async"
              />
            )}
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ytPoster}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
    );
  }

  // ── Internal / Firebase Storage / Legacy URL fallback ──────────────────
  const src = resolvedLegacy ?? videoId;
  if (!src) {
    return (
      <div
        ref={containerRef}
        className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400 ${className ?? ''}`}
      >
        <VideoIcon size={32} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className}>
      {allowMount ? (
        <video
          ref={videoRef}
          src={src}
          poster={mode === 'tutorial' ? (posterUrl ?? undefined) : undefined}
          className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
          autoPlay={mode === 'preview'}
          muted={mode === 'preview'}
          loop={mode === 'preview'}
          playsInline
          {...{"webkit-playsinline": "true"}}
          controls={mode === 'tutorial'}
          preload={mode === 'preview' ? 'none' : 'auto'}
          onLoadStart={() => console.log('[Video/legacy] ▶ loadstart', src)}
          onLoadedMetadata={() => console.log('[Video/legacy] ✓ loadedmetadata', src)}
          onCanPlay={() => console.log('[Video/legacy] ✓ canplay', src)}
          onStalled={() => console.warn('[Video/legacy] ⚠ stalled', src)}
          onError={(e) => {
            const v = e.currentTarget;
            const err = v.error;
            console.error('[Video/legacy] ✗ error', {
              src,
              errorCode: err?.code,
              errorMessage: err?.message,
              networkState: v.networkState,
              readyState: v.readyState,
            });
          }}
        />
      ) : (
        posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full bg-slate-800" />
        )
      )}
    </div>
  );
}

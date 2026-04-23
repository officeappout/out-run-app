'use client';

/**
 * ExerciseVideoPlayer — provider-aware video renderer.
 *
 * Renders the right element for the active provider:
 *   - bunny + preview   → muted MP4 loop (lazy-played via IntersectionObserver)
 *   - bunny + tutorial  → Bunny iframe player with full controls
 *   - youtube           → YouTube iframe (legacy/instructional)
 *   - internal / firebase-storage / fallback → native <video> with the legacy URL
 *
 * Props:
 *   video            — ExternalVideo reference (videoId + provider)
 *   mode             — 'preview' (autoplay loop muted) or 'tutorial' (full UI)
 *   legacyVideoUrl   — optional fallback for old `media.videoUrl` strings
 *   className        — wrapper classes (sizing/aspect)
 */

import { useEffect, useRef, useState } from 'react';
import { Video as VideoIcon } from 'lucide-react';
import {
  buildBunnyEmbedUrl,
  buildBunnyStreamUrl,
  buildBunnyThumbnailUrl,
} from '@/lib/bunny/bunny.config';
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
   * Static thumbnail shown while the video/iframe is buffering.
   * For <video> elements this becomes the native `poster` attribute.
   * For iframes (Bunny, YouTube) a lightweight <img> overlay is rendered on
   * top until the iframe fires its `load` event, then fades out.
   */
  posterUrl?: string | null;
}

/** Detect a YouTube video ID from a raw URL (youtube.com/* or youtu.be/*). */
function extractYoutubeId(url: string): string | null {
  const re =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const m = url.match(re);
  return m ? m[1] : null;
}

export default function ExerciseVideoPlayer({
  video,
  mode,
  legacyVideoUrl,
  className,
  lazyPlay = false,
  posterUrl,
}: ExerciseVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Track whether an iframe (Bunny / YouTube tutorial) has fired its `load`
  // event. While false, a lightweight poster image is layered on top of the
  // iframe to prevent the "blue screen" / black flash during initial buffer.
  // Resets whenever the video source changes (new exercise opened).
  const [iframeLoaded, setIframeLoaded] = useState(false);
  useEffect(() => { setIframeLoaded(false); }, [video?.videoId, legacyVideoUrl]);

  // ── Two-stage lazy state ─────────────────────────────────────────────────
  // `hasBeenVisible` is sticky (true after first intersection) — once the
  // card has appeared we keep the <video src> mounted so the player resumes
  // instantly when it scrolls back into view (rather than re-buffering).
  // `isOnScreen` toggles on every intersection change — we only `play()`
  // while on-screen and `pause()` otherwise to keep CPU usage low.
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

  // Drive playback on the underlying <video> element.
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

  // STRICT lazy: don't even mount the <video src>/<iframe> until the card
  // has actually appeared on screen at least once. Tutorials always mount
  // (they're singletons inside the detail sheet).
  const allowMount = !lazyPlay || mode === 'tutorial' || hasBeenVisible;

  // ── Resolve provider + URLs ────────────────────────────────────────────
  let provider = video?.provider;
  let videoId = video?.videoId;
  let resolvedLegacy = legacyVideoUrl ?? undefined;

  // Auto-detect YouTube from a legacy URL if no ExternalVideo was provided.
  if (!provider && resolvedLegacy) {
    const yt = extractYoutubeId(resolvedLegacy);
    if (yt) {
      provider = 'youtube';
      videoId = yt;
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
      // `loading="eager"` — the iframe is already in a detail sheet (singleton,
      // intentionally opened), so we want it to start fetching immediately.
      // The poster overlay prevents the dark-background flash while the Bunny
      // player SDK initialises; it fades out once the iframe fires `onLoad`.
      const bunnyPoster = posterUrl ?? video?.thumbnailUrl ?? buildBunnyThumbnailUrl(videoId);
      return (
        <div ref={containerRef} className={`${className ?? ''} relative`}>
          <iframe
            src={buildBunnyEmbedUrl(videoId)}
            className="absolute inset-0 w-full h-full border-0"
            loading="eager"
            onLoad={() => setIframeLoaded(true)}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
            title="Exercise tutorial"
          />
          {/* Poster — covers the blank iframe while it loads. pointer-events-none
              so the iframe behind it can still receive focus/interaction events
              the moment it finishes painting its first frame. */}
          {!iframeLoaded && bunnyPoster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bunnyPoster}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ zIndex: 1, backgroundColor: '#0f172a' }}
            />
          )}
        </div>
      );
    }
    // preview mode — direct CDN MP4 (lightweight, native loop).
    // Strict lazy: render only the poster <img> until the card has been
    // visible at least once; then mount the <video src> for real playback.
    const poster = video?.thumbnailUrl ?? buildBunnyThumbnailUrl(videoId);
    return (
      <div ref={containerRef} className={className}>
        {allowMount ? (
          <video
            ref={videoRef}
            src={buildBunnyStreamUrl(videoId, 360)}
            poster={poster}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            preload="none"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
    );
  }

  // ── YouTube ────────────────────────────────────────────────────────────
  if (provider === 'youtube' && videoId) {
    // For preview mode, defer iframe mount until visible — YouTube iframes
    // are heavy (full SDK + tracking). Show the cheap thumbnail until ready.
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
            {/* Poster overlay — hidden once the iframe fires onLoad */}
            {mode === 'tutorial' && !iframeLoaded && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ytPoster}
                alt=""
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ zIndex: 1, backgroundColor: '#0f172a' }}
                decoding="async"
              />
            )}
          </>
        ) : (
          // Preview mode — show static thumbnail until card is on-screen
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

  // In tutorial mode:
  //   • poster   — static image shown while the video buffers (hides dark bg).
  //   • preload  — "auto" asks the browser to buffer enough to play smoothly.
  //     "metadata" (lower bandwidth) also works and pre-fetches the first frame
  //     in most browsers; change to "auto" if fast delivery is more important
  //     than bandwidth for your use-case.
  //   • object-cover — fills the container without letterboxing.
  return (
    <div ref={containerRef} className={className}>
      {allowMount ? (
        <video
          ref={videoRef}
          src={src}
          poster={mode === 'tutorial' ? (posterUrl ?? undefined) : undefined}
          className="w-full h-full object-cover"
          muted={mode === 'preview'}
          loop={mode === 'preview'}
          playsInline
          controls={mode === 'tutorial'}
          preload={mode === 'preview' ? 'none' : 'auto'}
        />
      ) : (
        // Preview mode, not yet on-screen — show poster or a dark placeholder
        // so the list cell keeps its dimensions before the video mounts.
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

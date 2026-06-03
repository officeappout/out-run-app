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
  buildBunnyThumbnailUrl,
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

  // ── Pre-detect Bunny UUID from legacyVideoUrl ─────────────────────────
  // Done before the hook call so the hook always runs with the right id
  // (React rules prohibit conditional hook calls).
  const legacyBunnyId =
    !video?.provider && legacyVideoUrl
      ? extractBunnyVideoIdFromUrl(legacyVideoUrl)
      : null;

  // ── Network-aware stream URLs (always called — React rules of hooks) ────
  //
  // TWO hook calls are needed because the same videoId drives different render
  // branches for the two modes:
  //
  //  • bunnyPreviewId  — active in preview mode for any Bunny source (explicit
  //    ExternalVideo prop OR auto-detected legacy URL).  Feeds the muted loop.
  //
  //  • bunnyHeroId     — active in tutorial mode ONLY for auto-detected legacy
  //    Bunny URLs (i.e. exercises that have a mainVideoUrl but no fullTutorial).
  //    These are short movement-demo videos that must use object-cover layout,
  //    so we render a native <video> at network-aware quality rather than a
  //    Bunny embed iframe (which letterboxes and ignores object-cover).
  //    Explicit fullTutorial ExternalVideo objects keep the iframe path (Bunny's
  //    own ABR + full player controls) — their videoId goes to bunnyPreviewId=null
  //    in preview mode, iframe handles quality itself in tutorial mode.
  const effectiveBunnyId =
    (video?.provider === 'bunny' ? (video.videoId ?? null) : null) ?? legacyBunnyId;
  const bunnyPreviewId = effectiveBunnyId && mode === 'preview' ? effectiveBunnyId : null;
  // Only fire the hero hook for the "legacy URL → tutorial mode" case.
  const bunnyHeroId = legacyBunnyId && mode === 'tutorial' ? legacyBunnyId : null;
  // Fire for explicit fullTutorial ExternalVideo objects in tutorial mode.
  // Replaces the Bunny embed iframe so native <video> is used on all platforms —
  // WKWebView (iOS) does not honour the Permissions Policy `allow` attribute on
  // cross-origin iframes, which prevents autoplay inside them.
  const bunnyTutorialId =
    video?.provider === 'bunny' && !legacyBunnyId && mode === 'tutorial'
      ? (video.videoId ?? null)
      : null;
  const { streamUrl: bunnyPreviewUrl }   = useNetworkAwareStreamUrl(bunnyPreviewId);
  const { streamUrl: bunnyHeroUrl }      = useNetworkAwareStreamUrl(bunnyHeroId);
  const { streamUrl: bunnyTutorialUrl }  = useNetworkAwareStreamUrl(bunnyTutorialId);

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
      // Bunny CDN URL — promote to first-class Bunny provider:
      //   tutorial mode → Bunny embed iframe (Bunny's own adaptive bitrate, HQ)
      //   preview mode  → network-aware MP4 via useNetworkAwareStreamUrl
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

      // ── Legacy Bunny URL (promoted from mainVideoUrl, no explicit fullTutorial)
      // These are short exercise demo clips — they MUST use object-cover layout so
      // the hero area fills correctly without letterboxing. We render a native
      // <video> driven by useNetworkAwareStreamUrl (1080p WiFi, 720p 4G, …)
      // instead of the Bunny embed iframe which applies its own internal aspect
      // ratio and creates black bars inside the portrait/square hero container.
      // While the smart URL is resolving asynchronously, the poster image fills the
      // space — identical dimensions, zero layout shift on transition.
      if (legacyBunnyId) {
        return (
          <div ref={containerRef} className={`${className ?? ''} relative overflow-hidden`}>
            {bunnyHeroUrl ? (
              <video
                ref={videoRef}
                src={bunnyHeroUrl}
                poster={heroPoster ?? undefined}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                {...{"webkit-playsinline": "true"}}
                preload="auto"
              />
            ) : (
              // Poster placeholder while the network-aware URL resolves.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroPoster ?? ''}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                decoding="async"
              />
            )}
          </div>
        );
      }

      // ── Explicit fullTutorial ExternalVideo (long-form, full controls)
      // Native <video> with network-aware resolution — replaces the Bunny embed
      // iframe. WKWebView on iOS does not honour the Permissions Policy `allow`
      // attribute on cross-origin iframes, so autoplay inside them is blocked.
      // A native <video controls> element gives identical UX on all platforms.
      // The poster image fills the container while the network-aware URL resolves.
      return (
        <div ref={containerRef} className={`${className ?? ''} relative overflow-hidden`}>
          {bunnyTutorialUrl ? (
            <video
              src={bunnyTutorialUrl}
              poster={heroPoster ?? undefined}
              className="absolute inset-0 w-full h-full object-contain"
              playsInline
              {...{"webkit-playsinline": "true"}}
              preload="auto"
              controls
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroPoster ?? ''}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              decoding="async"
            />
          )}
        </div>
      );
    }
    // preview mode — direct CDN MP4 (lightweight, native loop).
    // Strict lazy: render only the poster <img> until the card has been
    // visible at least once; then mount the <video src> for real playback.
    //
    // Quality selection: `bunnyPreviewUrl` comes from useNetworkAwareStreamUrl
    // and is either a `blob:` from the offline cache (always 720p) or a Bunny
    // CDN MP4 picked from { 1080p WiFi | 720p 4G | 360p slow / unknown }.
    // While the async lookup is in flight we keep showing the poster — no
    // layout shift and no flash because the wrapper dimensions are stable.
    const poster = video?.thumbnailUrl ?? buildBunnyThumbnailUrl(videoId);
    return (
      <div ref={containerRef} className={className}>
        {allowMount && bunnyPreviewUrl ? (
          <video
            ref={videoRef}
            src={bunnyPreviewUrl}
            poster={poster}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            {...{"webkit-playsinline": "true"}}
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
          autoPlay={mode === 'preview'}
          muted={mode === 'preview'}
          loop={mode === 'preview'}
          playsInline
          {...{"webkit-playsinline": "true"}}
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

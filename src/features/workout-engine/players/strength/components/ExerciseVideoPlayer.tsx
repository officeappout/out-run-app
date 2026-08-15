'use client';

/**
 * ExerciseVideoPlayer
 * Handles YouTube (iframe) vs Direct (video tag) vs Image fallback
 * Uses key={exerciseId} to force fresh mount on each exercise change
 * 
 * CLEAN DESIGN: Solid bg-black background, no blur effects
 * Blur is only used in PREPARING state (StrengthRunner)
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { RefreshCw, ExternalLink, AlertCircle, GraduationCap, X, Smartphone, Maximize } from 'lucide-react';
import { useCachedMediaUrl } from '@/features/favorites/hooks/useCachedMedia';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import TutorialVideoPlayer from '@/features/content/exercises/client/components/ExerciseVideoPlayer';
import type { ExternalVideo } from '@/features/content/exercises/core/exercise.types';
import { FOLLOW_ALONG_TUTORIAL_CTA_DEDUP_ENABLED } from '@/config/feature-flags';

interface ExerciseVideoPlayerProps {
  exerciseId: string;
  videoUrl: string | null;
  exerciseName: string;
  exerciseType: 'reps' | 'time' | 'follow-along';
  /** B1: narrow "guided follow-along clip" flag (recovery + guided warmup — carries
   *  the per-exercise isFollowAlong). When omitted, the fullscreen/rotate affordance
   *  falls back to the broad exerciseType so non-live callers are unchanged. */
  isFollowAlong?: boolean;
  isPaused: boolean;
  /** @deprecated — Audio is now controlled by the global isAudioEnabled sessionStorage flag */
  hasAudio?: boolean;
  /** Long-form instructional video — renders the "צפה בהסבר המלא" CTA + fullscreen player when present. */
  fullTutorial?: ExternalVideo | null;
  onVideoProgress?: (progress: number) => void;
  onVideoEnded?: () => void;
  onLoadingChange?: (loading: boolean) => void;
}

// Fallback video URL
const FALLBACK_VIDEO_URL = 'https://assets.mixkit.co/videos/preview/mixkit-girl-doing-squats-in-a-gym-23136-large.mp4';

/**
 * Robust YouTube ID extraction
 */
function getYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  
  if (match && match[2] && match[2].length === 11) {
    return match[2];
  }
  
  return null;
}

/**
 * Check if URL is a YouTube URL
 */
function isYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const lowerUrl = url.toLowerCase().trim();
  return lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be');
}

export default function ExerciseVideoPlayer({
  exerciseId,
  videoUrl,
  exerciseName,
  exerciseType,
  isFollowAlong,
  isPaused,
  hasAudio: _legacyHasAudio = false,
  fullTutorial = null,
  onVideoProgress,
  onVideoEnded,
  onLoadingChange,
}: ExerciseVideoPlayerProps) {
  const [videoLoading, setVideoLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ── Landscape / fullscreen support (follow-along clips only) ───────────
  // Recovery follow-along clips are shot 16:9 (verified: Bunny renditions are
  // 640x360 … 1920x1080), so `object-contain` letterboxes them into a thin band
  // on a portrait phone. Rotating already fills the screen — the user just has
  // no way to know that. So: a one-shot rotate hint + an explicit fullscreen
  // button, both scoped to follow-along so the short reps/time preview loops
  // (strength) keep their current behaviour byte-for-byte.
  const [isLandscape, setIsLandscape] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);
  const hintShownForRef = useRef<string | null>(null);

  // B1: the fullscreen + rotate affordance is for GUIDED follow-along clips only
  // (recovery + guided warmup, which carry the per-exercise isFollowAlong flag).
  // Generic warmup reps drills run in follow-along MODE (exerciseType) but must NOT
  // get a fullscreen button. ActiveExerciseView passes the narrow isFollowAlong;
  // other callers omit it → fall back to the prior broad exerciseType (no regression).
  const isGuidedFollowAlong = isFollowAlong ?? (exerciseType === 'follow-along');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(orientation: landscape)');
    const sync = () => setIsLandscape(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      mq.removeEventListener?.('change', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  // Show the hint once per exercise while portrait. It persists (no auto-hide)
  // as long as the video stays portrait, and is cleared the moment the user
  // rotates to landscape (see the effect below).
  useEffect(() => {
    if (!isGuidedFollowAlong) return;
    if (isLandscape) return;
    if (hintShownForRef.current === exerciseId) return;
    hintShownForRef.current = exerciseId;
    setShowRotateHint(true);
  }, [isGuidedFollowAlong, exerciseId, isLandscape]);

  // Rotating to landscape satisfies the hint — drop it immediately.
  useEffect(() => {
    if (isLandscape) setShowRotateHint(false);
  }, [isLandscape]);

  /**
   * iOS WKWebView/Safari do NOT implement Fullscreen API on arbitrary elements —
   * only `<video>` via the webkit-prefixed call. Try that first, then the
   * standard API for Android/desktop. Silent no-op if neither exists.
   */
  const enterFullscreen = useCallback(() => {
    const v = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    }) | null;
    if (!v) return;
    if (typeof v.webkitEnterFullscreen === 'function') {
      v.webkitEnterFullscreen();
      return;
    }
    v.requestFullscreen?.().catch(() => {});
  }, []);

  // ── Global audio state (set by the user in WorkoutPreviewDrawer) ──
  const isAudioEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('isAudioEnabled') === 'true';
  }, [exerciseId]); // re-evaluate on exercise change so each mount picks up latest

  const isOnline = useOnlineStatus();

  // If the parent already resolved to a blob: URL, use it directly.
  // Only try cache lookup for non-blob remote URLs.
  const isAlreadyBlob = videoUrl?.startsWith('blob:');
  const urlToCache = isAlreadyBlob ? null : videoUrl;
  const cachedVideoUrl = useCachedMediaUrl(urlToCache);

  // Build effective URL: blob from parent > blob from cache > network (only if online) > null
  const effectiveVideoUrl = isAlreadyBlob
    ? videoUrl
    : cachedVideoUrl?.startsWith('blob:')
      ? cachedVideoUrl
      : isOnline
        ? (videoUrl || FALLBACK_VIDEO_URL)
        : null;

  // Check if current video is YouTube (never cache YouTube URLs)
  const isYouTubeVideo = useMemo(() => {
    return videoUrl ? isYouTubeUrl(videoUrl) : false;
  }, [videoUrl]);

  // Extract YouTube video ID
  const youtubeVideoId = useMemo(() => {
    if (!isYouTubeVideo || !effectiveVideoUrl) return null;
    return getYouTubeId(effectiveVideoUrl);
  }, [effectiveVideoUrl, isYouTubeVideo]);

  // Construct YouTube embed URL
  const youtubeEmbedUrl = useMemo(() => {
    if (!youtubeVideoId) return null;
    
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000';
    
    const params = new URLSearchParams({
      autoplay: isPaused ? '0' : '1',
      mute: isAudioEnabled ? '0' : '1',
      controls: '0',
      modestbranding: '1',
      rel: '0',
      showinfo: '0',
      playsinline: '1',
      origin: origin,
      loop: exerciseType !== 'follow-along' ? '1' : '0',
      playlist: exerciseType !== 'follow-along' ? youtubeVideoId : '',
    });
    
    return `https://www.youtube.com/embed/${youtubeVideoId}?${params.toString()}`;
  }, [youtubeVideoId, isPaused, exerciseType]);

  // Check if we have a valid DIRECT video URL
  const hasValidDirectVideoUrl = useMemo(() => {
    if (!effectiveVideoUrl) return false;
    if (isYouTubeVideo) return false;
    if (effectiveVideoUrl.startsWith('blob:')) return true;
    const lowerUrl = effectiveVideoUrl.toLowerCase();
    return lowerUrl.includes('.mp4') || 
           lowerUrl.includes('.mov') || 
           lowerUrl.includes('.webm') ||
           lowerUrl.includes('video');
  }, [effectiveVideoUrl, isYouTubeVideo]);

  // ── Mute policy ────────────────────────────────────────────────────────
  // The short reps/time preview loop is ALWAYS muted: browsers (and iOS
  // WKWebView in particular) refuse to *autoplay* an unmuted <video>, so an
  // unmuted clip freezes on frame 0 — which is exactly the "stuck on a static
  // image" symptom. Only follow-along mode (a full guided clip the user opted
  // into) honours the global audio toggle.
  const shouldMuteVideo = exerciseType === 'follow-along' ? !isAudioEnabled : true;

  // ── Imperative playback driver ─────────────────────────────────────────
  // The `autoPlay` attribute alone is unreliable on WKWebView, and React does
  // not always reflect the `muted` *prop* onto the DOM property (a long-standing
  // React quirk) — both cause the browser to treat the element as unmuted and
  // block autoplay. Setting `.muted` on the element and calling `.play()`
  // imperatively (mirroring the facility-page player, which never freezes) is
  // what actually starts the loop. Retries once fully-muted if the first
  // play() is rejected.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || isYouTubeVideo || !hasValidDirectVideoUrl) return;

    v.muted = shouldMuteVideo;

    if (isPaused) {
      v.pause();
      return;
    }

    const attempt = v.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        // Autoplay rejected (usually: element considered unmuted). Force-mute
        // and retry — the loop keeps running silently rather than freezing.
        v.muted = true;
        v.play().catch(() => {});
      });
    }
  }, [effectiveVideoUrl, hasValidDirectVideoUrl, isYouTubeVideo, isPaused, shouldMuteVideo]);

  // Handle loading state changes
  const handleLoadingChange = useCallback((loading: boolean) => {
    setVideoLoading(loading);
    onLoadingChange?.(loading);
  }, [onLoadingChange]);

  // Handle YouTube iframe refresh
  const handleRefreshYouTube = useCallback(() => {
    setIframeError(false);
    handleLoadingChange(true);
    const iframe = document.querySelector('iframe[src*="youtube.com"]') as HTMLIFrameElement;
    if (iframe) {
      const currentSrc = iframe.src;
      iframe.src = '';
      setTimeout(() => {
        iframe.src = currentSrc;
        handleLoadingChange(false);
      }, 100);
    }
  }, [handleLoadingChange]);

  return (
    <div className="absolute inset-0 bg-black overflow-hidden" key={exerciseId}>
      {/* Main Video Content - Centered on solid black background */}
      {effectiveVideoUrl && typeof effectiveVideoUrl === 'string' && effectiveVideoUrl.trim() !== '' && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* YouTube Video */}
          {isYouTubeVideo && youtubeVideoId && youtubeEmbedUrl && !iframeError && (
            <>
              <iframe
                key={`yt-${exerciseId}-${youtubeVideoId}`}
                className="absolute inset-0 w-full h-full"
                src={youtubeEmbedUrl}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                onLoad={() => handleLoadingChange(false)}
                onError={() => {
                  setIframeError(true);
                  handleLoadingChange(false);
                }}
                style={{ border: 'none' }}
              />
              {/* YouTube Controls */}
              <div className="absolute top-4 right-4 z-20 flex gap-2">
                <button
                  onClick={handleRefreshYouTube}
                  className="flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white rounded-full shadow-lg transition-all border border-white/20"
                  title="רענן סרטון"
                >
                  <RefreshCw size={18} />
                </button>
                <a
                  href={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg shadow-lg transition-all backdrop-blur-md border border-white/20"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={14} />
                  YouTube
                </a>
              </div>
            </>
          )}

          {/* YouTube Fallback */}
          {isYouTubeVideo && (!youtubeVideoId || iframeError) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 max-w-sm text-center border border-white/20">
                <AlertCircle size={48} className="text-yellow-400 mx-auto mb-4" />
                <h3 className="text-white font-bold text-lg mb-2" style={{ fontFamily: 'var(--font-simpler)' }}>
                  {iframeError ? 'הסרטון לא נטען' : 'לא הצלחנו לזהות את הסרטון'}
                </h3>
                <p className="text-white/70 text-sm mb-4" style={{ fontFamily: 'var(--font-simpler)' }}>
                  {iframeError 
                    ? `סרטון YouTube עם ID: ${youtubeVideoId || 'לא ידוע'}`
                    : `קישור YouTube: ${effectiveVideoUrl.substring(0, 50)}...`
                  }
                </p>
                <div className="flex flex-col gap-2">
                  {youtubeVideoId && (
                    <a
                      href={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      <ExternalLink size={18} />
                      צפה ב-YouTube
                    </a>
                  )}
                  <button
                    onClick={handleRefreshYouTube}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl transition-all"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    <RefreshCw size={18} />
                    נסה שוב
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Direct Video File (MP4/MOV) */}
          {!isYouTubeVideo && hasValidDirectVideoUrl && (
            <video
              // Key includes the URL (Stage 0 stuck-video fix): pyramid steps
              // share ONE exerciseId, so an id-only key never remounted the
              // element and <video> ignores src-attribute changes without a
              // load() — every set played step 1's video. URL in the key
              // forces a clean remount per step variant.
              key={`video-${exerciseId}-${effectiveVideoUrl ?? 'none'}`}
              ref={videoRef}
              src={effectiveVideoUrl}
              className="absolute inset-0 w-full h-full object-contain"
              autoPlay={!isPaused}
              loop={exerciseType !== 'follow-along'}
              muted={shouldMuteVideo}
              playsInline
              {...{"webkit-playsinline": "true"}}
              preload="auto"
              onLoadedData={() => handleLoadingChange(false)}
              onLoadStart={() => handleLoadingChange(true)}
              onError={() => handleLoadingChange(false)}
              onTimeUpdate={(e) => {
                if (exerciseType === 'follow-along') {
                  const video = e.currentTarget;
                  if (video.duration) {
                    onVideoProgress?.((video.currentTime / video.duration) * 100);
                  }
                }
              }}
              onEnded={() => {
                if (exerciseType === 'follow-along') {
                  onVideoEnded?.();
                }
              }}
            />
          )}

          {/* Fallback to image */}
          {!isYouTubeVideo && !hasValidDirectVideoUrl && (
            <img
              key={`img-${exerciseId}`}
              src={effectiveVideoUrl}
              alt={exerciseName}
              className="absolute inset-0 w-full h-full object-contain"
              onLoad={() => handleLoadingChange(false)}
              onError={() => handleLoadingChange(false)}
            />
          )}

          {/* Loading Spinner */}
          {videoLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      )}

      {/* "צפה בהסבר המלא" CTA — shown only when a long-form tutorial exists.
          Positioned in the visible video band just ABOVE the white metrics card
          (which peeks ~220px up from the bottom — see ActiveExerciseView spacer)
          and BELOW the RunnerHeader top overlay. z-[46] lifts it above the
          header (z-[45]) and the scroll card (z-10) so it is never covered.
          FOLLOW_ALONG_TUTORIAL_CTA_DEDUP_ENABLED (feature-flags.ts): hides this
          CTA specifically when the fullscreen Maximize toggle below is ALSO
          about to render (isGuidedFollowAlong && hasValidDirectVideoUrl — the
          identical pair Maximize itself gates on), since David judged the two
          redundant for guided follow-along clips — the clip already IS the
          full guided video, so fullscreen is enough. Reps/time exercises (no
          Maximize button) and the YouTube/image-fallback follow-along edge
          case (no Maximize button either) both keep the CTA untouched. */}
      {fullTutorial?.videoId && !showTutorial &&
        !(FOLLOW_ALONG_TUTORIAL_CTA_DEDUP_ENABLED && isGuidedFollowAlong && hasValidDirectVideoUrl) && (
        <button
          onClick={() => setShowTutorial(true)}
          className="absolute bottom-[236px] right-4 z-[46] inline-flex items-center gap-1.5 px-3.5 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white rounded-full shadow-lg transition-all border border-white/20"
          style={{ fontFamily: 'var(--font-simpler)' }}
          dir="rtl"
        >
          <GraduationCap size={16} />
          <span className="text-[13px] font-bold">צפה בהסבר המלא</span>
        </button>
      )}

      {/* Fullscreen long-form tutorial — reuses the facility-page provider-aware
          player (Bunny HLS + controls). Rendered above the live player surface.

          15.08.2026 reachability fix (app-wide — this is the single shared overlay
          for every strength/follow-along workout's "watch full explanation" video,
          reached via ActiveExerciseView):
            1. Safe-area insets — this overlay had none. Capacitor runs
               `ios: { contentInset: 'never' }` (edge-to-edge WKWebView), so the web
               layer must inset itself, same as every neighboring component in this
               screen family. Top padding matches RunnerHeader.tsx's exact idiom
               (`calc(env(safe-area-inset-top, 44px) + 0.75rem)`). Bottom padding on
               the outer container keeps TutorialVideoPlayer's native <video controls>
               bar off the home-indicator zone — fallback 0px (not InputStateView's
               24px: there's no fixed chrome here needing a non-notch cushion, only
               the real device inset matters).
            2. Close button grew from 40×40 to a 44×44 floor via min-w/min-h — the
               same hit-slop idiom already used codebase-wide (WorkoutSettingsDrawer's
               X button, PlannedRunActive's back arrow) instead of scaling the icon.
            3. Close button moved from top-left to top-right (now DOM-first, so it
               lands on the RTL start/right edge; title trails on the left) — top-left
               is the hardest one-handed corner for the right-handed majority to
               reach, top-right stays on the thumb's natural side. Kept in the top
               area rather than moved to the bottom: every fullscreen-video
               convention in this app (incl. the native-Fullscreen-API player) puts
               close/back at the top, and the bottom is already claimed by
               TutorialVideoPlayer's own native control bar — stacking a close button
               there would collide with it, not just be "reachable but cramped". */}
      {showTutorial && fullTutorial?.videoId && (
        <div
          className="fixed inset-0 z-[100] bg-black flex flex-col"
          dir="rtl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div
            className="flex items-center justify-between px-4 pb-3 shrink-0"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 0.75rem)' }}
          >
            <button
              onClick={() => setShowTutorial(false)}
              className="flex items-center justify-center w-10 h-10 min-w-[44px] min-h-[44px] bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/20 shrink-0"
              aria-label="סגור"
            >
              <X size={20} />
            </button>
            <span className="text-white text-base font-bold truncate" style={{ fontFamily: 'var(--font-simpler)' }}>
              {exerciseName}
            </span>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <TutorialVideoPlayer
              video={fullTutorial}
              mode="tutorial"
              posterUrl={fullTutorial.thumbnailUrl ?? null}
              objectFit="contain"
              className="w-full h-full"
            />
          </div>
        </div>
      )}

      {/* Follow-along only: fullscreen affordance + one-shot rotate hint.
          Both live in the SAME z-[46] band as the tutorial CTA — no new z-index
          value is introduced (see .cursorrules Z-Index Budget). The hint stays
          mounted at opacity:0 so it can fade rather than pop, and is
          pointer-events-none so it never intercepts a tap on the video. */}
      {isGuidedFollowAlong && hasValidDirectVideoUrl && (
        <>
          <button
            onClick={enterFullscreen}
            className="absolute bottom-[236px] left-4 z-[46] inline-flex items-center justify-center w-10 h-10 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white rounded-full shadow-lg transition-all border border-white/20"
            aria-label="מסך מלא"
            title="מסך מלא"
          >
            <Maximize size={18} />
          </button>

          <div
            className="absolute inset-x-0 bottom-[292px] z-[46] flex justify-center pointer-events-none transition-opacity duration-500"
            style={{ opacity: showRotateHint ? 1 : 0 }}
            aria-hidden={!showRotateHint}
          >
            <div
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-black/60 backdrop-blur-md text-white rounded-full shadow-lg border border-white/20"
              style={{ fontFamily: 'var(--font-simpler)' }}
              dir="rtl"
            >
              <Smartphone
                size={16}
                style={{ animation: 'outRotateHint 1.8s ease-in-out infinite' }}
              />
              <span className="text-[13px] font-bold">סובב לצפייה מלאה</span>
            </div>
          </div>

          <style>{`
            @keyframes outRotateHint {
              0%, 100% { transform: rotate(0deg); }
              45%, 65% { transform: rotate(90deg); }
            }
          `}</style>
        </>
      )}

      {/* Bottom-up Gradient - Melting into white card */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

      {/* Video Progress Bar for Follow-along Mode */}
      {exerciseType === 'follow-along' && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-10">
          <div
            className="h-full bg-cyan-500 transition-all duration-100"
            style={{ width: '0%' }}
            id={`progress-bar-${exerciseId}`}
          />
        </div>
      )}
    </div>
  );
}

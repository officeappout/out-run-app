'use client';

/**
 * ExerciseVideoPlayer
 * Handles YouTube (iframe) vs Direct (video tag) vs Image fallback
 * Uses key={exerciseId} to force fresh mount on each exercise change
 * 
 * CLEAN DESIGN: Solid bg-black background, no blur effects
 * Blur is only used in PREPARING state (StrengthRunner)
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';

interface ExerciseVideoPlayerProps {
  exerciseId: string;
  videoUrl: string | null;
  exerciseName: string;
  exerciseType: 'reps' | 'time' | 'follow-along';
  isPaused: boolean;
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
  isPaused,
  onVideoProgress,
  onVideoEnded,
  onLoadingChange,
}: ExerciseVideoPlayerProps) {
  const [videoLoading, setVideoLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Use fallback if no video URL provided
  const effectiveVideoUrl = videoUrl || FALLBACK_VIDEO_URL;

  // Check if current video is YouTube
  const isYouTubeVideo = useMemo(() => {
    return isYouTubeUrl(effectiveVideoUrl);
  }, [effectiveVideoUrl]);

  // Extract YouTube video ID
  const youtubeVideoId = useMemo(() => {
    if (!isYouTubeVideo) return null;
    return getYouTubeId(effectiveVideoUrl);
  }, [effectiveVideoUrl, isYouTubeVideo]);

  // Construct YouTube embed URL
  const youtubeEmbedUrl = useMemo(() => {
    if (!youtubeVideoId) return null;
    
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000';
    
    const params = new URLSearchParams({
      autoplay: isPaused ? '0' : '1',
      mute: '1',
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
    const lowerUrl = effectiveVideoUrl.toLowerCase();
    return lowerUrl.includes('.mp4') || 
           lowerUrl.includes('.mov') || 
           lowerUrl.includes('.webm') ||
           lowerUrl.includes('video');
  }, [effectiveVideoUrl, isYouTubeVideo]);

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
              key={`video-${exerciseId}`}
              ref={videoRef}
              src={effectiveVideoUrl}
              className="absolute inset-0 w-full h-full object-contain"
              autoPlay={!isPaused}
              loop={exerciseType !== 'follow-along'}
              muted
              playsInline
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

'use client';

import { useEffect, useRef, useCallback } from 'react';

interface MediaSessionConfig {
  workoutState: 'PREPARING' | 'ACTIVE' | 'RESTING' | 'PAUSED';
  exerciseName: string;
  nextExerciseName: string;
  workoutName: string;
  exerciseImageUrl: string | null;
  isPaused: boolean;
  onNextTrack: () => void;
  onTogglePause: () => void;
}

/**
 * useMediaSession — powers the OS lock-screen "Now Playing" widget.
 *
 * Updates metadata dynamically based on workout state:
 *   ACTIVE  → title = exercise name
 *   RESTING → title = "מנוחה: [next exercise]"
 *
 * Wires lock-screen controls:
 *   play/pause → togglePause
 *   nexttrack  → complete exercise or skip rest
 *
 * A silent audio loop keeps the Media Session alive in the background
 * on mobile browsers that require active media playback.
 */
export function useMediaSession(config: MediaSessionConfig) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  // Generate a tiny silent WAV in-memory (44 bytes header + 1 second of silence at 8kHz mono)
  const getSilentAudioUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const sampleRate = 8000;
    const duration = 1;
    const numSamples = sampleRate * duration;
    const dataSize = numSamples;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true); // byte rate
    view.setUint16(32, 1, true); // block align
    view.setUint16(34, 8, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    // Silence: 8-bit PCM silence = 128
    for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128);

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }, []);

  // Bootstrap silent audio element
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const url = getSilentAudioUrl();
    if (!url) return;

    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.01; // near-silent
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };
  }, [getSilentAudioUrl]);

  // Play/pause the silent audio to keep the session alive
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const shouldPlay =
      config.workoutState === 'ACTIVE' ||
      config.workoutState === 'RESTING';

    if (shouldPlay && !config.isPaused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [config.workoutState, config.isPaused]);

  // Update metadata
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const isResting = config.workoutState === 'RESTING';
    const title = isResting
      ? `מנוחה: ${config.nextExerciseName}`
      : config.exerciseName;

    const artwork: MediaImage[] = [];
    if (config.exerciseImageUrl) {
      artwork.push({
        src: config.exerciseImageUrl,
        sizes: '512x512',
        type: 'image/jpeg',
      });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: config.workoutName,
      album: 'OUT Workout',
      artwork,
    });

    navigator.mediaSession.playbackState = config.isPaused ? 'paused' : 'playing';
  }, [
    config.workoutState,
    config.exerciseName,
    config.nextExerciseName,
    config.workoutName,
    config.exerciseImageUrl,
    config.isPaused,
  ]);

  // Wire action handlers
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const handlePlay = () => {
      if (configRef.current.isPaused) configRef.current.onTogglePause();
    };
    const handlePause = () => {
      if (!configRef.current.isPaused) configRef.current.onTogglePause();
    };
    const handleNext = () => {
      configRef.current.onNextTrack();
    };

    try {
      navigator.mediaSession.setActionHandler('play', handlePlay);
      navigator.mediaSession.setActionHandler('pause', handlePause);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
    } catch (e) {
      console.warn('[MediaSession] Failed to set action handlers:', e);
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
      } catch {
        // cleanup
      }
    };
  }, []);
}

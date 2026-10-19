'use client';

/**
 * useTimedCueSound — plays the timed engine's cues: the strength rest
 * timer's beeps (short = countdown, long = new phase / minute / end) plus a
 * haptic. Sound respects the session-wide player mute; the haptic always
 * fires. The AudioContext is created lazily on the first cue and closed on
 * unmount.
 */
import { useCallback, useEffect, useRef } from 'react';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { isPlayerAudioMuted } from '../../logic/player-audio-mute';
import type { TimedCue } from '@/features/workout-engine/engines/timed/timed.types';
import { cueSound } from '../logic/timed-feedback';

type AudioCtor = typeof AudioContext;

export function useTimedCueSound(): (cue: TimedCue) => void {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(
    () => () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    },
    [],
  );

  return useCallback((cue: TimedCue) => {
    const kind = cueSound(cue);
    if (!kind) return;
    if (kind === 'short') hapticLight();
    else hapticMedium();
    if (isPlayerAudioMuted() || typeof window === 'undefined') return;
    try {
      const Ctor: AudioCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = ctxRef.current ?? (ctxRef.current = new Ctor());
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = kind === 'short' ? 400 : 600;
      gain.gain.value = kind === 'short' ? 0.3 : 0.5;
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + (kind === 'short' ? 0.1 : 0.3));
    } catch {
      // No Web Audio — the haptic already fired.
    }
  }, []);
}

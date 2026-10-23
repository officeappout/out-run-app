'use client';

import { useEffect, useRef } from 'react';
import { cueForSecond, cueSecond } from '../core/cues';
import { playCue } from '../tv/tv-audio';

export interface TvCueInput {
  /** Stable id of the interval being counted; a new one restarts the countdown. */
  key: string;
  clockMs: number;
  runningDown: boolean;
}

/** Countdown beeps on the TV, once per second boundary, at the host's volume. `input` null = no clock on screen. */
export function useTvCues(input: TvCueInput | null, audio: { volume: number; muted: boolean } | undefined): void {
  const prev = useRef<{ key: string; sec: number | null }>({ key: '', sec: null });
  const sec = input && input.runningDown ? cueSecond(input.clockMs) : null;
  const key = input?.key ?? '';
  const volume = audio?.volume ?? 1;
  const muted = audio?.muted ?? false;
  const on = !!audio;
  useEffect(() => {
    if (!on) return;
    if (sec === null) {
      prev.current = { key, sec: null };
      return;
    }
    const before = prev.current.key === key ? prev.current.sec : null;
    prev.current = { key, sec };
    playCue(cueForSecond(before, sec), volume, muted);
  }, [on, key, sec, volume, muted]);
}

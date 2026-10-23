import type { TvCue } from '../core/cues';

/**
 * The TV's only sound: the same countdown beeps as the phone player (880 Hz short, 660 → 880 Hz long), scaled by the
 * host's volume. The page has no <audio>; WebAudio is allowed because the fullscreen "OK" click is a user gesture.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx || ctx.state === 'closed') {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, ms: number, gainAmount: number, delayMs = 0): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.frequency.value = freq;
  osc.type = 'sine';
  const t0 = c.currentTime + delayMs / 1000;
  gain.gain.setValueAtTime(Math.max(0.0002, gainAmount), t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
  osc.start(t0);
  osc.stop(t0 + ms / 1000);
}

/** `volume` 0..1 is the host's slider; muted = silence. A browser that blocks audio just stays quiet. */
export function playCue(cue: TvCue, volume: number, muted: boolean): void {
  if (!cue || muted || volume <= 0) return;
  const c = context();
  if (!c) return;
  try {
    if (cue === 'short') tone(c, 880, 120, 0.5 * volume);
    else {
      tone(c, 660, 250, 0.6 * volume);
      tone(c, 880, 350, 0.6 * volume, 260);
    }
  } catch {
    /* audio unavailable: silent */
  }
}

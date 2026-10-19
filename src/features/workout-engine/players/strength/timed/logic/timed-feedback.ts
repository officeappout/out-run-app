/**
 * timed-feedback — engine cue → beep / haptic (pure), and the GPS distance
 * accumulator of a run item inside a round (board U-E3). Same beeps as the
 * strength rest timer: short = countdown, long = a new phase / minute / end.
 */
import type { TimedCue } from '@/features/workout-engine/engines/timed/timed.types';

export type CueSound = 'short' | 'long';

export function cueSound(cue: TimedCue): CueSound | null {
  switch (cue.type) {
    case 'countdown':
      return 'short';
    case 'phase_start':
    case 'cap_reached':
    case 'block_end':
      return 'long';
    case 'minute_start':
      // Minute 1 starts with the user's own "start" tap — no beep on top of it.
      return cue.minute === 0 ? null : 'long';
    default:
      return null;
  }
}

// ── run item distance (GPS) ───────────────────────────────────────────────

export interface RunFix {
  lat: number;
  lng: number;
}

export interface RunTrack {
  last: RunFix | null;
  distanceM: number;
}

export const EMPTY_TRACK: RunTrack = { last: null, distanceM: 0 };

function haversineM(a: RunFix, b: RunFix): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Add a fix: steps under `minStepM` are jitter (the anchor stays, so slow
 * walking still adds up), steps over `maxStepM` are a GPS jump (re-anchor,
 * nothing added).
 */
export function addRunFix(track: RunTrack, fix: RunFix, opts: { minStepM?: number; maxStepM?: number } = {}): RunTrack {
  const { minStepM = 3, maxStepM = 120 } = opts;
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return track;
  if (!track.last) return { last: fix, distanceM: track.distanceM };
  const step = haversineM(track.last, fix);
  if (step < minStepM) return track;
  if (step > maxStepM) return { last: fix, distanceM: track.distanceM };
  return { last: fix, distanceM: track.distanceM + step };
}

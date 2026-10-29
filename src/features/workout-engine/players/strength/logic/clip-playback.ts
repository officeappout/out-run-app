/**
 * clip-playback: how a station clip plays (pilot M14 / M17, enable_park_live_v2). Pure.
 *
 * Root causes (from the code, not the CDN: every equipment video answers 200/206 with the app's
 * Referer, all renditions present):
 *  1. Sound: ExerciseVideoPlayer muted every reps/time clip on every mount. The only unmute was
 *     the demo gate's tap on the block's FIRST interval; the next interval remounts the <video>
 *     muted again. The session mute button (rest screen) never reached the clip at all.
 *     The native app allows unmuted autoplay (Capacitor sets
 *     mediaTypesRequiringUserActionForPlayback = []), so the silence was our own policy.
 *  2. "Plays only partly": every tabata interval remounts the player (its key carries the
 *     round), so a machine clip restarted at 0 s and only its first workSec were ever seen.
 *
 * Fix: a station clip follows the session mute switch, and resumes where it stopped
 * (keyed by exercise, kept for the JS session).
 */

export interface ClipMuteInput {
  exerciseType: string;
  /** Legacy follow-along toggle (sessionStorage 'isAudioEnabled'). */
  legacyAudioEnabled: boolean;
  /** Station clip with sound (park live v2). */
  withSound: boolean;
  /** Session-wide player mute (usePlayerAudioMute). */
  sessionMuted: boolean;
}

export function clipMuted(i: ClipMuteInput): boolean {
  if (i.withSound) return i.sessionMuted;
  return i.exerciseType === 'follow-along' ? !i.legacyAudioEnabled : true;
}

const positions = new Map<string, number>();

/** Seconds from the end inside which a clip starts over instead of resuming. */
const END_MARGIN_SEC = 1;

export function rememberClipTime(key: string, timeSec: number): void {
  if (!key || !Number.isFinite(timeSec) || timeSec < 0) return;
  positions.set(key, timeSec);
}

/** Where to start the clip: the remembered second, or 0 (none, unknown length, or at the end). */
export function clipResumeTime(key: string, durationSec: number): number {
  const t = positions.get(key);
  if (t == null || t <= 0) return 0;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return t >= durationSec - END_MARGIN_SEC ? 0 : t;
}

/** Resume key of a clip: its video (Bunny id, else URL), so the rest preview and the active set share it. */
export function clipKey(bunnyVideoId: string | null | undefined, videoUrl: string | null | undefined): string | null {
  return bunnyVideoId || videoUrl || null;
}

export function clearClipTimes(): void {
  positions.clear();
}

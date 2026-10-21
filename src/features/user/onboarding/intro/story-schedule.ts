/**
 * The story screens' choreography, as a SEQUENCE of beats (enable_entry_intro_v1).
 *
 * Owner notes 21.10 (#2, #3): the thought bubble vanished before it could be read,
 * and the push was never seen — it dropped onto the phone while the phone was still
 * 42 % size and the lock screen faded away the moment the phone reached full size.
 * The fixed 18 s percentages are replaced by beats that each finish before the
 * next one starts, with hold times derived from the copy length:
 *
 *   1 thought   — bubble eases in (≤300 ms), holds readMs(thought), eases out
 *   2 phone     — appears small next to the person, the push "dings" onto it
 *   3 grow      — the person fades while the phone grows to the centre
 *   4 read      — the push, now full size, holds readMs(push)
 *   5 tap       — the finger taps it, the lock screen fades to the app screen
 *   6 happy     — the happy person settles in the bottom corner
 *
 * Pure data, no React. Times are seconds from the story's start (after the ring
 * hand-off); `storyTracks` turns them into the 0..1 Tracks trackProps plays.
 */

import { EASE_IN_OUT, EASE_OUT, EASE_STD, type Ease, type Track } from './story-timeline';
import type { StorySide } from './intro-copy';

/** Reading time: 60 ms per character, never under 1.2 s. */
export const READ_MS_PER_CHAR = 60;
export const READ_MIN_MS = 1200;

/** Characters of copy a person actually reads (quotes / whitespace runs don't count). */
function readableLength(text: string): number {
  return text.replace(/[„”"“]/g, '').replace(/\s+/g, ' ').trim().length;
}

export function readMs(text: string): number {
  return Math.max(READ_MIN_MS, readableLength(text) * READ_MS_PER_CHAR);
}

/** Beat durations (seconds). UI enters/exits stay ≤ 0.3 s; the grow is a storytelling beat. */
export const BEAT = {
  /** pause before the bubble, so the screen settles after the hand-off */
  lead: 0.3,
  bubbleIn: 0.28,
  bubbleOut: 0.24,
  phoneIn: 0.3,
  /** small phone on screen before the push lands on it */
  pushAfterPhone: 0.35,
  pushIn: 0.3,
  /** the push sits on the small phone before the phone grows */
  dingHold: 0.45,
  grow: 1.3,
  sadOut: 0.3,
  tapIn: 0.3,
  tapPress: 0.3,
  lockOut: 0.4,
  happyIn: 0.3,
  /** after the last beat, before the story counts as finished */
  tail: 0.4,
} as const;

export interface StorySchedule {
  bubbleIn: number;
  bubbleHoldEnd: number;
  bubbleGone: number;
  phoneIn: number;
  pushIn: number;
  growStart: number;
  growEnd: number;
  tapStart: number;
  lockOut: number;
  happyIn: number;
  /** The whole story, seconds (the tracks' duration). */
  total: number;
}

export function storySchedule(copy: { thought: string; push: string }): StorySchedule {
  const bubbleIn = BEAT.lead;
  const bubbleHoldEnd = bubbleIn + BEAT.bubbleIn + readMs(copy.thought) / 1000;
  const bubbleGone = bubbleHoldEnd + BEAT.bubbleOut;
  const phoneIn = bubbleGone;
  const pushIn = phoneIn + BEAT.phoneIn + BEAT.pushAfterPhone;
  const growStart = pushIn + BEAT.pushIn + BEAT.dingHold;
  const growEnd = growStart + BEAT.grow;
  const tapStart = growEnd + readMs(copy.push) / 1000;
  const lockOut = tapStart + BEAT.tapIn + BEAT.tapPress;
  const happyIn = lockOut + BEAT.lockOut;
  const total = happyIn + BEAT.happyIn + BEAT.tail;
  return { bubbleIn, bubbleHoldEnd, bubbleGone, phoneIn, pushIn, growStart, growEnd, tapStart, lockOut, happyIn, total };
}

type Values = Record<string, number | string>;

/** Keyframes at absolute seconds → a Track over `total` (holds the last frame to the end). */
export function keyframesTrack(total: number, frames: readonly [number, Values][], ease: Ease): Track {
  const pts = [...frames];
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
  if (pts[pts.length - 1][0] < total) pts.push([total, pts[pts.length - 1][1]]);
  const values: Record<string, (number | string)[]> = {};
  for (const k of Object.keys(pts[0][1])) values[k] = pts.map(([, v]) => v[k]);
  const times = pts.map(([t]) => Math.min(1, Math.max(0, t / total)));
  times[0] = 0;
  times[times.length - 1] = 1;
  return { times, values, ease };
}

export interface StoryTracks {
  total: number;
  think: Track;
  sad: Track;
  phone: Track;
  push: Track;
  tap: Track;
  lock: Track;
  happy: Track;
}

/** Small phone sits beside the person (mockup offsets); the push lands on it before it grows. */
export const PHONE_SMALL = { x: 105, y: 150, scale: 0.42 } as const;

export function storyTracks(story: { thought: string; push: string; side: StorySide }): StoryTracks {
  const s = storySchedule(story);
  const T = s.total;
  const px = story.side === 'left' ? PHONE_SMALL.x : -PHONE_SMALL.x;
  const small = { x: px, y: PHONE_SMALL.y, scale: PHONE_SMALL.scale };

  return {
    total: T,
    think: keyframesTrack(T, [
      [s.bubbleIn, { opacity: 0, scale: 0.94 }],
      [s.bubbleIn + BEAT.bubbleIn, { opacity: 1, scale: 1 }],
      [s.bubbleHoldEnd, { opacity: 1, scale: 1 }],
      [s.bubbleGone, { opacity: 0, scale: 0.97 }],
    ], EASE_OUT),
    sad: keyframesTrack(T, [
      [s.growStart, { opacity: 1 }],
      [s.growStart + BEAT.sadOut, { opacity: 0 }],
    ], EASE_OUT),
    phone: keyframesTrack(T, [
      [s.phoneIn, { opacity: 0, ...small }],
      [s.phoneIn + BEAT.phoneIn, { opacity: 1, ...small }],
      [s.growStart, { opacity: 1, ...small }],
      [s.growEnd, { opacity: 1, x: 0, y: 0, scale: 1 }],
    ], EASE_IN_OUT),
    push: keyframesTrack(T, [
      [s.pushIn, { opacity: 0, y: -12 }],
      [s.pushIn + BEAT.pushIn, { opacity: 1, y: 0 }],
    ], EASE_OUT),
    tap: keyframesTrack(T, [
      [s.tapStart, { opacity: 0, x: 30, y: 60, scale: 1 }],
      [s.tapStart + BEAT.tapIn, { opacity: 1, x: 0, y: 0, scale: 1 }],
      [s.tapStart + BEAT.tapIn + BEAT.tapPress / 2, { opacity: 1, x: 0, y: 0, scale: 0.85 }],
      [s.lockOut, { opacity: 1, x: 0, y: 0, scale: 1 }],
      [s.lockOut + BEAT.lockOut, { opacity: 0, x: 0, y: 0, scale: 1 }],
    ], EASE_STD),
    lock: keyframesTrack(T, [
      [s.lockOut, { opacity: 1 }],
      [s.lockOut + BEAT.lockOut, { opacity: 0 }],
    ], EASE_OUT),
    happy: keyframesTrack(T, [
      [s.happyIn, { opacity: 0, scale: 0.92, y: 8 }],
      [s.happyIn + BEAT.happyIn, { opacity: 1, scale: 1, y: 0 }],
    ], EASE_OUT),
  };
}

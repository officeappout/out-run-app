/**
 * The story screens' choreography (enable_entry_intro_v1), transcribed from the
 * owner's canvas keyframes (intro-S2…S6 / SB / G1 CSS). Percentages are the
 * mockup's own; the app plays each track ONCE and holds the last frame (every
 * track's final keyframe already is the story's end state).
 *
 * Pure data + one helper that turns a track into framer-motion props, or into the
 * final frame when motion is reduced.
 */

import type { MotionProps } from 'framer-motion';

/** The framer-motion props a track (or a one-off fade) produces. */
export type MotionTrackProps = Pick<MotionProps, 'initial' | 'animate' | 'transition'>;

export type Ease = readonly [number, number, number, number];

export const EASE_OUT: Ease = [0.23, 1, 0.32, 1];
export const EASE_IN_OUT: Ease = [0.65, 0, 0.35, 1];
export const EASE_CSS: Ease = [0.25, 0.1, 0.25, 1];
export const EASE_BACK: Ease = [0.34, 1.56, 0.64, 1];
export const EASE_STD: Ease = [0.4, 0, 0.2, 1];

/** One story's timeline — the mockup's 18 s loop, played once. */
export const STORY_S = 18;
/** The ring hand-off before each story. */
export const HANDOFF_S = 2.4;
/** The badge lands slightly after the hand-off. */
export const BADGE_S = 2.6;
/** The ring closing into the logo over the globe. */
export const RING_CLOSE_S = 5;

export interface Track {
  /** 0..1, ascending, first 0 and last 1. */
  times: readonly number[];
  values: Readonly<Record<string, readonly (number | string)[]>>;
  ease: Ease;
}

const pct = (...p: number[]) => p.map((n) => n / 100);

/** The thought bubble: in, hold, out. */
export const THINK: Track = {
  times: pct(0, 3, 7, 19, 23, 100),
  values: { opacity: [0, 0, 1, 1, 0, 0], scale: [0.85, 0.85, 1, 1, 0.95, 0.95] },
  ease: EASE_OUT,
};

/** The sad character + its name tag fade out as the happy one arrives. */
export const SAD: Track = {
  times: pct(0, 30, 36, 100),
  values: { opacity: [1, 1, 0, 0] },
  ease: EASE_CSS,
};

/** The happy character: crossfades in at the sad one's place, then shrinks into the corner. */
export function happyTrack(side: 'left' | 'right'): Track {
  const x = side === 'left' ? 70 : -100;
  return {
    times: pct(0, 30, 36, 40, 54, 100),
    values: {
      opacity: [0, 0, 1, 1, 1, 1],
      x: [x, x, x, x, 0, 0],
      y: [-164, -164, -164, -164, 0, 0],
      scale: [2.15, 2.15, 2.15, 2.15, 1, 1],
    },
    ease: EASE_IN_OUT,
  };
}

/** The phone: appears small next to the character, then grows into its place. */
export function phoneTrack(side: 'left' | 'right'): Track {
  const x = side === 'left' ? 105 : -105;
  return {
    times: pct(0, 20, 25, 38, 52, 100),
    values: {
      opacity: [0, 0, 1, 1, 1, 1],
      x: [x, x, x, x, 0, 0],
      y: [150, 150, 150, 150, 0, 0],
      scale: [0.42, 0.42, 0.42, 0.42, 1, 1],
    },
    ease: EASE_IN_OUT,
  };
}

/** The push notification drops onto the lock screen. */
export const PUSH: Track = {
  times: pct(0, 22, 27, 100),
  values: { opacity: [0, 0, 1, 1], y: [-12, -12, 0, 0] },
  ease: EASE_OUT,
};

/** The lock screen fades to the app screen after the tap. */
export const LOCK: Track = {
  times: pct(0, 52, 58, 100),
  values: { opacity: [1, 1, 0, 0] },
  ease: EASE_CSS,
};

/** The finger tapping the push. */
export const TAP: Track = {
  times: pct(0, 50, 53, 55, 57, 60, 100),
  values: {
    opacity: [0, 0, 1, 1, 1, 0, 0],
    x: [30, 30, 0, 0, 0, 0, 0],
    y: [60, 60, 0, 0, 0, 0, 0],
    scale: [1, 1, 1, 0.8, 1, 1, 1],
  },
  ease: EASE_STD,
};

/** Hand-off: the other segments fade while this one stays lit. */
export const HANDOFF_GREY: Track = {
  times: pct(0, 25, 55, 100),
  values: { opacity: [1, 1, 0.15, 0.15] },
  ease: EASE_CSS,
};

/** Hand-off: the white band under the ring. */
export const HANDOFF_BG: Track = {
  times: pct(0, 80, 100),
  values: { opacity: [1, 1, 0] },
  ease: EASE_CSS,
};

/** Hand-off: the ring flies into the badge (x/y/scale filled in from the measured badge). */
export function handoffRingTrack(dx: number, dy: number, scale: number): Track {
  return {
    times: pct(0, 30, 88, 100),
    values: { x: [0, 0, dx, dx], y: [0, 0, dy, dy], scale: [1, 1, scale, scale], opacity: [1, 1, 1, 0] },
    ease: EASE_IN_OUT,
  };
}

/** The header badge pops in as the ring lands. */
export const BADGE: Track = {
  times: pct(0, 85, 100),
  values: { opacity: [0, 0, 1], scale: [0.8, 0.8, 1] },
  ease: EASE_BACK,
};

/** Framer-motion props for a track, or its last frame when motion is reduced. */
export function trackProps(
  track: Track,
  duration: number,
  opts: { reduce: boolean; delay?: number },
): MotionTrackProps {
  const first: Record<string, number | string> = {};
  const last: Record<string, number | string> = {};
  const frames: Record<string, (number | string)[]> = {};
  for (const [k, v] of Object.entries(track.values)) {
    first[k] = v[0];
    last[k] = v[v.length - 1];
    frames[k] = [...v];
  }
  if (opts.reduce) return { initial: false, animate: last as MotionProps['animate'] };
  return {
    initial: first as MotionProps['initial'],
    animate: frames as MotionProps['animate'],
    transition: { duration, times: [...track.times], ease: track.ease, delay: opts.delay ?? 0 },
  };
}

/** A one-off tween (fade-up, pop-in), or nothing when motion is reduced. */
export function tween(
  from: Record<string, number>,
  to: Record<string, number>,
  t: { duration: number; ease: Ease; delay?: number },
  reduce: boolean,
): MotionTrackProps {
  if (reduce) return { initial: false };
  return {
    initial: from as MotionProps['initial'],
    animate: to as MotionProps['animate'],
    transition: { duration: t.duration, ease: t.ease, delay: t.delay ?? 0 },
  };
}

/**
 * The intro's motion primitives (enable_entry_intro_v1): eases, the ring
 * hand-off / badge tracks (from the owner's canvas keyframes), and the helpers
 * that turn a track into framer-motion props — or into the final frame when
 * motion is reduced. Each track plays ONCE and holds its last frame.
 * The story beats themselves are sequenced in story-schedule.ts.
 *
 * Pure data, no React.
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

/** The ring hand-off before each story. */
export const HANDOFF_S = 2.4;
/** The badge lands slightly after the hand-off. */
export const BADGE_S = 2.6;

export interface Track {
  /** 0..1, ascending, first 0 and last 1. */
  times: readonly number[];
  values: Readonly<Record<string, readonly (number | string)[]>>;
  ease: Ease;
}

const pct = (...p: number[]) => p.map((n) => n / 100);

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

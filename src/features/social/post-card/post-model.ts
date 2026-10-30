/**
 * One workout post (enable_workout_post_v1, canvas boards PostTypes / PostCompact / PostFeed): the
 * same card on home, in the feed and (later) in the share images. PURE. One design per family:
 *
 *   strength  brand night square + level ring · rings: sets · exercises · time
 *   run       night map with the route         · rings: km · pace (or speed on a ride) · time
 *   walk      night map with the route         · rings: steps · km · time   (never a running ring)
 *   combined  night map / brand night          · rings: walk / run · sets · total time
 *
 * Real values only: a ring whose value is unknown is dropped. Ring colours = the home widget's.
 * "together" is part of the design, but no post carries participants yet, so it is not built here.
 */

import { estimateSteps } from '@/lib/steps-estimate';
import { formatPaceMin, isRidePost, rideSpeedKmh } from '../services/feed-cardio-stats';
import type { FeedPost } from '../services/feed.service';
import type { FeedTopExercise } from '../services/feed-post-details';

export type PostKind = 'strength' | 'run' | 'walk' | 'combined';
export type PostRingKey = 'distance' | 'pace' | 'speed' | 'time' | 'steps' | 'sets' | 'exercises' | 'walk' | 'run' | 'total';
export type PostUnitKey = 'km' | 'minPerKm' | 'kmh' | 'min' | 'none';

export interface PostRing {
  key: PostRingKey;
  value: string;
  unit: PostUnitKey;
  /** 0-100. */
  pct: number;
  color: string;
}

export interface PostLevel {
  index: number;
  count: number;
}

export interface PostModel {
  kind: PostKind;
  /** The workout's own title, or null → the caller's family label. */
  title: string | null;
  rings: PostRing[];
  /** Stored route shape (0..1000 box, flat ints), when the square shows a map. */
  route: number[] | null;
  photoUrl: string | null;
  level: PostLevel | null;
  /** One achievement line (compact surface). */
  achievement: string | null;
  /** Strength rows (top exercises), for the set table. */
  exercises: FeedTopExercise[];
  moreExercises: number;
  place: string | null;
}

/** Ring colours: the home widget (aerobic lime / green, strength cyan, time brand blue). */
export const POST_RING_COLORS = {
  distance: '#84cc16',
  pace: '#10b981',
  speed: '#10b981',
  steps: '#84cc16',
  walk: '#84cc16',
  run: '#84cc16',
  sets: '#06B6D4',
  exercises: '#06B6D4',
  time: '#00baf7',
  total: '#00baf7',
} as const satisfies Record<PostRingKey, string>;

const pos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const ring = (key: PostRingKey, value: string, unit: PostUnitKey, pct = 100): PostRing => ({
  key,
  value,
  unit,
  pct: Math.max(0, Math.min(100, Math.round(pct))),
  color: POST_RING_COLORS[key],
});
const km1 = (km: number) => (Math.round(km * 10) / 10).toFixed(1);
const steps = (n: number) => n.toLocaleString('en-US');
const routeOf = (r: unknown): number[] | null => (Array.isArray(r) && r.length >= 6 ? (r as number[]) : null);

/** The family of a feed post. */
export function postKindOf(post: Pick<FeedPost, 'activityCategory' | 'hybridParts' | 'activityType'>): PostKind {
  if (post.hybridParts) return 'combined';
  if (post.activityCategory !== 'cardio') return 'strength';
  return post.activityType === 'walking' ? 'walk' : 'run';
}

function strengthRings(exercises: readonly FeedTopExercise[], more: number, minutes: number): PostRing[] {
  const out: PostRing[] = [];
  const planned = exercises.reduce((a, e) => a + (e.sets || 0), 0);
  const done = exercises.reduce((a, e) => a + (e.setsDone || 0), 0);
  // Sets only when the post lists every exercise (otherwise the sum would undercount).
  if (!more && done > 0) out.push(ring('sets', String(done), 'none', planned > 0 ? (done / planned) * 100 : 100));
  const count = exercises.length + (more || 0);
  if (count > 0) out.push(ring('exercises', String(count), 'none'));
  if (pos(minutes)) out.push(ring('time', String(Math.round(minutes)), 'min'));
  return out;
}

export function postFromFeed(post: FeedPost): PostModel {
  const kind = postKindOf(post);
  const minutes = post.durationMinutes;
  const km = post.distanceKm;
  let rings: PostRing[] = [];
  if (kind === 'strength') {
    rings = strengthRings(post.topExercises ?? [], post.moreExercises ?? 0, minutes);
  } else if (kind === 'combined') {
    const h = post.hybridParts!;
    const aerKm = (h.walkKm || 0) + (h.runKm || 0);
    if (aerKm > 0) rings.push(ring(h.runKm > h.walkKm ? 'run' : 'walk', km1(aerKm), 'km'));
    if (pos(h.strengthSets)) rings.push(ring('sets', String(h.strengthSets), 'none'));
    if (pos(minutes)) rings.push(ring('total', String(Math.round(minutes)), 'min'));
  } else {
    const ride = isRidePost(post);
    if (kind === 'walk' && pos(km)) rings.push(ring('steps', steps(estimateSteps(km)), 'none'));
    if (pos(km)) rings.push(ring('distance', km1(km), 'km'));
    if (kind === 'run') {
      const speed = ride ? rideSpeedKmh(km, minutes) : null;
      if (ride && speed) rings.push(ring('speed', speed.toFixed(1), 'kmh'));
      else if (!ride && pos(post.paceMinPerKm)) rings.push(ring('pace', formatPaceMin(post.paceMinPerKm), 'minPerKm'));
    }
    if (pos(minutes)) rings.push(ring('time', String(Math.round(minutes)), 'min'));
  }
  return {
    kind,
    title: post.title || post.programName || null,
    rings: rings.slice(0, 3),
    route: kind === 'strength' ? null : routeOf(post.routeShape),
    photoUrl: post.photoUrl || null,
    level: post.levelIndex && post.levelCount ? { index: post.levelIndex, count: post.levelCount } : null,
    achievement: post.personalBest || null,
    exercises: kind === 'strength' ? post.topExercises ?? [] : [],
    moreExercises: kind === 'strength' ? post.moreExercises ?? 0 : 0,
    place: post.parkName || null,
  };
}

/** The home "done today" slide's inputs (TodayActivityCardData + the saved doc's numbers). */
export interface DoneInput {
  category: string;
  workoutType?: string | null;
  title: string;
  minutes?: number;
  stepsAchieved?: number;
  /** km */
  distance?: number;
  /** seconds */
  duration?: number;
  /** minutes per km */
  pace?: number;
  setsCompleted?: number;
  note?: string | null;
}

export function postKindOfDone(d: Pick<DoneInput, 'category' | 'workoutType'>): PostKind {
  if (d.workoutType === 'hybrid') return 'combined';
  if (d.category === 'steps' || d.workoutType === 'walking') return 'walk';
  if (d.category === 'cardio' || d.workoutType === 'running' || d.workoutType === 'cycling') return 'run';
  return 'strength';
}

/** A saved workout (profile history: WorkoutHistoryEntry subset) → the same model as the home slide. */
export function postFromHistory(w: {
  category?: string;
  workoutType?: string;
  routeName?: string;
  distance?: number;
  duration?: number;
  pace?: number;
  setsCompleted?: number;
}, title = ''): PostModel {
  return postFromDone({
    category: w.category === 'cardio' || w.category === 'hybrid' ? 'cardio' : w.category ?? 'strength',
    workoutType: w.workoutType ?? null,
    title: w.routeName || title,
    distance: w.distance,
    duration: w.duration,
    pace: w.pace,
    setsCompleted: w.setsCompleted,
  });
}

export function postFromDone(d: DoneInput): PostModel {
  const kind = postKindOfDone(d);
  const km = d.distance;
  const minutes = pos(d.duration) ? d.duration / 60 : d.minutes;
  const rings: PostRing[] = [];
  if (kind === 'walk') {
    const s = pos(d.stepsAchieved) ? d.stepsAchieved : pos(km) ? estimateSteps(km) : 0;
    if (s > 0) rings.push(ring('steps', steps(s), 'none'));
    if (pos(km)) rings.push(ring('distance', km1(km), 'km'));
  } else if (kind === 'run') {
    if (pos(km)) rings.push(ring('distance', km1(km), 'km'));
    if (pos(d.pace) && d.workoutType !== 'cycling') rings.push(ring('pace', formatPaceMin(d.pace), 'minPerKm'));
  } else if (kind === 'combined') {
    if (pos(km)) rings.push(ring('walk', km1(km), 'km'));
    if (pos(d.setsCompleted)) rings.push(ring('sets', String(d.setsCompleted), 'none'));
  } else if (pos(d.setsCompleted)) {
    rings.push(ring('sets', String(d.setsCompleted), 'none'));
  }
  if (pos(minutes)) rings.push(ring(kind === 'combined' ? 'total' : 'time', String(Math.round(minutes)), 'min'));
  return {
    kind,
    title: d.title || null,
    rings: rings.slice(0, 3),
    route: null,
    photoUrl: null,
    level: null,
    achievement: d.note || null,
    exercises: [],
    moreExercises: 0,
    place: null,
  };
}

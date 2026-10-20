/**
 * Demo world — the docs of ONE done session (pure, no Firebase): the workout (the app's
 * WorkoutHistoryEntry shape), the optional feed post (ageGroup 'demo') and the optional
 * park check-in (sessions, demo authority). Shared by the seed's 60-day history
 * (scripts/demo/lib/history.ts) and the live engine (demoSimulatorTick), so a workout
 * written today looks exactly like one written by the seed.
 *
 * Random draws happen in a fixed order (duration, then pace / GPS) — the seed's output is
 * deterministic per persona + date + session index.
 */
import { gauss, roll } from './rng';
import { loopRoute, type LatLng } from './geo';

export type LifeCat = 'strength' | 'cardio' | 'maintenance';

export interface LifeDoc {
  path: string;
  data: Record<string, unknown>;
}

export interface LifePark {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** One planned session of a persona's week. `title` is the app's own Hebrew name. */
export interface LifeSession {
  kind: 'strength' | 'run' | 'walk' | 'mobility';
  slug?: string;
  slot?: string;
  minutes: number;
  title: string;
}

/** Who did it, and where they belong (every scope id is a demo id). */
export interface SessionActor {
  uid: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  parkUser: boolean;
  shareRate: number;
  authorityId: string;
  neighborhoodId: string | null;
  tenantId: string;
  unitId: string | null;
  groupIds: string[];
  home: LatLng;
  /** The persona's (real, read-only) park — referenced by NAME on workouts, by id only on check-ins. */
  park: LifePark | null;
  runLevel: string;
}

export interface DoneSession {
  workoutId: string | null;
  docs: LifeDoc[];
  cat: LifeCat;
  minutes: number;
  xp: number;
  calories: number;
  extraSteps: number;
  distanceKm: number;
  shared: boolean;
}

const PACE_BY_LEVEL: Record<string, number> = { beginner: 6.9, intermediate: 5.7, advanced: 4.9 };
const PACE_FACTOR_BY_SLOT: Record<string, number> = { quality_primary: 0.9, quality_secondary: 0.93, long_run: 1.08, easy_run: 1.1, recovery: 1.2 };

/**
 * Feed credit — the app's postActivityCredit for a non-hybrid post
 * (src/features/social/services/feed-hybrid.ts FEED_CREDIT_MULTIPLIER). functions/ cannot
 * import src/, so it is mirrored here; a parity test (scripts/demo/__tests__) keeps them equal.
 */
export const FEED_CREDIT_MULTIPLIER_MIRROR: Record<LifeCat, number> = { strength: 2, cardio: 1, maintenance: 1 };
export const feedCredit = (cat: LifeCat, minutes: number) => minutes * (FEED_CREDIT_MULTIPLIER_MIRROR[cat] ?? 1);

export const workoutIdFor = (uid: string, date: string, i: number) => `${uid}_w_${date}_${i}`;
export const postIdFor = (uid: string, date: string, i: number) => `${uid}_post_${date}_${i}`;
export const checkinIdFor = (uid: string, date: string, i: number) => `${uid}_chk_${date}_${i}`;

/** Did the persona share session i of `date` to the feed (seeded, stable). */
export const sharesSession = (uid: string, date: string, i: number, shareRate: number) => roll(`${uid}|${date}|${i}|share`) < shareRate;

export function buildSessionDocs(
  a: SessionActor,
  s: LifeSession,
  at: Date,
  date: string,
  i: number,
  weeksAgo: number,
  r: () => number,
): DoneSession {
  const uid = a.uid;
  const minutes = Math.max(10, Math.round(s.minutes * (1 + gauss(r) * 0.08)));
  if (s.kind === 'mobility') {
    return { workoutId: null, docs: [], cat: 'maintenance', minutes, xp: 0, calories: minutes * 3, extraSteps: 0, distanceKm: 0, shared: false };
  }

  const workoutId = workoutIdFor(uid, date, i);
  const docs: LifeDoc[] = [];
  const base = {
    userId: uid,
    date: at,
    createdAt: at,
    duration: minutes * 60,
    earnedCoins: minutes,
    authorityId: a.authorityId,
    ...(a.neighborhoodId ? { neighborhoodId: a.neighborhoodId } : {}),
    isDemo: true,
  };
  let cat: LifeCat;
  let distanceKm = 0;
  let pace = 0;
  let extraSteps = 0;
  let calories: number;
  let workout: Record<string, unknown>;
  const park = a.park;

  if (s.kind === 'strength') {
    cat = 'strength';
    calories = Math.round(minutes * 6.5);
    const setsPlanned = Math.round(minutes / 2.6);
    workout = {
      ...base,
      activityType: 'strength',
      workoutType: 'strength',
      category: 'strength',
      displayIcon: 'dumbbell',
      distance: 0,
      pace: 0,
      calories,
      setsPlanned,
      setsCompleted: Math.max(1, setsPlanned - (r() < 0.3 ? 1 : 0)),
      difficulty: 2,
      routePath: [],
      // The real park's NAME only — no parkId on the workout (real parks' activity
      // overlays read workouts by parkId; check-ins below carry the demo authority).
      ...(a.parkUser && park ? { parkName: park.name } : {}),
    };
    if (a.parkUser && park) {
      docs.push({ path: `sessions/${checkinIdFor(uid, date, i)}`, data: { authorityId: a.authorityId, parkId: park.id, userId: uid, date: at, isDemo: true } });
    }
  } else {
    cat = 'cardio';
    const isRun = s.kind === 'run';
    const improve = 1 + weeksAgo * 0.003;
    pace = isRun
      ? (PACE_BY_LEVEL[a.runLevel] ?? 6.2) * (PACE_FACTOR_BY_SLOT[s.slot ?? 'easy_run'] ?? 1) * improve * (1 + gauss(r) * 0.04)
      : (a.age >= 65 ? 13 : 11) * (1 + gauss(r) * 0.04);
    distanceKm = +(minutes / pace).toFixed(2);
    calories = Math.round(minutes * (isRun ? 10.5 : 4.5));
    extraSteps = Math.round(minutes * (isRun ? 160 : 105));
    const start = park && r() < 0.5 ? { lat: park.lat, lng: park.lng } : a.home;
    workout = {
      ...base,
      activityType: isRun ? 'running' : 'walking',
      workoutType: isRun ? 'running' : 'walking',
      category: 'cardio',
      displayIcon: isRun ? 'run-fast' : 'walk',
      distance: distanceKm,
      pace: +pace.toFixed(2),
      calories,
      routePath: loopRoute(start, distanceKm, r),
    };
  }
  const xp = Math.round(minutes * (cat === 'strength' ? 2 : 1.5));
  docs.push({ path: `workouts/${workoutId}`, data: { ...workout, xpEarned: xp } });

  const shared = sharesSession(uid, date, i, a.shareRate);
  if (shared) {
    docs.push({
      path: `feed_posts/${postIdFor(uid, date, i)}`,
      data: {
        authorUid: uid,
        authorName: a.name,
        type: 'workout',
        activityCategory: cat,
        durationMinutes: minutes,
        activityCredit: feedCredit(cat, minutes),
        distanceKm: distanceKm || null,
        paceMinPerKm: pace ? +pace.toFixed(2) : null,
        paceSecPerKm: pace ? Math.round(pace * 60) : null,
        runSegment: null,
        intensityLevel: null,
        title: s.title,
        audience: 'partners',
        authorityId: a.authorityId,
        neighborhoodId: a.neighborhoodId,
        schoolId: null,
        parkId: null,
        parkName: s.kind === 'strength' && a.parkUser && park ? park.name : null,
        // Never 'adult' / 'minor': no real board's age query can return a demo post.
        ageGroup: 'demo',
        gender: a.gender,
        programId: s.slug ?? null,
        groupIds: a.groupIds,
        xpAwarded: xp,
        tenantId: a.tenantId,
        ...(a.unitId ? { unitId: a.unitId } : {}),
        isDemo: true,
        createdAt: new Date(at.getTime() + minutes * 60_000),
      },
    });
  }
  return { workoutId, docs, cat, minutes, xp, calories, extraSteps, distanceKm, shared };
}

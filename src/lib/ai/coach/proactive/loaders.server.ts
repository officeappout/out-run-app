/**
 * Kelly phase 3 — the Admin SDK reads the proactive engine needs beyond the user sheet.
 * Read-only. Each loader is only called for the triggers due in the run (run.server.ts), so
 * a post-workout-only run never reads the week or the weather.
 */
import 'server-only';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { toCellId } from '@/features/weather/core/cell';
import { deriveHomeWeather } from '@/features/weather/core/derive-home-weather';
import type { WeatherSnapshot } from '@/features/weather/core/weather.types';
import { WEATHER_CACHE_COLLECTION, WEATHER_STALE_MAX_MS } from '@/features/weather/server/weather-cache';
import { EMPTY_LEDGER, type ProactiveLedger, type ProactiveUserState, type RecentWorkout, type WeekSummary } from './types';

export const PROACTIVE_LEDGER = 'ai_coach_proactive';
export const PROACTIVE_STATS = 'ai_coach_proactive_stats';
export const ASKED_WORKOUTS_MAX = 10;

/** Deterministic id of a day's proactive message: the doc itself is the one-a-day lock. */
export function proactiveMessageId(dateKey: string): string {
  return `proactive_${dateKey}`;
}

const msOf = (v: unknown): number | null => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as Timestamp).toMillis();
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

export function parseLedger(raw: Record<string, unknown> | undefined): ProactiveLedger {
  if (!raw) return { ...EMPTY_LEDGER, assessmentNudges: {}, askedWorkoutIds: [] };
  const nudges: Record<string, number> = {};
  const rawN = raw.assessmentNudges;
  if (rawN && typeof rawN === 'object') {
    for (const [k, v] of Object.entries(rawN as Record<string, unknown>)) if (typeof v === 'number') nudges[k] = v;
  }
  return {
    weeklySentFor: typeof raw.weeklySentFor === 'string' ? raw.weeklySentFor : null,
    assessmentNudges: nudges,
    lastAssessmentAt: typeof raw.lastAssessmentAt === 'number' ? raw.lastAssessmentAt : null,
    askedWorkoutIds: Array.isArray(raw.askedWorkoutIds) ? raw.askedWorkoutIds.filter((x): x is string => typeof x === 'string').slice(-ASKED_WORKOUTS_MAX) : [],
  };
}

/** A workouts doc → the post-workout trigger's view (duration is stored in seconds). */
export function recentWorkoutOf(id: string, d: Record<string, unknown>): RecentWorkout | null {
  const endedAtMs = msOf(d.date);
  if (endedAtMs === null) return null;
  const sec = typeof d.duration === 'number' && Number.isFinite(d.duration) ? d.duration : 0;
  return { id, endedAtMs, minutes: Math.round(sec / 60) };
}

/** Workouts saved in [fromMs, toMs): the post-workout candidates (single-field range, auto-indexed). */
export async function workoutsSavedBetween(db: Firestore, fromMs: number, toMs: number, limit = 500): Promise<Array<{ uid: string; workout: RecentWorkout }>> {
  const snap = await db
    .collection('workouts')
    .where('date', '>=', Timestamp.fromMillis(fromMs))
    .where('date', '<', Timestamp.fromMillis(toMs))
    .orderBy('date', 'asc')
    .limit(limit)
    .get();
  const out: Array<{ uid: string; workout: RecentWorkout }> = [];
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const uid = typeof d.userId === 'string' ? d.userId : null;
    const w = recentWorkoutOf(doc.id, d);
    if (uid && w) out.push({ uid, workout: w });
  }
  return out;
}

/** Distinct users with a workout saved since `sinceMs` (weekly / assessment candidates). */
export async function usersActiveSince(db: Firestore, sinceMs: number, limit = 3000): Promise<string[]> {
  const snap = await db.collection('workouts').where('date', '>=', Timestamp.fromMillis(sinceMs)).select('userId').limit(limit).get();
  const set = new Set<string>();
  for (const d of snap.docs) {
    const uid = d.get('userId');
    if (typeof uid === 'string' && uid) set.add(uid);
  }
  return Array.from(set);
}

/** Users with an uncompleted training entry today (morning / weather candidates). */
export async function usersTrainingToday(db: Firestore, dateKey: string, limit = 5000): Promise<string[]> {
  const snap = await db.collection('userSchedule').where('date', '==', dateKey).limit(limit).get();
  const out = new Set<string>();
  for (const doc of snap.docs) {
    const d = doc.data() as { userId?: unknown; entries?: unknown };
    if (typeof d.userId !== 'string') continue;
    const entries = Array.isArray(d.entries) ? (d.entries as Array<Record<string, unknown>>) : [];
    if (entries.some((e) => e?.type === 'training' && e?.completed !== true)) out.add(d.userId);
  }
  return Array.from(out);
}

/** This week so far: Sunday 00:00 Israel → now (workouts + daily steps). */
export async function loadWeekSummary(
  db: Firestore,
  uid: string,
  weekStartMs: number,
  weekDateKeys: string[],
  streakDays: number | null,
): Promise<WeekSummary> {
  const [wSnap, stepSnaps] = await Promise.all([
    db.collection('workouts').where('userId', '==', uid).where('date', '>=', Timestamp.fromMillis(weekStartMs)).orderBy('date', 'desc').limit(60).get(),
    weekDateKeys.length ? db.getAll(...weekDateKeys.map((k) => db.collection('dailyActivity').doc(`${uid}_${k}`))) : Promise.resolve([]),
  ]);
  const days = new Set<string>();
  let minutes = 0;
  for (const d of wSnap.docs) {
    const x = d.data();
    const ms = msOf(x.date);
    if (ms !== null) days.add(new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }));
    if (typeof x.duration === 'number' && Number.isFinite(x.duration)) minutes += Math.round(x.duration / 60);
  }
  const steps = stepSnaps.map((s) => (s.exists ? s.get('steps') : null)).filter((n): n is number => typeof n === 'number' && n > 0);
  return {
    workouts: wSnap.size,
    activeDays: days.size,
    minutes,
    streakDays,
    avgSteps: steps.length ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : null,
  };
}

/**
 * Weather for the user's home cell from the cache the app already keeps (weather_cache/{cell}),
 * never a provider call from the cron. The cell is rounded from core.anchorLat/Lng here and
 * never logged or stored. null = no fresh data.
 */
export async function loadCachedWeather(db: Firestore, profile: Record<string, unknown>, now: Date): Promise<ProactiveUserState['weather']> {
  const core = (profile.core ?? {}) as Record<string, unknown>;
  if (typeof core.anchorLat !== 'number' || typeof core.anchorLng !== 'number') return null;
  const cell = toCellId(core.anchorLat, core.anchorLng);
  if (!cell) return null;
  const snap = await db.collection(WEATHER_CACHE_COLLECTION).doc(cell).get();
  const s = snap.exists ? (snap.get('snapshot') as WeatherSnapshot | undefined) : undefined;
  if (!s || typeof s.fetchedAt !== 'number' || !s.now || now.getTime() - s.fetchedAt > WEATHER_STALE_MAX_MS) return null;
  const flag = deriveHomeWeather(s, now).classification.flag;
  return flag === 'cold' ? null : flag;
}

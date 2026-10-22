/**
 * users-activity.server — signups and workouts over time, for the get_signups_overview /
 * get_workouts_overview admin-assistant tools. READ-ONLY (Admin SDK), no write verb.
 *
 * Real data model (checked against production 22.10.2026):
 *   users/{uid}.createdAt                  Timestamp — the signup moment
 *   users/{uid}.core.authorityId           the user's city (string; absent for many)
 *   users/{uid}.marketingAttribution       { source, campaign, medium … } — present only on some
 *                                          users (3 of the 40 newest); absent = NOT attributed.
 *                                          (growth-metrics lumps absent into 'organic'; we do not
 *                                          — most users simply were never captured.)
 *   users/{uid}.core.isTestData/isMockData/demo   test + demo accounts: excluded (isExcludedFromGlobalKpis)
 *   workouts/{id}                          one doc per SAVED workout: userId, date (Timestamp),
 *                                          workoutType strength|running|walking|hybrid|recovery,
 *                                          setsCompleted (strength). isRealWorkoutCompletion is the
 *                                          locked KPI rule. There is NO started-vs-finished record,
 *                                          so a completion rate cannot be computed (reported null).
 * The users read is slim (select) and cached 10 minutes — never touches health/birth/phone fields.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { isExcludedFromGlobalKpis } from '@/lib/testAccountFilter';
import { isRealWorkoutCompletion } from '@/lib/workout-completion-kpi';
import { getIsraelDateKey } from '@/lib/israelTime';
import { authorityNames } from './authority-names.server';
import { cachedCompute, HEAVY_TOOL_TTL_MS } from './cache.server';
import { dayKeyDaysAgo, lastDayKeys, toDateSafe } from './dates';
import { maskSmall, metaOf, type MetricResult } from './meta';

export const UNATTRIBUTED = 'unattributed';
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_N = 10;
const WORKOUT_READ_LIMIT = 60000;

export interface SlimUser {
  uid: string;
  signupDay: string | null;
  authorityId: string | null;
  source: string;
  campaign: string | null;
}

export async function readRealUsers(db: Firestore): Promise<SlimUser[]> {
  return cachedCompute('users_slim', HEAVY_TOOL_TTL_MS, async () => {
    const snap = await db
      .collection('users')
      .select('createdAt', 'core.authorityId', 'core.isMockData', 'core.isTestData', 'core.demo', 'marketingAttribution.source', 'marketingAttribution.campaign')
      .get();
    const out: SlimUser[] = [];
    for (const d of snap.docs) {
      const data = (d.data() ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isExcludedFromGlobalKpis(data.core, d.id)) continue;
      const created = toDateSafe(data.createdAt);
      const src = data.marketingAttribution?.source;
      const camp = data.marketingAttribution?.campaign;
      out.push({
        uid: d.id,
        signupDay: created ? getIsraelDateKey(created) : null,
        authorityId: typeof data.core?.authorityId === 'string' && data.core.authorityId ? data.core.authorityId : null,
        source: typeof src === 'string' && src.trim() ? src.trim().toLowerCase() : UNATTRIBUTED,
        campaign: typeof camp === 'string' && camp.trim() ? camp.trim() : null,
      });
    }
    return out;
  });
}

type Counted = number | '<5';

function topSplit(map: Map<string, number>): Array<{ key: string; count: Counted }> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_N)
    .map(([key, n]) => ({ key, count: maskSmall(n) }));
}

const pctChange = (cur: number, prev: number): number | null => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

/** Bucket labels for a list of day keys (oldest first): each day, or 7-day blocks from the start. */
function bucketLabels(keys: string[], groupBy: 'day' | 'week'): Map<string, string> {
  const m = new Map<string, string>();
  keys.forEach((k, i) => m.set(k, groupBy === 'day' ? k : keys[i - (i % 7)]));
  return m;
}

// ── signups ───────────────────────────────────────────────────────────────

export interface SignupsOverview {
  days: number;
  groupBy: 'day' | 'week';
  filters: { authorityId: string | null; source: string | null };
  total: number;
  previousTotal: number;
  changePct: number | null;
  series: Array<{ from: string; signups: number }>;
  byCity: Array<{ authorityId: string; name: string; count: Counted }>;
  withoutCity: Counted;
  bySource: Array<{ source: string; count: Counted }>;
  byCampaign: Array<{ campaign: string; count: Counted }>;
  /** share of the period's signups that carry no marketingAttribution source, % */
  unattributedPct: number | null;
}

export interface SignupsInput {
  days: number;
  groupBy: 'day' | 'week';
  authorityId: string | null;
  source: string | null;
}

export function computeSignups(users: SlimUser[], input: SignupsInput, now: Date): SignupsOverview {
  const keys = lastDayKeys(now, input.days);
  const prevKeys = Array.from(new Set(Array.from({ length: input.days }, (_, i) => dayKeyDaysAgo(now, input.days + i)))).sort();
  const wantSource = input.source ? input.source.trim().toLowerCase() : null;
  const keep = (u: SlimUser) => (!input.authorityId || u.authorityId === input.authorityId) && (!wantSource || u.source === wantSource);
  const cur = new Set(keys);
  const prev = new Set(prevKeys);
  const inRange = users.filter((u) => u.signupDay && keep(u));
  const now_ = inRange.filter((u) => cur.has(u.signupDay as string));
  const previousTotal = inRange.filter((u) => prev.has(u.signupDay as string)).length;

  const labels = bucketLabels(keys, input.groupBy);
  const series = new Map<string, number>();
  for (const l of Array.from(new Set(labels.values()))) series.set(l, 0);
  now_.forEach((u) => series.set(labels.get(u.signupDay as string)!, (series.get(labels.get(u.signupDay as string)!) ?? 0) + 1));

  const city = new Map<string, number>();
  const src = new Map<string, number>();
  const camp = new Map<string, number>();
  let noCity = 0;
  let unattributed = 0;
  for (const u of now_) {
    if (u.authorityId) city.set(u.authorityId, (city.get(u.authorityId) ?? 0) + 1);
    else noCity += 1;
    src.set(u.source, (src.get(u.source) ?? 0) + 1);
    if (u.source === UNATTRIBUTED) unattributed += 1;
    if (u.campaign) camp.set(u.campaign, (camp.get(u.campaign) ?? 0) + 1);
  }
  return {
    days: input.days,
    groupBy: input.groupBy,
    filters: { authorityId: input.authorityId, source: wantSource },
    total: now_.length,
    previousTotal,
    changePct: pctChange(now_.length, previousTotal),
    series: Array.from(series.entries()).map(([from, signups]) => ({ from, signups })),
    byCity: topSplit(city).map((c) => ({ authorityId: c.key, name: c.key, count: c.count })),
    withoutCity: maskSmall(noCity),
    bySource: topSplit(src).map((s) => ({ source: s.key, count: s.count })),
    byCampaign: topSplit(camp).map((c) => ({ campaign: c.key, count: c.count })),
    unattributedPct: now_.length > 0 ? Math.round((unattributed / now_.length) * 1000) / 10 : null,
  };
}

export const SIGNUPS_CAVEATS = [
  'real accounts only (test / demo accounts excluded); signup = users.createdAt, Israel days',
  'marketing attribution was captured for only part of the users — "unattributed" means not captured, NOT organic',
  'split cells under 5 show "<5"',
];

export async function getSignupsOverview(db: Firestore, input: SignupsInput, opts: { now?: Date } = {}): Promise<MetricResult<SignupsOverview>> {
  const now = opts.now ?? new Date();
  const today = getIsraelDateKey(now);
  const period = { from: dayKeyDaysAgo(now, input.days - 1), to: today };
  const failed = (): MetricResult<SignupsOverview> => ({ value: null, meta: metaOf('signups_overview', period), error: 'users could not be read' });
  try {
    const users = await readRealUsers(db);
    const caveats = [...SIGNUPS_CAVEATS];
    let groupBy = input.groupBy;
    if (groupBy === 'day' && input.days > 60) {
      groupBy = 'week';
      caveats.push('daily series is limited to 60 days — grouped by week instead');
    }
    const value = computeSignups(users, { ...input, groupBy }, now);
    const ids = value.byCity.map((c) => c.authorityId);
    if (input.authorityId) ids.push(input.authorityId);
    const names = await authorityNames(db, ids);
    value.byCity = value.byCity.map((c) => ({ ...c, name: names.get(c.authorityId) ?? c.authorityId }));
    if (input.authorityId && !users.some((u) => u.authorityId === input.authorityId)) caveats.push('no real user is linked to this authorityId (check the id)');
    return { value, meta: metaOf('signups_overview', period, { n: value.total, caveats }) };
  } catch (err) {
    console.error('[admin-analytics/signups] failed', err);
    return failed();
  }
}

// ── workouts ──────────────────────────────────────────────────────────────

export type WorkoutKind = 'strength' | 'running' | 'walking' | 'hybrid' | 'cycling' | 'other';

export function workoutKindOf(data: Record<string, unknown>): WorkoutKind {
  const t = typeof data.workoutType === 'string' ? data.workoutType : data.activityType;
  if (t === 'strength' || t === 'workout') return 'strength';
  if (t === 'running' || t === 'run') return 'running';
  if (t === 'walking' || t === 'walk') return 'walking';
  if (t === 'hybrid') return 'hybrid';
  if (t === 'cycling') return 'cycling';
  return 'other';
}

export interface WorkoutRow {
  userId: string;
  day: string;
  kind: WorkoutKind;
  real: boolean;
}

export interface WorkoutsPeriod {
  workouts: number;
  activeUsers: number;
  perActiveUser: number | null;
}

export interface WorkoutsOverview {
  days: number;
  authorityId: string | null;
  current: WorkoutsPeriod;
  previous: WorkoutsPeriod;
  changePct: number | null;
  byType: Array<{ type: WorkoutKind; count: number }>;
  series: Array<{ from: string; workouts: number }>;
  /** saved workout docs that are NOT real workouts (recovery, strength with 0 sets) in the current period */
  notCounted: number;
  /** needs started-vs-finished data that the app does not store */
  completionRate: null;
}

export function computeWorkouts(rows: WorkoutRow[], input: { days: number }, now: Date): Omit<WorkoutsOverview, 'authorityId'> {
  const keys = lastDayKeys(now, input.days);
  const prevKeys = new Set(Array.from({ length: input.days }, (_, i) => dayKeyDaysAgo(now, input.days + i)));
  const cur = new Set(keys);
  const period = (pred: (r: WorkoutRow) => boolean): WorkoutsPeriod => {
    const real = rows.filter((r) => r.real && pred(r));
    const users = new Set(real.map((r) => r.userId));
    return { workouts: real.length, activeUsers: users.size, perActiveUser: users.size ? Math.round((real.length / users.size) * 10) / 10 : null };
  };
  const current = period((r) => cur.has(r.day));
  const previous = period((r) => prevKeys.has(r.day));
  const labels = bucketLabels(keys, input.days <= 31 ? 'day' : 'week');
  const series = new Map<string, number>();
  for (const l of Array.from(new Set(labels.values()))) series.set(l, 0);
  const types = new Map<WorkoutKind, number>();
  let notCounted = 0;
  for (const r of rows) {
    if (!cur.has(r.day)) continue;
    if (!r.real) {
      notCounted += 1;
      continue;
    }
    const l = labels.get(r.day)!;
    series.set(l, (series.get(l) ?? 0) + 1);
    types.set(r.kind, (types.get(r.kind) ?? 0) + 1);
  }
  return {
    days: input.days,
    current,
    previous,
    changePct: pctChange(current.workouts, previous.workouts),
    byType: Array.from(types.entries()).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
    series: Array.from(series.entries()).map(([from, workouts]) => ({ from, workouts })),
    notCounted,
    completionRate: null,
  };
}

export const WORKOUTS_CAVEATS = [
  'a workout = a saved workouts doc that passes the real-workout rule (recovery and zero-set strength are not counted); real accounts only',
  'completion rate is not available: the app stores finished workouts only, not started ones',
  'a user is attached to a city by users.core.authorityId; users without one are not in any city filter',
];

export async function getWorkoutsOverview(
  db: Firestore,
  input: { days: number; authorityId: string | null },
  opts: { now?: Date } = {},
): Promise<MetricResult<WorkoutsOverview>> {
  const now = opts.now ?? new Date();
  const today = getIsraelDateKey(now);
  const period = { from: dayKeyDaysAgo(now, input.days - 1), to: today };
  try {
    const users = await readRealUsers(db);
    const byUser = new Map(users.map((u) => [u.uid, u.authorityId]));
    // one range read covering the current + previous period (+1 day for the Israel-day edge)
    const since = new Date(now.getTime() - (2 * input.days + 1) * DAY_MS);
    const snap = await db
      .collection('workouts')
      .where('date', '>=', since)
      .select('userId', 'date', 'workoutType', 'activityType', 'setsCompleted')
      .limit(WORKOUT_READ_LIMIT)
      .get();
    const rows: WorkoutRow[] = [];
    for (const d of snap.docs) {
      const data = (d.data() ?? {}) as Record<string, unknown>;
      const uid = data.userId;
      if (typeof uid !== 'string' || !byUser.has(uid)) continue; // test/demo/unknown accounts
      if (input.authorityId && byUser.get(uid) !== input.authorityId) continue;
      const date = toDateSafe(data.date);
      if (!date) continue;
      rows.push({ userId: uid, day: getIsraelDateKey(date), kind: workoutKindOf(data), real: isRealWorkoutCompletion(data) });
    }
    const caveats = [...WORKOUTS_CAVEATS];
    if (snap.docs.length >= WORKOUT_READ_LIMIT) caveats.push(`the read hit its ${WORKOUT_READ_LIMIT}-doc cap — numbers are partial`);
    const value: WorkoutsOverview = { ...computeWorkouts(rows, input, now), authorityId: input.authorityId };
    return { value, meta: metaOf('workouts_overview', period, { n: value.current.workouts, caveats }) };
  } catch (err) {
    console.error('[admin-analytics/workouts] failed', err);
    return { value: null, meta: metaOf('workouts_overview', period), error: 'workouts could not be read' };
  }
}

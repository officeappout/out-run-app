/**
 * Ranking Service — real Firestore leaderboards for The League (הליגה).
 *
 * Aggregates `activityCredit` from the `feed_posts` collection,
 * grouped by author, filtered by scope, category, time window, and age group.
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ──────────────────────────────────────────────────────────────

export type LeaderboardScope = 'city' | 'school' | 'park' | 'neighborhood' | 'global' | 'league' | 'tenant';
export type LeaderboardCategory = 'overall' | 'cardio' | 'strength';
export type LeaderboardTimeWindow = 'daily' | 'weekly' | 'monthly';
export type LeaderboardGenderFilter = 'all' | 'male' | 'female';

export interface LeaderboardEntry {
  rank: number;
  uid: string;
  name: string;
  totalCredit: number;
  workoutCount: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  myEntry: LeaderboardEntry | null;
  totalParticipants: number;
  window: LeaderboardTimeWindow;
  generatedAt: Date;
}

// ── Scope → Firestore field mapping ──────────────────────────────────────

/**
 * Maps a leaderboard scope to the Firestore field that narrows a query to
 * it. Single source of truth for all scoped queries below — every function
 * that filters by scope goes through this instead of its own inline
 * ternary, so adding a new scope (or fixing one) only happens once.
 *
 * 'global' and 'league' span all authorities (no narrowing field); 'tenant'
 * is handled entirely by getTenantLeaderboard (leaderboard_shards, not
 * feed_posts/streaks/dailyActivity) and never reaches a query built here.
 */
export function scopeToField(scope: LeaderboardScope): string | null {
  switch (scope) {
    case 'city': return 'authorityId';
    case 'school': return 'schoolId';
    case 'park': return 'parkId';
    case 'neighborhood': return 'neighborhoodId';
    case 'global':
    case 'league':
    case 'tenant':
      return null;
  }
}

// ── Time helpers ───────────────────────────────────────────────────────

function getDayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // distance to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

export function getWindowStart(window: LeaderboardTimeWindow): Date {
  if (window === 'daily') return getDayStart();
  return window === 'weekly' ? getWeekStart() : getMonthStart();
}

// ── Core query ─────────────────────────────────────────────────────────

export async function getLeaderboard(params: {
  scope: LeaderboardScope;
  scopeId: string | null;
  category: LeaderboardCategory;
  timeWindow: LeaderboardTimeWindow;
  ageGroup: 'minor' | 'adult';
  genderFilter?: LeaderboardGenderFilter;
  programId?: string | null;
  currentUid: string;
  currentName?: string;
  maxEntries?: number;
}): Promise<LeaderboardResult> {
  const { scope, scopeId, category, timeWindow, ageGroup, genderFilter = 'all', programId, currentUid, currentName, maxEntries = 50 } = params;
  const windowStart = Timestamp.fromDate(getWindowStart(timeWindow));

  const constraints = [
    where('ageGroup', '==', ageGroup),
    where('createdAt', '>=', windowStart),
  ];

  // Global and league scopes span all authorities; other scopes narrow by
  // their respective FK column (see scopeToField).
  const scopeField = scopeToField(scope);
  if (scopeField && scopeId) {
    constraints.push(where(scopeField, '==', scopeId));
  }

  if (category !== 'overall') {
    constraints.push(where('activityCategory', '==', category));
  }

  if (genderFilter !== 'all') {
    constraints.push(where('gender', '==', genderFilter));
  }

  if (programId) {
    constraints.push(where('programId', '==', programId));
  }

  const q = query(collection(db, 'feed_posts'), ...constraints);
  const snap = await getDocs(q);

  // Aggregate credit + workout count per user
  const creditMap = new Map<string, { name: string; total: number; count: number }>();

  snap.forEach((d) => {
    const data = d.data();
    const uid = data.authorUid as string;
    const credit = (data.activityCredit as number) || 0;
    const name = (data.authorName as string) || '???';

    const existing = creditMap.get(uid);
    if (existing) {
      existing.total += credit;
      existing.count += 1;
    } else {
      creditMap.set(uid, { name, total: credit, count: 1 });
    }
  });

  // Sort descending by total credit
  const allSorted = Array.from(creditMap.entries())
    .sort(([, a], [, b]) => b.total - a.total);

  const totalParticipants = allSorted.length;

  const sorted = allSorted.slice(0, maxEntries);

  const entries: LeaderboardEntry[] = sorted.map(([uid, { name, total, count }], idx) => ({
    rank: idx + 1,
    uid,
    name,
    totalCredit: total,
    workoutCount: count,
    isCurrentUser: uid === currentUid,
  }));

  let myEntry = entries.find((e) => e.isCurrentUser) ?? null;

  // If the current user isn't in the top N, add them with their real rank
  if (!myEntry && currentUid) {
    const myIdx = allSorted.findIndex(([uid]) => uid === currentUid);
    if (myIdx >= 0) {
      const [, { name, total, count }] = allSorted[myIdx];
      myEntry = { rank: myIdx + 1, uid: currentUid, name, totalCredit: total, workoutCount: count, isCurrentUser: true };
    } else {
      myEntry = {
        rank: totalParticipants + 1,
        uid: currentUid,
        name: currentName ?? 'את/ה',
        totalCredit: 0,
        workoutCount: 0,
        isCurrentUser: true,
      };
    }
  }

  return { entries, myEntry, totalParticipants, window: timeWindow, generatedAt: new Date() };
}

// ── Segment (3k/5k/10k) leaderboard ───────────────────────────────────────

/**
 * Ranks runners by their personal-best average pace (sec/km) for a specific
 * distance segment. Lower pace = faster = rank 1.
 *
 * All-time leaderboard (no time window) — personal bests don't decay.
 * Scope-filtered the same way as the credit leaderboard.
 */
export type RunSegmentFilter = '3k' | '5k' | '10k';

/** Format seconds-per-km as "MM:SS" pace string (e.g. 300 → "5:00"). */
export function formatPaceSecPerKm(secPerKm: number): string {
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export async function getSegmentLeaderboard(params: {
  scope: LeaderboardScope;
  scopeId: string | null;
  runSegment: RunSegmentFilter;
  ageGroup?: 'minor' | 'adult';
  genderFilter?: LeaderboardGenderFilter;
  currentUid: string;
  currentName?: string;
  maxEntries?: number;
}): Promise<LeaderboardResult> {
  const {
    scope, scopeId, runSegment,
    ageGroup = 'adult', genderFilter = 'all',
    currentUid, currentName, maxEntries = 50,
  } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [
    where('ageGroup', '==', ageGroup),
    where('runSegment', '==', runSegment),
  ];

  const segmentScopeField = scopeToField(scope);
  if (segmentScopeField && scopeId) {
    constraints.push(where(segmentScopeField, '==', scopeId));
  }

  if (genderFilter !== 'all') {
    constraints.push(where('gender', '==', genderFilter));
  }

  // Fetch recent runs first; 500 is plenty to find per-user PBs
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(500));

  const q = query(collection(db, 'feed_posts'), ...constraints);
  const snap = await getDocs(q);

  // Find each user's best (minimum) paceSecPerKm
  const bestMap = new Map<string, { name: string; bestPace: number }>();

  snap.forEach((d) => {
    const data = d.data();
    const uid = data.authorUid as string | undefined;
    const pace = data.paceSecPerKm as number | undefined;
    const name = (data.authorName as string) || (uid === currentUid ? currentName : undefined) || '???';

    if (!uid || !pace || pace <= 0) return;

    const existing = bestMap.get(uid);
    if (!existing || pace < existing.bestPace) {
      bestMap.set(uid, { name, bestPace: pace });
    }
  });

  // Sort ascending — lower pace = faster = rank 1
  const allSorted = Array.from(bestMap.entries())
    .sort(([, a], [, b]) => a.bestPace - b.bestPace);

  const totalParticipants = allSorted.length;
  const topRows = allSorted.slice(0, maxEntries);

  const entries: LeaderboardEntry[] = topRows.map(([uid, { name, bestPace }], idx) => ({
    rank: idx + 1,
    uid,
    name,
    totalCredit: bestPace,
    workoutCount: bestPace,
    isCurrentUser: uid === currentUid,
  }));

  let myEntry = entries.find((e) => e.isCurrentUser) ?? null;

  if (!myEntry && currentUid) {
    const myIdx = allSorted.findIndex(([uid]) => uid === currentUid);
    if (myIdx >= 0) {
      const [, { name, bestPace }] = allSorted[myIdx];
      myEntry = { rank: myIdx + 1, uid: currentUid, name, totalCredit: bestPace, workoutCount: bestPace, isCurrentUser: true };
    } else {
      myEntry = { rank: totalParticipants + 1, uid: currentUid, name: currentName ?? 'את/ה', totalCredit: 0, workoutCount: 0, isCurrentUser: true };
    }
  }

  return { entries, myEntry, totalParticipants, window: 'weekly', generatedAt: new Date() };
}

// ── Streak leaderboard ─────────────────────────────────────────────────────

/**
 * Leaderboard built from the `streaks` collection rather than `feed_posts`.
 * Uses `currentStreak` (consecutive active days) as the ranking metric.
 * Streak docs acquire `authorityId` / `displayName` the first time a user
 * syncs after the field was added to useActivityStore.syncToServer.
 *
 * Scoped via scopeToField like every other query here — but only 'city'
 * (authorityId) is actually stamped on `streaks` docs today. 'park' and
 * 'neighborhood' resolve to the correct field name but will return empty
 * results until parkId/neighborhoodId are also stamped on this collection
 * (neighborhoodId stamping is tracked separately; parkId stamping on
 * streaks/dailyActivity is not, and is a prerequisite for park scope here).
 *
 * Fallback: if `displayName` is missing or '???' on a streak doc the service
 * performs a batched read of `users/{uid}.core.name` so the leaderboard
 * never shows '???' to the end user.
 */
export async function getStreakLeaderboard(params: {
  scope: LeaderboardScope;
  scopeId: string | null;
  currentUid: string;
  currentName?: string;
  maxEntries?: number;
}): Promise<LeaderboardResult> {
  const { scope, scopeId, currentUid, currentName, maxEntries = 50 } = params;

  // Build constraints
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [];

  const streakScopeField = scopeToField(scope);
  if (streakScopeField && scopeId) {
    constraints.push(where(streakScopeField, '==', scopeId));
  }

  constraints.push(orderBy('currentStreak', 'desc'));
  // Fetch a few extra so we can locate the current user even outside top-N
  constraints.push(limit(maxEntries + 30));

  const q = query(collection(db, 'streaks'), ...constraints);
  const snap = await getDocs(q);

  interface StreakRow { uid: string; name: string; streak: number }
  const rows: StreakRow[] = [];

  snap.forEach((d) => {
    const data = d.data();
    const uid = d.id; // doc ID === uid
    const streak = (data.currentStreak as number) || 0;
    if (streak <= 0) return;
    const name =
      (data.displayName as string | undefined) ||
      (uid === currentUid ? currentName : undefined) ||
      '???';
    rows.push({ uid, name, streak });
  });

  // ── Fallback: resolve '???' names from users collection ────────────────
  // Streak docs written before the displayName stamp was added (or by seed
  // data that didn't include it) arrive as '???'.  We batch-fetch the user
  // doc for each unknown row so the leaderboard always shows a real name.
  const unknownUids = rows
    .filter((r) => r.name === '???' && r.uid !== currentUid)
    .map((r) => r.uid);

  if (unknownUids.length > 0) {
    const nameCache = new Map<string, string>();
    await Promise.all(
      unknownUids.map(async (uid) => {
        try {
          const d = await getDoc(doc(db, 'users', uid));
          if (d.exists()) {
            const resolved = d.data()?.core?.name as string | undefined;
            if (resolved) nameCache.set(uid, resolved);
          }
        } catch {
          // leave as '???' — non-blocking
        }
      }),
    );
    for (const row of rows) {
      if (row.name === '???' && nameCache.has(row.uid)) {
        row.name = nameCache.get(row.uid)!;
      }
    }
  }
  // ───────────────────────────────────────────────────────────────────────

  const totalParticipants = rows.length;
  const topRows = rows.slice(0, maxEntries);

  const entries: LeaderboardEntry[] = topRows.map(({ uid, name, streak }, idx) => ({
    rank: idx + 1,
    uid,
    name,
    totalCredit: streak,
    workoutCount: streak,
    isCurrentUser: uid === currentUid,
  }));

  let myEntry = entries.find((e) => e.isCurrentUser) ?? null;

  if (!myEntry && currentUid) {
    const myIdx = rows.findIndex((r) => r.uid === currentUid);
    if (myIdx >= 0) {
      const { name, streak } = rows[myIdx];
      myEntry = { rank: myIdx + 1, uid: currentUid, name, totalCredit: streak, workoutCount: streak, isCurrentUser: true };
    } else {
      myEntry = { rank: totalParticipants + 1, uid: currentUid, name: currentName ?? 'את/ה', totalCredit: 0, workoutCount: 0, isCurrentUser: true };
    }
  }

  return { entries, myEntry, totalParticipants, window: 'weekly', generatedAt: new Date() };
}

// ── Steps leaderboard ──────────────────────────────────────────────────────

/**
 * Leaderboard built from the `dailyActivity` collection.
 * Aggregates daily `steps` for the last 7 days, then computes a per-user
 * weekly average (total ÷ 7), using that as `totalCredit`.
 *
 * `dailyActivity` docs acquire `authorityId` / `displayName` the first time
 * a user completes a workout sync after the scope-stamp was added to
 * useActivityStore.syncToServer. Until then they appear in global queries
 * but are invisible in city-scoped ones.
 *
 * Scoped via scopeToField like every other query here — same caveat as
 * getStreakLeaderboard: only 'city' (authorityId) is actually stamped on
 * `dailyActivity` docs today, so 'park' and 'neighborhood' resolve to the
 * correct field name but return empty until that field is also stamped
 * on this collection.
 */
export async function getStepsLeaderboard(params: {
  scope: LeaderboardScope;
  scopeId: string | null;
  currentUid: string;
  currentName?: string;
  maxEntries?: number;
}): Promise<LeaderboardResult> {
  const { scope, scopeId, currentUid, currentName, maxEntries = 50 } = params;

  // Build date range strings YYYY-MM-DD for last 7 days
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [
    where('date', '>=', weekAgoStr),
    where('date', '<=', todayStr),
  ];

  const stepsScopeField = scopeToField(scope);
  if (stepsScopeField && scopeId) {
    constraints.push(where(stepsScopeField, '==', scopeId));
  }

  // Limit to a reasonable scan size — 50 entries × 7 days + buffer
  constraints.push(limit(5000));

  const q = query(collection(db, 'dailyActivity'), ...constraints);
  const snap = await getDocs(q);

  // Aggregate steps per userId
  const stepMap = new Map<string, { name: string; totalSteps: number; dayCount: number }>();

  snap.forEach((d) => {
    const data = d.data();
    const uid = data.userId as string | undefined;
    const steps = (data.steps as number) || 0;
    const name =
      (data.displayName as string | undefined) ||
      (uid === currentUid ? currentName : undefined) ||
      '???';

    if (!uid || steps <= 0) return;

    const existing = stepMap.get(uid);
    if (existing) {
      existing.totalSteps += steps;
      existing.dayCount += 1;
    } else {
      stepMap.set(uid, { name, totalSteps: steps, dayCount: 1 });
    }
  });

  // Compute weekly average and sort descending
  const allSorted = Array.from(stepMap.entries())
    .map(([uid, { name, totalSteps }]) => ({
      uid,
      name,
      weeklyAvg: Math.round(totalSteps / 7),
    }))
    .sort((a, b) => b.weeklyAvg - a.weeklyAvg);

  const totalParticipants = allSorted.length;
  const topRows = allSorted.slice(0, maxEntries);

  const entries: LeaderboardEntry[] = topRows.map(({ uid, name, weeklyAvg }, idx) => ({
    rank: idx + 1,
    uid,
    name,
    totalCredit: weeklyAvg,
    workoutCount: weeklyAvg,
    isCurrentUser: uid === currentUid,
  }));

  let myEntry = entries.find((e) => e.isCurrentUser) ?? null;

  if (!myEntry && currentUid) {
    const myIdx = allSorted.findIndex((r) => r.uid === currentUid);
    if (myIdx >= 0) {
      const { name, weeklyAvg } = allSorted[myIdx];
      myEntry = { rank: myIdx + 1, uid: currentUid, name, totalCredit: weeklyAvg, workoutCount: weeklyAvg, isCurrentUser: true };
    } else {
      myEntry = { rank: totalParticipants + 1, uid: currentUid, name: currentName ?? 'את/ה', totalCredit: 0, workoutCount: 0, isCurrentUser: true };
    }
  }

  return { entries, myEntry, totalParticipants, window: 'weekly', generatedAt: new Date() };
}

// ── League (group) leaderboard ─────────────────────────────────────────────

/**
 * Individual ranking within a single community group (family, friends,
 * neighborhood, etc.). Queries `feed_posts` via `array-contains` on the
 * `groupIds` field stamped at post time.
 */
export async function getLeagueLeaderboard(params: {
  groupId: string;
  category: LeaderboardCategory;
  timeWindow: LeaderboardTimeWindow;
  genderFilter?: LeaderboardGenderFilter;
  currentUid: string;
  currentName?: string;
  maxEntries?: number;
}): Promise<LeaderboardResult> {
  const {
    groupId, category, timeWindow,
    genderFilter = 'all', currentUid, currentName, maxEntries = 50,
  } = params;
  const windowStart = Timestamp.fromDate(getWindowStart(timeWindow));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [
    where('groupIds', 'array-contains', groupId),
    where('createdAt', '>=', windowStart),
  ];

  if (category !== 'overall') {
    constraints.push(where('activityCategory', '==', category));
  }
  if (genderFilter !== 'all') {
    constraints.push(where('gender', '==', genderFilter));
  }

  const q = query(collection(db, 'feed_posts'), ...constraints);
  const snap = await getDocs(q);

  const creditMap = new Map<string, { name: string; total: number; count: number }>();

  snap.forEach((d) => {
    const data = d.data();
    const uid = data.authorUid as string;
    const credit = (data.activityCredit as number) || 0;
    const name = (data.authorName as string) || '???';
    const existing = creditMap.get(uid);
    if (existing) {
      existing.total += credit;
      existing.count += 1;
    } else {
      creditMap.set(uid, { name, total: credit, count: 1 });
    }
  });

  const allSorted = Array.from(creditMap.entries())
    .sort(([, a], [, b]) => b.total - a.total);

  const totalParticipants = allSorted.length;
  const sorted = allSorted.slice(0, maxEntries);

  const entries: LeaderboardEntry[] = sorted.map(([uid, { name, total, count }], idx) => ({
    rank: idx + 1,
    uid,
    name,
    totalCredit: total,
    workoutCount: count,
    isCurrentUser: uid === currentUid,
  }));

  let myEntry = entries.find((e) => e.isCurrentUser) ?? null;

  if (!myEntry && currentUid) {
    const myIdx = allSorted.findIndex(([uid]) => uid === currentUid);
    if (myIdx >= 0) {
      const [, { name, total, count }] = allSorted[myIdx];
      myEntry = { rank: myIdx + 1, uid: currentUid, name, totalCredit: total, workoutCount: count, isCurrentUser: true };
    } else {
      myEntry = {
        rank: totalParticipants + 1,
        uid: currentUid,
        name: currentName ?? 'את/ה',
        totalCredit: 0,
        workoutCount: 0,
        isCurrentUser: true,
      };
    }
  }

  return { entries, myEntry, totalParticipants, window: timeWindow, generatedAt: new Date() };
}

// ── Tenant / community leaderboard — ACTIVE DAYS (feed-independent) ─────────
// The league for closed communities (Wix pilot). Reads the per-day docs
// written by the onWorkoutCreate CF (leaderboard_shards, keyed by the member's
// core.tenantId + optional unitId) and ranks members by ACTIVE DAYS this month
// — days where they crossed ⅔ of the daily target. Does NOT touch feed_posts.

function getMonthPeriod(): string {
  // Israel-local month (YYYY-MM) so the read matches the CF's Jerusalem-day writes.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }).slice(0, 7);
}

export async function getTenantLeaderboard(params: {
  tenantId: string;
  /** Omit / null → tenant-wide (aggregate across all units). */
  unitId?: string | null;
  currentUid: string;
  currentName?: string;
  maxEntries?: number;
}): Promise<LeaderboardResult> {
  const { tenantId, unitId, currentUid, currentName, maxEntries = 50 } = params;
  const period = getMonthPeriod();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [
    where('tenantId', '==', tenantId),
    where('period', '==', period),
  ];
  if (unitId) constraints.push(where('unitId', '==', unitId));

  const snap = await getDocs(query(collection(db, 'leaderboard_shards'), ...constraints));

  // Sum activeDay flags + workouts per uid across the per-day docs.
  const agg = new Map<string, { activeDays: number; workouts: number }>();
  snap.forEach((d) => {
    const data = d.data();
    const uid = data.uid as string;
    if (!uid) return;
    const cur = agg.get(uid) ?? { activeDays: 0, workouts: 0 };
    cur.activeDays += typeof data.activeDay === 'number' ? data.activeDay : 0;
    cur.workouts += typeof data.workouts === 'number' ? data.workouts : 0;
    agg.set(uid, cur);
  });

  const allSorted = Array.from(agg.entries()).sort(([, a], [, b]) => b.activeDays - a.activeDays);
  const totalParticipants = allSorted.length;
  const sliced = allSorted.slice(0, maxEntries);

  // Shards carry no display name — resolve best-effort from users/{uid}.core.name
  // for the shown rows (+ current user).
  const uidsToName = new Set<string>(sliced.map(([uid]) => uid));
  uidsToName.add(currentUid);
  const nameMap = new Map<string, string>();
  await Promise.all(
    Array.from(uidsToName).map(async (uid) => {
      try {
        const u = await getDoc(doc(db, 'users', uid));
        nameMap.set(uid, (u.data()?.core?.name as string) || 'משתמש');
      } catch {
        nameMap.set(uid, 'משתמש');
      }
    }),
  );

  const entries: LeaderboardEntry[] = sliced.map(([uid, { activeDays, workouts }], idx) => ({
    rank: idx + 1,
    uid,
    name: uid === currentUid ? currentName ?? nameMap.get(uid) ?? 'את/ה' : nameMap.get(uid) ?? 'משתמש',
    totalCredit: activeDays, // score = active days this month
    workoutCount: workouts,
    isCurrentUser: uid === currentUid,
  }));

  let myEntry = entries.find((e) => e.isCurrentUser) ?? null;
  if (!myEntry && currentUid) {
    const myIdx = allSorted.findIndex(([uid]) => uid === currentUid);
    if (myIdx >= 0) {
      const [, { activeDays, workouts }] = allSorted[myIdx];
      myEntry = { rank: myIdx + 1, uid: currentUid, name: currentName ?? nameMap.get(currentUid) ?? 'את/ה', totalCredit: activeDays, workoutCount: workouts, isCurrentUser: true };
    } else {
      myEntry = { rank: totalParticipants + 1, uid: currentUid, name: currentName ?? 'את/ה', totalCredit: 0, workoutCount: 0, isCurrentUser: true };
    }
  }

  return { entries, myEntry, totalParticipants, window: 'monthly', generatedAt: new Date() };
}

// ── Group-vs-group competition leaderboard ─────────────────────────────────

/**
 * For a given institutional scope (city or school), aggregates all workout
 * credit from `feed_posts` in the time window, groups it by the `groupIds`
 * array on each post (skipping posts with no group), then ranks groups by
 * average score per active member.
 *
 * Returns only groups that had at least 1 active member in the window.
 * Group display names are batch-fetched from `community_groups` after
 * aggregation to keep the query count low.
 */

export interface GroupCompetitionEntry {
  rank: number;
  groupId: string;
  groupName: string;
  totalScore: number;
  /** Rounded average credit per active member in the window. */
  avgScore: number;
  activeMemberCount: number;
}

export interface GroupCompetitionResult {
  entries: GroupCompetitionEntry[];
  generatedAt: Date;
}

export async function getGroupCompetitionLeaderboard(params: {
  scope: 'city' | 'school' | 'global';
  scopeId: string | null;
  timeWindow: LeaderboardTimeWindow;
  maxEntries?: number;
}): Promise<GroupCompetitionResult> {
  const { scope, scopeId, timeWindow, maxEntries = 20 } = params;
  const windowStart = Timestamp.fromDate(getWindowStart(timeWindow));

  // For 'global', omit the scope constraint to scan all groups country-wide.
  // For 'city'/'school', filter to the specific authority or school.
  const q = scope === 'global' || !scopeId
    ? query(
        collection(db, 'feed_posts'),
        where('createdAt', '>=', windowStart),
      )
    : query(
        collection(db, 'feed_posts'),
        where(scope === 'city' ? 'authorityId' : 'schoolId', '==', scopeId),
        where('createdAt', '>=', windowStart),
      );
  const snap = await getDocs(q);

  // groupId → { totalScore, active member UIDs, placeholder name }
  const groupMap = new Map<string, { totalScore: number; members: Set<string> }>();

  snap.forEach((d) => {
    const data = d.data();
    const gids = data.groupIds as string[] | undefined;
    if (!Array.isArray(gids) || gids.length === 0) return;

    const credit = (data.activityCredit as number) || 0;
    const uid = data.authorUid as string;

    for (const gid of gids) {
      const existing = groupMap.get(gid);
      if (existing) {
        existing.totalScore += credit;
        existing.members.add(uid);
      } else {
        groupMap.set(gid, { totalScore: credit, members: new Set([uid]) });
      }
    }
  });

  if (groupMap.size === 0) {
    return { entries: [], generatedAt: new Date() };
  }

  // Batch-fetch group name + type from community_groups. Ephemeral groups
  // (single-session run/walk invites, e.g. "ריצה מתוזמנת" — created by
  // api/invite/run-session/route.ts with type: 'ephemeral', whose own
  // comment says they're meant to stay out of any group discovery/
  // management list) are excluded here — this leaderboard never filtered
  // on `type` before, so a one-off invite session could leak in ranked
  // alongside real persistent groups.
  const groupIds = Array.from(groupMap.keys());
  const groupMeta = new Map<string, { name: string; type?: string }>();

  await Promise.all(
    groupIds.map(async (id) => {
      try {
        const d = await getDoc(doc(db, 'community_groups', id));
        const data = d.data();
        groupMeta.set(id, {
          name: d.exists() ? (data?.name as string) ?? id : id,
          type: data?.type as string | undefined,
        });
      } catch {
        groupMeta.set(id, { name: id, type: undefined });
      }
    }),
  );

  const eligibleGroupIds = groupIds.filter((gid) => groupMeta.get(gid)?.type !== 'ephemeral');

  // Compute average and sort descending
  const allSorted = eligibleGroupIds
    .map((gid) => {
      const { totalScore, members } = groupMap.get(gid)!;
      return {
        groupId: gid,
        groupName: groupMeta.get(gid)?.name ?? gid,
        totalScore,
        avgScore: Math.round(totalScore / Math.max(members.size, 1)),
        activeMemberCount: members.size,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  const entries: GroupCompetitionEntry[] = allSorted
    .slice(0, maxEntries)
    .map((row, idx) => ({ rank: idx + 1, ...row }));

  return { entries, generatedAt: new Date() };
}

// ── Scope-vs-scope competition leaderboard ─────────────────────────────────

/**
 * Ranks scopes AGAINST EACH OTHER as competing entities — city-vs-city or
 * neighborhood-vs-neighborhood — unlike every other function in this file,
 * which ranks individuals/groups WITHIN one already-selected scope.
 *
 * Adapted from getGroupCompetitionLeaderboard's aggregation engine: same
 * Map<key, {totalScore, members}> shape, grouped by the scope's own FK
 * field (via scopeToField — authorityId or neighborhoodId) instead of
 * `groupIds`, and named via the `authorities` collection instead of
 * `community_groups`. Ranked by TOTAL score (sum across all active
 * members), not average — a big city's/neighborhood's collective total is
 * the intended competitive metric here, not per-member efficiency.
 *
 * 'city' works with today's data — authorityId has always been stamped on
 * feed_posts. 'neighborhood' will return an empty/sparse result until
 * neighborhoodId stamping has had time to accumulate real posts.
 *
 * CORRECTNESS GATE — neighborhoods compete ONLY within their own city:
 * `granularity: 'neighborhood'` REQUIRES `cityAuthorityId`. Without it, this
 * function fails closed (returns an empty result) rather than silently
 * scanning every city's neighborhoods nationwide and ranking them against
 * each other — a Tel Aviv neighborhood must never appear in the same
 * leaderboard as a Be'er Sheva one. `cityAuthorityId` is ignored for
 * `granularity: 'city'` (cities always compete nationwide).
 */

export interface ScopeCompetitionEntry {
  rank: number;
  scopeId: string;
  scopeName: string;
  totalScore: number;
  activeMemberCount: number;
}

export interface ScopeCompetitionResult {
  entries: ScopeCompetitionEntry[];
  generatedAt: Date;
}

export async function getScopeCompetitionLeaderboard(params: {
  granularity: 'city' | 'neighborhood';
  timeWindow: LeaderboardTimeWindow;
  /** Required when granularity === 'neighborhood' — see correctness gate above. Ignored for 'city'. */
  cityAuthorityId?: string | null;
  maxEntries?: number;
}): Promise<ScopeCompetitionResult> {
  const { granularity, timeWindow, cityAuthorityId, maxEntries = 20 } = params;

  if (granularity === 'neighborhood' && !cityAuthorityId) {
    return { entries: [], generatedAt: new Date() };
  }

  const groupField = scopeToField(granularity) as string; // 'authorityId' | 'neighborhoodId' — always non-null for these two
  const windowStart = Timestamp.fromDate(getWindowStart(timeWindow));

  const constraints = [where('createdAt', '>=', windowStart)];
  if (granularity === 'neighborhood' && cityAuthorityId) {
    constraints.push(where('authorityId', '==', cityAuthorityId));
  }

  const q = query(collection(db, 'feed_posts'), ...constraints);
  const snap = await getDocs(q);

  // scopeId → { totalScore, active member UIDs }
  const scopeMap = new Map<string, { totalScore: number; members: Set<string> }>();

  snap.forEach((d) => {
    const data = d.data();
    const scopeId = data[groupField] as string | undefined;
    if (!scopeId) return;

    const credit = (data.activityCredit as number) || 0;
    const uid = data.authorUid as string;

    const existing = scopeMap.get(scopeId);
    if (existing) {
      existing.totalScore += credit;
      existing.members.add(uid);
    } else {
      scopeMap.set(scopeId, { totalScore: credit, members: new Set([uid]) });
    }
  });

  if (scopeMap.size === 0) {
    return { entries: [], generatedAt: new Date() };
  }

  // Batch-fetch scope names from `authorities`
  const scopeIds = Array.from(scopeMap.keys());
  const nameLookup = new Map<string, string>();

  await Promise.all(
    scopeIds.map(async (id) => {
      try {
        const d = await getDoc(doc(db, 'authorities', id));
        nameLookup.set(id, d.exists() ? (d.data()?.name as string) ?? id : id);
      } catch {
        nameLookup.set(id, id);
      }
    }),
  );

  // Sort descending by TOTAL score
  const allSorted = scopeIds
    .map((id) => {
      const { totalScore, members } = scopeMap.get(id)!;
      return {
        scopeId: id,
        scopeName: nameLookup.get(id) ?? id,
        totalScore,
        activeMemberCount: members.size,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  const entries: ScopeCompetitionEntry[] = allSorted
    .slice(0, maxEntries)
    .map((row, idx) => ({ rank: idx + 1, ...row }));

  return { entries, generatedAt: new Date() };
}

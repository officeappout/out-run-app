/**
 * Health Economics Service
 * Calculates WHO 150-minute tracker and estimated health savings.
 *
 * Performance: All per-user queries replaced with batched Firestore 'in' queries
 * running in parallel. getSavingsOverTime parallelises all 12 months at once.
 * Old approach: n_users × n_months sequential reads (1,800+ for 150 users / 12 months).
 * New approach: ceil(n/30) parallel reads per month, all months concurrent (~72 reads).
 */
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAuthorityWithChildrenIds } from './analytics.service';

const WORKOUTS_COLLECTION = 'workouts';
export const AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON = 500; // ₪500/active person/month
const WHO_WEEKLY_TARGET_MINUTES = 150;

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDate(timestamp: unknown): Date | undefined {
  if (timestamp == null) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'number') {
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
    return (timestamp as Timestamp).toDate();
  }
  return undefined;
}
// suppress unused warning — kept for potential future callers
void toDate;

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Core: bulk workout minutes ────────────────────────────────────────────────

/**
 * Fetches workout durations for all userIds in a date range using parallel
 * batched Firestore 'in' queries.  Returns a Map<userId, totalMinutes>.
 *
 * Replaces the old per-user sequential getUserWorkoutDuration calls.
 */
async function getBulkWorkoutMinutes(
  userIds: string[],
  start: Date,
  end: Date
): Promise<Map<string, number>> {
  const userMinutes = new Map<string, number>();
  if (userIds.length === 0) return userMinutes;

  const startTs = Timestamp.fromDate(start);
  const endTs   = Timestamp.fromDate(end);

  await Promise.all(chunk(userIds, 30).map(async (batch) => {
    const q = query(
      collection(db, WORKOUTS_COLLECTION),
      where('userId', 'in', batch),
      where('date', '>=', startTs),
      where('date', '<=', endTs)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const { userId, duration } = d.data() as { userId?: string; duration?: number };
      if (userId) {
        userMinutes.set(userId, (userMinutes.get(userId) ?? 0) + (duration ?? 0) / 60);
      }
    });
  }));

  return userMinutes;
}

// ── Authority user IDs ────────────────────────────────────────────────────────

async function getAuthorityUsers(authorityId: string): Promise<string[]> {
  try {
    const authorityIds = await getAuthorityWithChildrenIds(authorityId);
    const userIds: string[] = [];

    await Promise.all(chunk(authorityIds, 30).map(async (batch) => {
      const q = query(
        collection(db, 'users'),
        where('core.authorityId', 'in', batch)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(doc => userIds.push(doc.id));
    }));

    return userIds;
  } catch (error) {
    console.error('Error fetching authority users:', error);
    return [];
  }
}

// ── WHO 150-Minute Tracker ────────────────────────────────────────────────────

export interface WHO150TrackerResult {
  totalUsers: number;
  usersReachingGoal: number;
  percentageReachingGoal: number;
  averageMinutesPerUser: number;
  currentWeek: { start: Date; end: Date };
}

export async function getWHO150Tracker(authorityId: string): Promise<WHO150TrackerResult> {
  const now = new Date();
  const weekRange = getWeekRange(now);

  try {
    const userIds = await getAuthorityUsers(authorityId);
    if (userIds.length === 0) {
      return { totalUsers: 0, usersReachingGoal: 0, percentageReachingGoal: 0, averageMinutesPerUser: 0, currentWeek: weekRange };
    }

    // ONE bulk batch query instead of n sequential per-user queries
    const minutesMap = await getBulkWorkoutMinutes(userIds, weekRange.start, weekRange.end);

    let totalMinutes = 0;
    let usersReachingGoal = 0;

    for (const userId of userIds) {
      const mins = minutesMap.get(userId) ?? 0;
      totalMinutes += mins;
      if (mins >= WHO_WEEKLY_TARGET_MINUTES) usersReachingGoal++;
    }

    const averageMinutesPerUser = totalMinutes / userIds.length;
    const percentageReachingGoal = (usersReachingGoal / userIds.length) * 100;

    return {
      totalUsers: userIds.length,
      usersReachingGoal,
      percentageReachingGoal: Math.round(percentageReachingGoal * 10) / 10,
      averageMinutesPerUser: Math.round(averageMinutesPerUser * 10) / 10,
      currentWeek: weekRange,
    };
  } catch (error) {
    console.error('Error calculating WHO 150 tracker:', error);
    return { totalUsers: 0, usersReachingGoal: 0, percentageReachingGoal: 0, averageMinutesPerUser: 0, currentWeek: weekRange };
  }
}

// ── Real WHO-150 Compliance (category-based, 2-condition) ──────────────────────
//
// Distinct from getWHO150Tracker above: that one sums `workouts.duration`
// (any workout type, session-based) against a single 150-min threshold. The
// actual WHO 2020 guideline has TWO conditions — see WHO_COMPLIANCE_BASELINE /
// WeeklyComplianceStatus in src/features/activity/types/activity.types.ts,
// which define this correctly but (per grep) have zero live compute/write
// sites anywhere in the codebase:
//   1. >= 150 min/week combined strength+cardio minutes (aerobic)
//   2. >= 2 distinct days/week with a strength session (>= STREAK_MINIMUM_MINUTES
//      strength minutes that day)
// Reads dailyActivity.categories directly (per-day, per-category minutes) —
// the same collection/index Phase 1's getCityStepsTotals uses, but filtered
// by userId (existing composite index: userId ASC, date DESC — see
// firestore.indexes.json) instead of authorityId.
//
// STREAK_MINIMUM_MINUTES is duplicated here (rather than imported from
// src/features/activity/types/activity.types.ts) per the domain-agnostic
// rule — src/features/admin/ does not cross-import another feature's types.

const DAILY_ACTIVITY_COLLECTION = 'dailyActivity';
const STREAK_MINIMUM_MINUTES = 10;

export interface WHOComplianceResult {
  totalUsers: number;
  usersCompliant: number; // BOTH conditions met (WHO Gold Medal)
  percentageCompliant: number;
  usersMeetingAerobicOnly: number;
  usersMeetingStrengthOnly: number;
  averageAerobicMinutes: number;
  currentWeek: { start: Date; end: Date };
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

interface WeeklyActivityAgg {
  aerobicMinutes: number;
  strengthDays: number;
}

async function getBulkWeeklyActivity(
  userIds: string[],
  start: Date,
  end: Date
): Promise<Map<string, WeeklyActivityAgg>> {
  const result = new Map<string, WeeklyActivityAgg>();
  if (userIds.length === 0) return result;

  const startStr = toDateStr(start);
  const endStr = toDateStr(end);

  await Promise.all(chunk(userIds, 30).map(async (batch) => {
    const q = query(
      collection(db, DAILY_ACTIVITY_COLLECTION),
      where('userId', 'in', batch),
      where('date', '>=', startStr),
      where('date', '<=', endStr)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const data = d.data();
      const userId: string | undefined = data.userId;
      if (!userId) return;
      const strengthMin: number = data.categories?.strength?.minutes ?? 0;
      const cardioMin: number = data.categories?.cardio?.minutes ?? 0;
      const entry = result.get(userId) ?? { aerobicMinutes: 0, strengthDays: 0 };
      entry.aerobicMinutes += strengthMin + cardioMin;
      if (strengthMin >= STREAK_MINIMUM_MINUTES) entry.strengthDays += 1;
      result.set(userId, entry);
    });
  }));

  return result;
}

function classifyCompliance(userIds: string[], activityMap: Map<string, WeeklyActivityAgg>) {
  let usersCompliant = 0, usersMeetingAerobicOnly = 0, usersMeetingStrengthOnly = 0, totalAerobicMinutes = 0;

  for (const userId of userIds) {
    const entry = activityMap.get(userId) ?? { aerobicMinutes: 0, strengthDays: 0 };
    totalAerobicMinutes += entry.aerobicMinutes;
    const aerobicMet = entry.aerobicMinutes >= WHO_WEEKLY_TARGET_MINUTES;
    const strengthMet = entry.strengthDays >= 2;
    if (aerobicMet && strengthMet) usersCompliant++;
    else if (aerobicMet) usersMeetingAerobicOnly++;
    else if (strengthMet) usersMeetingStrengthOnly++;
  }

  return { usersCompliant, usersMeetingAerobicOnly, usersMeetingStrengthOnly, totalAerobicMinutes };
}

export async function getWHOComplianceBreakdown(authorityId: string): Promise<WHOComplianceResult> {
  const now = new Date();
  const weekRange = getWeekRange(now);
  const empty: WHOComplianceResult = {
    totalUsers: 0, usersCompliant: 0, percentageCompliant: 0,
    usersMeetingAerobicOnly: 0, usersMeetingStrengthOnly: 0,
    averageAerobicMinutes: 0, currentWeek: weekRange,
  };

  try {
    const userIds = await getAuthorityUsers(authorityId);
    if (userIds.length === 0) return empty;

    const activityMap = await getBulkWeeklyActivity(userIds, weekRange.start, weekRange.end);
    const { usersCompliant, usersMeetingAerobicOnly, usersMeetingStrengthOnly, totalAerobicMinutes } =
      classifyCompliance(userIds, activityMap);

    return {
      totalUsers: userIds.length,
      usersCompliant,
      percentageCompliant: Math.round((usersCompliant / userIds.length) * 1000) / 10,
      usersMeetingAerobicOnly,
      usersMeetingStrengthOnly,
      averageAerobicMinutes: Math.round((totalAerobicMinutes / userIds.length) * 10) / 10,
      currentWeek: weekRange,
    };
  } catch (error) {
    console.error('Error calculating WHO compliance breakdown:', error);
    return empty;
  }
}

// ── WHO Compliance Over Time (bounded weekly trend) ─────────────────────────
//
// Phase 2b: past-weeks trend for the real compliance metric above. Mirrors
// getSavingsOverTime's proven scale pattern (all weeks run in parallel, each
// week is one chunked bulk query) — at current user counts this is
// weeks × ceil(users/30) reads total, same order of magnitude as the
// existing 12-month savings trend. Hard-capped at 26 weeks (~6 months) so a
// bad `weeks` argument can't turn into an unbounded read fan-out as the user
// base grows.

export interface WHOComplianceWeekPoint {
  weekLabel: string;  // "DD/MM" of the week's Monday, for chart x-axis
  weekStart: string;  // YYYY-MM-DD
  percentageCompliant: number;
  averageAerobicMinutes: number;
  totalUsers: number;
}

const MAX_TREND_WEEKS = 26;

export async function getWHOComplianceOverTime(
  authorityId: string,
  weeks: number = 8
): Promise<WHOComplianceWeekPoint[]> {
  const boundedWeeks = Math.max(1, Math.min(weeks, MAX_TREND_WEEKS));

  try {
    const userIds = await getAuthorityUsers(authorityId);
    if (userIds.length === 0) return [];

    const currentWeekStart = getWeekRange(new Date()).start;

    const results = await Promise.all(
      Array.from({ length: boundedWeeks }, (_, i) => {
        const weekStart = new Date(currentWeekStart);
        weekStart.setDate(weekStart.getDate() - (boundedWeeks - 1 - i) * 7);
        const weekRange = getWeekRange(weekStart);

        return getBulkWeeklyActivity(userIds, weekRange.start, weekRange.end).then(activityMap => {
          const { usersCompliant, totalAerobicMinutes } = classifyCompliance(userIds, activityMap);
          const weekLabel = `${String(weekRange.start.getDate()).padStart(2, '0')}/${String(weekRange.start.getMonth() + 1).padStart(2, '0')}`;
          return {
            weekLabel,
            weekStart: toDateStr(weekRange.start),
            percentageCompliant: Math.round((usersCompliant / userIds.length) * 1000) / 10,
            averageAerobicMinutes: Math.round((totalAerobicMinutes / userIds.length) * 10) / 10,
            totalUsers: userIds.length,
          };
        });
      })
    );

    return results;
  } catch (error) {
    console.error('Error calculating WHO compliance over time:', error);
    return [];
  }
}

// ── Health Savings ────────────────────────────────────────────────────────────

export interface HealthSavingsResult {
  totalUsers: number;
  activeUsers: number;
  estimatedMonthlySavings: number;
  estimatedYearlySavings: number;
  savingsPerActiveUser: number;
  currentMonth: { year: number; month: number };
}

export async function getHealthSavings(authorityId: string): Promise<HealthSavingsResult> {
  const now = new Date();

  try {
    const userIds = await getAuthorityUsers(authorityId);
    if (userIds.length === 0) {
      return {
        totalUsers: 0, activeUsers: 0,
        estimatedMonthlySavings: 0, estimatedYearlySavings: 0,
        savingsPerActiveUser: AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON,
        currentMonth: { year: now.getFullYear(), month: now.getMonth() },
      };
    }

    // Reuse current-week bulk query (same data as WHO tracker)
    const weekRange = getWeekRange(now);
    const minutesMap = await getBulkWorkoutMinutes(userIds, weekRange.start, weekRange.end);

    const activeUsers = Array.from(minutesMap.values()).filter(m => m >= WHO_WEEKLY_TARGET_MINUTES).length;
    const estimatedMonthlySavings = activeUsers * AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON;

    return {
      totalUsers: userIds.length,
      activeUsers,
      estimatedMonthlySavings: Math.round(estimatedMonthlySavings),
      estimatedYearlySavings: Math.round(estimatedMonthlySavings * 12),
      savingsPerActiveUser: AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON,
      currentMonth: { year: now.getFullYear(), month: now.getMonth() },
    };
  } catch (error) {
    console.error('Error calculating health savings:', error);
    return {
      totalUsers: 0, activeUsers: 0,
      estimatedMonthlySavings: 0, estimatedYearlySavings: 0,
      savingsPerActiveUser: AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON,
      currentMonth: { year: now.getFullYear(), month: now.getMonth() },
    };
  }
}

// ── Savings Over Time ─────────────────────────────────────────────────────────

export interface SavingsOverTimeData {
  month: string;      // "YYYY-MM"
  monthLabel: string; // Hebrew label
  savings: number;    // ₪
  activeUsers: number;
}

const MONTH_NAMES_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

/**
 * Returns monthly savings for the last `months` months.
 * All months run in parallel; each month uses a single bulk batch query.
 * Old: 12 × n_users sequential reads ≈ 1,800 for 150 users.
 * New: 12 parallel groups × ceil(n/30) parallel batches ≈ 72 reads total.
 */
export async function getSavingsOverTime(
  authorityId: string,
  months: number = 12
): Promise<SavingsOverTimeData[]> {
  try {
    const userIds = await getAuthorityUsers(authorityId);
    if (userIds.length === 0) return [];

    const now = new Date();

    // All months run concurrently
    const results = await Promise.all(
      Array.from({ length: months }, (_, i) => {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
        const monthRange = getMonthRange(targetDate.getFullYear(), targetDate.getMonth());

        return getBulkWorkoutMinutes(userIds, monthRange.start, monthRange.end).then(minutesMap => {
          const activeUsers = Array.from(minutesMap.values()).filter(m => m >= WHO_WEEKLY_TARGET_MINUTES).length;
          const savings     = activeUsers * AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON;
          const monthKey    = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
          const monthLabel  = `${MONTH_NAMES_HE[targetDate.getMonth()]} ${targetDate.getFullYear()}`;
          return { month: monthKey, monthLabel, savings: Math.round(savings), activeUsers };
        });
      })
    );

    return results;
  } catch (error) {
    console.error('Error calculating savings over time:', error);
    return [];
  }
}

// ── Park-specific Health Savings ──────────────────────────────────────────────

export interface ParkHealthSavings {
  parkId: string;
  parkName: string;
  activeUsers: number;
  estimatedMonthlySavings: number;
}

export async function getParkHealthSavings(
  authorityId: string,
  parkId: string,
  parkName: string
): Promise<ParkHealthSavings> {
  try {
    const userIds = await getAuthorityUsers(authorityId);
    if (userIds.length === 0) return { parkId, parkName, activeUsers: 0, estimatedMonthlySavings: 0 };

    const now = new Date();
    const weekRange = getWeekRange(now);
    const minutesMap = await getBulkWorkoutMinutes(userIds, weekRange.start, weekRange.end);

    const activeUsers = Array.from(minutesMap.values()).filter(m => m >= WHO_WEEKLY_TARGET_MINUTES).length;
    const parkActiveUsers = Math.round(activeUsers * 0.1);
    const estimatedMonthlySavings = parkActiveUsers * AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON;

    return { parkId, parkName, activeUsers: parkActiveUsers, estimatedMonthlySavings: Math.round(estimatedMonthlySavings) };
  } catch (error) {
    console.error('Error calculating park health savings:', error);
    return { parkId, parkName, activeUsers: 0, estimatedMonthlySavings: 0 };
  }
}

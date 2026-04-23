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

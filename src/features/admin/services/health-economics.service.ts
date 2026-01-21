/**
 * Health Economics Service
 * Calculates WHO 150-minute tracker and estimated health savings
 */
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserFromFirestore } from '@/lib/firestore.service';

const WORKOUTS_COLLECTION = 'workouts';
const WHO_WEEKLY_TARGET_MINUTES = 150; // WHO recommendation: 150 minutes per week
const AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON = 500; // ₪500 per active person per month (estimated)

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Get start and end of week (Monday to Sunday)
 */
function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

/**
 * Get start and end of month
 */
function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Get all users for an authority
 */
async function getAuthorityUsers(authorityId: string): Promise<string[]> {
  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const { db } = await import('@/lib/firebase');
    const q = query(
      collection(db, 'users'),
      where('core.authorityId', '==', authorityId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.id);
  } catch (error) {
    console.error('Error fetching authority users:', error);
    return [];
  }
}

/**
 * Get workout duration for a user in a time range (in minutes)
 */
async function getUserWorkoutDuration(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  try {
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const q = query(
      collection(db, WORKOUTS_COLLECTION),
      where('userId', '==', userId),
      where('date', '>=', startTimestamp),
      where('date', '<=', endTimestamp)
    );

    const snapshot = await getDocs(q);
    let totalMinutes = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const durationSeconds = data.duration || 0;
      totalMinutes += durationSeconds / 60; // Convert seconds to minutes
    });

    return totalMinutes;
  } catch (error) {
    console.error(`Error fetching workout duration for user ${userId}:`, error);
    return 0;
  }
}

/**
 * WHO 150-Minute Tracker
 * Calculates the percentage of users reaching the 150-minute weekly goal
 */
export interface WHO150TrackerResult {
  totalUsers: number;
  usersReachingGoal: number;
  percentageReachingGoal: number;
  averageMinutesPerUser: number;
  currentWeek: { start: Date; end: Date };
}

export async function getWHO150Tracker(authorityId: string): Promise<WHO150TrackerResult> {
  try {
    const userIds = await getAuthorityUsers(authorityId);
    if (userIds.length === 0) {
      const now = new Date();
      const weekRange = getWeekRange(now);
      return {
        totalUsers: 0,
        usersReachingGoal: 0,
        percentageReachingGoal: 0,
        averageMinutesPerUser: 0,
        currentWeek: weekRange,
      };
    }

    const now = new Date();
    const weekRange = getWeekRange(now);
    let usersReachingGoal = 0;
    let totalMinutes = 0;

    // Check each user's weekly activity
    for (const userId of userIds) {
      const weeklyMinutes = await getUserWorkoutDuration(userId, weekRange.start, weekRange.end);
      totalMinutes += weeklyMinutes;
      if (weeklyMinutes >= WHO_WEEKLY_TARGET_MINUTES) {
        usersReachingGoal++;
      }
    }

    const averageMinutesPerUser = userIds.length > 0 ? totalMinutes / userIds.length : 0;
    const percentageReachingGoal =
      userIds.length > 0 ? (usersReachingGoal / userIds.length) * 100 : 0;

    return {
      totalUsers: userIds.length,
      usersReachingGoal,
      percentageReachingGoal: Math.round(percentageReachingGoal * 10) / 10, // Round to 1 decimal
      averageMinutesPerUser: Math.round(averageMinutesPerUser * 10) / 10,
      currentWeek: weekRange,
    };
  } catch (error) {
    console.error('Error calculating WHO 150 tracker:', error);
    const now = new Date();
    const weekRange = getWeekRange(now);
    return {
      totalUsers: 0,
      usersReachingGoal: 0,
      percentageReachingGoal: 0,
      averageMinutesPerUser: 0,
      currentWeek: weekRange,
    };
  }
}

/**
 * Estimated Health Savings
 * Calculates estimated health cost savings based on active users
 */
export interface HealthSavingsResult {
  totalUsers: number;
  activeUsers: number; // Users with at least 150 minutes/week
  estimatedMonthlySavings: number; // In ₪
  estimatedYearlySavings: number; // In ₪
  savingsPerActiveUser: number; // In ₪
  currentMonth: { year: number; month: number };
}

export async function getHealthSavings(authorityId: string): Promise<HealthSavingsResult> {
  try {
    const userIds = await getAuthorityUsers(authorityId);
    if (userIds.length === 0) {
      const now = new Date();
      return {
        totalUsers: 0,
        activeUsers: 0,
        estimatedMonthlySavings: 0,
        estimatedYearlySavings: 0,
        savingsPerActiveUser: AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON,
        currentMonth: { year: now.getFullYear(), month: now.getMonth() },
      };
    }

    const now = new Date();
    const weekRange = getWeekRange(now);
    let activeUsers = 0;

    // Count active users (reaching 150 minutes/week)
    for (const userId of userIds) {
      const weeklyMinutes = await getUserWorkoutDuration(userId, weekRange.start, weekRange.end);
      if (weeklyMinutes >= WHO_WEEKLY_TARGET_MINUTES) {
        activeUsers++;
      }
    }

    const estimatedMonthlySavings = activeUsers * AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON;
    const estimatedYearlySavings = estimatedMonthlySavings * 12;

    return {
      totalUsers: userIds.length,
      activeUsers,
      estimatedMonthlySavings: Math.round(estimatedMonthlySavings),
      estimatedYearlySavings: Math.round(estimatedYearlySavings),
      savingsPerActiveUser: AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON,
      currentMonth: { year: now.getFullYear(), month: now.getMonth() },
    };
  } catch (error) {
    console.error('Error calculating health savings:', error);
    const now = new Date();
    return {
      totalUsers: 0,
      activeUsers: 0,
      estimatedMonthlySavings: 0,
      estimatedYearlySavings: 0,
      savingsPerActiveUser: AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON,
      currentMonth: { year: now.getFullYear(), month: now.getMonth() },
    };
  }
}

/**
 * Savings Over Time
 * Returns monthly savings data for the last 12 months
 */
export interface SavingsOverTimeData {
  month: string; // "YYYY-MM" format
  monthLabel: string; // Hebrew month label
  savings: number; // In ₪
  activeUsers: number;
}

export async function getSavingsOverTime(
  authorityId: string,
  months: number = 12
): Promise<SavingsOverTimeData[]> {
  try {
    const userIds = await getAuthorityUsers(authorityId);
    if (userIds.length === 0) {
      return [];
    }

    const now = new Date();
    const results: SavingsOverTimeData[] = [];
    const monthNames = [
      'ינואר',
      'פברואר',
      'מרץ',
      'אפריל',
      'מאי',
      'יוני',
      'יולי',
      'אוגוסט',
      'ספטמבר',
      'אוקטובר',
      'נובמבר',
      'דצמבר',
    ];

    // Calculate for each month going back
    for (let i = months - 1; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthRange = getMonthRange(targetDate.getFullYear(), targetDate.getMonth());
      
      // For each month, check weekly activity (use first week as proxy for simplicity)
      // In production, you'd want to aggregate all weeks in the month
      const weekRange = getWeekRange(monthRange.start);
      let activeUsers = 0;

      for (const userId of userIds) {
        const weeklyMinutes = await getUserWorkoutDuration(userId, weekRange.start, weekRange.end);
        if (weeklyMinutes >= WHO_WEEKLY_TARGET_MINUTES) {
          activeUsers++;
        }
      }

      const savings = activeUsers * AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON;
      const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = `${monthNames[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

      results.push({
        month: monthKey,
        monthLabel,
        savings: Math.round(savings),
        activeUsers,
      });
    }

    return results;
  } catch (error) {
    console.error('Error calculating savings over time:', error);
    return [];
  }
}

/**
 * Get park-specific health savings
 */
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
    // This is a simplified version - in production, you'd track which users
    // checked into which parks and calculate their activity
    const userIds = await getAuthorityUsers(authorityId);
    const now = new Date();
    const weekRange = getWeekRange(now);
    
    // For now, estimate based on authority-wide data
    // In production, filter by park check-ins
    let activeUsers = 0;
    for (const userId of userIds) {
      const weeklyMinutes = await getUserWorkoutDuration(userId, weekRange.start, weekRange.end);
      if (weeklyMinutes >= WHO_WEEKLY_TARGET_MINUTES) {
        activeUsers++;
      }
    }

    // Estimate park-specific savings (assume 10% of active users use this park)
    const parkActiveUsers = Math.round(activeUsers * 0.1);
    const estimatedMonthlySavings = parkActiveUsers * AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON;

    return {
      parkId,
      parkName,
      activeUsers: parkActiveUsers,
      estimatedMonthlySavings: Math.round(estimatedMonthlySavings),
    };
  } catch (error) {
    console.error('Error calculating park health savings:', error);
    return {
      parkId,
      parkName,
      activeUsers: 0,
      estimatedMonthlySavings: 0,
    };
  }
}

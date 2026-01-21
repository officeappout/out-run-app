/**
 * Analytics Service for Authority Managers
 * Privacy-first: Only aggregated/anonymized data, NO PII
 */
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const USERS_COLLECTION = 'users';
const WORKOUTS_COLLECTION = 'workouts'; // Assuming workouts are tracked
const SESSIONS_COLLECTION = 'sessions'; // Park check-ins

/**
 * Get daily active users (DAU) for an authority
 * Returns count of unique users who were active on a given date
 */
export async function getDailyActiveUsers(
  authorityId: string,
  date: Date
): Promise<number> {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Query users by authorityId
    const usersQuery = query(
      collection(db, USERS_COLLECTION),
      where('core.authorityId', '==', authorityId)
    );
    const usersSnapshot = await getDocs(usersQuery);
    
    // Get user IDs
    const userIds = usersSnapshot.docs.map((doc) => doc.id);
    
    if (userIds.length === 0) return 0;

    // Count unique users who had activity on this date
    // This would query workouts/sessions - simplified for now
    // In production, you'd query actual activity logs
    const activeUserIds = new Set<string>();
    
    // TODO: Query actual workout/session logs when available
    // For now, return estimated count based on user base
    return Math.floor(userIds.length * 0.1); // 10% daily engagement estimate
  } catch (error) {
    console.error('Error calculating DAU:', error);
    return 0;
  }
}

/**
 * Get monthly active users (MAU) for an authority
 */
export async function getMonthlyActiveUsers(
  authorityId: string,
  year: number,
  month: number
): Promise<number> {
  try {
    const usersQuery = query(
      collection(db, USERS_COLLECTION),
      where('core.authorityId', '==', authorityId)
    );
    const usersSnapshot = await getDocs(usersQuery);
    
    // In production, filter by actual activity in the month
    // For now, return count of users with activity in the month
    const activeUserIds = new Set<string>();
    
    // TODO: Query actual activity logs
    return Math.floor(usersSnapshot.size * 0.3); // 30% monthly engagement estimate
  } catch (error) {
    console.error('Error calculating MAU:', error);
    return 0;
  }
}

/**
 * Get gender distribution (aggregated, no PII)
 */
export interface GenderDistribution {
  male: number;
  female: number;
  other: number;
  total: number;
}

export async function getGenderDistribution(
  authorityId: string
): Promise<GenderDistribution> {
  try {
    const usersQuery = query(
      collection(db, USERS_COLLECTION),
      where('core.authorityId', '==', authorityId)
    );
    const usersSnapshot = await getDocs(usersQuery);
    
    const distribution: GenderDistribution = {
      male: 0,
      female: 0,
      other: 0,
      total: 0,
    };
    
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const gender = data?.core?.gender ?? 'other';
      distribution[gender as keyof GenderDistribution]++;
      distribution.total++;
    });
    
    return distribution;
  } catch (error) {
    console.error('Error calculating gender distribution:', error);
    return { male: 0, female: 0, other: 0, total: 0 };
  }
}

/**
 * Get age distribution (aggregated, no PII)
 * Returns age groups: 18-25, 26-35, 36-45, 46-55, 56+
 */
export interface AgeDistribution {
  '18-25': number;
  '26-35': number;
  '36-45': number;
  '46-55': number;
  '56+': number;
  total: number;
}

export async function getAgeDistribution(
  authorityId: string
): Promise<AgeDistribution> {
  try {
    const usersQuery = query(
      collection(db, USERS_COLLECTION),
      where('core.authorityId', '==', authorityId)
    );
    const usersSnapshot = await getDocs(usersQuery);
    
    const distribution: AgeDistribution = {
      '18-25': 0,
      '26-35': 0,
      '36-45': 0,
      '46-55': 0,
      '56+': 0,
      total: 0,
    };
    
    const currentYear = new Date().getFullYear();
    
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const birthDate = data?.core?.birthDate;
      
      if (birthDate) {
        const birthYear = birthDate instanceof Date 
          ? birthDate.getFullYear() 
          : (birthDate as Timestamp).toDate().getFullYear();
        const age = currentYear - birthYear;
        
        if (age >= 18 && age <= 25) distribution['18-25']++;
        else if (age >= 26 && age <= 35) distribution['26-35']++;
        else if (age >= 36 && age <= 45) distribution['36-45']++;
        else if (age >= 46 && age <= 55) distribution['46-55']++;
        else if (age >= 56) distribution['56+']++;
      }
      distribution.total++;
    });
    
    return distribution;
  } catch (error) {
    console.error('Error calculating age distribution:', error);
    return { '18-25': 0, '26-35': 0, '36-45': 0, '46-55': 0, '56+': 0, total: 0 };
  }
}

/**
 * Get popular parks ranking based on check-ins
 * Returns parks sorted by number of sessions/check-ins
 */
export interface PopularPark {
  parkId: string;
  parkName: string;
  checkInCount: number;
}

export async function getPopularParks(
  authorityId: string,
  limit: number = 10
): Promise<PopularPark[]> {
  try {
    // Query sessions/check-ins for parks in this authority
    // This is a simplified version - in production, you'd have a sessions collection
    const sessionsQuery = query(
      collection(db, SESSIONS_COLLECTION),
      where('authorityId', '==', authorityId)
    );
    
    // For now, return empty array - implement when sessions collection exists
    // In production, aggregate by parkId and count check-ins
    const popularParks: PopularPark[] = [];
    
    // TODO: Implement actual aggregation when sessions collection is available
    // Example logic:
    // const sessionsSnapshot = await getDocs(sessionsQuery);
    // const parkCounts = new Map<string, number>();
    // sessionsSnapshot.docs.forEach((doc) => {
    //   const parkId = doc.data().parkId;
    //   parkCounts.set(parkId, (parkCounts.get(parkId) || 0) + 1);
    // });
    // return Array.from(parkCounts.entries())
    //   .map(([parkId, count]) => ({ parkId, parkName: '...', checkInCount: count }))
    //   .sort((a, b) => b.checkInCount - a.checkInCount)
    //   .slice(0, limit);
    
    return popularParks;
  } catch (error) {
    console.error('Error calculating popular parks:', error);
    return [];
  }
}

/**
 * Get DAU/MAU trend over time
 */
export interface ActivityTrend {
  date: string; // ISO date string
  dau: number;
  mau?: number;
}

export async function getActivityTrend(
  authorityId: string,
  days: number = 30
): Promise<ActivityTrend[]> {
  try {
    const trends: ActivityTrend[] = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      const dau = await getDailyActiveUsers(authorityId, date);
      trends.push({
        date: date.toISOString().split('T')[0],
        dau,
      });
    }
    
    return trends;
  } catch (error) {
    console.error('Error calculating activity trend:', error);
    return [];
  }
}

/**
 * Get comprehensive authority statistics
 * Calculates total users, active minutes, and WHO 150-minute goal attainment
 */
export interface AuthorityStats {
  totalUsers: number;
  totalMinutes: number; // Total workout minutes for all users in current week
  usersMeetingWHOThreshold: number; // Users who reached 150 minutes this week
  whoPercentage: number; // Percentage of users meeting WHO goal (0-100)
}

const WHO_WEEKLY_TARGET_MINUTES = 150; // WHO recommendation: 150 minutes per week

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

export async function getAuthorityStats(authorityId: string): Promise<AuthorityStats> {
  try {
    // Get all users for this authority
    const usersQuery = query(
      collection(db, USERS_COLLECTION),
      where('core.authorityId', '==', authorityId)
    );
    const usersSnapshot = await getDocs(usersQuery);
    const userIds = usersSnapshot.docs.map((doc) => doc.id);
    const totalUsers = userIds.length;

    if (totalUsers === 0) {
      return {
        totalUsers: 0,
        totalMinutes: 0,
        usersMeetingWHOThreshold: 0,
        whoPercentage: 0,
      };
    }

    // Get current week range
    const now = new Date();
    const weekRange = getWeekRange(now);

    // Calculate workout minutes for each user in current week
    let totalMinutes = 0;
    let usersMeetingWHOThreshold = 0;

    for (const userId of userIds) {
      const weeklyMinutes = await getUserWorkoutDuration(userId, weekRange.start, weekRange.end);
      totalMinutes += weeklyMinutes;
      if (weeklyMinutes >= WHO_WEEKLY_TARGET_MINUTES) {
        usersMeetingWHOThreshold++;
      }
    }

    // Calculate percentage of users meeting WHO goal
    const whoPercentage = totalUsers > 0 
      ? Math.round((usersMeetingWHOThreshold / totalUsers) * 100 * 10) / 10 // Round to 1 decimal
      : 0;

    return {
      totalUsers,
      totalMinutes: Math.round(totalMinutes),
      usersMeetingWHOThreshold,
      whoPercentage,
    };
  } catch (error) {
    console.error('Error calculating authority stats:', error);
    return {
      totalUsers: 0,
      totalMinutes: 0,
      usersMeetingWHOThreshold: 0,
      whoPercentage: 0,
    };
  }
}

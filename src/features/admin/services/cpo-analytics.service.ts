/**
 * CPO Strategic Dashboard Analytics Service
 * Aggregates global data across all authorities for executive insights
 */
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllAuthorities } from './authority.service';
import { getAllParks } from './parks.service';
import { getAllMaintenanceReports } from './maintenance.service';
import { getSuperAdminCount } from './admin-management.service';
import { getAllUsers } from './users.service';
import { MaintenanceReport } from '@/types/maintenance.types';

const USERS_COLLECTION = 'users';
const WORKOUTS_COLLECTION = 'workouts';
const EXERCISES_COLLECTION = 'exercises';

/**
 * Executive Summary Metrics
 */
export interface ExecutiveSummary {
  totalUsers: number;
  activeAuthorities: number;
  activeClients: number; // Count of authorities marked as active clients
  weeklyGrowthPercent: number;
  overallCompletionRate: number;
  totalPlatformAdmins: number;
}

/**
 * Get executive summary metrics
 * Calculates stats from actual user data using getAllUsers()
 */
export async function getExecutiveSummary(): Promise<ExecutiveSummary> {
  try {
    // Fetch all users using the users service
    const users = await getAllUsers();
    const totalUsers = users.length;

    // Count platform admins (users with isSuperAdmin === true)
    const totalPlatformAdmins = users.filter((u) => u.isSuperAdmin === true).length;

    // Count users who completed onboarding
    const completedOnboarding = users.filter((u) => u.onboardingStatus === 'COMPLETED').length;

    // Calculate completion rate (avoid division by zero)
    const overallCompletionRate = totalUsers > 0 
      ? ((completedOnboarding / totalUsers) * 100) 
      : 0;

    // Active Authorities (authorities with at least 1 user)
    const authorities = await getAllAuthorities();
    const activeAuthorities = authorities.filter((a) => (a.userCount ?? 0) > 0).length;

    // Active Clients (authorities marked as isActiveClient = true)
    const activeClients = authorities.filter((a) => a.isActiveClient === true).length;

    // Weekly Growth % (compare this week vs last week)
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - 7);
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(now.getDate() - 14);

    // Count users created this week (using joinDate from user data)
    const thisWeekUsers = users.filter((u) => {
      if (!u.joinDate) return false;
      return u.joinDate >= thisWeekStart;
    }).length;

    // Count users created last week
    const lastWeekUsers = users.filter((u) => {
      if (!u.joinDate) return false;
      return u.joinDate >= lastWeekStart && u.joinDate < thisWeekStart;
    }).length;

    const weeklyGrowthPercent = lastWeekUsers > 0 
      ? ((thisWeekUsers - lastWeekUsers) / lastWeekUsers) * 100 
      : (thisWeekUsers > 0 ? 100 : 0);

    return {
      totalUsers,
      activeAuthorities,
      activeClients,
      weeklyGrowthPercent: Math.round(weeklyGrowthPercent * 10) / 10, // Round to 1 decimal
      overallCompletionRate: Math.round(overallCompletionRate * 10) / 10, // Round to 1 decimal
      totalPlatformAdmins,
    };
  } catch (error) {
    console.error('Error calculating executive summary:', error);
    return {
      totalUsers: 0,
      activeAuthorities: 0,
      activeClients: 0,
      weeklyGrowthPercent: 0,
      overallCompletionRate: 0,
      totalPlatformAdmins: 0,
    };
  }
}

/**
 * Authority Performance Data
 */
export interface AuthorityPerformance {
  authorityId: string;
  authorityName: string;
  userCount: number;
  activeParks: number;
  engagementScore: number; // Average workouts per user
}

/**
 * Get authority performance metrics
 */
export async function getAuthorityPerformance(): Promise<AuthorityPerformance[]> {
  try {
    const authorities = await getAllAuthorities();
    const parks = await getAllParks();
    const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));

    // Group parks by authority
    const parksByAuthority = new Map<string, number>();
    parks.forEach((park) => {
      if (park.authorityId) {
        parksByAuthority.set(park.authorityId, (parksByAuthority.get(park.authorityId) || 0) + 1);
      }
    });

    // Group users by authority and count workouts
    const usersByAuthority = new Map<string, string[]>(); // authorityId -> userIds
    const workoutsByUser = new Map<string, number>(); // userId -> workout count

    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const authorityId = data?.core?.authorityId;
      if (authorityId) {
        if (!usersByAuthority.has(authorityId)) {
          usersByAuthority.set(authorityId, []);
        }
        usersByAuthority.get(authorityId)!.push(doc.id);
      }
    });

    // Count workouts per user
    try {
      const workoutsSnapshot = await getDocs(collection(db, WORKOUTS_COLLECTION));
      workoutsSnapshot.docs.forEach((doc) => {
        const userId = doc.data()?.userId;
        if (userId) {
          workoutsByUser.set(userId, (workoutsByUser.get(userId) || 0) + 1);
        }
      });
    } catch (error) {
      console.warn('Workouts collection not available, using estimates');
    }

    // Calculate performance for each authority
    const performance: AuthorityPerformance[] = authorities.map((authority) => {
      const userIds = usersByAuthority.get(authority.id) || [];
      const userCount = userIds.length;
      const activeParks = parksByAuthority.get(authority.id) || 0;
      
      // Calculate engagement score (average workouts per user)
      const totalWorkouts = userIds.reduce((sum, userId) => {
        return sum + (workoutsByUser.get(userId) || 0);
      }, 0);
      const engagementScore = userCount > 0 ? totalWorkouts / userCount : 0;

      return {
        authorityId: authority.id,
        authorityName: authority.name,
        userCount,
        activeParks,
        engagementScore: Math.round(engagementScore * 10) / 10,
      };
    });

    // Sort by user count descending
    return performance.sort((a, b) => b.userCount - a.userCount);
  } catch (error) {
    console.error('Error calculating authority performance:', error);
    return [];
  }
}

/**
 * Base Movement ID Usage Stats
 */
export interface BaseMovementUsage {
  baseMovementId: string;
  usageCount: number;
}

/**
 * Get top base movement IDs by usage
 */
export async function getTopBaseMovements(limit: number = 5): Promise<BaseMovementUsage[]> {
  try {
    const exercisesSnapshot = await getDocs(collection(db, EXERCISES_COLLECTION));
    const movementCounts = new Map<string, number>();

    exercisesSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const baseMovementId = data?.base_movement_id;
      if (baseMovementId && typeof baseMovementId === 'string') {
        movementCounts.set(baseMovementId, (movementCounts.get(baseMovementId) || 0) + 1);
      }
    });

    // Convert to array and sort
    const movements = Array.from(movementCounts.entries())
      .map(([baseMovementId, usageCount]) => ({ baseMovementId, usageCount }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);

    return movements;
  } catch (error) {
    console.error('Error calculating top base movements:', error);
    return [];
  }
}

/**
 * Location Distribution
 */
export interface LocationDistribution {
  location: string;
  count: number;
  percentage: number;
}

/**
 * Get location distribution (Park vs Home vs Office)
 */
export async function getLocationDistribution(): Promise<LocationDistribution[]> {
  try {
    const exercisesSnapshot = await getDocs(collection(db, EXERCISES_COLLECTION));
    const locationCounts = new Map<string, number>();
    let total = 0;

    exercisesSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const executionMethods = data?.execution_methods || [];
      
      executionMethods.forEach((method: any) => {
        const location = method?.location;
        if (location && typeof location === 'string') {
          locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
          total++;
        }
      });
    });

    // Normalize location names
    const normalized: LocationDistribution[] = [];
    const locationMap: Record<string, string> = {
      park: 'פארק',
      home: 'בית',
      office: 'משרד',
      gym: 'מכון כושר',
    };

    locationCounts.forEach((count, location) => {
      const normalizedName = locationMap[location.toLowerCase()] || location;
      normalized.push({
        location: normalizedName,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0,
      });
    });

    // Sort by count descending
    return normalized.sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error calculating location distribution:', error);
    // Return default distribution
    return [
      { location: 'פארק', count: 0, percentage: 0 },
      { location: 'בית', count: 0, percentage: 0 },
      { location: 'משרד', count: 0, percentage: 0 },
    ];
  }
}

/**
 * Premium Conversion Rate (Placeholder)
 */
export interface PremiumMetrics {
  conversionRate: number;
  totalUsers: number;
  premiumUsers: number;
}

/**
 * Get premium conversion metrics (placeholder for future monetization)
 */
export async function getPremiumMetrics(): Promise<PremiumMetrics> {
  try {
    const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const totalUsers = usersSnapshot.size;

    // TODO: When premium feature is implemented, query users with premium status
    // For now, return placeholder data
    const premiumUsers = 0; // Placeholder
    const conversionRate = 0; // Placeholder

    return {
      conversionRate,
      totalUsers,
      premiumUsers,
    };
  } catch (error) {
    console.error('Error calculating premium metrics:', error);
    return {
      conversionRate: 0,
      totalUsers: 0,
      premiumUsers: 0,
    };
  }
}

/**
 * Get all unresolved maintenance reports across all authorities
 */
export async function getGlobalMaintenanceReports(): Promise<MaintenanceReport[]> {
  try {
    const allReports = await getAllMaintenanceReports();
    // Filter unresolved reports (not 'resolved' or 'dismissed')
    const unresolved = allReports.filter(
      (report) => report.status !== 'resolved' && report.status !== 'dismissed'
    );
    
    // Sort by priority: high -> medium -> low
    const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return unresolved.sort((a, b) => {
      const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
      if (priorityDiff !== 0) return priorityDiff;
      // If same priority, sort by date (newest first)
      return b.reportedAt.getTime() - a.reportedAt.getTime();
    });
  } catch (error) {
    console.error('Error fetching global maintenance reports:', error);
    return [];
  }
}

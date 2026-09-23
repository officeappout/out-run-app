/**
 * CPO Strategic Dashboard Analytics Service
 * Aggregates global data across all authorities for executive insights
 */
import {
  collection,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllMaintenanceReports } from './maintenance.service';
import { MaintenanceReport } from '@/types/maintenance.types';

const EXERCISES_COLLECTION = 'exercises';

/**
 * Authority Performance Data — the shape getAuthorityPerformance() used to
 * return. That function was deleted 23.09.2026 (00-MASTER-PLAN.md §13.11
 * P1 — it read the whole `users` collection unscoped; replaced by
 * /api/admin/statistics-summary, see src/lib/adminAnalyticsScope.ts) but
 * the type itself is kept: AuthorityPerformanceTable.tsx still imports it
 * to describe the new route's response shape, which is identical.
 */
export interface AuthorityPerformance {
  authorityId: string;
  authorityName: string;
  userCount: number;
  activeParks: number;
  engagementScore: number; // Average workouts per user
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

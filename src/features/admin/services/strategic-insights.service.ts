/**
 * Strategic Insights Analytics Service
 * Provides business-focused insights for municipal health impact reporting
 */

import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllAuthorities } from './authority.service';
import { getAllParks } from './parks.service';
import { getAllGearDefinitions } from './gear-definition.service';

const USERS_COLLECTION = 'users';
const WORKOUTS_COLLECTION = 'workouts';

/**
 * Health Wake-Up Metric
 * Count users who were inactive (historyFrequency: "none" or "low") but are now active (> 1 workout)
 */
export interface HealthWakeUpMetric {
  totalInactiveUsers: number; // Users with historyFrequency "none" or "low"
  nowActiveUsers: number; // Inactive users who completed > 1 workout
  successRate: number; // Percentage of inactive users who became active
}

export async function getHealthWakeUpMetric(authorityIds?: string[]): Promise<HealthWakeUpMetric> {
  try {
    const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
    
    // Get all user IDs for workout counting
    const inactiveUserIds: string[] = [];
    const allUserIds: string[] = [];
    
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      
      // Filter by authority if authorityIds provided
      if (authorityIds && authorityIds.length > 0) {
        const userAuthorityId = data?.core?.authorityId;
        if (!userAuthorityId || !authorityIds.includes(userAuthorityId)) {
          return; // Skip users not in the specified authorities
        }
      }
      
      allUserIds.push(doc.id);
      
      // Check historyFrequency (could be in root or lifestyle.historyFrequency)
      const historyFreq = data?.historyFrequency || 
                         data?.lifestyle?.historyFrequency || 
                         data?.onboardingData?.historyFrequency;
      
      // Count inactive users (NONE or LOW frequency)
      if (historyFreq === 'none' || historyFreq === 'NONE' || 
          historyFreq === 'low' || historyFreq === 'LOW') {
        inactiveUserIds.push(doc.id);
      }
    });
    
    // Count workouts per user
    const workoutsByUser = new Map<string, number>();
    
    try {
      const workoutsSnapshot = await getDocs(collection(db, WORKOUTS_COLLECTION));
      workoutsSnapshot.docs.forEach((workoutDoc) => {
        const userId = workoutDoc.data()?.userId;
        if (userId) {
          workoutsByUser.set(userId, (workoutsByUser.get(userId) || 0) + 1);
        }
      });
    } catch (error) {
      console.warn('Workouts collection not available or not indexed:', error);
    }
    
    // Count inactive users who now have > 1 workout
    const nowActiveUsers = inactiveUserIds.filter((userId) => {
      const workoutCount = workoutsByUser.get(userId) || 0;
      return workoutCount > 1;
    }).length;
    
    const totalInactiveUsers = inactiveUserIds.length;
    const successRate = totalInactiveUsers > 0 
      ? Math.round((nowActiveUsers / totalInactiveUsers) * 100 * 10) / 10
      : 0;
    
    return {
      totalInactiveUsers,
      nowActiveUsers,
      successRate,
    };
  } catch (error) {
    console.error('Error calculating health wake-up metric:', error);
    return {
      totalInactiveUsers: 0,
      nowActiveUsers: 0,
      successRate: 0,
    };
  }
}

/**
 * Equipment Gap Analysis
 * Analyzes equipment demand vs availability by neighborhood
 */
export interface EquipmentGap {
  neighborhoodId: string;
  neighborhoodName: string;
  cityName: string;
  equipmentDemand: {
    equipmentId: string;
    equipmentName: string;
    userCount: number;
  }[];
  availableFacilities: string[]; // From parks in that neighborhood
}

export async function getEquipmentGapAnalysis(authorityIds?: string[]): Promise<EquipmentGap[]> {
  try {
    const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const authorities = await getAllAuthorities();
    const parks = await getAllParks();
    const gearDefinitions = await getAllGearDefinitions();
    
    // Create gear ID -> name mapping
    const gearMap = new Map<string, string>();
    gearDefinitions.forEach((gear) => {
      gearMap.set(gear.id, gear.name?.he || gear.name?.en || gear.id);
    });
    
    // Group users by neighborhood/authority
    const usersByAuthority = new Map<string, {
      userId: string;
      equipment: string[]; // All equipment IDs from user profile
    }[]>();
    
    // Create authority ID -> name mapping
    const authorityMap = new Map<string, { name: string; type: string; parentId?: string }>();
    authorities.forEach((auth) => {
      authorityMap.set(auth.id, {
        name: auth.name,
        type: auth.type,
        parentId: auth.parentAuthorityId,
      });
    });
    
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const authorityId = data?.core?.authorityId;
      
      if (!authorityId) return;
      
      // Filter by authority if authorityIds provided
      if (authorityIds && authorityIds.length > 0) {
        if (!authorityIds.includes(authorityId)) {
          return; // Skip users not in the specified authorities
        }
      }
      
      // Collect all equipment IDs from user profile
      const equipmentIds: string[] = [];
      const equipment = data?.equipment || {};
      
      // Collect from home, office, outdoor
      if (Array.isArray(equipment.home)) {
        equipmentIds.push(...equipment.home);
      }
      if (Array.isArray(equipment.office)) {
        equipmentIds.push(...equipment.office);
      }
      if (Array.isArray(equipment.outdoor)) {
        equipmentIds.push(...equipment.outdoor);
      }
      
      if (!usersByAuthority.has(authorityId)) {
        usersByAuthority.set(authorityId, []);
      }
      
      usersByAuthority.get(authorityId)!.push({
        userId: doc.id,
        equipment: equipmentIds,
      });
    });
    
    // Group parks by authority (filter if authorityIds provided)
    const parksByAuthority = new Map<string, string[]>(); // authorityId -> facility names
    parks.forEach((park) => {
      if (!park.authorityId) return;
      
      // Filter by authority if authorityIds provided
      if (authorityIds && authorityIds.length > 0) {
        if (!authorityIds.includes(park.authorityId)) {
          return; // Skip parks not in the specified authorities
        }
      }
      
      if (!parksByAuthority.has(park.authorityId)) {
        parksByAuthority.set(park.authorityId, []);
      }
      const facilities = park.facilities || [];
      parksByAuthority.get(park.authorityId)!.push(...facilities);
    });
    
    // Analyze equipment gaps per neighborhood
    const gaps: EquipmentGap[] = [];
    
    usersByAuthority.forEach((users, authorityId) => {
      const authority = authorityMap.get(authorityId);
      if (!authority) return;
      
      // Only analyze neighborhoods and settlements (sub-locations)
      if (authority.type !== 'neighborhood' && authority.type !== 'settlement') {
        return;
      }
      
      // Count equipment demand
      const equipmentCounts = new Map<string, number>();
      users.forEach((user) => {
        user.equipment.forEach((equipId) => {
          equipmentCounts.set(equipId, (equipmentCounts.get(equipId) || 0) + 1);
        });
      });
      
      // Convert to sorted array
      const equipmentDemand = Array.from(equipmentCounts.entries())
        .map(([equipmentId, userCount]) => ({
          equipmentId,
          equipmentName: gearMap.get(equipmentId) || equipmentId,
          userCount,
        }))
        .sort((a, b) => b.userCount - a.userCount)
        .slice(0, 10); // Top 10 most requested items
      
      // Get parent city name
      const parentAuth = authority.parentId ? authorityMap.get(authority.parentId) : null;
      const cityName = parentAuth?.name || 'לא זוהה';
      
      gaps.push({
        neighborhoodId: authorityId,
        neighborhoodName: authority.name,
        cityName,
        equipmentDemand,
        availableFacilities: [...new Set(parksByAuthority.get(authorityId) || [])],
      });
    });
    
    return gaps.sort((a, b) => b.equipmentDemand.length - a.equipmentDemand.length);
  } catch (error) {
    console.error('Error calculating equipment gap analysis:', error);
    return [];
  }
}

/**
 * Sleepy Neighborhoods
 * Neighborhoods with high population potential but low user engagement
 */
export interface SleepyNeighborhood {
  neighborhoodId: string;
  neighborhoodName: string;
  cityName: string;
  userCount: number;
  populationEstimate?: number; // If available from authorities.userCount
  penetrationRate: number; // Users per estimated population (if available)
  parksCount: number;
}

export async function getSleepyNeighborhoods(authorityIds?: string[]): Promise<SleepyNeighborhood[]> {
  try {
    const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const authorities = await getAllAuthorities();
    const parks = await getAllParks();
    
    // Count users per authority
    const usersByAuthority = new Map<string, number>();
    usersSnapshot.docs.forEach((doc) => {
      const authorityId = doc.data()?.core?.authorityId;
      if (!authorityId) return;
      
      // Filter by authority if authorityIds provided
      if (authorityIds && authorityIds.length > 0) {
        if (!authorityIds.includes(authorityId)) {
          return; // Skip users not in the specified authorities
        }
      }
      
      usersByAuthority.set(authorityId, (usersByAuthority.get(authorityId) || 0) + 1);
    });
    
    // Count parks per authority (filter if authorityIds provided)
    const parksByAuthority = new Map<string, number>();
    parks.forEach((park) => {
      if (!park.authorityId) return;
      
      // Filter by authority if authorityIds provided
      if (authorityIds && authorityIds.length > 0) {
        if (!authorityIds.includes(park.authorityId)) {
          return; // Skip parks not in the specified authorities
        }
      }
      
      parksByAuthority.set(park.authorityId, (parksByAuthority.get(park.authorityId) || 0) + 1);
    });
    
    // Create authority lookup
    const authorityMap = new Map<string, { name: string; type: string; parentId?: string; userCount?: number }>();
    authorities.forEach((auth) => {
      authorityMap.set(auth.id, {
        name: auth.name,
        type: auth.type,
        parentId: auth.parentAuthorityId,
        userCount: auth.userCount,
      });
    });
    
    // Find neighborhoods and settlements with low engagement
    const sleepy: SleepyNeighborhood[] = [];
    
    authorities.forEach((auth) => {
      // Only look at neighborhoods and settlements
      if (auth.type !== 'neighborhood' && auth.type !== 'settlement') {
        return;
      }
      
      const userCount = usersByAuthority.get(auth.id) || 0;
      const parksCount = parksByAuthority.get(auth.id) || 0;
      
      // Get parent city
      const parentAuth = auth.parentAuthorityId ? authorityMap.get(auth.parentAuthorityId) : null;
      const cityName = parentAuth?.name || 'לא זוהה';
      
      // Use authority.userCount as population estimate (if available)
      const populationEstimate = auth.userCount || undefined;
      const penetrationRate = populationEstimate && populationEstimate > 0
        ? Math.round((userCount / populationEstimate) * 10000) / 100 // per 10k
        : 0;
      
      sleepy.push({
        neighborhoodId: auth.id,
        neighborhoodName: auth.name,
        cityName,
        userCount,
        populationEstimate,
        penetrationRate,
        parksCount,
      });
    });
    
    // Sort by penetration rate (lowest first) or user count (lowest first)
    return sleepy
      .sort((a, b) => {
        // If both have population estimates, sort by penetration rate
        if (a.populationEstimate && b.populationEstimate) {
          return a.penetrationRate - b.penetrationRate;
        }
        // Otherwise, sort by user count (ascending - lowest engagement)
        return a.userCount - b.userCount;
      })
      .slice(0, 10); // Bottom 10 (most sleepy)
  } catch (error) {
    console.error('Error calculating sleepy neighborhoods:', error);
    return [];
  }
}

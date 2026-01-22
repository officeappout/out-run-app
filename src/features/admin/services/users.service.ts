/**
 * Users Management Service
 * Handles fetching and managing all users in the system
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  where,
  Timestamp,
} from 'firebase/firestore';
import { deleteUser as deleteAuthUser } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { UserFullProfile } from '@/types/user-profile';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

const USERS_COLLECTION = 'users';
const WORKOUTS_COLLECTION = 'workouts';

/**
 * Convert Firestore timestamp to Date (safe parsing for all formats)
 * Handles: Firestore Timestamp, Date objects, strings, numbers, null, undefined
 */
function toDate(timestamp: any): Date | undefined {
  if (!timestamp) return undefined;
  
  // Already a Date object
  if (timestamp instanceof Date) {
    // Check if date is valid
    return isNaN(timestamp.getTime()) ? undefined : timestamp;
  }
  
  // Firestore Timestamp object (has toDate method)
  if (typeof timestamp.toDate === 'function') {
    try {
      return timestamp.toDate();
    } catch (error) {
      console.warn('Error converting Firestore timestamp to Date:', error);
      return undefined;
    }
  }
  
  // String (ISO date string or other date format)
  if (typeof timestamp === 'string') {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? undefined : date;
  }
  
  // Number (Unix timestamp in seconds or milliseconds)
  if (typeof timestamp === 'number') {
    // If timestamp is in seconds (less than year 2000 in milliseconds), convert to milliseconds
    const ms = timestamp < 946684800000 ? timestamp * 1000 : timestamp;
    const date = new Date(ms);
    return isNaN(date.getTime()) ? undefined : date;
  }
  
  // If timestamp has seconds/nanoseconds (Firestore Timestamp structure)
  if (timestamp.seconds !== undefined) {
    try {
      const ms = timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000;
      const date = new Date(ms);
      return isNaN(date.getTime()) ? undefined : date;
    } catch (error) {
      console.warn('Error converting timestamp with seconds/nanoseconds:', error);
      return undefined;
    }
  }
  
  // Unknown format, try to construct Date anyway
  try {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? undefined : date;
  } catch (error) {
    console.warn('Unable to parse timestamp:', timestamp, error);
    return undefined;
  }
}

/**
 * Extended user data for admin table display
 */
export interface AdminUserListItem {
  id: string;
  name: string;
  email?: string;
  phone?: string; // If available in future
  gender?: 'male' | 'female' | 'other';
  photoURL?: string;
  coins: number;
  level: number; // Global level or highest domain level
  joinDate?: Date;
  isSuperAdmin: boolean;
  isApproved: boolean;
  onboardingStep?: string; // Current onboarding step
  onboardingStatus?: 'ONBOARDING' | 'COMPLETED' | undefined; // Onboarding status
  isAnonymous?: boolean; // If user is anonymous (not yet signed up)
}

/**
 * Get all users (for admin table)
 */
export async function getAllUsers(): Promise<AdminUserListItem[]> {
  try {
    const q = query(collection(db, USERS_COLLECTION), orderBy('core.name', 'asc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const core = data?.core || {};
      const progression = data?.progression || {};

      // Calculate level: Use globalLevel, or highest domain level, or 1
      let calculatedLevel = progression.globalLevel || 1;
      if (progression.domains) {
        const domainLevels = Object.values(progression.domains).map((d: any) => d.currentLevel || 0);
        const maxDomainLevel = Math.max(...domainLevels, calculatedLevel);
        if (maxDomainLevel > calculatedLevel) {
          calculatedLevel = maxDomainLevel;
        }
      }

      return {
        id: docSnap.id,
        name: core.name || 'Unknown',
        email: core.email || undefined,
        phone: core.phone || undefined, // If phone field exists
        gender: core.gender || undefined,
        photoURL: core.photoURL || undefined,
        coins: progression.coins || 0,
        level: calculatedLevel,
        joinDate: toDate(data?.createdAt),
        isSuperAdmin: core.isSuperAdmin === true,
        isApproved: core.isApproved === true,
        onboardingStep: data?.onboardingStep || undefined,
        onboardingStatus: data?.onboardingStatus || undefined,
        isAnonymous: core.isAnonymous === true,
      };
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    throw error;
  }
}

/**
 * Get detailed user profile by ID
 */
export async function getUserDetails(userId: string): Promise<UserFullProfile | null> {
  try {
    const userDoc = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userDoc);

    if (!userSnap.exists()) {
      return null;
    }

    const data = userSnap.data();
    
    // Convert Firestore timestamps to Dates
    const profile: UserFullProfile = {
      id: userSnap.id,
      ...data,
      core: {
        ...data.core,
        birthDate: data.core?.birthDate ? toDate(data.core.birthDate) : undefined,
      },
    } as UserFullProfile;

    return profile;
  } catch (error) {
    console.error('Error fetching user details:', error);
    throw error;
  }
}

/**
 * Get user's workout history
 */
export async function getUserWorkoutHistory(userId: string, limit: number = 50): Promise<WorkoutHistoryEntry[]> {
  try {
    const q = query(
      collection(db, WORKOUTS_COLLECTION),
      where('userId', '==', userId),
      orderBy('date', 'desc'),
      // Note: If 'date' is not indexed, you may need to remove orderBy or create an index
    );
    
    const snapshot = await getDocs(q);
    const workouts: WorkoutHistoryEntry[] = [];

    snapshot.docs.slice(0, limit).forEach((docSnap) => {
      const data = docSnap.data();
      workouts.push({
        id: docSnap.id,
        userId: data.userId,
        date: toDate(data.date) || new Date(),
        activityType: data.activityType || 'workout',
        workoutType: data.workoutType || 'running',
        category: data.category || 'cardio',
        displayIcon: data.displayIcon || 'run-fast',
        distance: data.distance || 0,
        duration: data.duration || 0,
        calories: data.calories || 0,
        pace: data.pace || 0,
        routePath: data.routePath,
        routeId: data.routeId,
        routeName: data.routeName,
        earnedCoins: data.earnedCoins || 0,
      });
    });

    return workouts;
  } catch (error) {
    console.error('Error fetching workout history:', error);
    // If index doesn't exist, return empty array instead of failing
    if (error instanceof Error && error.message.includes('index')) {
      console.warn('Workout history index not found. Returning empty array.');
      return [];
    }
    throw error;
  }
}

/**
 * Delete user from Firestore AND Firebase Auth
 * Note: This requires admin privileges. In production, this should be a server action.
 */
export async function deleteUser(userId: string): Promise<void> {
  try {
    // 1. Delete user document from Firestore
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    await deleteDoc(userDocRef);

    // 2. Delete user from Firebase Auth (requires admin SDK on server side)
    // For now, we'll only delete from Firestore
    // In production, create a server action that uses Firebase Admin SDK
    console.warn('User deleted from Firestore. Firebase Auth deletion requires server-side implementation.');

    // Note: To fully delete from Auth, you need to:
    // 1. Create a server action (app/api/admin/delete-user/route.ts)
    // 2. Use Firebase Admin SDK's deleteUser() method
    // 3. Call this server action from the client
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

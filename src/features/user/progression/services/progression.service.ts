/**
 * Progression Service
 * Handles domain-specific progression tracking with unified master program view
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserFullProfile, TrainingDomainId } from '../../core/types/user.types';
import { ProgressionRule, DomainTrackProgress, MasterProgramProgress } from '../../core/types/progression.types';
import { Program } from '@/features/content/programs';
import { getProgram } from '@/features/content/programs';

const PROGRAM_LEVEL_SETTINGS_COLLECTION = 'program_level_settings';
const PROGRAMS_COLLECTION = 'programs';
const USERS_COLLECTION = 'users';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Initialize default track progress for a domain
 */
function getDefaultTrackProgress(): DomainTrackProgress {
  return {
    currentLevel: 1,
    percent: 0,
  };
}

/**
 * Ensure progression.tracks exists and initialize missing domains
 */
function ensureTracksInitialized(progression: UserFullProfile['progression']): void {
  if (!progression.tracks) {
    progression.tracks = {};
  }
}

/**
 * Get ProgressionRule for a specific program and level
 */
async function getProgressionRule(
  programId: string,
  level: number
): Promise<ProgressionRule | null> {
  try {
    const q = query(
      collection(db, PROGRAM_LEVEL_SETTINGS_COLLECTION),
      where('programId', '==', programId),
      where('level', '==', level)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as ProgressionRule;
  } catch (error) {
    console.error(`Error fetching progression rule for ${programId} level ${level}:`, error);
    return null;
  }
}

/**
 * Update user progression tracks in Firestore
 */
async function updateProgressionTracks(
  userId: string,
  tracks: { [programId: string]: DomainTrackProgress }
): Promise<boolean> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userDocRef, {
      'progression.tracks': tracks,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating progression tracks:', error);
    return false;
  }
}

/**
 * Calculate session progress for exercises
 * 
 * @param userId - User ID
 * @param exercises - Array of exercises with programId (string or string[]), reps, and targetReps
 * @returns Promise<boolean> - Success status
 */
export async function calculateSessionProgress(
  userId: string,
  exercises: { programId: string | string[]; reps: number; targetReps: number }[]
): Promise<boolean> {
  try {
    // Fetch user profile
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error('User not found:', userId);
      return false;
    }

    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;

    // Ensure tracks are initialized
    ensureTracksInitialized(progression);

    // Group exercises by domain
    const domainPerformance: Record<string, { totalReps: number; totalTargetReps: number; count: number }> = {};

    for (const exercise of exercises) {
      const programIds = Array.isArray(exercise.programId) ? exercise.programId : [exercise.programId];

      for (const programId of programIds) {
        if (!domainPerformance[programId]) {
          domainPerformance[programId] = {
            totalReps: 0,
            totalTargetReps: 0,
            count: 0,
          };
        }

        domainPerformance[programId].totalReps += exercise.reps;
        domainPerformance[programId].totalTargetReps += exercise.targetReps;
        domainPerformance[programId].count += 1;
      }
    }

    // Calculate average performance per domain and apply bonuses
    const updatedTracks = { ...progression.tracks };

    for (const [domain, performance] of Object.entries(domainPerformance)) {
      // Calculate average performance percentage
      const avgPerformance = performance.totalTargetReps > 0
        ? (performance.totalReps / performance.totalTargetReps) * 100
        : 0;

      // Initialize track if missing
      if (!updatedTracks[domain]) {
        updatedTracks[domain] = getDefaultTrackProgress();
      }

      const track = updatedTracks[domain];
      const currentLevel = track.currentLevel;

      // Fetch progression rule for bonus calculation
      const rule = await getProgressionRule(domain, currentLevel);
      const bonusPercent = rule?.bonusPercent || 0;

      // Calculate base progress (average performance as percentage)
      // Cap at 100% to prevent over-performance from giving excessive progress
      const baseProgress = Math.min(avgPerformance, 100);
      
      // Apply bonus: bonusPercent is a multiplier (e.g., 10 = 10% bonus)
      // Example: 80% performance with 10% bonus = 80% * 1.10 = 88% total progress
      const bonusAmount = (baseProgress * bonusPercent) / 100;
      const totalProgress = baseProgress + bonusAmount;

      // Add to existing percent
      track.percent = Math.min(track.percent + totalProgress, 100);

      // Check for level-up
      if (track.percent >= 100) {
        track.currentLevel += 1;
        track.percent = 0; // Reset percent after level-up
      }

      updatedTracks[domain] = track;
    }

    // Update Firestore
    await updateProgressionTracks(userId, updatedTracks);

    // Also update local progression object for consistency
    progression.tracks = updatedTracks;

    return true;
  } catch (error) {
    console.error('Error calculating session progress:', error);
    return false;
  }
}

/**
 * Get master program progress (unified view)
 * 
 * @param userId - User ID
 * @param masterProgramId - Master program ID (e.g., "full_body")
 * @returns Promise<MasterProgramProgress | null>
 */
export async function getMasterProgramProgress(
  userId: string,
  masterProgramId: string
): Promise<MasterProgramProgress | null> {
  try {
    // Fetch master program
    const masterProgram = await getProgram(masterProgramId);
    if (!masterProgram || !masterProgram.isMaster) {
      console.error('Master program not found or not a master program:', masterProgramId);
      return null;
    }

    // Fetch user profile
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error('User not found:', userId);
      return null;
    }

    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;

    // Ensure tracks are initialized
    ensureTracksInitialized(progression);

    // Get sub-programs
    const subProgramIds = masterProgram.subPrograms || [];
    if (subProgramIds.length === 0) {
      console.warn('Master program has no sub-programs:', masterProgramId);
      return null;
    }

    // Fetch progress for each sub-program
    const subPrograms: { programId: string; level: number; percent: number }[] = [];
    let totalLevel = 0;
    let totalPercent = 0;

    for (const subProgramId of subProgramIds) {
      const track = progression.tracks?.[subProgramId] || getDefaultTrackProgress();
      
      subPrograms.push({
        programId: subProgramId,
        level: track.currentLevel,
        percent: track.percent,
      });

      totalLevel += track.currentLevel;
      totalPercent += track.percent;
    }

    // Calculate weighted average
    const domainCount = subProgramIds.length;
    const displayLevel = Math.floor(totalLevel / domainCount);
    const displayPercent = totalPercent / domainCount;

    return {
      displayLevel,
      displayPercent: Math.round(displayPercent * 100) / 100, // Round to 2 decimal places
      subPrograms,
    };
  } catch (error) {
    console.error('Error getting master program progress:', error);
    return null;
  }
}

/**
 * Initialize progression tracks for a user with default values
 * 
 * @param userId - User ID
 * @param domains - Array of domain IDs to initialize
 * @returns Promise<boolean> - Success status
 */
export async function initializeProgressionTracks(
  userId: string,
  domains: string[]
): Promise<boolean> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error('User not found:', userId);
      return false;
    }

    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;

    // Ensure tracks are initialized
    ensureTracksInitialized(progression);

    // Initialize missing domains
    const updatedTracks = { ...progression.tracks };
    let hasChanges = false;

    for (const domain of domains) {
      if (!updatedTracks[domain]) {
        updatedTracks[domain] = getDefaultTrackProgress();
        hasChanges = true;
      }
    }

    // Update Firestore if there were changes
    if (hasChanges) {
      await updateProgressionTracks(userId, updatedTracks);
    }

    return true;
  } catch (error) {
    console.error('Error initializing progression tracks:', error);
    return false;
  }
}

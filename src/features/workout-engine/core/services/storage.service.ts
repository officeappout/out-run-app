// Workout Storage Service - Saves workout history to Firestore
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
// NOTE: getStepsTrend lives in activity-history.service.ts (queries dailyActivity collection).
import { db, auth } from '@/lib/firebase';

// Route coordinate format stored in Firestore (object format to avoid nested arrays)
export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface WorkoutHistoryEntry {
  id?: string;
  userId: string;
  date: Date;
  activityType: 'running' | 'walking' | 'cycling' | 'workout';
  // Future-proof fields
  workoutType: 'running' | 'walking' | 'cycling' | 'strength' | 'hybrid';
  category: 'cardio' | 'strength' | 'hybrid';
  displayIcon: string; // Lucide icon name (e.g., 'run-fast', 'walk', 'bike')
  distance: number; // km
  duration: number; // seconds
  calories: number;
  pace: number; // minutes per km
  routePath?: RoutePoint[] | [number, number][]; // GPS coordinates - supports both formats for backward compatibility
  routeId?: string; // If guided route
  routeName?: string;
  earnedCoins: number;
  /** Global XP earned in this session — written at save time for the activity history list. */
  xpEarned?: number;

  // ── Training OS fields ────────────────────────────────────────────────
  /** Whether this was a recovery/maintenance workout (does not consume weekly volume budget) */
  isRecovery?: boolean;
  /** Difficulty level (1-3 bolts) used for this workout */
  difficulty?: 1 | 2 | 3;
  /** Total sets completed in this strength session */
  setsCompleted?: number;
  /** Total sets planned for this strength session */
  setsPlanned?: number;
}

/**
 * Get workout metadata based on activity type
 */
function getWorkoutMetadata(activityType: string): {
  workoutType: 'running' | 'walking' | 'cycling' | 'strength' | 'hybrid';
  category: 'cardio' | 'strength' | 'hybrid';
  displayIcon: string;
} {
  switch (activityType) {
    case 'running':
      return { workoutType: 'running', category: 'cardio', displayIcon: 'run-fast' };
    case 'walking':
      return { workoutType: 'walking', category: 'cardio', displayIcon: 'walk' };
    case 'cycling':
      return { workoutType: 'cycling', category: 'cardio', displayIcon: 'bike' };
    case 'workout':
      return { workoutType: 'strength', category: 'strength', displayIcon: 'dumbbell' };
    default:
      return { workoutType: 'running', category: 'cardio', displayIcon: 'run-fast' };
  }
}

/**
 * Save a completed workout to Firestore
 */
export async function saveWorkout(workout: Omit<WorkoutHistoryEntry, 'id' | 'date' | 'workoutType' | 'category' | 'displayIcon'> & Partial<Pick<WorkoutHistoryEntry, 'workoutType' | 'category' | 'displayIcon'>>): Promise<boolean> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('❌ [DB] Cannot save workout: No User ID found');
      return false;
    }

    // Verify userId is provided and matches current user
    if (!workout.userId || workout.userId !== currentUser.uid) {
      console.warn('[WorkoutStorage] userId mismatch or missing, using currentUser.uid');
    }

    // Get workout metadata (use provided or derive from activityType)
    const metadata = workout.workoutType 
      ? {
          workoutType: workout.workoutType,
          category: workout.category || 'cardio',
          displayIcon: workout.displayIcon || 'run-fast',
        }
      : getWorkoutMetadata(workout.activityType);

    // Transform routePath from array format to [{lat, lng}] format for Firestore compatibility
    // Firestore doesn't support nested arrays, so we convert [[lng, lat]] to [{lat, lng}]
    // Use fallback: check both routePath and route properties, default to empty array
    const routeData = (workout.routePath || (workout as any).route || []) as any[];
    let formattedRoutePath: RoutePoint[] = [];
    
    if (Array.isArray(routeData) && routeData.length > 0) {
      try {
        formattedRoutePath = routeData.map((coord: any) => {
          // Handle array format: could be [lng, lat] (Mapbox) or [lat, lng] (legacy)
          if (Array.isArray(coord) && coord.length >= 2) {
            const first = Number(coord[0]);
            const second = Number(coord[1]);
            
            // Detect format: lat is always -90 to 90, lng is -180 to 180
            // If first value is outside lat range, it's likely [lng, lat] (Mapbox format)
            if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
              // [lng, lat] format - swap to {lat, lng}
              return {
                lat: second,
                lng: first
              };
            } else if (Math.abs(first) <= 90 && Math.abs(second) > 90) {
              // [lat, lng] format - use as is
              return {
                lat: first,
                lng: second
              };
            } else {
              // Ambiguous - assume [lng, lat] (Mapbox convention) and swap
              // This handles cases where both values are in valid ranges
              return {
                lat: second,
                lng: first
              };
            }
          } else if (coord && typeof coord === 'object' && 'lat' in coord && 'lng' in coord) {
            // Already in object format - validate and use
            return {
              lat: Number(coord.lat),
              lng: Number(coord.lng)
            };
          }
          throw new Error(`Invalid coordinate format: ${JSON.stringify(coord)}`);
        }).filter((point: RoutePoint) => {
          // Validate coordinates are within valid ranges
          return !isNaN(point.lat) && !isNaN(point.lng) && 
                 point.lat >= -90 && point.lat <= 90 && 
                 point.lng >= -180 && point.lng <= 180;
        });
      } catch (error) {
        console.warn('[WorkoutStorage] Error formatting routePath, using empty array:', error);
        formattedRoutePath = []; // Always use empty array instead of undefined
      }
    } else {
      // Ensure we always have an array, even if empty
      formattedRoutePath = [];
    }

    // Ensure all numeric fields have valid defaults
    const safeDistance = (typeof workout.distance === 'number' && !isNaN(workout.distance)) ? workout.distance : 0;
    const safeDuration = (typeof workout.duration === 'number' && !isNaN(workout.duration)) ? workout.duration : 0;
    const safeCalories = (typeof workout.calories === 'number' && !isNaN(workout.calories)) ? workout.calories : 0;
    const safePace = (typeof workout.pace === 'number' && !isNaN(workout.pace)) ? workout.pace : 0;
    const safeEarnedCoins = (typeof workout.earnedCoins === 'number' && !isNaN(workout.earnedCoins)) ? workout.earnedCoins : 0;

    const workoutData: Omit<WorkoutHistoryEntry, 'id'> = {
      ...workout,
      userId: currentUser.uid, // Always use current user's ID for security
      date: new Date(),
      workoutType: metadata.workoutType,
      category: metadata.category,
      displayIcon: metadata.displayIcon,
      distance: safeDistance,
      duration: safeDuration,
      calories: safeCalories,
      pace: safePace,
      earnedCoins: safeEarnedCoins,
      routePath: formattedRoutePath, // Always an array, never undefined
    };

    console.log('[DB] Saving workout to Firestore...', {
      userId: workoutData.userId,
      workoutType: workoutData.workoutType,
      distance: workoutData.distance,
      duration: workoutData.duration,
      calories: workoutData.calories,
      routePathLength: formattedRoutePath?.length || 0,
    });

    // Save to Firestore with try/catch around the actual save operation.
    // Native Phase: when the network is down (gym/bunker), enqueue to the
    // outbox instead of losing the workout. OutboxFlusher replays it on
    // reconnect, then awards XP via the Guardian (awardWorkoutXP).
    let docRef;
    try {
      docRef = await addDoc(collection(db, 'workouts'), {
      ...workoutData,
      date: serverTimestamp(), // Use server timestamp for consistency
    });
    } catch (saveError) {
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      console.error('❌ [DB] Firestore addDoc error:', saveError, { isOffline });
      try {
        const { enqueueWorkout, generateLocalWorkoutId } = await import(
          '@/lib/outbox/outbox-db'
        );
        const localWorkoutId = generateLocalWorkoutId();
        await enqueueWorkout({
          localWorkoutId,
          uid: workoutData.userId,
          payload: workoutData,
          enqueuedAt: Date.now(),
          attempts: 0,
        });
        console.log(
          `📥 [DB] Workout queued offline (localId=${localWorkoutId}). ` +
          `Will sync on reconnect via OutboxFlusher.`,
        );
        return true;
      } catch (queueError) {
        console.error('❌ [DB] Failed to enqueue workout offline:', queueError);
        throw saveError;
      }
    }

    console.log(`✅ [DB] Workout saved successfully with ID: ${docRef.id} (Type: ${metadata.workoutType}, Category: ${metadata.category}, Icon: ${metadata.displayIcon})`);
    return true;
  } catch (error) {
    console.error('❌ [DB] Error saving workout:', error);
    if (error instanceof Error) {
      console.error('❌ [DB] Error details:', error.message, error.stack);
    }
    return false;
  }
}

/**
 * Convert Firestore Timestamp to Date
 */
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

/**
 * Fetch the last N run or walk sessions for a user, ordered chronologically
 * (oldest → newest), ready for direct use as Recharts chart data.
 *
 * Returns an empty array when the user is offline, has no history, or on error.
 *
 * @param userId       Firestore user ID
 * @param activityType 'running' | 'walking'  (default: 'running')
 * @param limitCount   Max sessions to return (default: 8 — fits a bar chart nicely)
 *
 * @example
 * const trend = await getRunTrend(userId, 'running', 8);
 * const chartData = trend.map((w, i) => ({
 *   session: i + 1,
 *   distance: w.distance,
 *   duration: Math.round(w.duration / 60),
 *   pace: w.pace,
 * }));
 */
export async function getRunTrend(
  userId: string,
  activityType: 'running' | 'walking' = 'running',
  limitCount: number = 8,
): Promise<WorkoutHistoryEntry[]> {
  if (!userId) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];

  try {
    const q = query(
      collection(db, 'workouts'),
      where('userId', '==', userId),
      where('workoutType', '==', activityType),
      orderBy('date', 'desc'),
      limit(limitCount),
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return [];

    const entries: WorkoutHistoryEntry[] = snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          userId: data.userId,
          date: toDate(data.date) || new Date(),
          activityType: data.activityType || activityType,
          workoutType: data.workoutType || activityType,
          category: data.category || 'cardio',
          displayIcon: data.displayIcon || 'run-fast',
          distance: data.distance || 0,
          duration: data.duration || 0,
          calories: data.calories || 0,
          pace: data.pace || 0,
          earnedCoins: data.earnedCoins || 0,
        } as WorkoutHistoryEntry;
      })
      .reverse(); // Chronological order (oldest → newest) for chart x-axis

    console.log(
      `[WorkoutStorage] getRunTrend: ${entries.length} ${activityType} sessions for user ${userId}`,
    );
    return entries;
  } catch (error) {
    console.warn('[WorkoutStorage] getRunTrend failed:', error);
    return [];
  }
}

/**
 * Get user's workout history from Firestore
 */
export async function getWorkoutHistory(userId: string, limitCount: number = 50): Promise<WorkoutHistoryEntry[]> {
  try {
    const q = query(
      collection(db, 'workouts'),
      where('userId', '==', userId),
      orderBy('date', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    const workouts: WorkoutHistoryEntry[] = [];

    snapshot.docs.forEach((docSnap) => {
      try {
      const data = docSnap.data();
        
        // Handle routePath - support both old format [[lat, lng]] and new format [{lat, lng}]
        let routePath: RoutePoint[] | [number, number][] | undefined;
        if (data.routePath && Array.isArray(data.routePath)) {
          // Check if it's the new format (objects) or old format (arrays)
          if (data.routePath.length > 0 && typeof data.routePath[0] === 'object' && 'lat' in data.routePath[0]) {
            // New format: [{lat, lng}]
            routePath = data.routePath as RoutePoint[];
          } else if (Array.isArray(data.routePath[0])) {
            // Old format: [[lat, lng]] - keep as is for backward compatibility
            routePath = data.routePath as [number, number][];
          }
        }
        
      workouts.push({
        id: docSnap.id,
        userId: data.userId,
        date: toDate(data.date) || new Date(),
        activityType: data.activityType || 'running',
        workoutType: data.workoutType || 'running',
        category: data.category || 'cardio',
        displayIcon: data.displayIcon || 'run-fast',
        distance: data.distance || 0,
        duration: data.duration || 0,
        calories: data.calories || 0,
        pace: data.pace || 0,
          routePath: routePath,
        routeId: data.routeId,
        routeName: data.routeName,
        earnedCoins: data.earnedCoins || 0,
        xpEarned: data.xpEarned ?? 0,
      });
      } catch (error) {
        console.error('[WorkoutStorage] Error parsing workout document:', docSnap.id, error);
        // Skip malformed documents instead of crashing
      }
    });

    return workouts;
  } catch (error) {
    console.error('[WorkoutStorage] Error fetching workout history:', error);
    // If index doesn't exist, return empty array instead of failing
    if (error instanceof Error && error.message.includes('index')) {
      console.warn('[WorkoutStorage] Workout history index not found. Returning empty array.');
      return [];
    }
    return [];
  }
}

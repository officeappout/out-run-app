/**
 * Analytics Service
 * Centralized logging and analytics tracking for the app
 */
import { collection, addDoc, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

const ANALYTICS_COLLECTION = 'analytics_events';

/**
 * Event Types
 */
export type AnalyticsEventType =
  | 'app_open'
  | 'app_close'
  | 'login'
  | 'logout'
  | 'onboarding_start'
  | 'onboarding_step_complete'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'workout_start'
  | 'workout_session_started'
  | 'workout_complete'
  | 'workout_abandoned'
  | 'profile_created'
  | 'profile_updated'
  | 'permission_location_status'
  | 'error_occurred';

/**
 * Base Analytics Event Interface
 */
export interface BaseAnalyticsEvent {
  id?: string;
  userId?: string;
  eventName: AnalyticsEventType;
  timestamp: Date;
  sessionId?: string;
  [key: string]: any; // Allow additional params
}

/**
 * Specific Event Type Interfaces
 */
export interface SessionEvent extends BaseAnalyticsEvent {
  eventName: 'app_open' | 'app_close' | 'login' | 'logout';
}

export interface OnboardingStartEvent extends BaseAnalyticsEvent {
  eventName: 'onboarding_start';
  source?: string; // Where they came from (e.g., 'landing_page', 'direct')
}

export interface OnboardingStepCompleteEvent extends BaseAnalyticsEvent {
  eventName: 'onboarding_step_complete' | 'onboarding_step_completed';
  step_name: string;
  step_index?: number; // Order of the step in the flow
  time_spent: number; // seconds
}

export interface OnboardingCompletedEvent extends BaseAnalyticsEvent {
  eventName: 'onboarding_completed';
  total_time_spent?: number; // Total seconds from start to completion
  steps_completed?: number;
}

export interface WorkoutStartEvent extends BaseAnalyticsEvent {
  eventName: 'workout_start' | 'workout_session_started';
  level?: number;
  location?: string;
  workout_type?: string; // e.g., 'running', 'calisthenics'
}

export interface WorkoutCompleteEvent extends BaseAnalyticsEvent {
  eventName: 'workout_complete';
  workout_id?: string;
  duration?: number; // seconds
  calories?: number;
  earned_coins?: number;
}

export interface WorkoutAbandonedEvent extends BaseAnalyticsEvent {
  eventName: 'workout_abandoned';
  workout_id?: string;
  duration_before_abandon?: number; // seconds
}

export interface ProfileEvent extends BaseAnalyticsEvent {
  eventName: 'profile_created' | 'profile_updated';
  profile_fields?: string[]; // Which fields were updated
}

export interface PermissionLocationStatusEvent extends BaseAnalyticsEvent {
  eventName: 'permission_location_status';
  status: 'granted' | 'denied' | 'prompt';
  source?: string; // Where the permission was requested
}

export interface ErrorEvent extends BaseAnalyticsEvent {
  eventName: 'error_occurred';
  error_code: string;
  screen?: string;
  error_message?: string;
}

/**
 * Union type for all event types
 */
export type AnalyticsEvent =
  | SessionEvent
  | OnboardingStartEvent
  | OnboardingStepCompleteEvent
  | OnboardingCompletedEvent
  | WorkoutStartEvent
  | WorkoutCompleteEvent
  | WorkoutAbandonedEvent
  | ProfileEvent
  | PermissionLocationStatusEvent
  | ErrorEvent;

/**
 * Convert Date to Firestore Timestamp
 */
function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

/**
 * Convert Firestore Timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Generate or get current session ID
 */
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server-session';
  
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
}

/**
 * Get user level from stores (with fallback)
 */
function getUserLevel(): number {
  if (typeof window === 'undefined') return 1; // SSR fallback
  
  try {
    // Dynamically import stores to avoid circular dependencies
    // Try to get from user store first (most reliable)
    const userStoreModule = require('@/features/user/identity/store/useUserStore');
    const userStore = userStoreModule.useUserStore?.getState();
    
    if (userStore?.profile?.progression?.globalLevel) {
      const level = userStore.profile.progression.globalLevel;
      if (typeof level === 'number' && level > 0) {
        return level;
      }
    }
    
    // Fallback: try progression store domain level
    try {
      const progressionStoreModule = require('@/features/user/progression/store/useProgressionStore');
      const progressionStore = progressionStoreModule.useProgressionStore?.getState();
      
      if (progressionStore?.domainProgress?.['running']?.level) {
        const level = progressionStore.domainProgress['running'].level;
        if (typeof level === 'number' && level > 0) {
          return level;
        }
      }
    } catch (progError) {
      // Ignore progression store errors
    }
    
    // Default fallback
    return 1;
  } catch (error) {
    console.warn('[Analytics] Could not get user level, defaulting to 1:', error);
    return 1;
  }
}

/**
 * Sanitize object by removing undefined and null values
 */
function sanitizeParams(params: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(params)) {
    // Skip undefined and null values
    if (value !== undefined && value !== null) {
      // Recursively sanitize nested objects
      if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        const nestedSanitized = sanitizeParams(value);
        // Only include if nested object has at least one property
        if (Object.keys(nestedSanitized).length > 0) {
          sanitized[key] = nestedSanitized;
        }
      } else {
        sanitized[key] = value;
      }
    }
  }
  
  return sanitized;
}

/**
 * Log an analytics event
 * @param eventName Name of the event
 * @param params Additional parameters for the event
 */
export async function logEvent(
  eventName: AnalyticsEventType,
  params: Record<string, any> = {}
): Promise<boolean> {
  try {
    const currentUser = auth.currentUser;
    const userId = currentUser?.uid || undefined;
    const sessionId = getSessionId();

    // Get user level if not provided in params (for workout events)
    let level = params.level;
    if (level === undefined && (
      eventName === 'workout_start' || 
      eventName === 'workout_session_started' ||
      eventName === 'workout_complete'
    )) {
      level = getUserLevel();
    }

    const eventData: Omit<BaseAnalyticsEvent, 'id'> = {
      userId,
      eventName,
      timestamp: new Date(),
      sessionId,
      ...params,
      // Override level if we fetched it
      ...(level !== undefined ? { level } : {}),
    };

    // Sanitize params to remove undefined/null values before sending to Firestore
    const sanitizedParams = sanitizeParams(eventData);

    // Convert Date to Timestamp for Firestore
    const firestoreData = {
      ...sanitizedParams,
      timestamp: toTimestamp(eventData.timestamp),
    };

    await addDoc(collection(db, ANALYTICS_COLLECTION), firestoreData);
    
    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics]', eventName, sanitizedParams);
    }

    return true;
  } catch (error) {
    console.error('[Analytics] Error logging analytics event:', error);
    // Don't throw - analytics failures shouldn't break the app
    return false;
  }
}

/**
 * Get user's analytics events
 * @param userId User ID to get events for
 * @param eventTypes Optional filter by event types
 * @param limit Maximum number of events to return
 */
export async function getUserEvents(
  userId: string,
  eventTypes?: AnalyticsEventType[],
  limitCount: number = 50
): Promise<AnalyticsEvent[]> {
  try {
    let q = query(
      collection(db, ANALYTICS_COLLECTION),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    // If filtering by event types, add where clause
    // Note: Firestore only allows one 'in' query, so we handle this client-side if multiple types
    if (eventTypes && eventTypes.length === 1) {
      q = query(
        collection(db, ANALYTICS_COLLECTION),
        where('userId', '==', userId),
        where('eventName', '==', eventTypes[0]),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);
    const events: AnalyticsEvent[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      events.push({
        id: doc.id,
        ...data,
        timestamp: toDate(data.timestamp) || new Date(),
      } as AnalyticsEvent);
    });

    // Filter by event types if multiple were provided
    if (eventTypes && eventTypes.length > 1) {
      return events.filter((e) => eventTypes.includes(e.eventName)).slice(0, limitCount);
    }

    return events;
  } catch (error) {
    console.error('Error fetching user events:', error);
    // If index doesn't exist, return empty array
    if (error instanceof Error && error.message.includes('index')) {
      console.warn('Analytics index not found. Returning empty array.');
      return [];
    }
    throw error;
  }
}

/**
 * Get all events (admin only - requires proper auth checks)
 */
export async function getAllEvents(limitCount: number = 1000): Promise<AnalyticsEvent[]> {
  try {
    const q = query(
      collection(db, ANALYTICS_COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const events: AnalyticsEvent[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      events.push({
        id: doc.id,
        ...data,
        timestamp: toDate(data.timestamp) || new Date(),
      } as AnalyticsEvent);
    });

    return events;
  } catch (error) {
    console.error('Error fetching all events:', error);
    throw error;
  }
}

/**
 * Convenience functions for common events
 */
export const Analytics = {
  // Session events
  logAppOpen: () => logEvent('app_open'),
  logAppClose: () => logEvent('app_close'),
  logLogin: (method?: string) => logEvent('login', { method }),
  logLogout: () => logEvent('logout'),

  // Onboarding events
  logOnboardingStart: (source?: string) =>
    logEvent('onboarding_start', { source }),
  logOnboardingStepComplete: (stepName: string, timeSpent: number, stepIndex?: number) =>
    logEvent('onboarding_step_completed', { step_name: stepName, step_index: stepIndex, time_spent: timeSpent }),
  logOnboardingCompleted: (totalTimeSpent?: number, stepsCompleted?: number) =>
    logEvent('onboarding_completed', { total_time_spent: totalTimeSpent, steps_completed: stepsCompleted }),

  // Workout events
  logWorkoutStart: (location?: string) =>
    logEvent('workout_start', { location }),
  logWorkoutSessionStarted: (routeId?: string, workoutType?: string, activityType?: string) =>
    logEvent('workout_session_started', { route_id: routeId, workout_type: workoutType, activity_type: activityType }),
  logWorkoutComplete: (workoutId?: string, duration?: number, calories?: number, earnedCoins?: number) =>
    logEvent('workout_complete', { workout_id: workoutId, duration, calories, earned_coins: earnedCoins }),
  logWorkoutAbandoned: (workoutId?: string, durationBeforeAbandon?: number) =>
    logEvent('workout_abandoned', { workout_id: workoutId, duration_before_abandon: durationBeforeAbandon }),

  // Profile events
  logProfileCreated: (fields?: string[]) =>
    logEvent('profile_created', { profile_fields: fields }),
  logProfileUpdated: (fields?: string[]) =>
    logEvent('profile_updated', { profile_fields: fields }),

  // Permission events
  logPermissionLocationStatus: (status: 'granted' | 'denied' | 'prompt', source?: string) =>
    logEvent('permission_location_status', { status, source }),

  // Error events
  logError: (errorCode: string, screen?: string, errorMessage?: string) =>
    logEvent('error_occurred', { error_code: errorCode, screen, error_message: errorMessage }),
};

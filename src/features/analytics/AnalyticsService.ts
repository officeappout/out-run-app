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
  | 'onboarding_step_complete'
  | 'workout_start'
  | 'workout_complete'
  | 'workout_abandoned'
  | 'profile_created'
  | 'profile_updated'
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

export interface OnboardingStepCompleteEvent extends BaseAnalyticsEvent {
  eventName: 'onboarding_step_complete';
  step_name: string;
  time_spent: number; // seconds
}

export interface WorkoutStartEvent extends BaseAnalyticsEvent {
  eventName: 'workout_start';
  level?: number;
  location?: string;
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
  | OnboardingStepCompleteEvent
  | WorkoutStartEvent
  | WorkoutCompleteEvent
  | WorkoutAbandonedEvent
  | ProfileEvent
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

    const eventData: Omit<BaseAnalyticsEvent, 'id'> = {
      userId,
      eventName,
      timestamp: new Date(),
      sessionId,
      ...params,
    };

    // Convert Date to Timestamp for Firestore
    const firestoreData = {
      ...eventData,
      timestamp: toTimestamp(eventData.timestamp),
    };

    await addDoc(collection(db, ANALYTICS_COLLECTION), firestoreData);
    
    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics]', eventName, params);
    }

    return true;
  } catch (error) {
    console.error('Error logging analytics event:', error);
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
  logOnboardingStepComplete: (stepName: string, timeSpent: number) =>
    logEvent('onboarding_step_complete', { step_name: stepName, time_spent: timeSpent }),

  // Workout events
  logWorkoutStart: (level?: number, location?: string) =>
    logEvent('workout_start', { level, location }),
  logWorkoutComplete: (workoutId?: string, duration?: number, calories?: number, earnedCoins?: number) =>
    logEvent('workout_complete', { workout_id: workoutId, duration, calories, earned_coins: earnedCoins }),
  logWorkoutAbandoned: (workoutId?: string, durationBeforeAbandon?: number) =>
    logEvent('workout_abandoned', { workout_id: workoutId, duration_before_abandon: durationBeforeAbandon }),

  // Profile events
  logProfileCreated: (fields?: string[]) =>
    logEvent('profile_created', { profile_fields: fields }),
  logProfileUpdated: (fields?: string[]) =>
    logEvent('profile_updated', { profile_fields: fields }),

  // Error events
  logError: (errorCode: string, screen?: string, errorMessage?: string) =>
    logEvent('error_occurred', { error_code: errorCode, screen, error_message: errorMessage }),
};

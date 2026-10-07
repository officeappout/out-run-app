/**
 * Analytics Service
 * Centralized logging and analytics tracking for the app
 */
import { collection, addDoc, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { isCustomAnalyticsAllowed } from './consent';

const ANALYTICS_COLLECTION = 'analytics_events';

/**
 * Event Types
 */
/**
 * Event-instrumentation audit (06.10.2026, see the Journey Hub arc's
 * project memory) found 12 of the previously-declared values here had
 * ZERO call sites anywhere in `src/` or `functions/` — either never
 * wired in the first place ('workout_detail_viewed', 'screen_view',
 * 'session_start', 'session_end' — declared per the taxonomy doc's
 * naming convention but their instrumentation points were never
 * identified) or wired once and later orphaned when their call sites
 * were removed ('app_open', 'app_close', 'login', 'logout',
 * 'workout_start', 'workout_abandoned', 'profile_created',
 * 'profile_updated'). Removed per David's explicit "de-clutter the
 * taxonomy" instruction. If any of these need re-adding later (Phase 2
 * instrumentation build), re-add the literal AND wire a real call site
 * in the same change — don't let the type and the code drift again.
 *
 * NOTE for admin-timeline readers: any historical `analytics_events`
 * Firestore doc with one of these 12 old eventName values (if any exist
 * from before its call site was removed) will now render with the
 * generic "פעילות לא מזוהה" fallback in the admin user-detail timeline
 * instead of its old specific label — see that page's own comment.
 */
export type AnalyticsEventType =
  | 'onboarding_start'
  | 'onboarding_step_complete'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'workout_session_started'
  | 'workout_complete'
  | 'permission_location_status'
  | 'error_occurred'
  // ── Journey-hub Phase 1 seed events (docs/analytics/event-taxonomy.md) ──
  // Both WIRED (home-screen carousel, src/app/home/page.tsx).
  | 'recommendation_shown'
  | 'workout_play_pressed'
  // ── Journey Hub Phase 2 (07.10.2026) — the missing middle of the funnel ──
  // 'workout_detail_viewed' re-added here (removed as dead in the Phase 0
  // cleanup above, now wired for real — see WorkoutPreviewDrawer.tsx's own
  // isOpen-gated effect). 'workout_start_pressed' is new: a SINGLE event
  // for every primary "start" tap, carrying `surface` the same way
  // recommendation_shown/workout_play_pressed already do, rather than one
  // event per entry point. 'workout_abandoned' is explicitly NOT added —
  // see docs/analytics/event-taxonomy.md and the Phase 2 investigation:
  // it can't be detected consistently with isRealWorkoutCompletion today.
  | 'workout_detail_viewed'
  | 'workout_start_pressed'
  // ── Reminder-schedule build (scheduling-capability-audit.md Part A) ──
  // 'reminder_set' fires the first time a user ever adds a reminder slot
  // (0 -> 1); 'reminder_updated' fires on every subsequent add or remove
  // once they already have at least one — distinguishes first-commitment
  // from ongoing management, same split growth-metrics uses elsewhere.
  | 'reminder_set'
  | 'reminder_updated';

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
  eventName: 'workout_session_started';
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
 * Journey-hub Phase 1 (docs/analytics/event-taxonomy.md §4). Fields are
 * what `Suggestion` (suggestion.types.ts) actually carries at the moment
 * a card is shown/tapped — NOT the plan doc's original illustrative
 * `{level, equipment}` shape, which don't exist on that type. `difficulty`
 * (1|2|3) is the real available proxy for "level"; `equipment` isn't
 * reliably available at this point (would need the optional, sometimes-
 * absent `preview` field) so it's omitted rather than faked.
 */
export interface RecommendationShownEvent extends BaseAnalyticsEvent {
  eventName: 'recommendation_shown';
  workout_id: string;
  suggestion_type: string; // Suggestion['type'] — daily_workout | post_workout | program_recommendation | micro_nudge
  generator_id: string;
  difficulty: 1 | 2 | 3;
  surface: string; // which UI surface shown on — reuses UserContextSurface's existing vocabulary (user-context.types.ts), e.g. 'home'
}

export interface WorkoutPlayPressedEvent extends BaseAnalyticsEvent {
  eventName: 'workout_play_pressed';
  workout_id: string;
  generator_id: string;
  surface: string;
}

/**
 * Journey Hub Phase 2 (07.10.2026). Fired once per drawer open, from
 * WorkoutPreviewDrawer.tsx's own isOpen-gated effect — the highest-
 * priority event in this phase since the black-box drill-down's funnel
 * depends on it.
 */
export interface WorkoutDetailViewedEvent extends BaseAnalyticsEvent {
  eventName: 'workout_detail_viewed';
  workout_id: string;
  surface: string;
}

/**
 * Journey Hub Phase 2 (07.10.2026). ONE event for the primary "start a
 * workout" tap, with `surface` distinguishing which entry point fired it
 * — NOT a separate event per surface. Fired from useWorkoutSession.ts's
 * handleStartWorkout, conditionally on `surface` being supplied by the
 * caller (the 2 drawer-bypass starts — HOME_RECOVERY_START_SHORTCUT,
 * post-workout-suggestion direct-start — deliberately don't pass one,
 * so they stay uninstrumented per this phase's scope).
 */
export interface WorkoutStartPressedEvent extends BaseAnalyticsEvent {
  eventName: 'workout_start_pressed';
  workout_id: string;
  surface: string;
}

export interface ReminderScheduleEvent extends BaseAnalyticsEvent {
  eventName: 'reminder_set' | 'reminder_updated';
  day: string;
  time: string;
  action: 'add' | 'remove';
  total_reminders: number;
}

/**
 * Union type for all event types
 */
export type AnalyticsEvent =
  | OnboardingStartEvent
  | OnboardingStepCompleteEvent
  | OnboardingCompletedEvent
  | WorkoutStartEvent
  | WorkoutCompleteEvent
  | PermissionLocationStatusEvent
  | ErrorEvent
  | RecommendationShownEvent
  | WorkoutPlayPressedEvent
  | WorkoutDetailViewedEvent
  | WorkoutStartPressedEvent
  | ReminderScheduleEvent;

/**
 * Convert Date to Firestore Timestamp
 */
function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
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
  // Compliance Phase 5.1 — honour user analytics opt-out before any
  // Firestore write. Fail-OPEN if the store is unavailable so a hydration
  // race never silently kills our funnels.
  if (!isCustomAnalyticsAllowed()) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics] suppressed (user opted out):', eventName);
    }
    return false;
  }

  try {
    const currentUser = auth.currentUser;
    const userId = currentUser?.uid || undefined;
    const sessionId = getSessionId();

    // Get user level if not provided in params (for workout events)
    let level = params.level;
    if (level === undefined && (
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
  // Onboarding events
  logOnboardingStart: (source?: string) =>
    logEvent('onboarding_start', { source }),
  logOnboardingStepComplete: (stepName: string, timeSpent: number, stepIndex?: number) =>
    logEvent('onboarding_step_completed', { step_name: stepName, step_index: stepIndex, time_spent: timeSpent }),
  logOnboardingCompleted: (totalTimeSpent?: number, stepsCompleted?: number) =>
    logEvent('onboarding_completed', { total_time_spent: totalTimeSpent, steps_completed: stepsCompleted }),

  // Workout events
  logWorkoutSessionStarted: (routeId?: string, workoutType?: string, activityType?: string) =>
    logEvent('workout_session_started', { route_id: routeId, workout_type: workoutType, activity_type: activityType }),
  logWorkoutComplete: (workoutId?: string, duration?: number, calories?: number, earnedCoins?: number) =>
    logEvent('workout_complete', { workout_id: workoutId, duration, calories, earned_coins: earnedCoins }),

  // Permission events
  logPermissionLocationStatus: (status: 'granted' | 'denied' | 'prompt', source?: string) =>
    logEvent('permission_location_status', { status, source }),

  // Error events
  logError: (errorCode: string, screen?: string, errorMessage?: string) =>
    logEvent('error_occurred', { error_code: errorCode, screen, error_message: errorMessage }),

  // Journey-hub Phase 1 seed events (docs/analytics/event-taxonomy.md)
  logRecommendationShown: (opts: {
    workoutId: string;
    suggestionType: string;
    generatorId: string;
    difficulty: 1 | 2 | 3;
    surface: string;
  }) =>
    logEvent('recommendation_shown', {
      workout_id: opts.workoutId,
      suggestion_type: opts.suggestionType,
      generator_id: opts.generatorId,
      difficulty: opts.difficulty,
      surface: opts.surface,
    }),
  logWorkoutPlayPressed: (opts: { workoutId: string; generatorId: string; surface: string }) =>
    logEvent('workout_play_pressed', {
      workout_id: opts.workoutId,
      generator_id: opts.generatorId,
      surface: opts.surface,
    }),

  // Journey Hub Phase 2 (07.10.2026).
  logWorkoutDetailViewed: (opts: { workoutId: string; surface: string }) =>
    logEvent('workout_detail_viewed', {
      workout_id: opts.workoutId,
      surface: opts.surface,
    }),
  logWorkoutStartPressed: (opts: { workoutId: string; surface: string }) =>
    logEvent('workout_start_pressed', {
      workout_id: opts.workoutId,
      surface: opts.surface,
    }),

  // Reminder-schedule build (scheduling-capability-audit.md Part A).
  logReminderSchedule: (opts: {
    day: string;
    time: string;
    action: 'add' | 'remove';
    totalReminders: number;
  }) =>
    logEvent(opts.action === 'add' && opts.totalReminders === 1 ? 'reminder_set' : 'reminder_updated', {
      day: opts.day,
      time: opts.time,
      action: opts.action,
      total_reminders: opts.totalReminders,
    }),
};

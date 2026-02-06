/**
 * useSmartGreeting Hook
 * 
 * Provides context-aware greeting messages for the home screen.
 * Reads from the MessageService which syncs with Admin panel changes.
 * 
 * Context Logic:
 * - If user just completed a workout → 'post_workout'
 * - If user quit workout early → 'partial_workout'
 * - If user hasn't worked out in 7+ days → 're_engagement'
 * - If user set a personal record → 'pr_record'
 * - If user reached a streak milestone → 'streak_milestone'
 * - If user leveled up → 'level_up'
 * - If first ever workout → 'first_workout'
 * - Default greeting otherwise
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  messageService, 
  type SmartMessage, 
  type MessageType,
  type MessageContext,
  DEFAULT_MESSAGES,
} from '../services/MessageService';

// ============================================================================
// TYPES
// ============================================================================

export interface GreetingContext {
  /** Whether user just completed a workout */
  workoutCompleted?: boolean;
  /** Whether the workout was partial (quit early) */
  isPartial?: boolean;
  /** Days since last workout */
  daysSinceLastWorkout?: number;
  /** Whether user set a personal record */
  hasPersonalRecord?: boolean;
  /** Current workout streak */
  streak?: number;
  /** Whether user just leveled up */
  justLeveledUp?: boolean;
  /** Whether this is user's first workout */
  isFirstWorkout?: boolean;
  /** User's persona/lifestyle tags (e.g., 'parent', 'athlete') */
  persona?: string;
  /** User's lifestyle tags - for multi-lifestyle support */
  lifestyles?: string[];
  /** User's current level */
  level?: number;
  /** User's active program name */
  program?: string;
  /** User's display name */
  userName?: string;
}

export interface SmartGreetingResult {
  /** The selected message */
  message: SmartMessage;
  /** The determined message type */
  type: MessageType;
  /** Whether still loading */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Manually refresh the message */
  refresh: () => void;
  /** Get a specific message type */
  getMessageForType: (type: MessageType) => SmartMessage;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const INACTIVITY_THRESHOLD_DAYS = 7;
const STREAK_MILESTONE_INTERVALS = [3, 7, 14, 30, 60, 100];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine the message type based on context
 */
function determineMessageType(context: GreetingContext): MessageType {
  // Priority order (highest to lowest)
  
  // 1. First workout ever
  if (context.isFirstWorkout) {
    return 'first_workout';
  }
  
  // 2. Personal record
  if (context.hasPersonalRecord) {
    return 'pr_record';
  }
  
  // 3. Level up
  if (context.justLeveledUp) {
    return 'level_up';
  }
  
  // 4. Workout completed
  if (context.workoutCompleted && !context.isPartial) {
    // Check for streak milestone
    if (context.streak && STREAK_MILESTONE_INTERVALS.includes(context.streak)) {
      return 'streak_milestone';
    }
    return 'post_workout';
  }
  
  // 5. Partial workout
  if (context.isPartial) {
    return 'partial_workout';
  }
  
  // 6. Re-engagement (inactive for too long)
  if (context.daysSinceLastWorkout && context.daysSinceLastWorkout >= INACTIVITY_THRESHOLD_DAYS) {
    return 're_engagement';
  }
  
  // 7. Default greeting
  return 'default';
}

/**
 * Parse URL search params for context flags
 */
function parseSearchParams(searchParams: URLSearchParams): Partial<GreetingContext> {
  const context: Partial<GreetingContext> = {};
  
  if (searchParams.get('workout_completed') === 'true') {
    context.workoutCompleted = true;
  }
  
  if (searchParams.get('is_partial') === 'true') {
    context.isPartial = true;
  }
  
  if (searchParams.get('pr') === 'true') {
    context.hasPersonalRecord = true;
  }
  
  if (searchParams.get('level_up') === 'true') {
    context.justLeveledUp = true;
  }
  
  if (searchParams.get('first_workout') === 'true') {
    context.isFirstWorkout = true;
  }
  
  const streak = searchParams.get('streak');
  if (streak) {
    context.streak = parseInt(streak, 10);
  }
  
  return context;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Smart greeting hook that provides context-aware messages
 * 
 * @param explicitContext - Optional explicit context (overrides URL params)
 * @returns SmartGreetingResult with message and utilities
 * 
 * @example
 * // Basic usage - auto-detects context from URL
 * const { message, type, isLoading } = useSmartGreeting();
 * 
 * @example
 * // With explicit context
 * const { message } = useSmartGreeting({
 *   workoutCompleted: true,
 *   streak: 7,
 * });
 */
export function useSmartGreeting(explicitContext?: Partial<GreetingContext>): SmartGreetingResult {
  const searchParams = useSearchParams();
  
  const [message, setMessage] = useState<SmartMessage>(DEFAULT_MESSAGES.default[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Merge URL params with explicit context
  const context = useMemo((): GreetingContext => {
    const fromUrl = searchParams ? parseSearchParams(searchParams) : {};
    return { ...fromUrl, ...explicitContext };
  }, [searchParams, explicitContext]);
  
  // Determine the message type
  const messageType = useMemo(() => determineMessageType(context), [context]);
  
  // Fetch the message
  const fetchMessage = useCallback(() => {
    setIsLoading(true);
    setError(null);
    
    try {
      const msgContext: MessageContext = {
        type: messageType,
        persona: context.persona,
        streak: context.streak,
        isPersonalRecord: context.hasPersonalRecord,
      };
      
      const selectedMessage = messageService.getLocalBestMessage(msgContext);
      setMessage(selectedMessage);
    } catch (err) {
      console.error('[useSmartGreeting] Error fetching message:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch message'));
      // Fallback to default
      const defaults = DEFAULT_MESSAGES[messageType] || DEFAULT_MESSAGES.default;
      setMessage(defaults[Math.floor(Math.random() * defaults.length)]);
    } finally {
      setIsLoading(false);
    }
  }, [messageType, context.persona, context.streak, context.hasPersonalRecord]);
  
  // Initial fetch and subscribe to changes
  useEffect(() => {
    fetchMessage();
    
    // Subscribe to localStorage changes (when admin updates)
    const unsubscribe = messageService.subscribeToLocalMessages(() => {
      fetchMessage();
    });
    
    return unsubscribe;
  }, [fetchMessage, refreshKey]);
  
  // Refresh function
  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);
  
  // Get message for specific type
  const getMessageForType = useCallback((type: MessageType): SmartMessage => {
    return messageService.getLocalBestMessage({ type, persona: context.persona });
  }, [context.persona]);
  
  return {
    message,
    type: messageType,
    isLoading,
    error,
    refresh,
    getMessageForType,
  };
}

/**
 * Simple hook to get a message for a specific type
 * 
 * @example
 * const message = useSmartMessage('post_workout');
 */
export function useSmartMessage(type: MessageType, persona?: string): SmartMessage {
  const [message, setMessage] = useState<SmartMessage>(DEFAULT_MESSAGES[type]?.[0] || DEFAULT_MESSAGES.default[0]);
  
  useEffect(() => {
    const msg = messageService.getLocalBestMessage({ type, persona });
    setMessage(msg);
    
    // Subscribe to changes
    const unsubscribe = messageService.subscribeToLocalMessages(() => {
      const updated = messageService.getLocalBestMessage({ type, persona });
      setMessage(updated);
    });
    
    return unsubscribe;
  }, [type, persona]);
  
  return message;
}

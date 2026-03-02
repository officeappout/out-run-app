'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ExecutionMethod } from '../../../core/exercise.types';

/**
 * Storage format for execution methods draft
 */
interface MethodsDraftStorage {
  methods: ExecutionMethod[];
  savedAt: string; // ISO timestamp
  exerciseId: string;
  version: number; // for future migration
}

interface UseMethodsAutosaveOptions {
  /** Debounce delay in milliseconds (default: 2000) */
  debounceMs?: number;
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean;
}

interface UseMethodsAutosaveReturn {
  /** Load draft data from localStorage */
  loadDraft: () => ExecutionMethod[] | null;
  /** Clear draft from localStorage */
  clearDraft: () => void;
  /** Manually trigger a save immediately */
  saveNow: () => void;
}

const STORAGE_VERSION = 1;
const STORAGE_KEY_PREFIX = 'exercise-methods-draft-';

/**
 * useMethodsAutosave Hook
 * 
 * Provides silent localStorage-based autosave for execution methods
 * to prevent data loss during crashes. Operates independently from
 * the Firestore draft system.
 * 
 * @param methods - Current execution methods array
 * @param exerciseId - Exercise ID (null for new exercises)
 * @param options - Configuration options
 */
export function useMethodsAutosave(
  methods: ExecutionMethod[],
  exerciseId: string | null,
  options: UseMethodsAutosaveOptions = {}
): UseMethodsAutosaveReturn {
  const { debounceMs = 2000, enabled = true } = options;

  // Refs for debouncing and tracking
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const isInitialMountRef = useRef(true);

  /**
   * Get localStorage key for this exercise
   */
  const getStorageKey = useCallback((): string | null => {
    if (!exerciseId) return null;
    return `${STORAGE_KEY_PREFIX}${exerciseId}`;
  }, [exerciseId]);

  /**
   * Check if localStorage is available (SSR safety)
   */
  const isLocalStorageAvailable = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  };

  /**
   * Save methods to localStorage
   */
  const saveToLocalStorage = useCallback((methodsToSave: ExecutionMethod[]) => {
    const key = getStorageKey();
    if (!key || !isLocalStorageAvailable() || !enabled) return;

    try {
      const storage: MethodsDraftStorage = {
        methods: methodsToSave,
        savedAt: new Date().toISOString(),
        exerciseId: exerciseId!,
        version: STORAGE_VERSION,
      };

      const serialized = JSON.stringify(storage);

      // Skip if data hasn't changed
      if (serialized === lastSavedDataRef.current) {
        return;
      }

      localStorage.setItem(key, serialized);
      lastSavedDataRef.current = serialized;
      
      console.log('[useMethodsAutosave] Draft saved to localStorage', {
        exerciseId,
        methodCount: methodsToSave.length,
        timestamp: storage.savedAt,
      });
    } catch (error: any) {
      // Handle QuotaExceededError gracefully
      if (error.name === 'QuotaExceededError') {
        console.warn('[useMethodsAutosave] localStorage quota exceeded. Draft not saved.');
      } else {
        console.error('[useMethodsAutosave] Error saving to localStorage:', error);
      }
    }
  }, [exerciseId, getStorageKey, enabled]);

  /**
   * Load draft from localStorage
   */
  const loadDraft = useCallback((): ExecutionMethod[] | null => {
    const key = getStorageKey();
    if (!key || !isLocalStorageAvailable()) return null;

    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const parsed: MethodsDraftStorage = JSON.parse(stored);

      // Validate storage format
      if (!parsed.methods || !Array.isArray(parsed.methods)) {
        console.warn('[useMethodsAutosave] Invalid draft format, clearing...');
        clearDraft();
        return null;
      }

      // Check version compatibility (for future migrations)
      if (parsed.version !== STORAGE_VERSION) {
        console.warn('[useMethodsAutosave] Draft version mismatch, clearing...');
        clearDraft();
        return null;
      }

      console.log('[useMethodsAutosave] Draft loaded from localStorage', {
        exerciseId: parsed.exerciseId,
        methodCount: parsed.methods.length,
        savedAt: parsed.savedAt,
      });

      return parsed.methods;
    } catch (error) {
      console.error('[useMethodsAutosave] Error loading draft, clearing corrupt data:', error);
      clearDraft();
      return null;
    }
  }, [getStorageKey]);

  /**
   * Clear draft from localStorage
   */
  const clearDraft = useCallback(() => {
    const key = getStorageKey();
    if (!key || !isLocalStorageAvailable()) return;

    try {
      localStorage.removeItem(key);
      lastSavedDataRef.current = '';
      console.log('[useMethodsAutosave] Draft cleared from localStorage', { exerciseId });
    } catch (error) {
      console.error('[useMethodsAutosave] Error clearing draft:', error);
    }
  }, [exerciseId, getStorageKey]);

  /**
   * Manually trigger save immediately
   */
  const saveNow = useCallback(() => {
    if (!exerciseId || !enabled) return;
    saveToLocalStorage(methods);
  }, [exerciseId, enabled, methods, saveToLocalStorage]);

  /**
   * Debounced auto-save effect
   */
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (!exerciseId || !enabled || methods.length === 0) return;

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      saveToLocalStorage(methods);
    }, debounceMs);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [methods, exerciseId, enabled, debounceMs, saveToLocalStorage]);

  return {
    loadDraft,
    clearDraft,
    saveNow,
  };
}

export default useMethodsAutosave;

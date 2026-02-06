'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ExerciseFormData } from '../../core/exercise.types';
import { saveExerciseDraft, getExerciseDraft, ExerciseDraft } from '../../core/exercise.service';

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutoSaveState {
  status: DraftStatus;
  lastSavedAt: Date | null;
  error: string | null;
}

interface UseAutoSaveDraftOptions {
  /** Exercise ID (required for saving) */
  exerciseId: string | null;
  /** Debounce delay in milliseconds (default: 2000) */
  debounceMs?: number;
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean;
}

interface UseAutoSaveDraftReturn {
  /** Current auto-save state */
  state: AutoSaveState;
  /** Manually trigger a save */
  saveNow: () => Promise<void>;
  /** Load draft data if it exists */
  loadDraft: () => Promise<ExerciseDraft | null>;
  /** Check if there's a draft */
  hasDraft: boolean;
  /** Set hasDraft state (for external control) */
  setHasDraft: (value: boolean) => void;
}

/**
 * useAutoSaveDraft Hook
 * 
 * Provides automatic draft saving with debounce for the exercise editor.
 * Saves form data to a `draft` field in Firestore without affecting live data.
 */
export function useAutoSaveDraft(
  formData: ExerciseFormData,
  options: UseAutoSaveDraftOptions
): UseAutoSaveDraftReturn {
  const { exerciseId, debounceMs = 2000, enabled = true } = options;
  
  const [state, setState] = useState<AutoSaveState>({
    status: 'idle',
    lastSavedAt: null,
    error: null,
  });
  
  const [hasDraft, setHasDraft] = useState(false);
  
  // Refs for debouncing
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const isInitialMountRef = useRef(true);
  
  // Save function
  const saveNow = useCallback(async () => {
    if (!exerciseId || !enabled) return;
    
    const currentData = JSON.stringify(formData);
    
    // Skip if data hasn't changed
    if (currentData === lastSavedDataRef.current) {
      return;
    }
    
    setState((prev) => ({ ...prev, status: 'saving', error: null }));
    
    try {
      await saveExerciseDraft(exerciseId, formData);
      
      lastSavedDataRef.current = currentData;
      setHasDraft(true);
      
      setState({
        status: 'saved',
        lastSavedAt: new Date(),
        error: null,
      });
    } catch (error: any) {
      console.error('Auto-save failed:', error);
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: error.message || 'שגיאה בשמירת טיוטה',
      }));
    }
  }, [exerciseId, formData, enabled]);
  
  // Load draft function
  const loadDraft = useCallback(async (): Promise<ExerciseDraft | null> => {
    if (!exerciseId) return null;
    
    try {
      const draft = await getExerciseDraft(exerciseId);
      if (draft) {
        setHasDraft(true);
        setState((prev) => ({
          ...prev,
          lastSavedAt: draft.savedAt,
        }));
      }
      return draft;
    } catch (error) {
      console.error('Error loading draft:', error);
      return null;
    }
  }, [exerciseId]);
  
  // Debounced auto-save effect
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    
    if (!exerciseId || !enabled) return;
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      saveNow();
    }, debounceMs);
    
    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [formData, exerciseId, enabled, debounceMs, saveNow]);
  
  // Check for existing draft on mount
  useEffect(() => {
    if (exerciseId) {
      loadDraft();
    }
  }, [exerciseId, loadDraft]);
  
  return {
    state,
    saveNow,
    loadDraft,
    hasDraft,
    setHasDraft,
  };
}

export default useAutoSaveDraft;

'use client';

// Force dynamic rendering to prevent SSR issues
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import StrengthRunner from '@/features/workout-engine/players/strength/StrengthRunner';
import { WorkoutPlan, Exercise as WorkoutExercise } from '@/features/parks';
import { getAllExercises, Exercise as FirestoreExercise, getLocalizedText, findMethodForLocation } from '@/features/content/exercises';
import { 
  StrengthDopamineScreen, 
  StrengthSummaryPage,
  type CompletedExercise,
  type Difficulty,
} from '@/features/workout-engine/components/strength';

// ============================================================================
// TYPES
// ============================================================================

/** Flow state for workout completion journey */
type FlowState = 'active' | 'dopamine' | 'summary';

/** Workout stats preserved between flow steps */
interface WorkoutStats {
  duration: number;           // Total workout duration in seconds
  totalReps: number;          // Sum of all reps
  completedExercises: CompletedExercise[];
  difficulty: Difficulty;
  startTime: number;          // Timestamp when workout started
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Helper to extract localized text from various formats
 */
function extractLocalizedText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.he || value.en || '';
  }
  return String(value);
}

/**
 * Helper to extract highlights array from content
 */
function extractHighlights(content: any): string[] {
  if (!content?.highlights) return [];
  if (!Array.isArray(content.highlights)) return [];
  return content.highlights.map((h: any) => {
    if (typeof h === 'string') return h;
    if (typeof h === 'object' && h !== null) {
      return h.he || h.en || String(h);
    }
    return String(h || '');
  });
}

/**
 * Convert Firestore Exercise to enriched WorkoutExercise
 * This ensures all metadata is included in the workout plan
 * 
 * DYNAMIC VALUES: Uses Firestore values if present, falls back to segment target
 * LOCATION-AWARE: Resolves video/image from the execution_method matching the active location
 */
function enrichExercise(
  ex: FirestoreExercise, 
  segmentRole: 'warmup' | 'main' | 'cooldown',
  segmentTarget?: { type: 'reps' | 'time'; value: number },
  workoutLocation?: string,
): WorkoutExercise {
  // Location-aware media resolution: select the execution_method matching the workout's location
  const method = findMethodForLocation(ex, workoutLocation);
  const videoUrl = method?.media?.mainVideoUrl || ex.media?.videoUrl || undefined;
  const imageUrl = method?.media?.imageUrl || videoUrl || ex.media?.imageUrl || undefined;

  // Extract goal/description
  const goal = extractLocalizedText(ex.content?.description) || 
               extractLocalizedText(ex.content?.goal) ||
               '';

  // Extract highlights
  const highlights = extractHighlights(ex.content);

  // Determine exercise type
  const exerciseType = ex.type === 'time' ? 'time' : 'reps';

  // Determine if follow-along
  const isFollowAlong = 
    ex.isFollowAlong === true ||
    segmentRole === 'warmup' ||
    segmentRole === 'cooldown';

  // DYNAMIC REPS/DURATION: ONLY set if exists in Firestore or segment target
  // NO hardcoded values - the algorithm controls everything
  let reps: string | undefined = undefined;
  let duration: string | undefined = undefined;

  // REPS: Only for reps-type exercises, never for time-type (like Plank)
  if (exerciseType === 'reps') {
    // Check if exercise has its own reps value from Firestore
    const firestoreReps = (ex as any).reps || (ex as any).defaultReps;
    if (firestoreReps) {
      // Use Firestore value (could be number or string)
      const repsValue = typeof firestoreReps === 'number' ? firestoreReps : parseInt(String(firestoreReps), 10);
      reps = isNaN(repsValue) ? String(firestoreReps) : `${repsValue} חזרות`;
    } else if (segmentTarget?.type === 'reps' && segmentTarget?.value) {
      // Fallback to segment target value
      reps = `${segmentTarget.value} חזרות`;
    }
    // If no reps found, leave undefined - UI will handle it
  }

  // DURATION: Only for time-type exercises or follow-along
  if (exerciseType === 'time' || isFollowAlong) {
    // Check if exercise has its own duration value from Firestore
    const firestoreDuration = (ex as any).duration || (ex as any).defaultDuration;
    if (firestoreDuration) {
      // Use Firestore value (could be number or string)
      const durationValue = typeof firestoreDuration === 'number' ? firestoreDuration : parseInt(String(firestoreDuration), 10);
      duration = isNaN(durationValue) ? String(firestoreDuration) : `${durationValue} שניות`;
    } else if (segmentTarget?.type === 'time' && segmentTarget?.value) {
      // Fallback to segment target value
      duration = `${segmentTarget.value} שניות`;
    }
    // If no duration found, leave undefined - UI will handle it
  }

  // Extract equipment from Firestore
  const equipment = Array.isArray((ex as any).equipment) 
    ? (ex as any).equipment 
    : [];

  return {
    id: ex.id,
    name: getLocalizedText(ex.name),
    reps,
    duration,
    videoUrl,
    imageUrl,
    // Enriched metadata
    exerciseType,
    exerciseRole: segmentRole,
    isFollowAlong,
    hasAudio: ex.hasAudio === true,
    highlights,
    muscleGroups: ex.muscleGroups || [],
    goal,
    description: goal,
    equipment,
  };
}

/**
 * Fetch workout from Firestore and convert to ENRICHED WorkoutPlan
 * All exercise metadata is embedded - Single Source of Truth
 */
async function fetchWorkoutFromFirestore(workoutId: string, workoutLocation?: string): Promise<WorkoutPlan | null> {
  try {
    console.log('[ActiveWorkoutPage] Fetching all exercises from Firestore');
    const exercises = await getAllExercises();
    
    if (!exercises || exercises.length === 0) {
      console.warn('[ActiveWorkoutPage] No exercises found in Firestore');
      return null;
    }

    // Separate exercises by role
    const warmupExercises = exercises.filter((ex) => ex.exerciseRole === 'warmup');
    const mainExercises = exercises.filter((ex) => ex.exerciseRole === 'main' || !ex.exerciseRole);
    const cooldownExercises = exercises.filter((ex) => ex.exerciseRole === 'cooldown');

    const segments: WorkoutPlan['segments'] = [];

    // Warm-up segment (follow-along, no rest between exercises)
    if (warmupExercises.length > 0) {
      const warmupTarget = { type: 'time' as const, value: 60 };
      segments.push({
        id: 'warmup-segment',
        type: 'station',
        title: 'חימום',
        icon: '🔥',
        target: warmupTarget,
        exercises: warmupExercises.slice(0, 3).map((ex) => enrichExercise(ex, 'warmup', warmupTarget, workoutLocation)),
        isCompleted: false,
        restBetweenExercises: 0, // No rest for warmup
      });
    }

    // Main strength segment
    if (mainExercises.length > 0) {
      const mainTarget = { type: 'reps' as const, value: 12 };
      segments.push({
        id: 'strength-segment',
        type: 'station',
        title: 'תרגילי כוח',
        icon: '💪',
        target: mainTarget,
        exercises: mainExercises.slice(0, 6).map((ex) => enrichExercise(ex, 'main', mainTarget, workoutLocation)),
        isCompleted: false,
        restBetweenExercises: 10, // Standard rest
      });
    }

    // Cool-down segment (follow-along, no rest between exercises)
    if (cooldownExercises.length > 0) {
      const cooldownTarget = { type: 'time' as const, value: 60 };
      segments.push({
        id: 'cooldown-segment',
        type: 'station',
        title: 'קירור',
        icon: '🧘',
        target: cooldownTarget,
        exercises: cooldownExercises.slice(0, 2).map((ex) => enrichExercise(ex, 'cooldown', cooldownTarget, workoutLocation)),
        isCompleted: false,
        restBetweenExercises: 0, // No rest for cooldown
      });
    }

    // Fallback: create default segment if none were created
    if (segments.length === 0 && exercises.length > 0) {
      const defaultTarget = { type: 'reps' as const, value: 12 };
      segments.push({
        id: 'main-segment',
        type: 'station',
        title: 'אימון כוח',
        icon: '💪',
        target: defaultTarget,
        exercises: exercises.slice(0, 5).map((ex) => enrichExercise(ex, 'main', defaultTarget, workoutLocation)),
        isCompleted: false,
        restBetweenExercises: 10,
      });
    }

    console.log('[ActiveWorkoutPage] Created enriched workout plan with', segments.length, 'segments');

    return {
      id: workoutId,
      name: 'אימון כוח',
      segments,
      totalDuration: segments.reduce((sum, seg) => sum + (seg.target?.value || 60), 0),
      difficulty: 'medium' as const,
    };
  } catch (error) {
    console.error('[ActiveWorkoutPage] Error fetching workout from Firestore:', error);
    return null;
  }
}

/**
 * Map WorkoutPlan exercises to CompletedExercise format for summary
 */
function mapToCompletedExercises(workoutPlan: WorkoutPlan): CompletedExercise[] {
  const completedExercises: CompletedExercise[] = [];
  
  for (const segment of workoutPlan.segments) {
    if (!segment.exercises) continue;
    
    // Determine category based on segment title/id
    let category: CompletedExercise['category'] = 'main';
    if (segment.id.includes('warmup') || segment.title?.includes('חימום')) {
      category = 'warmup';
    } else if (segment.id.includes('cooldown') || segment.title?.includes('קירור') || segment.title?.includes('מתיחות')) {
      category = 'stretch';
    } else if (segment.title?.includes('סופר') || segment.exercises.length >= 2) {
      category = 'superset';
    }
    
    for (const ex of segment.exercises) {
      // Extract reps from the exercise
      let repsValue = 12; // Default
      if (ex.reps) {
        const match = ex.reps.match(/(\d+)/);
        if (match) repsValue = parseInt(match[1], 10);
      }
      
      // Simulate 3 sets (can be enhanced with actual tracking data)
      const sets = [repsValue, repsValue, repsValue];
      const totalReps = sets.reduce((a, b) => a + b, 0);
      
      completedExercises.push({
        id: ex.id,
        name: ex.name,
        category,
        sets,
        totalReps,
        isPersonalRecord: Math.random() < 0.2, // 20% chance for demo
      });
    }
  }
  
  return completedExercises;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ActiveWorkoutPage() {
  const params = useParams();
  const router = useRouter();
  const workoutId = params.id as string;
  
  // === FLOW STATE ===
  const [flowState, setFlowState] = useState<FlowState>('active');
  
  // === WORKOUT STATS (preserved between flow steps) ===
  const [workoutStats, setWorkoutStats] = useState<WorkoutStats>({
    duration: 0,
    totalReps: 0,
    completedExercises: [],
    difficulty: 'medium',
    startTime: Date.now(),
  });
  
  // === WORKOUT DATA ===
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Workout location for location-aware media selection in player components
  const [workoutLocation, setWorkoutLocation] = useState<string>('home');

  // Refs to prevent re-fetching
  const hasFetchedRef = useRef(false);
  const workoutIdRef = useRef(workoutId);

  // Load workout plan: first check sessionStorage, then fetch from Firestore
  useEffect(() => {
    // Skip if already fetched for this workoutId
    if (hasFetchedRef.current && workoutIdRef.current === workoutId) {
      return;
    }

    async function loadWorkout() {
      if (typeof window === 'undefined') return;

      // Mark as fetched
      hasFetchedRef.current = true;
      workoutIdRef.current = workoutId;

      setIsLoading(true);
      setError(null);

      // Read workout location from sessionStorage (set by home page / preview drawer)
      const storedLocation = sessionStorage.getItem('currentWorkoutLocation');
      if (storedLocation) {
        setWorkoutLocation(storedLocation);
      }

      // Step 1: Check if we have a valid workout plan in sessionStorage for THIS workout
      const storedPlanId = sessionStorage.getItem('currentWorkoutPlanId');
      const stored = sessionStorage.getItem('currentWorkoutPlan');
      
      if (stored && storedPlanId === workoutId) {
        try {
          const parsed = JSON.parse(stored) as WorkoutPlan;
          
          // Validate that the stored plan has segments
          if (parsed && parsed.segments && parsed.segments.length > 0) {
            // Clear sessionStorage after reading
            sessionStorage.removeItem('currentWorkoutPlan');
            sessionStorage.removeItem('currentWorkoutPlanId');
            
            console.log('[ActiveWorkoutPage] Loaded workout from sessionStorage');
            setWorkoutPlan(parsed);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('[ActiveWorkoutPage] Error parsing stored workout plan:', err);
        }
      }

      // Clear any stale sessionStorage data
      sessionStorage.removeItem('currentWorkoutPlan');
      sessionStorage.removeItem('currentWorkoutPlanId');

      // Step 2: Fetch enriched workout from Firestore
      console.log('[ActiveWorkoutPage] Fetching workout from Firestore, ID:', workoutId);
      const firestoreWorkout = await fetchWorkoutFromFirestore(workoutId, storedLocation || 'home');
      
      if (firestoreWorkout) {
        setWorkoutPlan(firestoreWorkout);
      } else {
        setError('לא הצלחנו לטעון את האימון. נסה שוב.');
      }
      
      setIsLoading(false);
    }

    loadWorkout();
  }, [workoutId]);

  // Stable workoutPlan reference using useMemo to prevent StrengthRunner resets
  const stableWorkoutPlan = useMemo(() => {
    if (!workoutPlan) return null;
    return workoutPlan;
  }, [workoutPlan?.id]); // Only recreate if ID changes

  // === FLOW HANDLERS ===
  
  /**
   * Handle workout completion - transition to dopamine screen
   */
  const handleComplete = useCallback(() => {
    if (!workoutPlan) return;
    
    // Calculate final stats
    const duration = Math.floor((Date.now() - workoutStats.startTime) / 1000);
    const completedExercises = mapToCompletedExercises(workoutPlan);
    const totalReps = completedExercises.reduce((sum, ex) => sum + ex.totalReps, 0);
    
    // Determine difficulty from workout plan
    const difficulty: Difficulty = 
      workoutPlan.difficulty === 'easy' ? 'easy' :
      workoutPlan.difficulty === 'hard' ? 'hard' : 'medium';
    
    // Update stats for summary screen
    setWorkoutStats({
      duration,
      totalReps,
      completedExercises,
      difficulty,
      startTime: workoutStats.startTime,
    });
    
    console.log('[ActiveWorkoutPage] Workout complete! Duration:', duration, 'seconds');
    
    // Transition to dopamine screen (NOT router.push)
    setFlowState('dopamine');
  }, [workoutPlan, workoutStats.startTime]);

  /**
   * Handle dopamine screen completion - transition to summary
   */
  const handleDopamineComplete = useCallback(() => {
    setFlowState('summary');
  }, []);

  /**
   * Handle summary completion - navigate to home
   */
  const handleSummaryFinish = useCallback(() => {
    router.push('/home');
  }, [router]);

  // Handle pause
  const handlePause = () => {
    console.log('Workout paused');
  };

  // Handle resume
  const handleResume = () => {
    console.log('Workout resumed');
  };

  // === LOADING STATE ===
  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">טוען את האימון...</p>
          <p className="text-gray-400 text-sm mt-1">מכין את התרגילים שלך</p>
        </div>
      </div>
    );
  }

  // === ERROR STATE ===
  if (error || !stableWorkoutPlan) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50" dir="rtl">
        <div className="text-center px-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">😕</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">לא הצלחנו לטעון את האימון</h2>
          <p className="text-gray-500 mb-6">{error || 'נסה שוב מאוחר יותר'}</p>
          <button
            onClick={() => router.push('/home')}
            className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-8 rounded-xl transition-all"
          >
            חזרה לדף הבית
          </button>
        </div>
      </div>
    );
  }

  // === RENDER BASED ON FLOW STATE ===
  
  // Step 1: Active Workout
  if (flowState === 'active') {
    return (
      <div className="w-full h-screen overflow-hidden">
        <StrengthRunner
          workout={stableWorkoutPlan}
          onComplete={handleComplete}
          onPause={handlePause}
          onResume={handleResume}
        />
      </div>
    );
  }
  
  // Step 2: Dopamine Celebration Screen
  if (flowState === 'dopamine') {
    return (
      <StrengthDopamineScreen
        initialProgress={63}
        currentLevel={5}
        programName={stableWorkoutPlan.name || 'אימון כוח'}
        onShare={() => {
          console.log('[ActiveWorkoutPage] Share clicked');
        }}
        onBack={handleDopamineComplete}
      />
    );
  }
  
  // Step 3: Summary Screen
  if (flowState === 'summary') {
    return (
      <StrengthSummaryPage
        duration={workoutStats.duration}
        totalReps={workoutStats.totalReps}
        completedExercises={workoutStats.completedExercises}
        difficulty={workoutStats.difficulty}
        streak={3} // TODO: Get from user progression store
        programName={stableWorkoutPlan.name || 'אימון כוח'}
        currentLevel={5}
        maxLevel={10}
        progressToNextLevel={80}
        onFinish={handleSummaryFinish}
      />
    );
  }

  // Fallback (should never reach here)
  return null;
}

'use client';

// Force dynamic rendering to prevent SSR issues
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import StrengthRunner from '@/features/workout-engine/players/strength/StrengthRunner';
import type { ExerciseResultLog } from '@/features/workout-engine/players/strength/StrengthRunner';
import { WorkoutPlan, Exercise as WorkoutExercise } from '@/features/parks';
import { getAllExercises, Exercise as FirestoreExercise, getLocalizedText, findMethodForLocation } from '@/features/content/exercises';
import { 
  StrengthDopamineScreen, 
  StrengthSummaryPage,
  type CompletedExercise,
  type Difficulty,
} from '@/features/workout-engine/components/strength';
import type { BonusStep, VolumeBreakdownDisplay } from '@/features/workout-engine/components/strength/StrengthDopamineScreen';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { processWorkoutCompletion } from '@/features/user/progression/services/progression.service';
import type { WorkoutCompletionResult, WorkoutExerciseResult } from '@/features/user/core/types/progression.types';
import { auth } from '@/lib/firebase';
import { saveWorkout } from '@/features/workout-engine/core/services/storage.service';
import { createWorkoutPost } from '@/features/social/services/feed.service';
import { extractFeedScope } from '@/features/social/services/feed-scope.utils';
import { detectNearbyPark } from '@/features/workout-engine/services/park-detection.service';
import { Target, Sparkles, Flame } from 'lucide-react';
import { useSmartMessage } from '@/features/messages/hooks/useSmartGreeting';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { useWorkoutPresence } from '@/features/workout-engine/hooks/useWorkoutPresence';
import { useKudosInbox } from '@/features/safecity/hooks/useKudosInbox';
import KudoToast from '@/features/safecity/components/KudoToast';

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
  rawExerciseLog: ExerciseResultLog[]; // Actual confirmed reps with correct targetReps
  domainSets?: Record<string, number>; // Per-domain set counts (Phase 3)
}

const MUSCLE_TO_DOMAIN: Record<string, string> = {
  chest: 'push', triceps: 'push', shoulders: 'push', deltoids: 'push',
  back: 'pull', biceps: 'pull', lats: 'pull', forearms: 'pull',
  quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', hip_flexors: 'legs',
  core: 'core', abs: 'core', obliques: 'core',
};

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

  // DYNAMIC REPS/DURATION: Uses generated workout range data if available,
  // falls back to Firestore values, then segment target.
  let reps: string | undefined = undefined;
  let duration: string | undefined = undefined;

  // Check if we have generated workout range data from sessionStorage
  const generatedExData = typeof window !== 'undefined'
    ? (() => {
        try {
          const stored = sessionStorage.getItem('generatedExerciseRanges');
          if (!stored) return null;
          const map = JSON.parse(stored) as Record<string, {
            repsRange?: { min: number; max: number };
            sets?: number;
            isTimeBased?: boolean;
            isGoalExercise?: boolean;
            rampedTarget?: number;
          }>;
          return map[ex.id] || null;
        } catch { return null; }
      })()
    : null;

  // REPS: Only for reps-type exercises, never for time-type (like Plank)
  if (exerciseType === 'reps') {
    if (generatedExData?.repsRange) {
      const { min, max } = generatedExData.repsRange;
      const setsPrefix = generatedExData.sets ? `${generatedExData.sets}×` : '';
      const goalSuffix = generatedExData.isGoalExercise && generatedExData.rampedTarget
        ? ` (יעד: ${generatedExData.rampedTarget})`
        : '';
      reps = min !== max
        ? `${setsPrefix}${min}-${max} חזרות${goalSuffix}`
        : `${setsPrefix}${min} חזרות${goalSuffix}`;
    } else {
      const firestoreReps = (ex as any).reps || (ex as any).defaultReps;
      if (firestoreReps) {
        const repsValue = typeof firestoreReps === 'number' ? firestoreReps : parseInt(String(firestoreReps), 10);
        reps = isNaN(repsValue) ? String(firestoreReps) : `${repsValue} חזרות`;
      } else if (segmentTarget?.type === 'reps' && segmentTarget?.value) {
        reps = `${segmentTarget.value} חזרות`;
      }
    }
  }

  // DURATION: Only for time-type exercises or follow-along
  if (exerciseType === 'time' || isFollowAlong) {
    if (generatedExData?.repsRange && generatedExData.isTimeBased) {
      const { min, max } = generatedExData.repsRange;
      const setsPrefix = generatedExData.sets ? `${generatedExData.sets}×` : '';
      const goalSuffix = generatedExData.isGoalExercise && generatedExData.rampedTarget
        ? ` (יעד: ${generatedExData.rampedTarget})`
        : '';
      duration = min !== max
        ? `${setsPrefix}${min}-${max} שניות${goalSuffix}`
        : `${setsPrefix}${min} שניות${goalSuffix}`;
    } else {
      const firestoreDuration = (ex as any).duration || (ex as any).defaultDuration;
      if (firestoreDuration) {
        const durationValue = typeof firestoreDuration === 'number' ? firestoreDuration : parseInt(String(firestoreDuration), 10);
        duration = isNaN(durationValue) ? String(firestoreDuration) : `${durationValue} שניות`;
      } else if (segmentTarget?.type === 'time' && segmentTarget?.value) {
        duration = `${segmentTarget.value} שניות`;
      }
    }
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
 * Map WorkoutPlan exercises to CompletedExercise format for summary.
 * When a real exerciseLog is available (from StrengthRunner's RepetitionPicker),
 * those confirmed reps are used instead of fabricated values.
 */
function mapToCompletedExercises(
  workoutPlan: WorkoutPlan,
  exerciseLog?: ExerciseResultLog[],
): CompletedExercise[] {
  const completedExercises: CompletedExercise[] = [];

  // Build a lookup from the real log for O(1) access
  const logMap = new Map<string, ExerciseResultLog>();
  if (exerciseLog) {
    for (const entry of exerciseLog) {
      logMap.set(entry.exerciseId, entry);
    }
  }
  
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
      const logged = logMap.get(ex.id);

      const sets = logged && logged.confirmedReps.length > 0
        ? logged.confirmedReps
        : []; // Not performed — no fake fill

      const totalReps = sets.reduce((a, b) => a + b, 0);
      
      completedExercises.push({
        id: ex.id,
        name: ex.name,
        category,
        sets,
        totalReps,
        isPersonalRecord: false,
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

  // === SMART MESSAGE (admin-managed post-workout motivation) ===
  const postWorkoutMsg = useSmartMessage('post_workout');
  const celebrationText = postWorkoutMsg
    ? [postWorkoutMsg.text, postWorkoutMsg.subText].filter(Boolean).join(' ')
    : undefined;

  // === CONFETTI / HAPTICS ===
  const { celebrate } = useGoalCelebration();
  useEffect(() => {
    if (flowState === 'dopamine') {
      celebrate('workout_completed', 1200);
    }
  }, [flowState, celebrate]);

  // === KUDOS INBOX (receive High Fives from map viewers) ===
  const { currentKudo, dismissKudo } = useKudosInbox(
    flowState === 'active' ? auth.currentUser?.uid : undefined,
  );

  // === WORKOUT STATS (preserved between flow steps) ===
  const [workoutStats, setWorkoutStats] = useState<WorkoutStats>({
    duration: 0,
    totalReps: 0,
    completedExercises: [],
    difficulty: 'medium',
    startTime: Date.now(),
    rawExerciseLog: [],
  });

  // === UNIFIED PROGRESSION (single source of truth for both Dopamine + Summary) ===
  const [progressionResult, setProgressionResult] = useState<WorkoutCompletionResult | null>(null);
  const preWorkoutPercentRef = useRef(0);
  const progressionComputedRef = useRef(false);
  
  // === WORKOUT DATA ===
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Workout location for location-aware media selection in player components
  const [workoutLocation, setWorkoutLocation] = useState<string>('home');

  // === LIVE PRESENCE (Social Map heartbeat while workout is active) ===
  useWorkoutPresence({
    activityStatus: 'strength',
    workoutTitle: workoutPlan?.name,
  });

  // === USER PROGRESSION (real data from Firestore) ===
  const { profile, refreshProfile } = useUserStore();

  const userProgression = useMemo(() => {
    const prog = profile?.progression;
    // Determine the active program ID
    const activeProgramId =
      prog?.activePrograms?.[0]?.id ||
      (profile as any)?.currentProgramId ||
      'full_body';

    const track = prog?.tracks?.[activeProgramId];
    const domain = prog?.domains
      ? (prog.domains as Record<string, any>)[activeProgramId]
      : null;

    return {
      programId: activeProgramId,
      currentLevel: track?.currentLevel ?? domain?.currentLevel ?? 1,
      maxLevel: domain?.maxLevel ?? 10,
      percent: track?.percent ?? 0,
      streak: prog?.globalStreak ?? 0,
    };
  }, [profile]);

  // Refs to prevent re-fetching
  const hasFetchedRef = useRef(false);
  const workoutIdRef = useRef(workoutId);

  // Load workout plan: check sessionStorage sources first, then fetch from Firestore
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

      // ── Priority 1: Full generated workout data from home page ──
      // This contains the exact workout the user previewed, with all metadata
      const activeWorkoutRaw = sessionStorage.getItem('active_workout_data');
      if (activeWorkoutRaw) {
        try {
          const parsed = JSON.parse(activeWorkoutRaw) as WorkoutPlan;
          if (parsed && parsed.segments && parsed.segments.length > 0) {
            // Keep the data in sessionStorage for the duration of the workout
            // (only clear when workout completes or user navigates away)
            console.log('[ActiveWorkoutPage] Loaded full workout from active_workout_data');
            setWorkoutPlan(parsed);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('[ActiveWorkoutPage] Error parsing active_workout_data:', err);
        }
      }

      // ── Priority 2: Legacy sessionStorage format ──
      const storedPlanId = sessionStorage.getItem('currentWorkoutPlanId');
      const stored = sessionStorage.getItem('currentWorkoutPlan');
      
      if (stored && storedPlanId === workoutId) {
        try {
          const parsed = JSON.parse(stored) as WorkoutPlan;
          if (parsed && parsed.segments && parsed.segments.length > 0) {
            sessionStorage.removeItem('currentWorkoutPlan');
            sessionStorage.removeItem('currentWorkoutPlanId');
            console.log('[ActiveWorkoutPage] Loaded workout from legacy sessionStorage');
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

      // ── Priority 3: Fetch from Firestore as last resort ──
      console.log('[ActiveWorkoutPage] No stored workout found — fetching from Firestore, ID:', workoutId);
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
   * Handle workout completion - merge real exercise log with plan data,
   * then transition to dopamine screen.
   */
  const handleComplete = useCallback((exerciseLog?: ExerciseResultLog[]) => {
    if (!workoutPlan) return;
    
    // Freeze pre-workout percent before any Firestore writes
    preWorkoutPercentRef.current = userProgression.percent;

    // Calculate final stats
    const duration = Math.floor((Date.now() - workoutStats.startTime) / 1000);

    // Build CompletedExercise[] using real confirmed reps when available
    const completedExercises = mapToCompletedExercises(workoutPlan, exerciseLog);
    const totalReps = completedExercises.reduce((sum, ex) => sum + ex.totalReps, 0);
    
    // Determine difficulty from workout plan
    const difficulty: Difficulty = 
      workoutPlan.difficulty === 'easy' ? 'easy' :
      workoutPlan.difficulty === 'hard' ? 'hard' : 'medium';

    // Phase 3: Compute per-domain set counts from segment exercises + log
    const domainSets: Record<string, number> = {};
    const logMap = new Map<string, number>();
    if (exerciseLog) {
      for (const entry of exerciseLog) {
        logMap.set(entry.exerciseId, entry.confirmedReps.length);
      }
    }
    for (const segment of workoutPlan.segments) {
      if (!segment.exercises) continue;
      for (const ex of segment.exercises) {
        const setsCount = logMap.get(ex.id) ?? ex.sets ?? 0;
        if (setsCount === 0) continue;
        const muscle = ex.muscleGroups?.[0]?.toLowerCase();
        const domain = muscle ? MUSCLE_TO_DOMAIN[muscle] : undefined;
        if (domain) {
          domainSets[domain] = (domainSets[domain] ?? 0) + setsCount;
        }
      }
    }
    
    // Update stats for summary screen
    setWorkoutStats({
      duration,
      totalReps,
      completedExercises,
      difficulty,
      startTime: workoutStats.startTime,
      rawExerciseLog: exerciseLog ?? [],
      domainSets: Object.keys(domainSets).length > 0 ? domainSets : undefined,
    });
    
    console.log('[ActiveWorkoutPage] Workout complete! Duration:', duration, 'seconds',
      `(${exerciseLog?.length || 0} exercises logged with real data)`);
    
    // Transition to dopamine screen (NOT router.push)
    setFlowState('dopamine');
  }, [workoutPlan, workoutStats.startTime, userProgression.percent]);

  // === RUN PROGRESSION ENGINE ONCE (shared by Dopamine + Summary) ===
  useEffect(() => {
    if (flowState !== 'dopamine') return;
    if (progressionComputedRef.current) return;

    const rawLog = workoutStats.rawExerciseLog;
    if (rawLog.length === 0) return;

    progressionComputedRef.current = true;

    const run = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const exerciseResults: WorkoutExerciseResult[] = rawLog.map(entry => ({
          exerciseId: entry.exerciseId,
          exerciseName: entry.exerciseName,
          programLevels: {} as Record<string, number>,
          setsCompleted: entry.confirmedReps.length,
          repsPerSet: entry.confirmedReps,
          targetReps: entry.targetReps,
          isCompound: false,
        }));

        const result = await processWorkoutCompletion({
          userId: uid,
          activeProgramId: userProgression.programId,
          exercises: exerciseResults,
          totalDuration: Math.max(Math.round(workoutStats.duration / 60), 1),
          completedAt: new Date(),
        });

        setProgressionResult(result);

        if (result.success) {
          const g = result.activeProgramGain;
          console.log(
            `[ActiveWorkoutPage] Progression: ${userProgression.programId} +${g.totalGain.toFixed(1)}%` +
            ` (base=${g.baseGain.toFixed(1)}, perf=${g.bonusGain.toFixed(1)}, goals=${g.goalBonusGain.toFixed(1)})` +
            (g.leveledUp ? ` → LEVEL UP to ${g.newLevel}!` : ` (now ${g.newPercent.toFixed(1)}%)`),
          );
        }
      } catch (e) {
        console.error('[ActiveWorkoutPage] processWorkoutCompletion failed:', e);
      }
    };

    run();
  }, [flowState, workoutStats.rawExerciseLog, workoutStats.duration, userProgression.programId]);

  // Derive real bonuses for DopamineScreen from the single progression result.
  // For MASTER programs (bottom-up), show per-child domain gains.
  // For LEAF programs, show the traditional completion/performance/goal bonuses.
  const dopamineBonuses = useMemo((): BonusStep[] | undefined => {
    if (!progressionResult?.success) return undefined;

    const positions: Array<'top-right' | 'top-left' | 'bottom-left' | 'bottom-right'> =
      ['top-right', 'top-left', 'bottom-left', 'bottom-right'];

    // Master program → show per-child gains ("+3.2% דחיפה", "+5% משיכה")
    const childGains = progressionResult.childDomainGains;
    if (childGains && childGains.length > 0) {
      const activeChildren = childGains.filter(c => c.totalGain > 0);
      if (activeChildren.length > 0) {
        return activeChildren.map((child, idx) => ({
          id: child.childId,
          label: `+${child.totalGain.toFixed(1)}% ${child.label}`,
          percentage: Math.round(child.totalGain * 10) / 10,
          icon: <Target className="w-3 h-3" />,
          position: positions[idx % positions.length],
        }));
      }
    }

    // Leaf program → traditional bonuses
    const gain = progressionResult.activeProgramGain;
    const bonuses: BonusStep[] = [];

    if (gain.baseGain > 0) {
      bonuses.push({
        id: 'completion',
        label: `${Math.round(gain.baseGain)}% על השלמת אימון`,
        percentage: Math.round(gain.baseGain * 10) / 10,
        icon: <Target className="w-3 h-3" />,
        position: 'top-right',
      });
    }
    if (gain.bonusGain > 0) {
      bonuses.push({
        id: 'performance',
        label: `${Math.round(gain.bonusGain)}% על ביצוע מעל המצופה`,
        percentage: Math.round(gain.bonusGain * 10) / 10,
        icon: <Sparkles className="w-3 h-3" />,
        position: 'top-left',
      });
    }
    if (gain.goalBonusGain > 0) {
      bonuses.push({
        id: 'goals',
        label: `${Math.round(gain.goalBonusGain)}% על השגת יעדים`,
        percentage: Math.round(gain.goalBonusGain * 10) / 10,
        icon: <Flame className="w-3 h-3" />,
        position: 'bottom-left',
      });
    }

    return bonuses.length > 0 ? bonuses : undefined;
  }, [progressionResult]);

  const dopamineVolumeBreakdown = useMemo((): VolumeBreakdownDisplay | undefined => {
    if (!progressionResult?.success) return undefined;
    const vb = progressionResult.volumeBreakdown;
    return {
      setsPerformed: vb.setsPerformed,
      requiredSets: vb.requiredSets,
      isFullVolume: vb.isFullVolume,
    };
  }, [progressionResult]);

  /**
   * Handle dopamine screen completion - transition to summary
   */
  const handleDopamineComplete = useCallback(() => {
    setFlowState('summary');
  }, []);

  /**
   * Handle summary completion — save workout to history, publish feed post,
   * clean up sessionStorage, refresh profile, navigate home.
   */
  const handleSummaryFinish = useCallback(async () => {
    const currentUser = auth.currentUser;
    const durationSec = workoutStats.duration;
    const durationMin = Math.max(1, Math.round(durationSec / 60));

    // 1. Save workout to Firestore history
    if (currentUser) {
      try {
        await saveWorkout({
          userId: currentUser.uid,
          activityType: 'strength',
          distance: 0,
          duration: durationSec,
          calories: 0,
          pace: 0,
          earnedCoins: 0,
          workoutType: 'STRENGTH',
          category: 'strength',
          displayIcon: 'dumbbell',
        });
        console.log('[ActiveWorkoutPage] Workout saved to history');
      } catch (err) {
        console.error('[ActiveWorkoutPage] Failed to save workout:', err);
      }
    }

    // 2. Publish to social feed (with scope fields for leaderboard)
    if (currentUser && profile?.core?.name) {
      const diffLabel =
        workoutStats.difficulty === 'easy' ? 'קלה' :
        workoutStats.difficulty === 'hard' ? 'גבוהה' : 'בינונית';
      const scope = extractFeedScope(profile);

      // Try to detect park from user's last known GPS
      let parkFields: { parkId?: string; parkName?: string } = {};
      try {
        if (navigator.geolocation) {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }),
          ).catch(() => null);
          if (pos) {
            const park = await detectNearbyPark(pos.coords.latitude, pos.coords.longitude);
            if (park) parkFields = park;
          }
        }
      } catch { /* GPS unavailable — post without park */ }

      createWorkoutPost({
        authorUid: currentUser.uid,
        authorName: profile.core.name,
        activityCategory: 'strength',
        durationMinutes: durationMin,
        intensityLevel: diffLabel,
        title: stableWorkoutPlan?.name || undefined,
        ...scope,
        ...parkFields,
      }).catch((err) => console.warn('[ActiveWorkoutPage] Feed post failed:', err));
    }

    // 3. Clean up stored workout data
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('active_workout_data');
      sessionStorage.removeItem('currentWorkoutPlanId');
      sessionStorage.removeItem('generatedExerciseRanges');
    }
    try {
      await refreshProfile();
    } catch (e) {
      console.error('[ActiveWorkoutPage] Failed to refresh profile before navigating:', e);
    }
    router.push('/home');
  }, [router, refreshProfile, workoutStats.duration, workoutStats.difficulty, profile, stableWorkoutPlan?.name]);

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
        <KudoToast kudo={currentKudo} onDismiss={dismissKudo} />
      </div>
    );
  }
  
  // Step 2: Dopamine Celebration Screen
  if (flowState === 'dopamine') {
    return (
      <StrengthDopamineScreen
        initialProgress={Math.round(preWorkoutPercentRef.current)}
        currentLevel={userProgression.currentLevel}
        programName={stableWorkoutPlan.name || 'אימון כוח'}
        bonuses={dopamineBonuses}
        volumeBreakdown={dopamineVolumeBreakdown}
        celebrationMessage={celebrationText}
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
        streak={userProgression.streak}
        programId={userProgression.programId}
        programName={stableWorkoutPlan.name || 'אימון כוח'}
        currentLevel={userProgression.currentLevel}
        maxLevel={userProgression.maxLevel}
        progressToNextLevel={Math.round(preWorkoutPercentRef.current)}
        onFinish={handleSummaryFinish}
        trainingType={stableWorkoutPlan.trainingType}
        rawExerciseLog={workoutStats.rawExerciseLog}
        precomputedProgression={progressionResult}
        domainSets={workoutStats.domainSets}
      />
    );
  }

  // Fallback (should never reach here)
  return null;
}

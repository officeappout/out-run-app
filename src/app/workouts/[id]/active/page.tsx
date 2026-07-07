'use client';

// Force dynamic rendering to prevent SSR issues
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import StrengthRunner from '@/features/workout-engine/players/strength/StrengthRunner';
import type { ExerciseResultLog } from '@/features/workout-engine/players/strength/StrengthRunner';
import { clearWorkoutCheckpoint } from '@/features/workout-engine/players/strength/hooks/useWorkoutPersistence';
import { WorkoutPlan, Exercise as WorkoutExercise } from '@/features/parks';
import { getAllExercises, getExercise as getFirestoreExercise, Exercise as FirestoreExercise, getLocalizedText, findMethodForLocation } from '@/features/content/exercises';
import { normalizeGearId } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { saveExerciseHistory, getHistoryMapForExercises } from '@/features/workout-engine/services/exercise-history.service';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import ExerciseReplacementModal from '@/features/workout-engine/players/strength/components/ExerciseReplacementModal';
import type { ExecutionMethod } from '@/features/content/exercises';
import { 
  StrengthDopamineScreen, 
  StrengthSummaryPage,
  type CompletedExercise,
  type Difficulty,
} from '@/features/workout-engine/components/strength';
import type { BonusStep, VolumeBreakdownDisplay } from '@/features/workout-engine/components/strength/StrengthDopamineScreen';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { processWorkoutCompletion } from '@/features/user/progression/services/progression.service';
import type { WorkoutCompletionResult, WorkoutExerciseResult } from '@/features/user/core/types/progression.types';
import { auth, db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { saveWorkout } from '@/features/workout-engine/core/services/storage.service';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { calculateStrengthWorkoutXP } from '@/features/user/progression/services/xp.service';
import { createWorkoutPost } from '@/features/social/services/feed.service';
import { extractFeedScope, extractGroupIds } from '@/features/social/services/feed-scope.utils';
import { IS_COMMUNITY_FEED_ENABLED } from '@/config/feature-flags';
import { detectNearbyPark } from '@/features/workout-engine/services/park-detection.service';
import { Target, Sparkles, Flame } from 'lucide-react';
import { useSmartMessage } from '@/features/messages/hooks/useSmartGreeting';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { MASTER_PROGRAM_CHILDREN, MASTER_LEVEL_CAP } from '@/features/home/hooks/useProgramProgress';
import { useWorkoutPresence } from '@/features/workout-engine/hooks/useWorkoutPresence';
import { useActiveWorkoutHeartbeat } from '@/features/heatmap/hooks/useActiveWorkoutHeartbeat';
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
  const allMethods = (ex as any).execution_methods || (ex as any).executionMethods || [];

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
  const isUni = (ex as any).symmetry === 'unilateral';
  const perSideSuffix = isUni ? ' (לכל צד)' : '';
  if (exerciseType === 'reps') {
    if (generatedExData?.repsRange) {
      const { min, max } = generatedExData.repsRange;
      const setsPrefix = generatedExData.sets ? `${generatedExData.sets}×` : '';
      const goalSuffix = generatedExData.isGoalExercise && generatedExData.rampedTarget
        ? ` (יעד: ${generatedExData.rampedTarget})`
        : '';
      reps = min !== max
        ? `${setsPrefix}${min}-${max} חזרות${perSideSuffix}${goalSuffix}`
        : `${setsPrefix}${min} חזרות${perSideSuffix}${goalSuffix}`;
    } else {
      const firestoreReps = (ex as any).reps || (ex as any).defaultReps;
      if (firestoreReps) {
        const repsValue = typeof firestoreReps === 'number' ? firestoreReps : parseInt(String(firestoreReps), 10);
        reps = isNaN(repsValue) ? String(firestoreReps) : `${repsValue} חזרות${perSideSuffix}`;
      } else if (segmentTarget?.type === 'reps' && segmentTarget?.value) {
        reps = `${segmentTarget.value} חזרות${perSideSuffix}`;
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

  const matchedGear = method?.gearIds ?? (method?.gearId ? [method.gearId] : []);
  const matchedEquip = method?.equipmentIds ?? (method?.equipmentId ? [method.equipmentId] : []);
  let methodIdsCollected = [...matchedGear, ...matchedEquip].filter(Boolean);

  // Deep scan: if the matched method yielded nothing, scan ALL execution methods
  if (methodIdsCollected.length === 0 && allMethods.length > 0) {
    for (const m of allMethods) {
      const g = m.gearIds ?? (m.gearId ? [m.gearId] : []);
      const e = m.equipmentIds ?? (m.equipmentId ? [m.equipmentId] : []);
      methodIdsCollected.push(...g, ...e);
    }
    methodIdsCollected = methodIdsCollected.filter(Boolean);
  }

  const allRaw = [...methodIdsCollected].filter(Boolean);
  const seen = new Set<string>();
  const equipment: string[] = [];
  for (const id of allRaw) {
    const norm = normalizeGearId(id);
    if (norm !== 'none' && norm !== 'bodyweight' && !seen.has(norm)) {
      seen.add(norm);
      equipment.push(norm);
    }
  }

  return {
    id: ex.id,
    name: getLocalizedText(ex.name),
    reps,
    duration,
    videoUrl,
    imageUrl,
    fullTutorial: resolveExerciseMedia(ex as any, method as any).fullTutorial,
    exerciseType,
    exerciseRole: segmentRole,
    isFollowAlong,
    hasAudio: ex.hasAudio === true,
    highlights,
    muscleGroups: ex.muscleGroups || [],
    goal,
    description: goal,
    equipment,
    symmetry: (ex as any).symmetry as 'bilateral' | 'unilateral' | undefined,
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
 * Map performed exercises to CompletedExercise format for the summary screen.
 *
 * Log-driven architecture (Block 4): the primary pass iterates the live
 * exerciseLog rather than the WorkoutPlan so that exercises swapped in the
 * preview layer appear in the summary with their real confirmed reps instead
 * of showing 0 sets under the old plan ID.  A secondary pass appends any
 * plan exercises that were never logged (skipped / warmup bypassed) so the
 * summary list stays complete without inflating the rep totals.
 */
function mapToCompletedExercises(
  workoutPlan: WorkoutPlan,
  exerciseLog?: ExerciseResultLog[],
): CompletedExercise[] {
  // ── 1. Log map — O(1) lookup for the secondary (unlogged) pass ──────────
  const logMap = new Map<string, ExerciseResultLog>();
  if (exerciseLog) {
    for (const entry of exerciseLog) logMap.set(entry.exerciseId, entry);
  }

  // ── 2. Plan map — name + category for log entries that have a plan twin,
  //    and as the source list for the secondary unlogged pass.
  //    Category detection mirrors the old plan-driven logic exactly so the
  //    StrengthSummaryPage grouping stays identical.
  const planMap = new Map<string, { name: string; category: CompletedExercise['category'] }>();
  for (const segment of workoutPlan.segments) {
    if (!segment.exercises) continue;

    const isWarmup =
      segment.id.includes('warmup') || !!segment.title?.includes('חימום');
    const isCooldown =
      segment.id.includes('cooldown') ||
      !!segment.title?.includes('קירור') ||
      !!segment.title?.includes('מתיחות');
    const isSuperset =
      !!segment.title?.includes('סופר') || segment.exercises.length >= 2;

    // Strict mapping to CompletedExercise['category'] union:
    // 'warmup' | 'superset' | 'stretch' | 'main'
    const category: CompletedExercise['category'] = isWarmup
      ? 'warmup'
      : isCooldown
        ? 'stretch'
        : isSuperset
          ? 'superset'
          : 'main';

    for (const ex of segment.exercises) {
      planMap.set(ex.id, { name: ex.name, category });
    }
  }

  const completedExercises: CompletedExercise[] = [];

  // ── 3. Primary pass — iterate the actual performed log ───────────────────
  // This captures swapped-in exercises by their real exerciseId so the
  // summary shows the variant the user actually trained, not the plan ghost.
  for (const entry of exerciseLog ?? []) {
    const planInfo = planMap.get(entry.exerciseId);
    completedExercises.push({
      id: entry.exerciseId,
      name: entry.exerciseName,
      category: planInfo?.category ?? 'main',
      sets: entry.confirmedReps,
      totalReps: entry.confirmedReps.reduce((a, b) => a + b, 0),
      isPersonalRecord: false,
    });
  }

  // ── 4. Secondary pass — append unlogged plan exercises with empty sets ───
  // Preserves full summary list for exercises that were skipped or stripped
  // (e.g. warmup bypass) without fabricating rep counts.
  for (const [planId, info] of planMap) {
    if (!logMap.has(planId)) {
      completedExercises.push({
        id: planId,
        name: info.name,
        category: info.category,
        sets: [],
        totalReps: 0,
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

  // === UNIFIED SESSION STORE (hybrid plumbing, Phase 0) ===
  // Registers this strength player on useSessionStore so cross-mode fields
  // (mode / status / totalDuration) have a live writer from the strength side
  // too. Standalone strength OWNS the session (start + tick + end). If an
  // outer session already exists (future combined workout: a paused run), we
  // only switchMode('strength') and leave ticking/ending to the session owner.
  const ownsSessionRef = useRef(false);
  useEffect(() => {
    const s = useSessionStore.getState();
    if (s.status === 'active' || s.status === 'paused') {
      if (s.mode === 'strength') {
        // Remount of our own session (client-side nav) — reclaim ownership.
        ownsSessionRef.current = true;
      } else {
        s.switchMode('strength');
      }
    } else {
      s.startSession('strength');
      ownsSessionRef.current = true;
    }
  }, []);

  // Wall-clock ticker — mirrors workoutStats.duration semantics (pause is
  // internal to StrengthRunner and does not stop the wall clock today).
  // Gated on ownership so a future combined-workout host doesn't get double
  // ticks: the running player's durationInterval already ticks the store.
  useEffect(() => {
    if (flowState !== 'active' || !ownsSessionRef.current) return;
    const id = setInterval(() => useSessionStore.getState().tick(), 1000);
    return () => clearInterval(id);
  }, [flowState]);

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

  // === EXERCISE HISTORY (Progression Memory) ===
  const [exerciseHistoryMap, setExerciseHistoryMap] = useState<Record<string, number[]>>({});

  // === MID-WORKOUT SWAP STATE ===
  const [swapTarget, setSwapTarget] = useState<{ segIdx: number; exIdx: number; exerciseId: string } | null>(null);
  const [fullSwapExercise, setFullSwapExercise] = useState<FirestoreExercise | null>(null);
  /** Incremented when an exercise is swapped mid-session to force stableWorkoutPlan to update */
  const [workoutVersion, setWorkoutVersion] = useState(0);

  // === LIVE PRESENCE (Social Map heartbeat while workout is active) ===
  useWorkoutPresence({
    activityStatus: 'strength',
    workoutTitle: workoutPlan?.name,
  });

  // === HEATMAP HEARTBEAT (45s active_workouts doc for municipal heat map) ===
  useActiveWorkoutHeartbeat({ workoutType: 'strength' });

  // === USER PROGRESSION (real data from Firestore) ===
  const { profile, refreshProfile } = useUserStore();

  const userProgression = useMemo(() => {
    const prog = profile?.progression;
    const activeProgramId =
      prog?.activePrograms?.[0]?.id ||
      (profile as any)?.currentProgramId ||
      'full_body';

    const track = prog?.tracks?.[activeProgramId];
    const domain = prog?.domains
      ? (prog.domains as Record<string, any>)[activeProgramId]
      : null;

    // For master programs (e.g. full_body), derive level + percent from child tracks
    // so preWorkoutPercentRef captures the real value, not the stale stored one.
    const masterChildren = MASTER_PROGRAM_CHILDREN[activeProgramId];
    let currentLevel: number;
    let percent: number;

    if (masterChildren && prog?.tracks) {
      const childData = masterChildren
        .map((id) => (prog.tracks as Record<string, { currentLevel: number; percent?: number }>)[id])
        .filter((t): t is NonNullable<typeof t> => !!t && typeof t.currentLevel === 'number');
      if (childData.length > 0) {
        const avgLevel = childData.reduce((s, t) => s + t.currentLevel, 0) / childData.length;
        const avgPercent = childData.reduce((s, t) => s + (t.percent ?? 0), 0) / childData.length;
        currentLevel = Math.min(MASTER_LEVEL_CAP, Math.round(avgLevel));
        percent = Math.round(avgPercent);
      } else {
        currentLevel = track?.currentLevel ?? domain?.currentLevel ?? 1;
        percent = track?.percent ?? 0;
      }
    } else {
      currentLevel = track?.currentLevel ?? domain?.currentLevel ?? 1;
      percent = track?.percent ?? 0;
    }

    return {
      programId: activeProgramId,
      currentLevel,
      maxLevel: domain?.maxLevel ?? 25,
      percent,
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
      // This contains the exact workout the user previewed, with all metadata.
      // NOTE: active_workout_data is written by home/page.tsx at generation
      // time and is still present in sessionStorage when the user navigates
      // here from WorkoutPreviewDrawer (which writes to currentWorkoutPlan).
      // The isWarmupActive filter MUST live here too, otherwise the Priority-2
      // filter is never reached and warmup skip has no effect.
      const activeWorkoutRaw = sessionStorage.getItem('active_workout_data');
      if (activeWorkoutRaw) {
        try {
          const parsed = JSON.parse(activeWorkoutRaw) as WorkoutPlan;
          if (parsed && parsed.segments && parsed.segments.length > 0) {
            // Block 1 (Priority-1 mirror) — strip warmup when the preview
            // toggle was set to "דלג" before tapping "התחלת אימון".
            if (parsed.isWarmupActive === false) {
              parsed.segments = parsed.segments.filter(
                (s) =>
                  s.id !== 'warmup-segment' &&
                  s.id !== 'joints-segment' &&
                  !s.title?.includes('חימום') &&
                  !s.title?.includes('מפרקים'),
              );
              console.log('[ActiveWorkoutPage] Full warmup & joint segments stripped (Priority-1 path).');
            }

            setWorkoutPlan({ ...parsed, workoutLocation: storedLocation || parsed.workoutLocation || 'home' });

            // Fetch per-exercise history in the background for smart target selection
            const uid = auth.currentUser?.uid;
            if (uid) {
              const exerciseIds = parsed.segments.flatMap(
                (seg) => (seg.exercises ?? []).map((ex) => ex.id),
              );
              getHistoryMapForExercises(uid, exerciseIds)
                .then(setExerciseHistoryMap)
                .catch(console.warn);
            }

            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('[ActiveWorkoutPage] Error parsing active_workout_data:', err);
        }
      }

      // ── Priority 2: Legacy sessionStorage format (WorkoutPreviewDrawer path) ──
      const storedPlanId = sessionStorage.getItem('currentWorkoutPlanId');
      const stored = sessionStorage.getItem('currentWorkoutPlan');
      
      if (stored && storedPlanId === workoutId) {
        try {
          const parsed = JSON.parse(stored) as WorkoutPlan;
          if (parsed && parsed.segments && parsed.segments.length > 0) {
            // Block 1 — Strip the warmup segment when the user toggled it off
            // in the WorkoutPreviewDrawer before starting the session.
            if (parsed.isWarmupActive === false) {
              parsed.segments = parsed.segments.filter(
                (s) =>
                  s.id !== 'warmup-segment' &&
                  s.id !== 'joints-segment' &&
                  !s.title?.includes('חימום') &&
                  !s.title?.includes('מפרקים'),
              );
              console.log('[ActiveWorkoutPage] Full warmup & joint segments stripped (Priority-2 path).');
            }
            sessionStorage.removeItem('currentWorkoutPlan');
            sessionStorage.removeItem('currentWorkoutPlanId');
            console.log('[ActiveWorkoutPage] Loaded workout from legacy sessionStorage');
            setWorkoutPlan({ ...parsed, workoutLocation: storedLocation || parsed.workoutLocation || 'home' });
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
        setWorkoutPlan({ ...firestoreWorkout, workoutLocation: storedLocation || firestoreWorkout.workoutLocation || 'home' });
      } else {
        setError('לא הצלחנו לטעון את האימון. נסה שוב.');
      }
      
      setIsLoading(false);
    }

    loadWorkout();
  }, [workoutId]);

  // Stable workoutPlan reference — recreates only when ID changes OR when an exercise is swapped.
  // workoutVersion is bumped on swap so the new exercise propagates without resetting the state machine
  // (the machine only resets on workout.id change, which we deliberately keep stable).
  const stableWorkoutPlan = useMemo(() => {
    if (!workoutPlan) return null;
    return workoutPlan;
  }, [workoutPlan?.id, workoutVersion]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Phase 3 + 4: Compute per-domain set counts from segment exercises + log.
    // Two concurrent writes per exercise:
    //   Pass A (anatomical / coarse): MUSCLE_TO_DOMAIN → 'push' | 'pull' | 'legs' | 'core'
    //   Pass B (skill-track / granular): programIds resolved to canonical slugs →
    //           'planche' | 'front_lever' | 'muscle_up' | 'back_lever' | 'handstand' | 'handstand_pushup'
    // Both passes write into the same domainSets dict.  The store merges any
    // incoming string keys natively, so no store changes are required.
    const SKILL_PROGRAM_SLUGS = new Set([
      'planche', 'front_lever', 'muscle_up', 'back_lever',
      'handstand', 'handstand_pushup',
    ]);
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

        // ── Pass A: anatomical domain (unchanged legacy path) ──────────
        const muscle = ex.muscleGroups?.[0]?.toLowerCase();
        const domain = muscle ? MUSCLE_TO_DOMAIN[muscle] : undefined;
        if (domain) {
          domainSets[domain] = (domainSets[domain] ?? 0) + setsCount;
        }

        // ── Pass B: skill-track slug (Phase 4 dual-key write) ──────────
        // Iterates every programId on the plan exercise (populated at generation
        // time from the source exercise's targetPrograms + programIds).
        // resolveToSlug normalises Firestore hash IDs to canonical slugs so
        // exercises stored with hash IDs still credit the correct track.
        for (const pid of ex.programIds ?? []) {
          const slug = resolveToSlug(pid) || pid;
          if (SKILL_PROGRAM_SLUGS.has(slug)) {
            domainSets[slug] = (domainSets[slug] ?? 0) + setsCount;
          }
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

    // End the unified session (owner only) — freezes totalDuration at the
    // moment the player finishes, before the dopamine/summary screens.
    if (ownsSessionRef.current) useSessionStore.getState().endSession();

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

    // Signal to StrengthSummaryPage that progression is in-flight or done so it
    // never double-writes even if it mounts before this async chain resolves.
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('progression_failed_this_session');
      sessionStorage.setItem('progression_started_this_session', 'true');
    }

    const run = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        // ── Build exerciseId → programIds[] lookup from the loaded plan ──
        // The exercise's `programIds` are populated at workout generation time
        // (see src/app/home/page.tsx, where they are spread from the source
        // exercise's targetPrograms + programIds). This unlocks
        // detectLinkedProgramsFromExercises in progression.service.ts so
        // cross-program credit (e.g. Pull session → Front Lever progress)
        // is awarded automatically.
        const exerciseProgramLookup = new Map<string, string[]>();
        if (workoutPlan?.segments) {
          for (const seg of workoutPlan.segments) {
            if (!seg.exercises) continue;
            for (const ex of seg.exercises) {
              if (ex.programIds && ex.programIds.length > 0) {
                exerciseProgramLookup.set(ex.id, ex.programIds);
              }
            }
          }
        }
        const linkedExerciseCount = Array.from(exerciseProgramLookup.values())
          .reduce((sum, ids) => sum + ids.length, 0);
        console.log(
          `[ActiveWorkoutPage] Built exerciseProgramLookup: ${exerciseProgramLookup.size} exercises ` +
          `with ${linkedExerciseCount} cross-program associations`,
        );

        const exerciseResults: WorkoutExerciseResult[] = rawLog.map(entry => {
          const linkedProgramIds = exerciseProgramLookup.get(entry.exerciseId) ?? [];
          // Value 1 is a presence-marker — detectLinkedProgramsFromExercises
          // only checks `!== undefined`, so the actual numeric value is unused
          // by the cross-program detection path. Keeping it stable as 1 also
          // prevents accidental tier confusion in any future readers.
          const programLevels: Record<string, number> = {};
          for (const pid of linkedProgramIds) programLevels[pid] = 1;

          return {
            exerciseId: entry.exerciseId,
            exerciseName: entry.exerciseName,
            programLevels,
            setsCompleted: entry.confirmedReps.length,
            repsPerSet: entry.confirmedReps,
            targetReps: entry.targetReps,
            isCompound: false,
            ...(entry.confirmedRepsRight && { repsPerSetRight: entry.confirmedRepsRight }),
            ...(entry.confirmedRepsLeft && { repsPerSetLeft: entry.confirmedRepsLeft }),
          };
        });

        const result = await processWorkoutCompletion({
          userId: uid,
          activeProgramId: userProgression.programId,
          exercises: exerciseResults,
          totalDuration: Math.max(Math.round(workoutStats.duration / 60), 1),
          completedAt: new Date(),
        });

        setProgressionResult(result);

        // Persist per-exercise reps to Firestore for future session smart targets
        saveExerciseHistory(uid, exerciseResults).catch((e) =>
          console.warn('[ActiveWorkoutPage] saveExerciseHistory failed (non-critical):', e),
        );

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
        // Mark as failed so StrengthSummaryPage's fallback is allowed to re-run
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('progression_failed_this_session', 'true');
        }
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
  const handleSummaryFinish = useCallback(async ({
    xpEarned: awardedXP,
    xpStatus: xpAwardStatus,
  }: {
    xpEarned: number;
    xpStatus: 'pending' | 'awarded' | 'failed';
  }) => {
    const currentUser = auth.currentUser;
    const durationSec = workoutStats.duration;
    const durationMin = Math.max(1, Math.round(durationSec / 60));

    // 0. Detect nearest park (within 200 m) up front so the workout doc, the
    // sessions check-in, and the feed post all see the same parkId. Coordinates
    // come from the shared GPS store (driven by useGPS) — no prompt here; if
    // there's no fix we simply skip park tagging.
    let detectedPark: Awaited<ReturnType<typeof detectNearbyPark>> = null;
    const gpsFix = useGPSStore.getState().coords;
    if (gpsFix) {
      detectedPark = await detectNearbyPark(gpsFix.lat, gpsFix.lng).catch(() => null);
    }

    // 1. Save workout to Firestore history (include XP + optional park tagging)
    let saved = false;
    if (currentUser) {
      try {
        const bolts: 1 | 2 | 3 =
          workoutStats.difficulty === 'easy' ? 1 :
          workoutStats.difficulty === 'hard' ? 3 : 2;
        const totalSetsCount = workoutStats.completedExercises.reduce(
          (acc, ex) => acc + ex.sets.length, 0,
        );
        // sessionXP (streak:0) is used only as a fallback when the Cloud Function
        // hasn't resolved yet.  The authoritative value comes from StrengthSummaryPage
        // via the onFinish callback, which captures what the Guardian CF actually persisted.
        const sessionXP = calculateStrengthWorkoutXP({
          durationMinutes: durationMin,
          difficultyBolts: bolts,
          totalSets: totalSetsCount,
          totalReps: workoutStats.totalReps,
          streak: 0,
        });

        // xpAwardStatus from StrengthSummaryPage.runAwardXP:
        //   'awarded'  → CF succeeded, awardedXP is exact
        //   'pending'  → user tapped finish before CF resolved; use sessionXP (close enough)
        //   'failed'   → CF failed and was rolled back; store 0 and flag for recovery
        const xpToStore =
          xpAwardStatus === 'awarded' ? awardedXP
          : xpAwardStatus === 'pending' ? sessionXP
          : 0;

        // Phase 0 (hybrid plumbing): one strength segment record — the same
        // planned-vs-actual segments[] shape the combined summary will
        // consume. Keys are conditionally spread (no undefined in arrays).
        const plannedExercises = stableWorkoutPlan?.segments?.reduce(
          (acc, seg) => acc + (seg.exercises?.length ?? 0), 0) ?? 0;
        const plannedSets = stableWorkoutPlan?.segments?.reduce(
          (acc, seg) => acc + (seg.exercises?.reduce((a, ex) => a + (ex.sets ?? 0), 0) ?? 0), 0) ?? 0;
        const strengthSegment = {
          index: 0,
          kind: 'strength' as const,
          ...(stableWorkoutPlan?.name ? { label: stableWorkoutPlan.name } : {}),
          ...(plannedExercises > 0 || plannedSets > 0
            ? {
                planned: {
                  ...(plannedExercises > 0 ? { exercises: plannedExercises } : {}),
                  ...(plannedSets > 0 ? { sets: plannedSets } : {}),
                },
              }
            : {}),
          actual: {
            durationSec,
            exercises: workoutStats.completedExercises.length,
            sets: totalSetsCount,
          },
          ...(detectedPark ? { parkId: detectedPark.parkId } : {}),
        };

        saved = await saveWorkout({
          userId: currentUser.uid,
          activityType: 'strength',
          distance: 0,
          duration: durationSec,
          calories: 0,
          pace: 0,
          earnedCoins: 0,
          xpEarned: xpToStore,
          ...(xpAwardStatus === 'failed' ? { xpAwardFailed: true } : {}),
          // Lowercase on purpose: every reader compares === 'strength'.
          // The old 'STRENGTH' literal only matched via the category
          // fallback — legacy docs keep the uppercase value.
          workoutType: 'strength',
          category: 'strength',
          displayIcon: 'dumbbell',
          segments: [strengthSegment],
          ...(detectedPark
            ? { parkId: detectedPark.parkId, parkName: detectedPark.parkName }
            : {}),
        });
        console.log('[ActiveWorkoutPage] Workout saved to history');
      } catch (err) {
        console.error('[ActiveWorkoutPage] Failed to save workout:', err);
      }
    }

    // 1b. Park check-in for `getPopularParks()` analytics.
    // Best-effort: never block UI / navigation on this write.
    if (saved && currentUser && detectedPark?.parkId) {
      const authorityId =
        profile?.core?.authorityId ?? detectedPark.authorityId ?? null;
      if (authorityId) {
        addDoc(collection(db, 'sessions'), {
          authorityId,
          parkId: detectedPark.parkId,
          userId: currentUser.uid,
          date: serverTimestamp(),
        }).catch((err) =>
          console.warn('[ActiveWorkoutPage] Session check-in failed:', err),
        );
      }
      // Remember the user's most-recent park so the Park league card surfaces
      // automatically in /community (read by useArenaAccess).
      updateDoc(doc(db, 'users', currentUser.uid), {
        'core.preferredParkId': detectedPark.parkId,
        'core.preferredParkName': detectedPark.parkName,
      }).catch((err) =>
        console.warn('[ActiveWorkoutPage] preferredPark write failed:', err),
      );
    }

    // 2. Publish to social feed (with scope fields for leaderboard)
    // COMMUNITY_FEED_PAUSED: Gated by IS_COMMUNITY_FEED_ENABLED to stop ghost
    // Firestore writes during the MVP freeze. Re-enable alongside the feed tab.
    if (IS_COMMUNITY_FEED_ENABLED && currentUser && profile?.core?.name) {
      const diffLabel =
        workoutStats.difficulty === 'easy' ? 'קלה' :
        workoutStats.difficulty === 'hard' ? 'גבוהה' : 'בינונית';
      const scope = extractFeedScope(profile);

      const activeProgramId =
        profile?.progression?.activePrograms?.[0]?.id ||
        (profile?.progression as Record<string, unknown>)?.currentProgram as string | undefined ||
        undefined;

      createWorkoutPost({
        authorUid: currentUser.uid,
        authorName: profile.core.name,
        activityCategory: 'strength',
        durationMinutes: durationMin,
        intensityLevel: diffLabel,
        title: stableWorkoutPlan?.name || undefined,
        programId: activeProgramId,
        ...scope,
        groupIds: extractGroupIds(profile),
        ...(detectedPark
          ? { parkId: detectedPark.parkId, parkName: detectedPark.parkName }
          : {}),
      }).catch((err) => console.warn('[ActiveWorkoutPage] Feed post failed:', err));
    }

    // 3. Clean up stored workout data
    // Clear the crash-recovery checkpoint ONLY on a successful Firestore save.
    // If saveWorkout threw, `saved` stays false and the checkpoint is preserved
    // so the resume-offer dialog can protect the user's progress on next launch.
    if (saved) {
      clearWorkoutCheckpoint();
    }
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('active_workout_data');
      sessionStorage.removeItem('currentWorkoutPlanId');
      sessionStorage.removeItem('generatedExerciseRanges');
      sessionStorage.removeItem('progression_started_this_session');
      sessionStorage.removeItem('progression_failed_this_session');
    }
    try {
      await refreshProfile();
    } catch (e) {
      console.error('[ActiveWorkoutPage] Failed to refresh profile before navigating:', e);
    }
    // Release the unified session (owner only) — the store returns to idle so
    // the next workout of any mode can startSession() cleanly.
    if (ownsSessionRef.current) useSessionStore.getState().clearSession();
    router.push('/home');
  }, [router, refreshProfile, workoutStats.duration, workoutStats.difficulty, workoutStats.completedExercises, profile, stableWorkoutPlan]);

  // Handle pause
  const handlePause = () => {
    console.log('Workout paused');
  };

  // Handle resume
  const handleResume = () => {
    console.log('Workout resumed');
  };

  // === MID-WORKOUT SWAP HANDLERS ===

  /**
   * Called by StrengthRunner when the user taps "החלפת תרגיל".
   * Fetches the full Firestore Exercise, then opens the replacement modal.
   */
  const handleSwapExercise = useCallback(
    async (exerciseId: string, segIdx: number, exIdx: number) => {
      setSwapTarget({ segIdx, exIdx, exerciseId });
      try {
        const full = await getFirestoreExercise(exerciseId);
        if (full) {
          setFullSwapExercise(full);
        } else {
          console.warn('[ActiveWorkoutPage] Could not fetch exercise for swap:', exerciseId);
          setSwapTarget(null);
        }
      } catch (e) {
        console.error('[ActiveWorkoutPage] handleSwapExercise fetch failed:', e);
        setSwapTarget(null);
      }
    },
    [],
  );

  /**
   * Called by ExerciseReplacementModal when the user confirms a replacement.
   *
   * Context-Preserving Mutation — three guarantees:
   *   1. Volume preservation: sets / reps / repsRange / restSeconds / duration
   *      are copied verbatim from the OLD exercise so the set counter never
   *      collapses back to Firestore defaults (typically 1-2 sets).
   *   2. Superset linkage: the old exercise's `pairedWith` string is forwarded
   *      onto the new exercise node so it stays bound to its partner.
   *   3. Bi-directional re-link: the partner exercise's `pairedWith` pointer
   *      is updated from the OLD exercise ID to the NEW exercise ID so the
   *      mutual link remains intact and section-grouping keeps the pair card.
   */
  const handleReplaceExercise = useCallback(
    (newExercise: FirestoreExercise, executionMethod: ExecutionMethod) => {
      if (!swapTarget || !workoutPlan) return;

      const { segIdx, exIdx } = swapTarget;
      const segment = workoutPlan.segments[segIdx];
      if (!segment) return;

      // ── Step 1: Snapshot session context from the OLD exercise ──────────
      const oldExercise = segment.exercises?.[exIdx];
      const inheritedSets        = oldExercise?.sets;
      const inheritedReps        = oldExercise?.reps;
      const inheritedDuration    = oldExercise?.duration;
      const inheritedRepsRange   = oldExercise?.repsRange;
      const inheritedRestSeconds = (oldExercise as any)?.restSeconds as number | undefined;
      const inheritedPairedWith  = (oldExercise as any)?.pairedWith as string | null | undefined;

      // Re-use the enrichExercise helper already in this file (resolves media,
      // goal text, equipment from the new Firestore document + location)
      const enriched = enrichExercise(
        newExercise,
        (segment as any).segmentRole ?? 'main',
        segment.target,
        workoutLocation,
      );

      // ── Step 2: Overlay preserved volume + superset binding ─────────────
      const newWorkoutExercise = {
        ...enriched,
        // Volume preservation — engine-assigned budget survives the swap
        ...(inheritedSets        != null && { sets: inheritedSets }),
        ...(inheritedReps        != null && { reps: inheritedReps }),
        ...(inheritedDuration    != null && { duration: inheritedDuration }),
        ...(inheritedRepsRange   != null && { repsRange: inheritedRepsRange }),
        ...(inheritedRestSeconds != null && { restSeconds: inheritedRestSeconds }),
        // Superset linkage — carry the old pairedWith string forward
        pairedWith: inheritedPairedWith ?? null,
        wasSwapped: true,
      };

      // ── Step 3: Deep-clone segments, replace target + re-link partner ───
      const newSegments = workoutPlan.segments.map((seg, si) => {
        if (si !== segIdx) return seg;

        const exercises = [...(seg.exercises ?? [])];
        exercises[exIdx] = newWorkoutExercise as any;

        // Bi-directional binding update: redirect the superset partner's
        // pairedWith from the OLD exercise ID to the NEW exercise ID so
        // section-grouping still sees a mutual pair.
        if (inheritedPairedWith) {
          const partnerIdx = exercises.findIndex(
            (e, i) => i !== exIdx && e.id === inheritedPairedWith,
          );
          if (partnerIdx !== -1) {
            exercises[partnerIdx] = {
              ...exercises[partnerIdx],
              pairedWith: newExercise.id,
            } as any;
            console.log(
              `[ActiveWorkoutPage] Superset re-link: partner "${exercises[partnerIdx].name}" ` +
              `pairedWith updated "${oldExercise?.id}" → "${newExercise.id}"`,
            );
          } else {
            console.warn(
              `[ActiveWorkoutPage] Superset partner id="${inheritedPairedWith}" not found ` +
              `in segment ${segIdx} — pairedWith forwarded on new exercise but partner ` +
              `pointer not updated (possible cross-segment split).`,
            );
          }
        }

        return { ...seg, exercises };
      });

      setWorkoutPlan({ ...workoutPlan, segments: newSegments });
      setWorkoutVersion((v) => v + 1);

      console.log(
        `[ActiveWorkoutPage] Swapped [${segIdx}][${exIdx}]: "${oldExercise?.name}" → "${newExercise.id}"` +
        (inheritedPairedWith ? ` | superset pair preserved` : ''),
      );

      // Clean up modal state
      setSwapTarget(null);
      setFullSwapExercise(null);
    },
    [swapTarget, workoutPlan, workoutLocation],
  );

  // === LOADING STATE ===
  if (isLoading) {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center bg-gradient-to-b from-white to-gray-50">
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
      <div className="w-full h-[100dvh] flex items-center justify-center bg-gradient-to-b from-white to-gray-50" dir="rtl">
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
      <div
        className="fixed inset-0 w-full h-[100dvh] overflow-hidden flex flex-col"
        style={{ overscrollBehavior: 'none' }}
      >
        <StrengthRunner
          workout={stableWorkoutPlan}
          onComplete={handleComplete}
          onPause={handlePause}
          onResume={handleResume}
          onSwapExercise={handleSwapExercise}
          exerciseHistoryMap={exerciseHistoryMap}
        />
        <KudoToast kudo={currentKudo} onDismiss={dismissKudo} />

        {/* Mid-workout exercise replacement modal */}
        {swapTarget && fullSwapExercise && profile && (
          <ExerciseReplacementModal
            isOpen={true}
            onClose={() => { setSwapTarget(null); setFullSwapExercise(null); }}
            currentExercise={fullSwapExercise}
            currentLevel={userProgression.currentLevel}
            location={workoutLocation as any}
            park={null}
            userProfile={profile as any}
            onReplace={handleReplaceExercise}
          />
        )}
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

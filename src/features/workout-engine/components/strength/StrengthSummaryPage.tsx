"use client";

/**
 * StrengthSummaryPage - Detailed Workout Summary Screen
 * 
 * Features:
 * - MET-based calorie calculation
 * - Coins with difficulty bonus
 * - Exercise breakdown by category (warmup/superset/stretches)
 * - Monthly achievements progress (from Activity Store)
 * - Level progress indicator
 * - RTL Hebrew support
 * - Logs workout to Activity Store for rings/streak update
 */

import React, { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Flame, 
  Clock, 
  Flag, 
  Dumbbell, 
  ChevronDown, 
  Sparkles, 
  TrendingUp,
  Trophy,
  Timer,
  Coins,
  Medal,
  Check,
  ChevronRight,
  Star,
  Calendar,
  Shield,
} from 'lucide-react';
import AccountSecureStep from '@/features/user/onboarding/components/steps/AccountSecureStep';
import { syncFieldToFirestore } from '@/lib/firestore.service';
import { useDailyActivity, useWeeklyProgress } from '@/features/activity';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { syncWorkoutCompletion } from '@/features/workout-engine/services/completion-sync.service';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { trackMuscleUsage } from '@/features/workout-engine/services/split-decision';
import { getExercise } from '@/features/content/exercises/core/exercise.service';
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';
// calculateStrengthWorkoutXP is now called internally by useProgressionStore.awardStrengthXP
import { processWorkoutCompletion } from '@/features/user/progression/services/progression.service';
import type { WorkoutCompletionResult } from '@/features/user/core/types/progression.types';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';
import CircularProgress from '@/components/CircularProgress';

// ============================================================================
// TYPES
// ============================================================================

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface CompletedExercise {
  id: string;
  name: string;
  category: 'warmup' | 'superset' | 'stretch' | 'main';
  sets: number[];  // Array of reps per set, e.g. [30, 30, 30]
  totalReps: number;
  isPersonalRecord?: boolean;
}

export interface StrengthSummaryPageProps {
  /** Duration in seconds */
  duration: number;
  
  /** Total reps across all exercises */
  totalReps: number;
  
  /** List of completed exercises with their details */
  completedExercises: CompletedExercise[];
  
  /** Workout difficulty level */
  difficulty: Difficulty;
  
  /** Current streak (consecutive workouts) */
  streak?: number;
  
  /** Current program ID (e.g. 'full_body', 'push') - used for domain progression */
  programId?: string;
  
  /** Current program name */
  programName?: string;
  
  /** Current level in program */
  currentLevel?: number;
  
  /** Max level in program */
  maxLevel?: number;
  
  /** Progress percentage to next level */
  progressToNextLevel?: number;
  
  /** Callback when user finishes viewing summary */
  onFinish: () => void;

  // ── Training OS fields ────────────────────────────────────────────────
  /** Whether this workout was a recovery session (skip volume budget) */
  isRecovery?: boolean;
  /** Total planned sets from the generated workout */
  totalPlannedSets?: number;
  /** Numeric difficulty (1-3) if available */
  difficultyBolts?: 1 | 2 | 3;

  // ── Persona Engine fields ──────────────────────────────────────────────
  /**
   * Training type of the source Program ('strength' | 'cardio').
   * Determines which ActivityCategory ring the workout minutes fill.
   * Falls back to 'strength' when absent (all legacy workouts are strength).
   */
  trainingType?: 'strength' | 'cardio';

  // ── Program Goal Sync ────────────────────────────────────────────────
  /**
   * Admin-defined level goals from ProgramLevelSettings.
   * When provided, the summary page shows these as a checklist
   * and auto-checks goals that the workout fulfilled.
   */
  levelGoals?: LevelGoalDef[];

  // ── Phase 4.6: Real Scoring Pipeline ──────────────────────────────
  /**
   * Raw exercise log from StrengthRunner with correct targetReps per exercise.
   * Used by processWorkoutCompletion for accurate scoring (overachievement
   * bonus, volume ratio, partial-workout support).
   */
  rawExerciseLog?: { exerciseId: string; exerciseName: string; segmentId: string; confirmedReps: number[]; targetReps: number }[];

  /**
   * Pre-computed progression result from ActiveWorkoutPage.
   * When provided, SummaryPage skips calling processWorkoutCompletion
   * to avoid double-writes and guarantees Dopamine + Summary show identical values.
   */
  precomputedProgression?: WorkoutCompletionResult | null;

  /** Per-domain set counts for weekly volume tracking (Phase 3). */
  domainSets?: Record<string, number>;
}

export interface LevelGoalDef {
  id: string;
  exerciseName: string;
  targetValue: number;
  unit: 'reps' | 'seconds';
  label: string; // Hebrew display label
  progressBonus?: number; // Admin-defined % awarded when goal is met
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** MET values by difficulty */
const MET_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 3.5,
  medium: 6.0,
  hard: 8.0,
};

/** 
 * Coin ratio - 1:1 with calories for simplicity
 * This makes it easy for users to understand: 1 calorie = 1 coin
 */
const COIN_RATIO = 1;

/**
 * Bonus coins by difficulty level
 * Harder workouts earn a multiplier on top of base coins
 */
const COIN_BONUS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 1.0,    // No bonus
  medium: 1.25, // 25% bonus
  hard: 1.5,    // 50% bonus
};

/** Default user weight for calorie calculation (kg) */
const DEFAULT_WEIGHT_KG = 75;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate calories using MET formula
 * Formula: MET × 0.0175 × weightKg × durationMinutes
 */
function calculateCalories(
  durationSeconds: number,
  difficulty: Difficulty,
  weightKg: number = DEFAULT_WEIGHT_KG
): number {
  const met = MET_BY_DIFFICULTY[difficulty];
  const durationMinutes = durationSeconds / 60;
  return Math.round(met * 0.0175 * weightKg * durationMinutes);
}

/**
 * Calculate coins earned
 * Coins = Calories × COIN_RATIO (1:1 ratio)
 */
function calculateCoins(calories: number): number {
  return Math.round(calories * COIN_RATIO);
}

/**
 * Format duration from seconds to MM:SS
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Group exercises by category
 */
function groupExercisesByCategory(exercises: CompletedExercise[]): Record<string, CompletedExercise[]> {
  return exercises.reduce((acc, ex) => {
    const category = ex.category || 'main';
    if (!acc[category]) acc[category] = [];
    acc[category].push(ex);
    return acc;
  }, {} as Record<string, CompletedExercise[]>);
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Stat Box Component
 */
function StatBox({ 
  label, 
  value, 
  icon, 
  iconColor = 'text-primary',
  showTrend = false,
  hasBorder = false,
}: { 
  label: string; 
  value: string | number; 
  icon: React.ReactNode;
  iconColor?: string;
  showTrend?: boolean;
  hasBorder?: boolean;
}) {
  return (
    <div className={`flex flex-col ${hasBorder ? 'border-x border-slate-100 dark:border-slate-700 px-6' : ''}`}>
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <div className={`flex items-center justify-center gap-1 ${iconColor}`}>
        <span className="text-lg font-bold">{value}</span>
        {showTrend && <TrendingUp className="w-4 h-4" />}
        {!showTrend && icon}
      </div>
    </div>
  );
}

/**
 * Achievement Badge Component
 */
function AchievementBadge({ 
  icon, 
  current, 
  total, 
  label,
  progress,
}: { 
  icon: React.ReactNode;
  current: number;
  total: number;
  label: string;
  progress: number; // 0-360 degrees
}) {
  const rotation = Math.min(progress, 360) - 90; // Start from top
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-12 h-12 mb-2">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div 
          className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <span className="text-[10px] font-bold text-slate-500">{current}/{total}</span>
      <span className="text-[9px] text-slate-400 text-center leading-tight">{label}</span>
    </div>
  );
}

/**
 * Exercise Row Component
 * Shows total reps and completion percentage. Unperformed exercises show 0%.
 */
function ExerciseRow({ exercise }: { exercise: CompletedExercise }) {
  const wasPerformed = exercise.sets.length > 0;
  const estimatedTarget = wasPerformed
    ? Math.max(...exercise.sets) * exercise.sets.length
    : 0;
  const completionPercent = !wasPerformed
    ? 0
    : estimatedTarget > 0
      ? Math.min(150, Math.round((exercise.totalReps / estimatedTarget) * 100))
      : 0;
  
  return (
    <div className="flex justify-between items-center">
      {/* Total reps with trend */}
      <div className="flex items-center gap-1 bg-white dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-600 shadow-sm">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
        <span className="text-slate-800 dark:text-white font-bold text-xs">{exercise.totalReps}</span>
      </div>
      
      {/* Completion percentage badge */}
      <div className={`px-3 py-1.5 rounded-lg border shadow-sm ${
        completionPercent >= 100
          ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800'
          : !wasPerformed
            ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
            : 'bg-white dark:bg-slate-700 border-slate-100 dark:border-slate-600'
      }`}>
        <span className={`font-bold text-xs ${
          completionPercent >= 100
            ? 'text-green-600 dark:text-green-400'
            : !wasPerformed
              ? 'text-slate-400 dark:text-slate-500'
              : 'text-slate-800 dark:text-white'
        }`}>
          {wasPerformed ? `${completionPercent}%` : 'לא בוצע'}
        </span>
      </div>
      
      {/* Exercise name */}
      <div className={`px-4 py-2 rounded-xl border shadow-sm flex-1 mr-4 ${
        wasPerformed
          ? 'bg-white dark:bg-slate-700 border-slate-100 dark:border-slate-600'
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700 opacity-60'
      }`}>
        <p className="text-[10px] text-slate-800 dark:text-white text-right leading-none">
          {exercise.name}
        </p>
      </div>
    </div>
  );
}

/**
 * Exercise Category Section
 */
function ExerciseCategory({ 
  title, 
  exercises 
}: { 
  title: string; 
  exercises: CompletedExercise[];
}) {
  if (exercises.length === 0) return null;
  
  return (
    <div className="px-4 py-2 border-t border-slate-50 dark:border-slate-700 first:border-t-0">
      <p className="text-[11px] font-bold text-slate-400 text-right mb-2">{title}</p>
      <div className="space-y-2">
        {exercises.map((ex) => (
          <ExerciseRow key={ex.id} exercise={ex} />
        ))}
      </div>
    </div>
  );
}

/**
 * Personal Records Section
 */
function PersonalRecords({ exercises }: { exercises: CompletedExercise[] }) {
  const records = exercises.filter(ex => ex.isPersonalRecord);
  
  if (records.length === 0) return null;
  
  return (
    <div className="bg-sky-100 dark:bg-sky-900/30 rounded-2xl p-4 border border-sky-200 dark:border-sky-800/50">
      <div className="flex items-center justify-between mb-3">
        <Sparkles className="w-5 h-5 text-sky-600 dark:text-sky-400" />
        <h3 className="text-sky-600 dark:text-sky-400 font-bold text-base">שיא חדש!</h3>
      </div>
      <div className="space-y-2">
        {records.map((ex) => (
          <div key={ex.id} className="flex justify-between items-center">
            <span className="text-slate-800 dark:text-slate-200 font-bold">{ex.totalReps}</span>
            <span className="text-slate-700 dark:text-slate-300 text-sm">{ex.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function StrengthSummaryPage({
  duration,
  totalReps,
  completedExercises,
  difficulty,
  streak: propStreak = 0,
  programId: propProgramId,
  programName = 'תוכנית כל הגוף',
  currentLevel = 5,
  maxLevel = 25,
  progressToNextLevel = 80,
  onFinish,
  // Training OS
  isRecovery = false,
  totalPlannedSets,
  difficultyBolts,
  // Persona Engine
  trainingType,
  // Program Goal Sync
  levelGoals,
  // Phase 4.6: Real Scoring Pipeline
  rawExerciseLog,
  precomputedProgression,
  // Phase 3: Per-domain volume tracking
  domainSets,
}: StrengthSummaryPageProps) {
  // Track if workout has been logged to prevent double-logging
  const hasLoggedWorkout = useRef(false);

  // ── User profile (for lifestyle CTA check) ──
  const { profile } = useUserStore();

  // ── Hydration-safe sessionStorage reads (avoid SSR mismatch) ──
  const [skippedBridge, setSkippedBridge] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSkippedBridge(sessionStorage.getItem('skipped_bridge') === 'true');
    }
  }, []);

  // ── Post-Workout Email Capture Drawer ──
  const [showEmailDrawer, setShowEmailDrawer] = useState(false);
  const [showInlineAccount, setShowInlineAccount] = useState(false);

  useEffect(() => {
    const isAnonymous = auth.currentUser?.isAnonymous ?? true;
    const hasEmail = !!profile?.core?.email;
    const dismissed = typeof window !== 'undefined'
      ? sessionStorage.getItem('dismissed_email_cta') === 'true'
      : false;

    if (!hasEmail && isAnonymous && !dismissed) {
      const timer = setTimeout(() => setShowEmailDrawer(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [profile]);

  const handleEmailCaptured = async (secured: boolean, method?: string, email?: string) => {
    if (secured && email) {
      await syncFieldToFirestore('core.email', email);
    }
    setShowInlineAccount(false);
    setShowEmailDrawer(false);
  };

  const dismissEmailDrawer = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dismissed_email_cta', 'true');
    }
    setShowEmailDrawer(false);
  };

  // Progression result state — initialized from precomputed if available (no duplicate call)
  const [progressionResult, setProgressionResult] = useState<WorkoutCompletionResult | null>(
    precomputedProgression ?? null
  );
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const { celebrate } = useGoalCelebration();

  useEffect(() => {
    if (showLevelUpModal) {
      celebrate('level_up', 300);
    }
  }, [showLevelUpModal, celebrate]);

  // ── Live progression values: update after processWorkoutCompletion resolves ──
  const liveLevel = progressionResult?.success && progressionResult.activeProgramGain.leveledUp
    ? progressionResult.activeProgramGain.newLevel ?? currentLevel + 1
    : currentLevel;
  const livePercent = progressionResult?.success
    ? Math.round(progressionResult.activeProgramGain.newPercent)
    : progressToNextLevel;
  
  const { showToast } = useToast();

  // Get progression store for coins
  const { addCoins } = useProgressionStore();

  // TRAINING OS: Get weekly volume store for reactive tracking
  const { recordStrengthSession } = useWeeklyVolumeStore();
  
  // Get real streak and weekly data from Activity hooks
  const { 
    streak: activityStreak, 
    totalMinutesToday,
    caloriesToday,
  } = useDailyActivity();
  
  const {
    summary: weeklySummary,
    totalMinutes: weeklyMinutes,
    daysWithActivity,
  } = useWeeklyProgress();
  
  // Use activity store streak if available, otherwise use prop
  const streak = activityStreak > 0 ? activityStreak : propStreak;
  
  // Calculate stats
  const calories = calculateCalories(duration, difficulty);
  const coins = calculateCoins(calories); // 1:1 ratio with calories
  const formattedDuration = formatDuration(duration);
  
  // Calculate duration in minutes — real elapsed time, no clamp.
  // Accurate duration is critical for WHO compliance tracking.
  const durationMinutes = Math.max(Math.round(duration / 60), 1); // min 1 to avoid logging 0
  
  // Log workout to Activity Store and add coins on mount
  useEffect(() => {
    if (hasLoggedWorkout.current) return;
    hasLoggedWorkout.current = true;
    
    const activityCategory = trainingType === 'cardio' ? 'cardio' : 'strength';
    syncWorkoutCompletion({
      workoutType: 'strength',
      durationMinutes,
      calories,
      activityCategory,
      displayIcon: 'dumbbell',
      workoutTitle: programName,
    });
    
    // Update Progression Store (global coins)
    console.log('[StrengthSummaryPage] Adding coins to ProgressionStore:', coins);
    addCoins(coins);

    // ── TRAINING OS: Update Weekly Volume Store ─────────────────────────
    // Only non-recovery workouts consume the weekly volume budget.
    // Sets are counted exclusively from the raw exercise log (no phantom inflation).
    const actualSetsCompleted = rawExerciseLog && rawExerciseLog.length > 0
      ? rawExerciseLog.reduce((sum, entry) => sum + entry.confirmedReps.length, 0)
      : completedExercises
          .filter(ex => ex.category === 'main' || ex.category === 'superset')
          .reduce((sum, ex) => sum + ex.sets.length, 0);
    const plannedSets = totalPlannedSets ?? actualSetsCompleted;
    const diffNum: 1 | 2 | 3 = difficultyBolts ?? (difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2);

    const sessionExerciseIds = (rawExerciseLog && rawExerciseLog.length > 0)
      ? rawExerciseLog.map(e => e.exerciseId).filter(Boolean)
      : completedExercises.filter(ex => ex.category === 'main' || ex.category === 'superset').map(ex => ex.id);

    recordStrengthSession(
      actualSetsCompleted,
      plannedSets,
      diffNum,
      isRecovery,
      propProgramId,
      undefined, // durationMinutes — computed separately
      domainSets,
      sessionExerciseIds,
    );

    console.log(
      `[StrengthSummaryPage] Volume tracked: ${actualSetsCompleted}/${plannedSets} sets` +
        ` (D${diffNum}, recovery=${isRecovery})`,
    );

    // ── 48-Hour Muscle Shield: Track trained muscles for next session ───
    const trackMusclesForShield = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const exerciseIds = [
          ...new Set([
            ...completedExercises.map((e) => e.id),
            ...(rawExerciseLog?.map((e) => e.exerciseId).filter(Boolean) ?? []),
          ]),
        ] as string[];

        if (exerciseIds.length === 0) return;

        const exercises = await Promise.all(exerciseIds.map((id) => getExercise(id)));
        const muscles = new Set<MuscleGroup>();
        for (const ex of exercises) {
          if (ex?.primaryMuscle) muscles.add(ex.primaryMuscle);
          ex?.secondaryMuscles?.forEach((m) => muscles.add(m));
        }

        if (muscles.size > 0) {
          const today = new Date().toISOString().split('T')[0];
          const pid = propProgramId?.toLowerCase() ?? '';
          const LEG_MUSCLES = new Set(['quads', 'hamstrings', 'glutes', 'calves', 'hip_flexors']);
          const legMuscleCount = Array.from(muscles).filter(m => LEG_MUSCLES.has(m)).length;
          const isLegsDominant = legMuscleCount >= muscles.size / 2;

          const sessionFocus: string | undefined =
            pid.includes('legs') || pid.includes('lower_body') || isLegsDominant
              ? 'legs'
              : pid.includes('push')
                ? 'push'
                : pid.includes('pull')
                  ? 'pull'
                  : undefined;

          await trackMuscleUsage({
            userId: uid,
            trainedMuscleGroups: Array.from(muscles),
            sessionDate: today,
            sessionFocus,
          });
        }
      } catch (e) {
        console.warn('[StrengthSummaryPage] trackMuscleUsage failed:', e);
      }
    };
    trackMusclesForShield();

    // Award global XP via centralized store action (uses overhauled formula)
    const awardXP = async () => {
      try {
        const bolts: 1 | 2 | 3 = difficultyBolts ?? (difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3);
        const totalSetsCount = completedExercises.reduce((acc, ex) => acc + ex.sets.length, 0);
        const currentStreak = useProgressionStore.getState().currentStreak;

        const result = await useProgressionStore.getState().awardStrengthXP({
          durationMinutes,
          difficultyBolts: bolts,
          totalSets: totalSetsCount,
          totalReps,
          streak: currentStreak,
        });

        console.log(`[XP] +${result.xpEarned} XP → Level ${result.newLevel}${result.leveledUp ? ' (LEVEL UP!)' : ''}`);
      } catch (e) {
        console.error('[XP] Failed to award XP:', e);
      }
    };
    awardXP();

    // ✅ WORKOUT BRIDGE: Trigger domain-specific progression + master-level recalculation
    // Skip if the result was already computed by ActiveWorkoutPage (prevents double-writes)
    if (precomputedProgression) {
      console.log('[Progression] Using precomputed result from ActiveWorkoutPage — skipping duplicate call');
      if (precomputedProgression.success && precomputedProgression.activeProgramGain.leveledUp) {
        setTimeout(() => setShowLevelUpModal(true), 1200);
      }
    } else {
      const triggerDomainProgression = async () => {
        try {
          const uid = auth.currentUser?.uid;
          if (!uid) return;

          let activeProgramId = propProgramId;
          if (!activeProgramId) {
            const userDocRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
              const userData = userSnap.data();
              activeProgramId = userData.currentProgramId || 
                                userData.progression?.activePrograms?.[0]?.id || 
                                'full_body';
            } else {
              activeProgramId = 'full_body';
            }
          }

          const exerciseResults = rawExerciseLog && rawExerciseLog.length > 0
            ? rawExerciseLog.map(entry => ({
                exerciseId: entry.exerciseId,
                exerciseName: entry.exerciseName,
                programLevels: {} as Record<string, number>,
                setsCompleted: entry.confirmedReps.length,
                repsPerSet: entry.confirmedReps,
                targetReps: entry.targetReps,
                isCompound: false,
              }))
            : completedExercises
                .filter(ex => ex.category === 'main' || ex.category === 'superset')
                .map(ex => ({
                  exerciseId: ex.id,
                  exerciseName: ex.name,
                  programLevels: {} as Record<string, number>,
                  setsCompleted: ex.sets.length,
                  repsPerSet: ex.sets,
                  targetReps: ex.sets.length > 0 ? Math.max(...ex.sets) : 10,
                  isCompound: ex.category === 'superset',
                }));

          if (exerciseResults.length === 0) {
            console.log('[Progression] No main/superset exercises to process — skipping domain progression');
            return;
          }

          const result = await processWorkoutCompletion({
            userId: uid,
            activeProgramId,
            exercises: exerciseResults,
            totalDuration: durationMinutes,
            completedAt: new Date(),
          });

          setProgressionResult(result);

          if (result.success) {
            const gain = result.activeProgramGain;
            console.log(
              `[Progression] Domain progression: ${activeProgramId} +${gain.totalGain.toFixed(1)}%` +
                ` (base=${gain.baseGain.toFixed(1)}, perf=${gain.bonusGain.toFixed(1)}, goals=${gain.goalBonusGain.toFixed(1)})` +
                (gain.leveledUp ? ` → LEVEL UP to ${gain.newLevel}!` : ` (now ${gain.newPercent.toFixed(1)}%)`),
            );

            if (gain.leveledUp) {
              setTimeout(() => setShowLevelUpModal(true), 1200);
            }

            // ── Unified Rewards: award one-time Global XP bonus for newly completed goals ──
            if (gain.newlyCompletedGoalIds && gain.newlyCompletedGoalIds.length > 0) {
              try {
                const levelSettings = await getProgramLevelSetting(activeProgramId, currentLevel);
                const allGoals = levelSettings?.targetGoals ?? [];
                const bonusXP = gain.newlyCompletedGoalIds.reduce((sum, id) => {
                  const goal = allGoals.find((g: any) => g.exerciseId === id);
                  return sum + (goal?.xpBonus ?? 0);
                }, 0);
                if (bonusXP > 0) {
                  useProgressionStore.getState().awardBonusXP(bonusXP, 'goal-completion').then(({ xpEarned }) => {
                    console.log(`[Progression] Goal XP bonus: +${xpEarned} Global XP for ${gain.newlyCompletedGoalIds!.length} completed goal(s)`);
                  }).catch(() => {});
                }
              } catch (e) {
                console.warn('[Progression] Could not award goal XP bonus (non-critical):', e);
              }
            }

            if (result.linkedProgramGains.length > 0) {
              console.log(`[Progression] Linked programs updated:`,
                result.linkedProgramGains.map(lp => `${lp.programId} +${lp.gain.toFixed(1)}%`).join(', '));
            }

            if (result.readyForSplit?.isReady) {
              console.log(`[Progression] Ready for split! Suggested: ${result.readyForSplit.suggestedPrograms?.join(', ')}`);
            }
            // Warn if the Firestore write did not persist
            if (!result.trackWriteSucceeded) {
              showToast('error', 'ההתקדמות חושבה אך לא נשמרה. בדוק חיבור לאינטרנט.');
            }
          } else {
            console.warn('[Progression] processWorkoutCompletion returned failure');
            showToast('error', 'שגיאה בחישוב ההתקדמות. נסה שוב.');
          }
        } catch (e) {
          console.error('[Progression] Failed to process domain progression:', e);
        }
      };
      triggerDomainProgression();
    }
  }, [addCoins, durationMinutes, calories, coins, difficulty, propProgramId, completedExercises, recordStrengthSession, isRecovery, totalPlannedSets, difficultyBolts, precomputedProgression, rawExerciseLog, domainSets]);
  
  // Group exercises by category
  const groupedExercises = groupExercisesByCategory(completedExercises);

  // ── Self-fetch level goals when not passed as props ──
  const [fetchedGoals, setFetchedGoals] = useState<LevelGoalDef[]>([]);
  useEffect(() => {
    if (levelGoals && levelGoals.length > 0) return; // Props provided — skip fetch
    const programId = propProgramId;
    if (!programId) return;
    let cancelled = false;

    getProgramLevelSetting(programId, currentLevel).then((settings) => {
      if (cancelled || !settings?.targetGoals?.length) return;
      const defs: LevelGoalDef[] = settings.targetGoals.map((tg, idx) => {
        const unitLabel = tg.unit === 'reps' ? 'חזרות' : 'שניות';
        return {
          id: tg.exerciseId || `goal-${idx}`,
          exerciseName: tg.exerciseName,
          targetValue: tg.targetValue,
          unit: tg.unit,
          label: `${tg.exerciseName} — ${tg.targetValue} ${unitLabel}`,
          progressBonus: (tg as any).progressBonus,
        };
      });
      setFetchedGoals(defs);
    }).catch((e) => console.error('[SummaryPage] Failed to fetch level goals:', e));

    return () => { cancelled = true; };
  }, [levelGoals, propProgramId, currentLevel]);

  const resolvedGoals = (levelGoals && levelGoals.length > 0) ? levelGoals : fetchedGoals;
  
  // ── Program Goal Sync: Evaluate admin-defined level goals ──
  const evaluatedGoals = (resolvedGoals || []).map((goal) => {
    // Find matching exercise in completed exercises
    const match = completedExercises.find(
      (ex) => ex.name.toLowerCase().includes(goal.exerciseName.toLowerCase()) ||
              ex.id === goal.id,
    );
    const bestValue = match
      ? goal.unit === 'reps'
        ? Math.max(...match.sets, 0)
        : match.totalReps  // For seconds, totalReps holds total hold time
      : 0;
    return {
      ...goal,
      achieved: bestValue >= goal.targetValue,
      bestValue,
    };
  });

  // Category labels in Hebrew
  const categoryLabels: Record<string, string> = {
    warmup: 'חימום',
    superset: 'סופר סט',
    stretch: 'מתיחות',
    main: 'עיקרי',
  };
  
  // Calculate real achievement progress from weekly data
  const weeklyStrengthMinutes = weeklySummary?.categoryTotals?.strength || 0;
  const weeklyStrengthSessions = Math.floor(weeklyStrengthMinutes / 30); // ~30 min per session
  const weeklyGoalSessions = 3; // Target 3 strength sessions per week
  
  return (
    <div 
      className="fixed inset-0 z-[100] w-full h-full bg-slate-50 dark:bg-card-dark flex flex-col overflow-hidden"
      dir="rtl"
    >
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4 pt-[env(safe-area-inset-top)]">
          
          {/* Top Stats Row */}
          <div className="flex justify-between items-center text-center px-2">
            {/* Calories (was "שיפור ביצועים") */}
            <StatBox
              label="קלוריות"
              value={calories}
              icon={<Flame className="w-4 h-4" />}
              iconColor="text-orange-500"
              showTrend={false}
            />
            
            {/* Duration */}
            <StatBox
              label="זמן"
              value={formattedDuration}
              icon={<Clock className="w-4 h-4" />}
              iconColor="text-slate-800 dark:text-white"
              hasBorder
            />
            
            {/* Streak */}
            <StatBox
              label="אימונים ברצף"
              value={streak}
              icon={<Flag className="w-4 h-4" />}
              iconColor="text-slate-800 dark:text-white"
            />
          </div>
          
          {/* Program Progress Card — uses live values after processWorkoutCompletion */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-700 flex items-center justify-between">
            <div className="flex flex-col flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Dumbbell className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">{programName}</h2>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                  רמה {liveLevel}/{maxLevel}
                </span>
                <div className="flex items-center gap-1 mt-1">
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-500">
                    עוד {100 - livePercent}% לרמה {liveLevel + 1}
                  </span>
                </div>
              </div>
            </div>
            <CircularProgress percentage={livePercent} />
          </div>

          {/* Gain Breakdown — Real values from processWorkoutCompletion */}
          {progressionResult?.success && (() => {
            // 1. Completion: % of sets performed vs required
            const completionPct = progressionResult.sessionCompletionPercent;
            // 2. Performance: % of admin-defined goal targets met this session
            const totalGoals = progressionResult.goalProgress.length;
            const metGoals = progressionResult.goalProgress.filter(g => g.achieved).length;
            const performancePct = totalGoals > 0 ? Math.round((metGoals / totalGoals) * 100) : 0;
            // 3. Consistency: bonus if weekly sessions >= target (3)
            const consistencyBonus = weeklyStrengthSessions >= weeklyGoalSessions;

            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-700"
              >
                <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-3">פירוט התקדמות</h3>
                <div className="space-y-2">
                  {/* Completion — sets performed / required */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-cyan-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-200">השלמת אימון</span>
                    </div>
                    <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                      {completionPct}%
                    </span>
                  </div>

                  {/* Performance — goal targets met */}
                  {totalGoals > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-500" />
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          יעדים שהושגו ({metGoals}/{totalGoals})
                        </span>
                      </div>
                      <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        {performancePct}%
                      </span>
                    </div>
                  )}

                  {/* Consistency — weekly frequency */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-purple-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        עקביות שבועית ({weeklyStrengthSessions}/{weeklyGoalSessions})
                      </span>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${
                      consistencyBonus
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}>
                      {consistencyBonus ? '✓ בונוס' : `עוד ${weeklyGoalSessions - weeklyStrengthSessions}`}
                    </span>
                  </div>

                  {/* Divider + Total Gain */}
                  <div className="border-t border-slate-100 dark:border-slate-700 pt-2 mt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800 dark:text-white">סה״כ התקדמות</span>
                    <span className="text-base font-black text-cyan-600 dark:text-cyan-400 tabular-nums">
                      +{progressionResult.activeProgramGain.totalGain.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })()}
          
          {/* Level Goals Checklist (from Admin-defined ProgramLevelSettings) */}
          {evaluatedGoals.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-3">יעדי רמה</h3>
              <div className="space-y-3">
                {evaluatedGoals.map((goal, idx) => {
                  const bonus = goal.progressBonus ?? 5;
                  return (
                    <motion.div
                      key={goal.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className="flex items-center gap-3"
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                          goal.achieved
                            ? 'bg-[#00C9F2] border-[#00C9F2]'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {goal.achieved && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span
                        className={`text-sm flex-1 ${
                          goal.achieved
                            ? 'text-slate-500 dark:text-slate-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {goal.label}
                      </span>
                      <span className="text-xs tabular-nums text-slate-400">
                        {goal.bestValue}/{goal.targetValue} {goal.unit === 'reps' ? 'חזרות' : 'שניות'}
                      </span>
                      <span className={`text-xs font-bold tabular-nums min-w-[3rem] text-left ${
                        goal.achieved ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-300 dark:text-slate-600'
                      }`}>
                        {goal.achieved ? `+${bonus}%` : `(${bonus}%)`}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
              {/* Session Goal Total */}
              <div className="border-t border-slate-100 dark:border-slate-700 mt-3 pt-3 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800 dark:text-white">סה״כ יעדים באימון</span>
                <span className="text-base font-black text-cyan-600 dark:text-cyan-400 tabular-nums">
                  +{evaluatedGoals.reduce((s, g) => s + (g.achieved ? (g.progressBonus ?? 5) : 0), 0)}%
                </span>
              </div>
            </div>
          )}

          {/* Personal Records */}
          <PersonalRecords exercises={completedExercises} />
          
          {/* Weekly Achievements - Using real Activity Store data */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <Medal className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              <h3 className="text-slate-800 dark:text-white font-bold text-base">הישגים שבועיים</h3>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {/* Coins Earned */}
              <AchievementBadge
                icon={<Coins className="w-5 h-5 text-primary" />}
                current={coins}
                total={500}
                label="מטבעות"
                progress={(coins / 500) * 360}
              />
              
              {/* Strength Sessions (from Activity Store) */}
              <AchievementBadge
                icon={<Dumbbell className="w-5 h-5 text-primary" />}
                current={weeklyStrengthSessions}
                total={weeklyGoalSessions}
                label="אימוני כוח"
                progress={(weeklyStrengthSessions / weeklyGoalSessions) * 360}
              />
              
              {/* Active Days (from Activity Store) */}
              <AchievementBadge
                icon={<Flag className="w-5 h-5 text-primary" />}
                current={daysWithActivity}
                total={5}
                label="ימים פעילים"
                progress={(daysWithActivity / 5) * 360}
              />
              
              {/* Weekly Minutes (from Activity Store) */}
              <AchievementBadge
                icon={<Timer className="w-5 h-5 text-primary" />}
                current={Math.round(weeklyMinutes)}
                total={150}
                label="דקות שבועיות"
                progress={(weeklyMinutes / 150) * 360}
              />
            </div>
          </div>
          
          {/* Exercise Breakdown */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm border border-slate-50 dark:border-slate-700">
            {/* Header — TRAINING OS: No individual set columns, show total + percentage */}
            <div className="p-4 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <span className="text-xs font-bold text-slate-400">סה״כ</span>
              <span className="text-xs font-bold text-slate-400">ביצוע</span>
              <h3 className="text-slate-800 dark:text-white font-bold text-base">סיכום אימון</h3>
            </div>
            
            {/* Exercise Categories */}
            {Object.entries(groupedExercises).map(([category, exercises]) => (
              <ExerciseCategory
                key={category}
                title={categoryLabels[category] || category}
                exercises={exercises}
              />
            ))}
            
            {/* Empty state */}
            {completedExercises.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                <p>אין תרגילים להצגה</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Post-Workout Lifestyle CTA (Phase 2 Conversion) ────────────── */}
        {!profile?.lifestyle?.scheduleDays && 
         skippedBridge && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mx-4 mb-4"
          >
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-2xl p-6 border-2 border-cyan-200 dark:border-cyan-700 shadow-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#5BC2F2] to-[#3BA4D8] flex items-center justify-center shadow-md">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">עבודה מעולה!</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">בוא נשמור על המומנטום הזה</p>
                </div>
              </div>
              <button
                onClick={() => {
                  // Open lifestyle wizard (will need callback from parent)
                  if (typeof window !== 'undefined') {
                    window.location.href = '/home?openWizard=true';
                  }
                }}
                className="w-full py-3 bg-gradient-to-r from-[#5BC2F2] to-[#3BA4D8] text-white font-bold rounded-xl shadow-md active:scale-[0.98] transition-all"
              >
                בואו נקבע לו״ז
              </button>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem('dismissed_lifestyle_cta', 'true');
                  }
                }}
                className="w-full mt-2 py-2 text-sm text-slate-500 hover:text-slate-700 font-medium"
              >
                אולי מאוחר יותר
              </button>
            </div>
          </motion.div>
        )}

      {/* Footer Button — pinned outside scroll, always clickable */}
      <div
        className="shrink-0 z-[100] relative p-5 bg-white dark:bg-card-dark"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={onFinish}
          className="w-full bg-primary py-4 rounded-2xl text-white font-extrabold text-xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-all"
        >
          תודה על האימון!
        </button>
      </div>
      
      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E2E8F0;
          border-radius: 10px;
        }
      `}</style>

      {/* ── Post-Workout Email Capture Drawer ──────────────────────────── */}
      <AnimatePresence>
        {showEmailDrawer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40"
            onClick={dismissEmailDrawer}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden"
              dir="rtl"
            >
              {showInlineAccount ? (
                <div className="p-2">
                  <AccountSecureStep
                    onNext={handleEmailCaptured}
                    onSkip={dismissEmailDrawer}
                  />
                </div>
              ) : (
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-black text-slate-900">גבה את האימון שלך</h3>
                      <p className="text-sm text-slate-500">הוסף אימייל כדי לא לאבד את ההתקדמות</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowInlineAccount(true)}
                    className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-xl shadow-md active:scale-[0.98] transition-all"
                  >
                    התחבר עם Google
                  </button>
                  <button
                    onClick={dismissEmailDrawer}
                    className="w-full mt-2 py-2.5 text-sm text-slate-500 hover:text-slate-700 font-medium"
                  >
                    אולי מאוחר יותר
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Level-Up Celebration Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {showLevelUpModal && progressionResult?.activeProgramGain.leveledUp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-6"
            onClick={() => setShowLevelUpModal(false)}
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.7, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-xs shadow-2xl text-center"
              dir="rtl"
            >
              {/* Trophy icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2, damping: 12 }}
                className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg"
              >
                <Trophy className="w-10 h-10 text-white" />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-black text-slate-900 dark:text-white mb-1"
              >
                עלית רמה!
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-lg font-bold text-cyan-600 dark:text-cyan-400 mb-1"
              >
                {programName}
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-4xl font-black text-slate-900 dark:text-white mb-6"
              >
                רמה {progressionResult.activeProgramGain.newLevel}
              </motion.p>

              {/* CTA */}
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                onClick={() => setShowLevelUpModal(false)}
                className="w-full py-3.5 rounded-xl bg-gradient-to-l from-[#00C9F2] to-[#00E5FF] text-white font-bold text-base shadow-lg shadow-cyan-500/20 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
              >
                <span>המשך לרמה הבאה</span>
                <ChevronRight className="w-5 h-5" />
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  calculateCalories,
  calculateCoins,
  formatDuration,
  MET_BY_DIFFICULTY,
  COIN_RATIO,
  COIN_BONUS_BY_DIFFICULTY,
};

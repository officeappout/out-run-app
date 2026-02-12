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

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
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
  Medal
} from 'lucide-react';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { useDailyActivity, useWeeklyProgress } from '@/features/activity';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { calculateBaseWorkoutXP, calculateLevelFromXP, getProgressToNextLevel } from '@/features/user/progression/services/xp.service';
import { processWorkoutCompletion } from '@/features/user/progression/services/progression.service';
import { getAllLevels } from '@/features/content/programs/core/level.service';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

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

/**
 * Calculate stroke-dashoffset for circular progress
 */
function calculateDashOffset(percentage: number, circumference: number): number {
  return circumference - (percentage / 100) * circumference;
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
 * Circular Progress Component
 */
function CircularProgress({ percentage }: { percentage: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = calculateDashOffset(percentage, circumference);
  
  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          className="text-slate-100 dark:text-slate-700"
          cx="40"
          cy="40"
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="6"
        />
        <circle
          className="text-primary"
          cx="40"
          cy="40"
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-lg font-extrabold text-slate-800 dark:text-white">
        {percentage}<span className="text-xs font-normal">%</span>
      </span>
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
 */
function ExerciseRow({ exercise }: { exercise: CompletedExercise }) {
  // Take up to 3 sets for display
  const displaySets = exercise.sets.slice(0, 3);
  
  return (
    <div className="flex justify-between items-center">
      {/* Total with trend */}
      <div className="flex items-center gap-1 bg-white dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-600 shadow-sm">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
        <span className="text-slate-800 dark:text-white font-bold text-xs">{exercise.totalReps}</span>
      </div>
      
      {/* Individual sets */}
      <div className="flex gap-2">
        {displaySets.map((reps, idx) => (
          <div 
            key={idx}
            className="bg-white dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-600 shadow-sm"
          >
            <span className="text-slate-800 dark:text-white font-bold text-xs">{reps}</span>
          </div>
        ))}
      </div>
      
      {/* Exercise name */}
      <div className="bg-white dark:bg-slate-700 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-600 shadow-sm flex-1 mr-4">
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
  maxLevel = 10,
  progressToNextLevel = 80,
  onFinish,
}: StrengthSummaryPageProps) {
  // Track if workout has been logged to prevent double-logging
  const hasLoggedWorkout = useRef(false);
  
  // Get activity store actions and state
  const { logWorkout } = useActivityStore();
  
  // Get progression store for coins
  const { addCoins } = useProgressionStore();
  
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
  
  // Calculate duration in minutes (minimum 30 for testing Blue Flame)
  const durationMinutes = Math.max(Math.round(duration / 60), 30);
  
  // Log workout to Activity Store and add coins on mount
  useEffect(() => {
    if (hasLoggedWorkout.current) return;
    hasLoggedWorkout.current = true;
    
    // Log workout: category is 'strength' for this page
    // Duration is in minutes, calories calculated
    console.log('[StrengthSummaryPage] Logging workout to ActivityStore:', {
      category: 'strength',
      durationMinutes,
      calories,
      coins,
    });
    
    // Update Activity Store (rings, streak)
    logWorkout('strength', durationMinutes, calories);
    
    // Update Progression Store (global coins)
    console.log('[StrengthSummaryPage] Adding coins to ProgressionStore:', coins);
    addCoins(coins);

    // Award XP (hidden — user only sees %)
    const awardStrengthXP = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const difficultyNum = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
        const baseXP = calculateBaseWorkoutXP(durationMinutes, difficultyNum, 'strength');

        const userDocRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) return;

        const userData = userSnap.data();
        const currentXP = userData.progression?.globalXP || 0;
        const newXP = currentXP + baseXP;

        const levels = await getAllLevels();
        const newLevel = calculateLevelFromXP(newXP, levels);
        const pct = getProgressToNextLevel(newXP, newLevel, levels);

        await updateDoc(userDocRef, {
          'progression.globalXP': newXP,
          'progression.globalLevel': newLevel,
        });

        console.log(`[XP] +${baseXP} XP (hidden). Progress: ${Math.round(pct)}% → Level ${newLevel + 1}`);
      } catch (e) {
        console.error('[XP] Failed to award XP:', e);
      }
    };
    awardStrengthXP();

    // ✅ WORKOUT BRIDGE: Trigger domain-specific progression + master-level recalculation
    // This activates the full Phases 6-10 recursive progression pipeline
    const triggerDomainProgression = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        // Determine active program ID:
        // 1. From prop (highest priority — passed by workout engine)
        // 2. From Firestore user doc (fallback)
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

        // Convert CompletedExercise[] → WorkoutExerciseResult[]
        const exerciseResults = completedExercises
          .filter(ex => ex.category === 'main' || ex.category === 'superset') // Skip warmup/stretches
          .map(ex => ({
            exerciseId: ex.id,
            exerciseName: ex.name,
            programLevels: {} as Record<string, number>, // Not available here — linked detection will use other signals
            setsCompleted: ex.sets.length,
            repsPerSet: ex.sets,
            targetReps: ex.sets.length > 0 ? Math.max(...ex.sets) : 10, // Use highest set as proxy for target
            isCompound: ex.category === 'superset', // Supersets are compound movements
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

        if (result.success) {
          const gain = result.activeProgramGain;
          console.log(`[Progression] Domain progression: ${activeProgramId} +${gain.totalGain.toFixed(1)}%` +
            (gain.leveledUp ? ` → LEVEL UP to ${gain.newLevel}!` : ` (now ${gain.newPercent.toFixed(1)}%)`));
          
          if (result.linkedProgramGains.length > 0) {
            console.log(`[Progression] Linked programs updated:`, 
              result.linkedProgramGains.map(lp => `${lp.programId} +${lp.gain.toFixed(1)}%`).join(', '));
          }
          
          if (result.readyForSplit?.isReady) {
            console.log(`[Progression] Ready for split! Suggested: ${result.readyForSplit.suggestedPrograms?.join(', ')}`);
          }
        } else {
          console.warn('[Progression] processWorkoutCompletion returned failure');
        }
      } catch (e) {
        console.error('[Progression] Failed to process domain progression:', e);
      }
    };
    triggerDomainProgression();
  }, [logWorkout, addCoins, durationMinutes, calories, coins, difficulty, propProgramId, completedExercises]);
  
  // Group exercises by category
  const groupedExercises = groupExercisesByCategory(completedExercises);
  
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
          
          {/* Program Progress Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-700 flex items-center justify-between">
            <div className="flex flex-col flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Dumbbell className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">{programName}</h2>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                  רמה {currentLevel}/{maxLevel}
                </span>
                <div className="flex items-center gap-1 mt-1">
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-500">
                    עוד {100 - progressToNextLevel}% לרמה {currentLevel + 1}
                  </span>
                </div>
              </div>
            </div>
            <CircularProgress percentage={progressToNextLevel} />
          </div>
          
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
            {/* Header */}
            <div className="p-4 border-b border-slate-50 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <span className="text-xs font-bold text-slate-400">סה"כ</span>
              <div className="flex gap-4">
                <span className="text-xs font-bold text-slate-400">סט 3</span>
                <span className="text-xs font-bold text-slate-400">סט 2</span>
                <span className="text-xs font-bold text-slate-400">סט 1</span>
              </div>
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
        
      {/* Footer Button */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="p-5 bg-white dark:bg-card-dark shrink-0 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <button
          onClick={onFinish}
          className="w-full bg-primary py-4 rounded-2xl text-white font-extrabold text-xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-all"
        >
          תודה על האימון!
        </button>
      </motion.div>
      
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

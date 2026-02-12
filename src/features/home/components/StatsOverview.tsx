import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useUserStore } from '@/features/user';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import HeroWorkoutCard from './HeroWorkoutCard';
import { StepsWidget } from './widgets/StepsWidget';
import { RunningStatsWidget } from './widgets/RunningStatsWidget';
import DashedGoalCarousel from './carousel/DashedGoalCarousel';
import { useDailyActivity, useWeeklyProgress } from '@/features/activity';
import { ConcentricRingsProgress, CompactRingsProgress } from './rings/ConcentricRingsProgress';
import { ACTIVITY_COLORS } from '@/features/activity/types/activity.types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Dumbbell, Heart, Sparkles, Timer, Footprints } from 'lucide-react';
import { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { generateHomeWorkout } from '@/features/workout-engine/services/home-workout.service';
import AdjustWorkoutModal from './AdjustWorkoutModal';
import ProcessingOverlay from './ProcessingOverlay';
import { MockWorkout } from '../data/mock-schedule-data';

// --- Fallback static data (used when engine hasn't generated yet) ---
const fallbackWorkoutData: MockWorkout = {
  id: 'daily-fallback',
  title: 'אימון יומי',
  description: 'האימון שלך נטען...',
  duration: 30,
  calories: 200,
  coins: 200,
  difficulty: 2,
  imageUrl:
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80',
  type: 'strength',
};

/**
 * Map a GeneratedWorkout from the engine into the MockWorkout shape
 * expected by HeroWorkoutCard.
 */
function mapGeneratedToMock(workout: GeneratedWorkout): MockWorkout {
  return {
    id: 'daily-generated',
    title: workout.title,
    description: workout.description,
    duration: workout.estimatedDuration,
    calories: workout.stats.calories,
    coins: workout.stats.coins,
    difficulty: workout.difficulty,
    imageUrl:
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80',
    exerciseCount: workout.exercises.length,
    aiCue: workout.aiCue,
    isGenerated: true,
    volumeBadge: workout.volumeAdjustment?.badge,
  } as MockWorkout & { volumeBadge?: string };
}

interface StatsOverviewProps {
  stats: any;
  currentTrack?: string;
  isGuest?: boolean;
  onStartWorkout?: () => void;
  /** Show the weekly goals carousel */
  showGoalsCarousel?: boolean;
  /** Fires whenever the dynamic workout is generated or updated (lifted to parent) */
  onWorkoutGenerated?: (workout: GeneratedWorkout) => void;
}

export default function StatsOverview({ 
  stats, 
  currentTrack, 
  isGuest, 
  onStartWorkout,
  showGoalsCarousel = true,
  onWorkoutGenerated,
}: StatsOverviewProps) {
  const { profile } = useUserStore();
  
  // Get real activity data from the Activity Store
  const { 
    stepsToday, 
    caloriesToday, 
    totalMinutesToday,
    ringData,
    dominantColor,
  } = useDailyActivity();
  
  const {
    totalMinutes: weeklyMinutes,
    daysWithActivity,
  } = useWeeklyProgress();

  // 1. Calculate Mode
  const mode = useDashboardMode(profile);

  // 2. Safe Logging
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('🧠 Brain Decision (Stable):', mode);
    }
  }, [mode]);

  // 3. Smart Goals Logic (Memoized)
  const goals = useMemo(
    () => ({
      dailySteps: profile?.goals?.dailySteps || 4000,
      weeklyMinutes: 150,
    }),
    [profile?.goals?.dailySteps],
  );
  
  const displaySteps = stepsToday > 0 ? stepsToday : (stats?.steps || 0);

  // ── Dynamic Workout State ──────────────────────────────────────────────
  const [dynamicWorkout, setDynamicWorkout] = useState<GeneratedWorkout | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  const didGenerate = useRef(false);

  // Generate workout on mount (once per profile)
  useEffect(() => {
    if (!profile || isGuest || didGenerate.current) return;
    didGenerate.current = true;

    setIsGenerating(true);
    generateHomeWorkout({ userProfile: profile })
      .then((result) => {
        setDynamicWorkout(result.workout);
        onWorkoutGenerated?.(result.workout);
        // Persist workout location for the player to select the correct execution_method media
        if (typeof window !== 'undefined' && result.meta?.location) {
          sessionStorage.setItem('currentWorkoutLocation', result.meta.location);
        }
      })
      .catch((err) => {
        console.error('[StatsOverview] Workout generation failed:', err);
      })
      .finally(() => setIsGenerating(false));
  }, [profile, isGuest, onWorkoutGenerated]);

  // Map generated workout → HeroWorkoutCard shape
  const heroData: MockWorkout = dynamicWorkout
    ? mapGeneratedToMock(dynamicWorkout)
    : fallbackWorkoutData;

  const isGenerated = !!dynamicWorkout;

  // Handle save from AdjustWorkoutModal
  const handleSaveAdjustedWorkout = useCallback((workout: GeneratedWorkout) => {
    // Close modal first, then show processing animation
    setIsAdjustModalOpen(false);
    setTimeout(() => setShowProcessing(true), 300);
  // Save the workout after processing completes — stored via handleProcessingComplete
  // We stash it in a ref so handleProcessingComplete can read it.
    pendingWorkoutRef.current = workout;
  }, []);

  const pendingWorkoutRef = useRef<GeneratedWorkout | null>(null);

  const handleProcessingComplete = useCallback(() => {
    setShowProcessing(false);
    if (pendingWorkoutRef.current) {
      setDynamicWorkout(pendingWorkoutRef.current);
      onWorkoutGenerated?.(pendingWorkoutRef.current);
      pendingWorkoutRef.current = null;
    }
  }, [onWorkoutGenerated]);

  // ── Render: RUNNING Mode ──
  if (mode === 'RUNNING') {
    return (
      <div className="space-y-6">
        <RunningStatsWidget weeklyDistance={12.5} weeklyGoal={20} calories={caloriesToday || 450} />
        {showGoalsCarousel && <DashedGoalCarousel maxVisible={5} />}
        <HeroWorkoutCard
          workout={heroData}
          isGenerated={isGenerated}
          onStart={onStartWorkout || (() => console.log('Start Workout'))}
          onAdjust={() => setIsAdjustModalOpen(true)}
        />
        {/* Modal + Processing */}
        {profile && (
          <AdjustWorkoutModal
            isOpen={isAdjustModalOpen}
            onClose={() => setIsAdjustModalOpen(false)}
            userProfile={profile}
            currentWorkout={dynamicWorkout}
            onSave={handleSaveAdjustedWorkout}
          />
        )}
        <ProcessingOverlay isVisible={showProcessing} onComplete={handleProcessingComplete} />
      </div>
    );
  }

  // State for expanded weekly detail modal
  const [showWeeklyDetail, setShowWeeklyDetail] = useState(false);
  
  // Calculate weekly progress percentage
  const weeklyProgressPercent = Math.min((weeklyMinutes / goals.weeklyMinutes) * 100, 100);
  
  // DEFAULT / HEALTH MODE
  return (
    <div className="space-y-4">
      {/* Compact Stats Row - Horizontal Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Hybrid Active Minutes Card (Clickable) */}
        <button
          onClick={() => setShowWeeklyDetail(true)}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-50 dark:border-slate-700 text-right transition-all hover:shadow-md active:scale-[0.98]"
        >
          <div className="flex items-center justify-between mb-2">
            <Timer className="w-5 h-5 text-primary" />
            <span className="text-xs text-gray-400">לחץ לפירוט</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12">
              <svg className="w-full h-full -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="#E2E8F0" strokeWidth="4" fill="none" className="dark:stroke-slate-700" />
                <circle 
                  cx="24" cy="24" r="20" 
                  stroke="#00D1FF" 
                  strokeWidth="4" 
                  fill="none"
                  strokeDasharray={125.6}
                  strokeDashoffset={125.6 - (125.6 * weeklyProgressPercent / 100)}
                  strokeLinecap="round"
                  className="transition-all duration-700"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700 dark:text-gray-200">
                {Math.round(weeklyProgressPercent)}%
              </span>
            </div>
            <div className="flex-1">
              <p className="text-2xl font-black text-gray-900 dark:text-white">{Math.round(weeklyMinutes)}</p>
              <p className="text-[10px] text-gray-400">/ {goals.weeklyMinutes} דק'</p>
            </div>
          </div>
        </button>
        
        {/* Steps Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-50 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <Footprints className="w-5 h-5 text-lime-500" />
            <span className="text-xs text-gray-400">צעדים</span>
          </div>
          <p className="text-2xl font-black text-gray-900 dark:text-white">{displaySteps.toLocaleString()}</p>
          <p className="text-[10px] text-gray-400">/ {goals.dailySteps.toLocaleString()} יעד</p>
        </div>
      </div>
      
      {/* Weekly Goals Carousel */}
      {showGoalsCarousel && <DashedGoalCarousel maxVisible={5} />}

      {/* Hero Card — Dynamic Workout or Fallback */}
      <HeroWorkoutCard
        workout={heroData}
        isGenerated={isGenerated}
        onStart={onStartWorkout || (() => console.log('Start Workout'))}
        onAdjust={() => setIsAdjustModalOpen(true)}
      />

      {/* Adjust Workout Modal */}
      {profile && (
        <AdjustWorkoutModal
          isOpen={isAdjustModalOpen}
          onClose={() => setIsAdjustModalOpen(false)}
          userProfile={profile}
          currentWorkout={dynamicWorkout}
          onSave={handleSaveAdjustedWorkout}
        />
      )}

      {/* Processing Overlay (2-second animation after save) */}
      <ProcessingOverlay isVisible={showProcessing} onComplete={handleProcessingComplete} />
      
      {/* Weekly Detail Modal */}
      <AnimatePresence>
        {showWeeklyDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowWeeklyDetail(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">יעד שבועי</h3>
                <button
                  onClick={() => setShowWeeklyDetail(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              
              <div className="flex justify-center mb-6">
                <ConcentricRingsProgress
                  size={180}
                  strokeWidth={16}
                  showCenter={true}
                  centerMode="minutes"
                  showLegend={false}
                  animationDuration={0.8}
                />
              </div>
              
              <div className="space-y-3">
                <p className="text-sm font-bold text-gray-600 dark:text-gray-300">התפלגות לפי קטגוריה</p>
                {ringData.map((ring) => (
                  <div key={ring.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ring.color }} />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{ring.label}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{Math.round(ring.value)} דק'</span>
                    <span className="text-xs text-gray-400">({Math.round(ring.percentage)}%)</span>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-sm text-gray-500">ימים פעילים השבוע</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">{daysWithActivity} / 7</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

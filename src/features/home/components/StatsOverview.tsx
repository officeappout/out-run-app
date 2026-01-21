import React, { useMemo, useEffect } from 'react';
import { useUserStore } from '@/features/user/store/useUserStore';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import HeroWorkoutCard from './HeroWorkoutCard';
import { StepsWidget } from './widgets/StepsWidget';
import { WeeklyActivityWidget } from './widgets/WeeklyActivityWidget';
import { RunningStatsWidget } from './widgets/RunningStatsWidget';

// --- Static Data (Moved Outside to prevent Loops) ---
const heroWorkoutData = {
  id: 'daily-1',
  title: 'אימון התאוששות לכל הגוף',
  description:
    'איזה כיף, היום זה נחים :) בכל זאת רוצים לעשות אימון? מוזמנים לעשות אימון התאוששות.',
  duration: 60,
  calories: 300,
  coins: 300,
  difficulty: 'easy',
  imageUrl:
    'https://www.kan-ashkelon.co.il/wp-content/uploads/2025/09/60555fe0f5af3f9222dcfc72692f5f55-845x845.jpeg',
  completed: false,
  locked: false,
  type: 'recovery',
};

interface StatsOverviewProps {
  stats: any;
  currentTrack?: string;
  isGuest?: boolean;
  onStartWorkout?: () => void;
}

export default function StatsOverview({ stats, currentTrack, isGuest, onStartWorkout }: StatsOverviewProps) {
  const { profile } = useUserStore();

  // 1. Calculate Mode
  const mode = useDashboardMode(profile);

  // 2. Safe Logging (Only logs when mode changes)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('🧠 Brain Decision (Stable):', mode);
    }
  }, [mode]);

  // 3. Smart Goals Logic (Memoized)
  const goals = useMemo(
    () => ({
      dailySteps: profile?.goals?.dailySteps || 4000, // Default to 4000 for quick wins
      weeklyMinutes: 150,
    }),
    [profile?.goals?.dailySteps],
  );

  // 4. Render Logic
  if (mode === 'RUNNING') {
    return (
      <div className="space-y-6">
        <RunningStatsWidget weeklyDistance={12.5} weeklyGoal={20} calories={450} />
        <HeroWorkoutCard workout={heroWorkoutData as any} onStart={onStartWorkout || (() => console.log('Start Workout'))} />
      </div>
    );
  }

  // DEFAULT / HEALTH MODE
  return (
    <div className="space-y-6">
      {/* Widgets Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Steps Widget (Cyan) */}
        <StepsWidget steps={stats?.steps || 0} goal={goals.dailySteps} />

        {/* Weekly Activity Widget (Cyan) */}
        <WeeklyActivityWidget
          currentMinutes={stats?.weeklyMinutes || 90}
          weeklyGoal={goals.weeklyMinutes}
          activityCount={stats?.activityCount || 9}
        />
      </div>

      {/* Hero Card (Full Width) */}
      <HeroWorkoutCard workout={heroWorkoutData as any} onStart={() => console.log('Start Workout')} />
    </div>
  );
}


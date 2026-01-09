// ==========================================
// Custom Hook: Smart Schedule Logic
// מנהל את המצבים השונים של דף הבית
// ==========================================

import { useState, useEffect, useMemo } from 'react';
import { useUserStore } from '@/features/user/store/useUserStore';
import { 
  CURRENT_SCENARIO, 
  ScheduleScenario, 
  MockWorkout, 
  MOCK_WORKOUTS,
  MOCK_WEEK_SCHEDULE,
  DaySchedule,
} from '../data/mock-schedule-data';

export interface ScheduleState {
  scenario: ScheduleScenario;
  currentWorkout: MockWorkout | null;
  weekSchedule: DaySchedule[];
  todayStatus: 'completed' | 'scheduled' | 'rest' | 'missed' | 'today';
  showMissedAlert: boolean;
  showComebackAlert: boolean;
  showPostWorkout: boolean;
  trackingMode: 'wellness' | 'performance';
  postWorkoutData?: {
    improvement: number;
    duration: string;
    streak: number;
  };
}

export function useSmartSchedule(): ScheduleState {
  const { profile } = useUserStore();
  const [scenario, setScenario] = useState<ScheduleScenario>(CURRENT_SCENARIO);
  
  // קביעת trackingMode מה-Store
  const trackingMode = profile?.core?.trackingMode || 'performance';

  // חישוב מצב היום
  const todayStatus = useMemo(() => {
    const today = MOCK_WEEK_SCHEDULE.find(d => d.status === 'today');
    return today?.status || 'scheduled';
  }, []);

  // זיהוי מצב פספוס
  const showMissedAlert = useMemo(() => {
    if (scenario !== 'missed') return false;
    // בדיקה אם אתמול היה אימון ולא בוצע
    const yesterday = MOCK_WEEK_SCHEDULE.find(d => d.date === 2); // אתמול
    return yesterday?.status === 'missed' || scenario === 'missed';
  }, [scenario]);

  // זיהוי חזרה מפגרה
  const showComebackAlert = useMemo(() => {
    if (scenario !== 'long_absence') return false;
    // בדיקה אם המשתמש לא התאמן זמן רב
    const lastWorkout = MOCK_WEEK_SCHEDULE.find(d => d.status === 'completed');
    const daysSinceLastWorkout = lastWorkout ? 7 : 14; // Mock - במקרה אמיתי נחשב לפי תאריכים
    return daysSinceLastWorkout > 5;
  }, [scenario]);

  // זיהוי סיום אימון
  const showPostWorkout = useMemo(() => {
    return scenario === 'completed';
  }, [scenario]);

  // חישוב אימון נוכחי לפי המצב (עם חישוב דינמי של קלוריות ומטבעות)
  const currentWorkout = useMemo(() => {
    let baseWorkout: MockWorkout;
    
    // אם trackingMode הוא wellness, נטה לאימוני התאוששות
    if (trackingMode === 'wellness' && scenario === 'standard') {
      // ב-wellness mode, נציג אימון התאוששות גם ביום רגיל
      baseWorkout = MOCK_WORKOUTS.recovery;
    } else {
      switch (scenario) {
        case 'rest':
          baseWorkout = MOCK_WORKOUTS.recovery;
          break;
        case 'missed':
        case 'long_absence':
          baseWorkout = MOCK_WORKOUTS.comeback;
          break;
        case 'completed':
          baseWorkout = MOCK_WORKOUTS.standard; // האימון שהושלם
          break;
        case 'standard':
        default:
          baseWorkout = MOCK_WORKOUTS.standard;
      }
    }

    // חישוב דינמי של קלוריות ומטבעות
    const rewards = calculateWorkoutRewards(
      baseWorkout.duration,
      baseWorkout.difficulty,
      baseWorkout.type
    );

    return {
      ...baseWorkout,
      calories: rewards.calories,
      coins: rewards.coins,
    };
  }, [scenario, trackingMode]);

  // נתוני סיום אימון (Mock)
  const postWorkoutData = useMemo(() => {
    if (!showPostWorkout) return undefined;
    
    return {
      improvement: 33, // שיפור של 33%
      duration: '20:23', // 20 דקות 23 שניות
      streak: 3, // 3 אימונים ברצף
    };
  }, [showPostWorkout]);

  return {
    scenario,
    currentWorkout,
    weekSchedule: MOCK_WEEK_SCHEDULE,
    todayStatus,
    showMissedAlert,
    showComebackAlert,
    showPostWorkout,
    postWorkoutData,
    trackingMode, // חשוף את trackingMode לשימוש ברכיבים
  };
}

// ==========================================
// Helper: חישוב קלוריות ומטבעות דינמי
// ==========================================
export function calculateWorkoutRewards(
  duration: number, // דקות
  difficulty: 'easy' | 'medium' | 'hard',
  type: 'strength' | 'cardio' | 'recovery' | 'flexibility'
): { calories: number; coins: number } {
  // בסיס קלוריות לפי סוג
  const baseCalories: Record<string, number> = {
    strength: 8,   // 8 קלוריות לדקה
    cardio: 10,   // 10 קלוריות לדקה
    recovery: 5,  // 5 קלוריות לדקה
    flexibility: 3, // 3 קלוריות לדקה
  };

  // מכפיל קושי
  const difficultyMultiplier: Record<string, number> = {
    easy: 0.8,
    medium: 1.0,
    hard: 1.3,
  };

  const base = baseCalories[type] || 5;
  const multiplier = difficultyMultiplier[difficulty] || 1.0;
  const calories = Math.round(duration * base * multiplier);
  
  // מטבעות שווים לקלוריות (1:1)
  const coins = calories;

  return { calories, coins };
}

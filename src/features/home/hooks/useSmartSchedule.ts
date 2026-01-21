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

  // Generate week schedule from user profile schedule days
  const weekSchedule = useMemo(() => {
    const dayMap = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const today = new Date();
    const todayDayIndex = (today.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
    
    // Get schedule days from profile (array of Hebrew day letters like ['א', 'ב', 'ג'])
    const scheduleDays = profile?.lifestyle?.scheduleDays || [];
    
    // Build week schedule based on user's selected days
    const schedule: DaySchedule[] = dayMap.map((day, index) => {
      const isSelectedDay = scheduleDays.includes(day);
      const isToday = index === todayDayIndex;
      
      // Determine status based on day selection and today
      let status: DaySchedule['status'] = 'rest';
      if (isSelectedDay) {
        if (isToday) {
          status = 'today';
        } else if (index < todayDayIndex) {
          status = 'completed'; // Past workout days are marked as completed (can be enhanced later with actual workout data)
        } else {
          status = 'scheduled';
        }
      }
      
      return {
        day,
        date: index + 1,
        status,
        workoutId: isSelectedDay ? 'w1' : undefined,
      };
    });
    
    return schedule;
  }, [profile?.lifestyle?.scheduleDays]);

  // חישוב מצב היום
  const todayStatus = useMemo(() => {
    const today = weekSchedule.find(d => d.status === 'today');
    return today?.status || 'rest';
  }, [weekSchedule]);

  // זיהוי מצב פספוס
  const showMissedAlert = useMemo(() => {
    if (scenario !== 'missed') return false;
    // בדיקה אם אתמול היה אימון ולא בוצע
    const yesterdayIndex = ((new Date().getDay() + 6) % 7) - 1; // Yesterday's day index
    const yesterday = yesterdayIndex >= 0 ? weekSchedule[yesterdayIndex] : null;
    return yesterday?.status === 'missed' || scenario === 'missed';
  }, [scenario, weekSchedule]);

  // זיהוי חזרה מפגרה
  const showComebackAlert = useMemo(() => {
    if (scenario !== 'long_absence') return false;
    // בדיקה אם המשתמש לא התאמן זמן רב
    const lastWorkout = weekSchedule.find(d => d.status === 'completed');
    const daysSinceLastWorkout = lastWorkout ? 7 : 14; // Mock - במקרה אמיתי נחשב לפי תאריכים
    return daysSinceLastWorkout > 5;
  }, [scenario, weekSchedule]);

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
    weekSchedule, // Use real schedule from profile
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

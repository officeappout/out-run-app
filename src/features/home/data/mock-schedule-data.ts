// ==========================================
// Mock Schedule Data - לבדיקת מצבים שונים
// ==========================================

export type ScheduleScenario = 
  | 'standard'        // מצב רגיל - יש אימון מתוכנן
  | 'rest'           // יום מנוחה
  | 'missed'         // פספוס אימון אתמול
  | 'long_absence'   // חזרה מפגרה ארוכה
  | 'completed';     // אימון הושלם היום

// ==========================================
// שליטה במצב הנוכחי (לבדיקות)
// ==========================================
export const CURRENT_SCENARIO: ScheduleScenario = 'standard'; // שנה כאן לבדיקת מצבים שונים

// ==========================================
// Mock Workout Data
// ==========================================
export interface MockWorkout {
  id: string;
  title: string;
  type: 'strength' | 'cardio' | 'recovery' | 'flexibility';
  difficulty: 'easy' | 'medium' | 'hard';
  duration: number; // דקות
  calories: number; // קלוריות (מחושבות)
  coins: number;    // מטבעות (שווים לקלוריות)
  imageUrl: string;
  description?: string;
}

export const MOCK_WORKOUTS: Record<string, MockWorkout> = {
  standard: {
    id: 'w1',
    title: 'אימון רגליים קשה',
    type: 'strength',
    difficulty: 'hard',
    duration: 45,
    calories: 350,
    coins: 350,
    imageUrl: '/images/workouts/legs.jpg',
    description: 'אימון ממוקד לפלג גוף תחתון',
  },
  recovery: {
    id: 'w2',
    title: 'אימון התאוששות לכל הגוף',
    type: 'recovery',
    difficulty: 'easy',
    duration: 60,
    calories: 300,
    coins: 300,
    imageUrl: '/images/workouts/recovery.jpg',
    description: 'אימון קל להחלמה ומתיחות',
  },
  comeback: {
    id: 'w3',
    title: 'אימון חזרה קליל',
    type: 'flexibility',
    difficulty: 'easy',
    duration: 30,
    calories: 150,
    coins: 150,
    imageUrl: '/images/workouts/comeback.jpg',
    description: 'אימון קצר לחזרה לשגרה',
  },
};

// ==========================================
// Mock Schedule (שבוע)
// ==========================================
export interface DaySchedule {
  day: string; // 'א', 'ב', 'ג'...
  date: number;
  status: 'completed' | 'scheduled' | 'rest' | 'missed' | 'today';
  workoutId?: string;
}

export const MOCK_WEEK_SCHEDULE: DaySchedule[] = [
  { day: 'א', date: 1, status: 'completed', workoutId: 'w1' },
  { day: 'ב', date: 2, status: 'completed', workoutId: 'w1' },
  { day: 'ג', date: 3, status: 'today', workoutId: 'w1' },
  { day: 'ד', date: 4, status: 'scheduled', workoutId: 'w1' },
  { day: 'ה', date: 5, status: 'rest' },
  { day: 'ו', date: 6, status: 'rest' },
  { day: 'ש', date: 7, status: 'rest' },
];

// ==========================================
// Mock Stats
// ==========================================
export interface DailyStats {
  steps: {
    current: number;
    goal: number;
    streak: number; // ימים ברצף
  };
  weeklyGoal: {
    current: number;
    goal: number;
    activities: number;
  };
}

export const MOCK_STATS = {
  minutes: 90,
  steps: 4000,
  calories: 300
};



// ==========================================
// Mock User Progress
// ==========================================
export interface UserProgress {
  domain: string; // 'פלג גוף תחתון'
  currentLevel: number;
  maxLevel: number;
  percentage: number; // אחוז לרמה הבאה
}

export const MOCK_PROGRESS: UserProgress = {
  domain: 'פלג גוף תחתון',
  currentLevel: 5,
  maxLevel: 10,
  percentage: 80, // 80% לרמה 6
};

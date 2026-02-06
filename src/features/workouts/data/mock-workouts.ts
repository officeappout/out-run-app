// ==========================================
// Mock Workout Data - Centralized
// ==========================================

export interface WorkoutSegment {
  id: string;
  type: 'running' | 'strength';
  title: string;
  durationOrDistance?: string;
  pace?: string;
  statusColor?: string;
  repsOrDuration?: string;
  imageUrl?: string | null;
  sets?: number;
}

export interface WorkoutData {
  id: string;
  title: string;
  description?: string;
  level?: string;
  difficulty?: string;
  duration?: number;
  coverImage?: string;
  routePath?: number[][] | Array<{ lat: number; lng: number }>;
  segments: WorkoutSegment[];
  equipment?: string[];
  muscles?: string[];
  sets?: number;
}

/**
 * Recovery Workout Mock - אימון התאוששות
 * Used for the daily recovery workout card on the home page
 */
export const RECOVERY_WORKOUT_MOCK: WorkoutData = {
  id: 'recovery-workout-1',
  title: 'אימון התאוששות לכל הגוף',
  description: 'איזה כיף, היום זה נחים :) בכל זאת רוצים לעשות אימון? מוזמנים לעשות אימון התאוששות.',
  level: 'easy',
  difficulty: 'easy',
  duration: 60,
  coverImage: 'https://www.kan-ashkelon.co.il/wp-content/uploads/2025/09/60555fe0f5af3f9222dcfc72692f5f55-845x845.jpeg',
  routePath: null,
  equipment: ['מזרן', 'גומייה'],
  muscles: ['גב', 'רגליים', 'כתפיים'],
  sets: 3,
  segments: [
    {
      id: 'seg-1',
      type: 'running',
      title: 'חימום - ריצה קלה',
      durationOrDistance: '5 דקות',
      pace: '6:00 /ק״מ',
      statusColor: '#00ADEF', // Cyan for easy
    },
    {
      id: 'seg-2',
      type: 'strength',
      title: 'מתיחות גמישות',
      repsOrDuration: '10 דקות',
      imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=200&q=80',
    },
    {
      id: 'seg-3',
      type: 'strength',
      title: 'תרגילי נשימה',
      repsOrDuration: '5 דקות',
      imageUrl: null,
    },
    {
      id: 'seg-4',
      type: 'running',
      title: 'קירור - הליכה',
      durationOrDistance: '5 דקות',
      pace: '8:00 /ק״מ',
      statusColor: '#00ADEF', // Cyan for easy
    },
  ],
};

/**
 * Strength & Running Combined Workout Mock
 * Used for the workout preview page
 */
export const STRENGTH_RUNNING_WORKOUT_MOCK: WorkoutData = {
  id: 'workout-1',
  title: 'אימון כוח וריצה משולב',
  description: 'אימון דינמי המשלב ריצה קלה עם תרגילי כוח בפארק. מושלם לחיזוק הגוף והסיבולת.',
  level: 'medium',
  difficulty: 'medium',
  duration: 45,
  coverImage: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80',
  routePath: null,
  segments: [
    {
      id: 'seg-1',
      type: 'running',
      title: 'חימום - ריצה קלה',
      durationOrDistance: '5 דקות',
      pace: '6:00 /ק״מ',
      statusColor: '#00ADEF', // Cyan for easy
    },
    {
      id: 'seg-2',
      type: 'strength',
      title: 'שכיבות סמיכה',
      repsOrDuration: '15 חזרות',
      imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=200&q=80',
    },
    {
      id: 'seg-3',
      type: 'running',
      title: 'ריצה מהירה',
      durationOrDistance: '10 דקות',
      pace: '4:30 /ק״מ',
      statusColor: '#FF8C00', // Orange for hard
    },
    {
      id: 'seg-4',
      type: 'strength',
      title: 'מתח',
      repsOrDuration: '10 חזרות',
      imageUrl: null,
    },
    {
      id: 'seg-5',
      type: 'running',
      title: 'קירור - הליכה',
      durationOrDistance: '5 דקות',
      pace: '8:00 /ק״מ',
      statusColor: '#00ADEF', // Cyan for easy
    },
  ],
};

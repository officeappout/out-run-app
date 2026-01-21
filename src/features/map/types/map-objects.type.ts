// src/features/map/types/map-objects.type.ts

// ==========================================
// 1. הגדרות בסיס (שרירים, סוגים, יצרנים)
// ==========================================

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'abs' | 'obliques'
  | 'forearms' | 'biceps' | 'triceps' | 'quads'
  | 'hamstrings' | 'glutes' | 'calves' | 'traps'
  | 'cardio' | 'full_body' | 'core' | 'legs'; // הוספתי legs לתמיכה בנתונים ישנים

export type DeviceType =
  | 'hydraulic'    // מכשיר עם התנגדות שמן
  | 'static'       // מתקן קבוע
  | 'calisthenics' // אימון רחוב
  | 'cardio';

export type DeviceWorkoutType = 'time' | 'reps' | 'static';

export type Manufacturer = 'urbanix' | 'lodos' | 'other';

// ==========================================
// 2. הגדרת מכשיר בפארק (ParkDevice)
// ==========================================
export interface ParkDevice {
  id: string;
  name: string;
  mainMuscle: MuscleGroup;

  // -- שדות אופציונליים (?) למניעת שגיאות בנתונים ישנים --
  secondaryMuscles?: MuscleGroup[];

  // סיווגים חדשים לאלגוריתם
  type?: DeviceType;
  workoutType?: string;         // גמיש (מחרוזת) לתמיכה לאחור

  // רמות קושי (תמיכה כפולה: ישן וחדש)
  difficultyLevel?: 1 | 2 | 3;
  recommendedLevel?: number;

  // מידע נוסף
  isFunctional?: boolean;
  manufacturer?: string;
  imageUrl?: string;
  videoUrl?: string;
  executionTips?: string[];
}

// ==========================================
// 3. אימון מובנה בפארק (ParkWorkout)
// ==========================================
export interface ParkWorkout {
  id: string;
  title: string;
  durationMinutes: number;
  difficulty: 1 | 2 | 3;
  imageUrl: string;
  tags: string[];
}

// ==========================================
// 4. הגדרת הפארק המלאה (MapPark)
// ==========================================
export interface MapPark {
  id: string;
  name: string;
  city?: string;
  address?: string;

  // מיקום (כפול לתמיכה בקוד ישן וחדש)
  location: { lat: number; lng: number };
  lat: number;
  lng: number;

  // רשימת המתקנים בפארק
  devices: ParkDevice[];

  // אימונים זמינים בפארק
  availableWorkouts?: ParkWorkout[];

  // --- דירוגים ומאפיינים חדשים ---
  rating?: number;
  adminQualityScore?: number;

  hasDogPark?: boolean;
  hasWaterFountain?: boolean;
  hasLights?: boolean;
  isShaded?: boolean;

  // מידע תצוגה
  description?: string;
  imageUrl?: string;
  whatsappLink?: string;

  // שדות טכניים
  isVerified?: boolean;
  distance?: number;

  // זמני עומס
  maximumTime?: {
    [key: number]: number;
  };

  // תמיכה בפארק לינארי (מסלול)
  segmentEndpoints?: {
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
  };
}

// ==========================================
// 4.1. הגדרת מתקן/נקודת עניין (MapFacility)
// ==========================================
export type FacilityType = 'water' | 'toilet' | 'gym' | 'parking';

export interface MapFacility {
  id: string;
  name: string;
  type: FacilityType;
  location: { lat: number; lng: number };
  properties?: any;
}

// ==========================================
// 5. אובייקטים לתצוגת המסלול (UI - Drawer)
// ==========================================

export type ActivityType = 'running' | 'walking' | 'cycling' | 'workout';
export type SegmentType = 'run' | 'walk' | 'workout' | 'bench' | 'finish';

export interface Exercise {
  id: string;
  name: string;
  reps?: string;
  duration?: string;
  videoUrl?: string;
  instructions?: string[];
  icon?: string;
}

export interface RouteSegment {
  id?: string;
  type: SegmentType;
  title: string;
  subTitle?: string;
  distance?: string;
  duration?: string;
  location?: { lat: number; lng: number };
  exercises?: Exercise[];
}

export type WorkoutSegmentType = 'travel' | 'station';

export interface WorkoutSegment {
  id: string;
  type: WorkoutSegmentType;
  title: string;
  subTitle?: string;
  icon: string;
  target: {
    type: 'distance' | 'time' | 'reps';
    value: number;
    unit?: string;
  };
  exercises?: Exercise[];
  isCompleted: boolean;
  heartRateTarget?: string;
  paceTarget?: string;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  segments: WorkoutSegment[];
  totalDuration: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

// הגדרת מסלול מתוכנן (Legacy)
export interface PlannedRoute {
  id: string;
  name: string;
  totalDistance: number;
  totalTime: number;
  pathCoordinates: [number, number][];
  stops: {
    parkId: string;
    order: number;
    suggestedWorkoutId?: string;
  }[];
}

// ==========================================
// 6. המסלול המלא שמוצג למשתמש (Route)
// ==========================================

// הגדרה גמישה למאפייני המסלול כדי למנוע שגיאות TS
export interface RouteFeatures {
  hasGym: boolean;
  hasBenches: boolean;
  lit: boolean;
  scenic: boolean;
  // גמישות בערכים (string) כדי למנוע התנגשויות (paved vs asphalt וכו')
  terrain: string;      
  environment: string;
  trafficLoad: string;
  surface: string;      
}

export interface Route {
  id: string;
  name: string;
  description?: string;
  descriptionKey?: string;

  // נתונים מספריים
  distance: number;
  duration: number;
  score: number;

  type: ActivityType;
  activityType?: ActivityType;
  difficulty: 'easy' | 'medium' | 'hard';

  // דירוגים
  rating: number; // היה חסר בהגדרה הקודמת והופיע ב-Mock
  calories: number; // היה חסר והופיע ב-Mock
  adminRating?: number;
  isPromoted?: boolean;

  // 1. ניהול מקורות
  source?: {
    type: 'official_api' | 'user_generated' | 'system';
    name: string;
    externalId?: string;
    externalLink?: string;
  };

  // 2. אנליטיקס
  analytics?: {
    usageCount: number;
    rating: number;
    heatMapScore: number;
  };

  // 3. תגים ומאפיינים (משתמש בהגדרה הגמישה החדשה)
  features: RouteFeatures;

  // 4. מבנה המסלול
  segments: RouteSegment[]; // שלבים (למגירה)
  path: [number, number][]; // קו גיאוגרפי

  // 5. צבע אופציונלי לתצוגה במפה
  color?: string;

  // =======================================================
  // תוספות דינמיות (Runtime Fields)
  // =======================================================
  calculatedScore?: number;
  distanceFromUser?: number;
  isWarmupFeasible?: boolean;
  isReachableWithoutCar?: boolean;
  includesOfficialSegments?: boolean;
  visitingParkId?: string | null;
  includesFitnessStop?: boolean;
}
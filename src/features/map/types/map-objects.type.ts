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
  
  // זמני עומס (שמרתי מהגרסה הראשונה ששלחת)
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
// 5. אובייקטים לתצוגת המסלול (UI - Drawer)
// ==========================================

export type ActivityType = 'running' | 'walking' | 'cycling' | 'workout';
export type SegmentType = 'run' | 'walk' | 'workout' | 'bench' | 'finish';

export interface Exercise {
  name: string;      
  reps: string;      
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

// המסלול המלא שמוצג למשתמש
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
  activityType?: ActivityType; // Alias for backward compatibility and clarity
  difficulty: 'easy' | 'medium' | 'hard';
  
  // Curator Mode (Admin Overrides)
  adminRating?: number; // 0-10, default 0
  isPromoted?: boolean; // Whether this route is manually promoted by admin
  
  // המגירה
  segments: RouteSegment[]; 
  
  // הקו על המפה
  path: [number, number][]; 
}
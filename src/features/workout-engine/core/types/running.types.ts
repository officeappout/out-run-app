// ==========================================
// 1. הגדרת המטרות והיכולת (מהמצגת עמ' 2-3)
// ==========================================
export type RunnerGoal = 
  | 'couch_to_5k'       // להתחיל לרוץ (רצים חדשים/חוזרים) [cite: 21, 26]
  | 'maintain_fitness'  // לשמור על כושר קיים [cite: 23]
  | 'improve_speed_10k' // לשפר קצב ל-10 ק"מ (מתחת ל-6:00) [cite: 7]
  | 'improve_speed_5k'  // לשפר קצב ל-5 ק"מ
  | 'improve_endurance'; // רץ שרוצה לרוץ לאט יותר מ-6:00 [cite: 8]

export interface RunningOnboardingData {
  currentAbility: {
    canRunContinuous: boolean; // האם יכול לרוץ ברצף? [cite: 27]
    continuousTimeMinutes: number; // 5-15, 15-30, 30-45+ [cite: 29, 31, 43]
    referencePace?: string; // תוצאת שיא אחרונה (למשל 10 ק"מ ב-50 דק') [cite: 141]
  };
  targetDistance: 3 | 5 | 10; // מרחק יעד [cite: 30, 34]
  weeklyFrequency: 1 | 2 | 3 | 4; // כמה פעמים בשבוע [cite: 33, 152]
}

// ==========================================
// 2. מערכת קצבים חכמה (הליבה של המצגת עמ' 7-8)
// ==========================================
export type RunZoneType = 
  | 'walk'              // הליכה (125-160% או קבוע) [cite: 241, 344]
  | 'recovery'          // ריצת התאוששות (145-165%) [cite: 241]
  | 'easy'              // ריצה קלה / חימום (130-145%) [cite: 241]
  | 'long_run'          // ריצת נפח
  | 'fartlek_medium'    // פרטלק בינוני
  | 'tempo'             // טמפו / סף לקטט (105-112%) [cite: 241]
  | 'fartlek_fast'      // פרטלק מהיר / קצב 10 ק"מ
  | 'interval_short';   // אינטרוולים קצרים (98-102%) [cite: 241]

// המבנה ששומר את קצב הבסיס והאזורים המחושבים
export interface PaceProfile {
  basePace: number; // הקצב בשניות לק"מ (למשל: 330 שניות = 5:30) [cite: 233]
  
  // האזורים המחושבים (מעוגלים ל-5 שניות הקרובות לנוחות) [cite: 234, 239]
  zones: {
    [key in RunZoneType]: {
      minPace: number; // שניות לק"מ
      maxPace: number;
      label: string;   // "5:30-5:45"
    }
  };

  // היסטוריית אימוני איכות לצורך עדכון קצב הבסיס [cite: 279]
  qualityWorkoutsHistory: {
    workoutId: string;
    date: Date;
    avgPace: number;
    performanceZone: 'low' | 'mid' | 'high' | 'out'; // האם עמד בטווח? [cite: 264, 271, 273]
    impactOnBasePace: number; // כמה שניות שיפר/האט (למשל -3.2 שניות) [cite: 266, 287]
  }[];
}

// ==========================================
// 3. מבנה אימון ריצה (עמ' 15)
// ==========================================
export interface RunningWorkout {
  id: string;
  name: string; // "אימון אינטרוולים קלאסי"
  description: string; // "נועד לשפר יכולת אנאירובית..." [cite: 191]
  
  isQualityWorkout: boolean; // האם זה אימון שמשפיע על קצב הבסיס? 
  
  structure: {
    warmup: { durationOrDist: number; type: 'time' | 'dist'; zone: RunZoneType }; 
    
    // הליבה של האימון (יכולה להיות חזרות)
    mainSet: {
      sets: number; // מספר הקפות [cite: 205]
      exercises: {
        type: 'interval' | 'rest' | 'strength'; // ריצה או מנוחה או כוח
        zone?: RunZoneType; // קצב יעד (למשל: ריצה מהירה מאוד) [cite: 207]
        durationOrDist: number;
        durationType: 'time' | 'dist'; 
      }[];
    };
    
    cooldown: { durationOrDist: number; type: 'time' | 'dist'; zone: RunZoneType }; 
  };
  
  videoIds?: string[]; // סרטונים בסוף האימון [cite: 367]
}

// ==========================================
// 4. תוכנית אימונים פעילה (עמ' 16)
// ==========================================
export interface ActiveRunningProgram {
  programId: string; // "5k_improver"
  startDate: Date;
  currentWeek: number; // שבוע 8 מתוך 16 [cite: 352]
  schedule: {
    week: number;
    day: number;
    workoutId: string;
    status: 'pending' | 'completed' | 'skipped' | 'swapped'; // תמיכה בהחלפה/פספוס 
    actualPerformance?: {
      avgPace: number;
      completionRate: number; // כמה מהאימון בוצע
    };
  }[];
}
// זה המשתנה שהיה חסר!
export interface RunningProfile {
  isUnlocked: boolean;          // האם המשתמש בכלל פתח את עולם הריצה?
  currentGoal: RunnerGoal;      // (הוגדר למעלה)
  paceProfile?: PaceProfile;    // (הוגדר למעלה)
  activeProgram?: ActiveRunningProgram; // (הוגדר למעלה)
}
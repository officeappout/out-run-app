// src/features/onboarding/types/onboarding.types.ts

// ==========================================
// Types לשאלון Onboarding דינמי
// ==========================================

export type QuestionViewType =
  | 'cards_with_image'   // כרטיסי בחירה עם תמונה (כמו "מה המטרה שלך")
  | 'simple_selection'   // כפתורים רגילים (כמו "מגדר")
  | 'text_input'         // שדה טקסט (כמו שם)
  | 'date_picker'        // יום/חודש/שנה (3 שדות input)
  | 'multi_day_selector' // בחירת ימי אימון (א,ב,ג...)
  | 'time_picker'        // בחירת שעה
  | 'boolean_toggle'     // הצהרת בריאות (כן/לא)
  | 'equipment_selector' // בחירת ציוד (multi-select עם אייקונים)
  | 'info_screen'        // מסך מידע (כמו תנאי שימוש)
  | 'terms_of_use'       // תנאי שימוש (עם גלילה פנימית)
  | 'phone_input'        // הזנת טלפון
  | 'otp_input'         // הזנת קוד OTP
  | 'loader'            // מסך טעינה ("מחשבים לך את התוכנית...")
  | 'summary_reveal'     // מסך סיכום עם הרמה והניתוח
  | 'health_declaration_strict' // הצהרת בריאות מחמירה (צ'קבוקס)
  | 'save_progress';     // מסך הסבר על שמירת התקדמות

// ==========================================
// הגדרת אפשרות בחירה
// ==========================================
export interface QuestionOption {
  id: string;
  labelKey: string;        // מפתח במילון (dictionaries.ts)
  imageRes?: string;        // נתיב לתמונה בתוך הכרטיס
  value: any;              // הערך שנשמר בתשובה
  nextStepId: string;       // המזהה של השאלה הבאה
  icon?: string;           // אייקון (לציוד)
}

// ==========================================
// לוגיקה מותנית לדילוג
// ==========================================
export interface ConditionalLogic {
  dependsOnQuestionId: string;  // שאלה שתלויה בה
  matchValue: any;              // הערך שצריך להתאים
  jumpToStepId: string;         // לקפוץ לשאלה זו
}

// ==========================================
// הגדרת שאלה/צעד בשאלון
// ==========================================
export interface QuestionnaireNode {
  id: string;                    // מזהה ייחודי
  viewType: QuestionViewType;    // סוג התצוגה
  titleKey: string;              // מפתח כותרת במילון
  subtitleKey?: string;          // מפתח תת-כותרת (אופציונלי)
  descriptionKey?: string;       // מפתח תיאור (אופציונלי)
  nextStepId?: string;
  
  // אפשרויות בחירה (רק אם viewType תומך)
  options?: QuestionOption[];

  // לוגיקה מותנית לדילוג
  conditionalLogic?: ConditionalLogic;

  // שדות מיוחדים לפי סוג + אימות
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    minAge?: number;  // לתאריך לידה
    
    // ✅ הוספתי את אלו כדי לתמוך במשקל/גובה
    min?: number;     
    max?: number;
  };

  // ערך ברירת מחדל
  defaultValue?: any;

  // האם ניתן לדלג על השאלה
  skippable?: boolean;
}

// ==========================================
// תשובות המשתמש
// ==========================================
export interface OnboardingAnswers {
  [questionId: string]: any;
}

// ==========================================
// מצב השאלון
// ==========================================
export interface OnboardingState {
  currentStepId: string | null;
  answers: OnboardingAnswers;
  visitedSteps: string[];  // מעקב על צעדים שביקרנו בהם
  isComplete: boolean;
}

// ==========================================
// Types for the new Onboarding Wizard Flow
// ==========================================

export interface OnboardingData {
  // Phase 2 - Persona & Lifestyle (multi-select personas, single-select goal)
  selectedPersonaId?: string; // First selected lifestyle persona ID (for backwards compatibility)
  selectedPersonaIds?: string[]; // Array of selected lifestyle persona IDs (multi-select)
  lifestyleTags?: string[]; // Combined tags from selected personas and goals
  selectedGoal?: string; // Selected goal ID (single-select)
  selectedGoalLabel?: string; // Short goal label (e.g., "שגרה קבועה")
  selectedGoalDescription?: string; // Long goal description (e.g., "להתמיד ולבנות שגרה קבועה")
  selectedGoals?: string[]; // DEPRECATED: kept for backwards compatibility
  
  // Phase 2 - Personal Stats
  weight?: number; // Weight in kg
  trainingHistory?: 'none' | '1-2' | '3+'; // Frequency of current workouts
  
  // Phase 2 - Sports & Outdoor Gym (conditional)
  otherSportsTags?: string[]; // IDs of selected sports (e.g., ['running', 'yoga'])
  sportTags?: string[]; // Sport tags for notifications (e.g., ['sport_running', 'sport_yoga'])
  outdoorGymExperience?: 'first_time' | 'tried_few' | 'regular'; // Outdoor gym experience level
  
  // Phase 2 - Location
  locationAllowed: boolean;
  city: string;
  location?: { lat: number; lng: number; city: string }; // GPS coordinates
  
  // Phase 2 - Equipment
  hasEquipment: boolean;
  equipmentCategory?: 'none' | 'home' | 'gym'; // Equipment category
  equipmentList: string[]; // Array of gear definition IDs
  hasGym?: boolean; // User also trains at gym
  
  // Phase 2 - Schedule
  trainingDays: number;
  trainingTime: string;
  scheduleDays?: string[]; // Array of Hebrew day letters like ['א', 'ג', 'ה'] - actual selected days
  scheduleDayIndices?: number[]; // Array of day indices (0-6) for reference
  
  // Account Security (Backup & Security)
  accountSecured?: boolean; // True if user linked Google/Email/Phone
  accountStatus?: 'secured' | 'unsecured'; // Status terminology (replaces 'anonymous')
  accountMethod?: 'google' | 'email' | 'phone' | 'unsecured'; // How account is backed up
  securedEmail?: string; // Email used for backup (if email method)
  securedPhone?: string; // Phone used for backup (if phone method)
  termsVersion?: string; // Terms version accepted (e.g., '1.0')
  termsAcceptedAt?: Date; // When terms were accepted
  
  // Dynamic Questionnaire Results (from DynamicOnboardingEngine)
  // These take HIGHEST priority over GOAL_TO_PROGRAM mapping
  assignedResults?: Array<{
    programId: string;
    levelId: string;
    masterProgramSubLevels?: Record<string, number>;
  }>;
  assignedProgramId?: string; // Primary assigned program (first result or legacy)
  assignedLevelId?: string;   // Primary assigned level (first result or legacy)
  assignedLevel?: number;     // Numeric level (legacy)

  // Legacy fields (kept for compatibility)
  onboardingCoins?: number; // Total coins earned during onboarding wizard
  pastActivityLevel: string;
  historyFrequency?: string; // Frequency of past workouts ('none', '1-2', '3+')
  historyTypes?: string[]; // Past workout locations/types (legacy)
  historyLocations?: string[]; // Where user trained ('studio', 'park', 'home', 'gym')
  historySports?: string[]; // Sports practiced ('running', 'yoga', 'cycling', 'strength', 'cardio', 'crossfit')
  healthKitConnected: boolean;
}

export type OnboardingStepId = 
  // Phase 2 Steps (new sequence)
  | 'PERSONA'
  | 'PERSONAL_STATS'
  | 'LOCATION'  // Unified location step (GPS + City Search + Parks)
  | 'EQUIPMENT' 
  | 'SCHEDULE'
  | 'HEALTH_DECLARATION' // Health declaration before completion
  | 'ACCOUNT_SECURE' // Backup & Security step (after health declaration)
  | 'PROCESSING' // Animated processing screen before summary
  // Legacy steps (kept for compatibility)
  | 'HISTORY'
  | 'SOCIAL_MAP'
  | 'COMMUNITY' 
  | 'COMPLETED'
  | 'SUMMARY';
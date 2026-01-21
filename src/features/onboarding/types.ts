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
  locationAllowed: boolean;
  city: string;
  hasEquipment: boolean;
  equipmentList: string[]; // Array of gear definition IDs
  hasGym?: boolean; // User also trains at gym
  trainingDays: number;
  trainingTime: string;
  scheduleDays?: string[]; // Array of Hebrew day letters like ['א', 'ג', 'ה'] - actual selected days
  scheduleDayIndices?: number[]; // Array of day indices (0-6) for reference
  onboardingCoins?: number; // Total coins earned during onboarding wizard
  pastActivityLevel: string;
  historyFrequency?: string; // Frequency of past workouts ('none', '1-2', '3+')
  historyTypes?: string[]; // Past workout locations/types ('gym', 'street', 'studio', 'home', 'cardio')
  healthKitConnected: boolean;
}

export type OnboardingStepId = 
  | 'LOCATION' 
  | 'EQUIPMENT' 
  | 'HISTORY'
  | 'SCHEDULE' 
  | 'SOCIAL_MAP'
  | 'COMMUNITY' 
  | 'COMPLETED'
  | 'SUMMARY';
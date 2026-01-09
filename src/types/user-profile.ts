import { RunningProfile } from '../features/running/types/running.types';// ==========================================
// 1. הגדרת התחומים המקצועיים (Skill Tree Domains)
// אלו "עמודי התווך" של המערכת. הם קבועים ולא משתנים.
// ==========================================
export type TrainingDomainId = 
  | 'upper_body'   // פלג גוף עליון (למשל: 22 רמות)
  | 'lower_body'   // פלג גוף תחתון (למשל: 10 רמות)
  | 'full_body'    // כל הגוף
  | 'core'         // ליבה ובטן
  | 'flexibility'  // גמישות / מוביליטי
  | 'running'      // תחום הריצה (מקושר לקובץ הריצה)
  
  // --- תחומי מיומנות ספציפיים (Skills) ---
  | 'handstand'    // תוכנית לעמידת ידיים
  | 'pull_up_pro'; // תוכנית למתח יד אחת / מתח מתקדם

// מעקב התקדמות טכני לכל תחום בנפרד
export interface DomainProgress {

  currentLevel: number; // הרמה הנוכחית (למשל: רמה 5 מתוך 22)
  maxLevel: number;     // הרמה המקסימלית האפשרית בתחום הזה
  isUnlocked: boolean;  // האם התחום הזה פתוח למשתמש?
}

// ==========================================
// 2. הגדרת תוכניות אימון דינמיות (Active Programs)
// מנגנון זה מאפשר להוסיף "מוצרים" זמניים (כמו "אימון חתונה")
// מבלי לשנות את הקוד של הטיפוסים הראשיים.
// ==========================================
export interface UserActiveProgram {
  id: string;          // מזהה ייחודי להרשמה (למשל: 'wedding_prep_2026')
  templateId: string;  // מזהה התבנית המקורית ממאגר התוכניות
  name: string;        // שם התצוגה: "אימון חתונה"
  startDate: Date;
  durationWeeks: number;
  currentWeek: number;
  
  // באילו תחומי יכולת התוכנית הזו משתמשת?
  // (למשל: תוכנית חתונה תתמקד ב-'upper_body' וב-'core')
  focusDomains: TrainingDomainId[]; 
}

// ==========================================
// 3. מערכת ההתקדמות המפוצלת (Progression System)
// ==========================================
export interface UserProgression {
  // --- רמת ה"שחקן" הכללית (RPG) ---
  // זה רק בשביל הדמות, התגים והכיף (Gamification).
  globalLevel: number;       // שלב 1-50
  globalXP: number;          // נקודות ניסיון כלליות
  avatarId: string;          // הדמות (משתנה לפי ה-Global Level)
  unlockedBadges: string[];  // תגים שנאספו

  // --- רמות הכושר האמיתיות (Technical Skill Tree) ---
  // האלגוריתם מסתכל *רק* כאן כשהוא בונה אימון!
  // זהו המיפוי המדויק של יכולות המשתמש בכל תחום.
  domains: {
    [key in TrainingDomainId]?: DomainProgress; 
  };

  // --- תוכניות פעילות ---
  // רשימת התוכניות שהמשתמש רשום אליהן כרגע.
  // מאפשר למשתמש להיות רשום לכמה תוכניות במקביל.
  activePrograms: UserActiveProgram[]; 

  // תרגילים מיוחדים שנפתחו כבונוס
  unlockedBonusExercises: string[];
}

// ==========================================
// 4. פרופיל הציוד
// ==========================================
export interface EquipmentProfile {
  home: { dumbbells: boolean; bands: boolean; pullUpBar: boolean; mat: boolean; kettlebell: boolean };
  office: { stableChair: boolean; desk: boolean; privateSpace: boolean; stairs: boolean };
  studies: { stableChair: boolean; stairs: boolean; campusOutdoorArea: boolean };
  outdoor: { bench: boolean; lowBar: boolean; highBar: boolean; dipStation: boolean; wall: boolean; stairs: boolean };
}

// ==========================================
// 5. הפרופיל המלא והסופי (Root Object)
// ==========================================
export interface UserFullProfile {
  id: string;
  
  core: {
    name: string;
    
    // סיווג התחלתי בלבד (בשביל נקודת הזינוק הראשונה של האלגוריתם)
    initialFitnessTier: 1 | 2 | 3; 
    trackingMode: 'wellness' | 'performance'; // wellness = כפתור "סיימתי", performance = הזנת חזרות

    mainGoal: 'healthy_lifestyle' | 'performance_boost' | 'weight_loss' | 'skill_mastery';
    gender: 'male' | 'female' | 'other';
    weight: number;
    birthDate?: Date;
  };

  // כאן יושבת המערכת החדשה המאוחדת
  progression: UserProgression;

  equipment: EquipmentProfile;

  lifestyle: {
    hasDog: boolean;
    commute: { method: 'bus' | 'car' | 'bike' | 'walk'; workLocation?: { lat: number; lng: number }; enableChallenges: boolean };
  };
  
  health: { injuries: string[]; connectedWatch: 'apple' | 'garmin' | 'none' }; 
  
  running: RunningProfile; // מתוך קובץ הריצה הנפרד
  
  coins: number; // המדד הכלכלי: 1 קלוריה שווה 1 מטבע
}


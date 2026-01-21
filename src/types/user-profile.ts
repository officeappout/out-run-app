// Re-export from new location for backward compatibility
export * from '../features/user/core/types/user.types';

// ==========================================
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

  // כלכלה וסטטיסטיקה (Lifetime Totals)
  coins: number;
  totalCaloriesBurned: number;
  hasUnlockedAdvancedStats: boolean;

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

  // --- Master Program Hidden Sub-Levels (Invisible Complexity) ---
  // For Master Programs (e.g., "Full Body"), track sub-levels separately
  // but show only a unified "Global Level" to beginners (Level 1-5)
  masterProgramSubLevels?: {
    [programId: string]: {
      upper_body_level?: number;
      lower_body_level?: number;
      core_level?: number;
      // Add more sub-domains as needed
    };
  };

  // --- Domain-Specific Progression Tracks ---
  // Firestore structure: progression.tracks.[programId]
  // Tracks independent level and percentage for each domain
  tracks?: {
    [programId: string]: DomainTrackProgress;
  };
}

// ==========================================
// 4. פרופיל הציוד
// ==========================================
// New structure: Array of gear definition IDs (from gear_definitions collection)
export interface EquipmentProfile {
  home: string[]; // Array of gear_definition IDs
  office: string[]; // Array of gear_definition IDs
  outdoor: string[]; // Array of gear_definition IDs
}

// ==========================================
// 4.1 Dashboard / Home Mode
// ==========================================
export type DashboardMode = 'DEFAULT' | 'RUNNING' | 'PERFORMANCE';

// ==========================================
// 5. הפרופיל המלא והסופי (Root Object)
// ==========================================
export interface UserFullProfile {
  id: string;

  core: {
    name: string;
    email?: string; // Added for Guest Detection

    // סיווג התחלתי בלבד (בשביל נקודת הזינוק הראשונה של האלגוריתם)
    initialFitnessTier: 1 | 2 | 3;
    trackingMode: 'wellness' | 'performance'; // wellness = כפתור "סיימתי", performance = הזנת חזרות

    mainGoal: 'healthy_lifestyle' | 'performance_boost' | 'weight_loss' | 'skill_mastery';
    gender: 'male' | 'female' | 'other';
    weight: number;
    birthDate?: Date;
    photoURL?: string;
    authorityId?: string; // Link to authority (city/region) for manager access control
    isSuperAdmin?: boolean; // Super admin flag for platform administrators
    isApproved?: boolean; // Approval status for admin access (defaults to false for new sign-ups)
  };

  // כאן יושבת המערכת החדשה המאוחדת
  progression: UserProgression;

  equipment: EquipmentProfile;

  // Optional user goals (e.g., daily steps target)
  goals?: {
    dailySteps: number;
    // More goals can be added here later (e.g., weeklyMinutes, weeklyRuns)
  };

  lifestyle: {
    hasDog: boolean;
    commute: { method: 'bus' | 'car' | 'bike' | 'walk'; workLocation?: { lat: number; lng: number }; enableChallenges: boolean };
    scheduleDays?: string[]; // Array of Hebrew day letters: ['א', 'ב', 'ג'] - workout days
    trainingTime?: string; // HH:MM format - preferred workout time
    dashboardMode?: DashboardMode; // Explicit dashboard mode override (DEFAULT/RUNNING/PERFORMANCE)
  };

  health: { injuries: string[]; connectedWatch: 'apple' | 'garmin' | 'none' };

  running: RunningProfile; // מתוך קובץ הריצה הנפרד
}

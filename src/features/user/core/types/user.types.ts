import { RunningProfile } from '../../../workout-engine/core/types/running.types';
import { DomainTrackProgress, ReadyForSplitStatus } from './progression.types';
import type { RecurringTemplate } from '../../scheduling/types/schedule.types';

// ==========================================
// Level Goal Progress Tracking
// ==========================================
/**
 * Tracks a user's progress on admin-defined level goals.
 * Stored in progression.levelGoalProgress[]
 */
export interface UserLevelGoalProgress {
  levelId: string;
  levelName: string;
  goals: {
    exerciseId: string;
    exerciseName: string;
    targetValue: number;
    unit: 'reps' | 'seconds';
    bestPerformance: number;      // User's best performance so far
    lastAttemptDate?: Date;
    completionPercent: number;    // (bestPerformance / targetValue) * 100, capped at 100
    isCompleted: boolean;         // true if bestPerformance >= targetValue
  }[];
}

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

  // --- Lemur Evolution (NEW in Wave 4) ---
  daysActive: number;        // Total days user has been active (persistence metric)
  lastActiveDate?: string;   // Last activity date 'YYYY-MM-DD' (to prevent double-counting)
  lemurStage: number;        // 1-10 (Lemur evolution stage based on daysActive)

  // --- Dynamic Goals (NEW in Two-Speed System) ---
  dailyStepGoal: number;     // Adaptive step goal (starts at 3000, adjusts +10%/-5%)
  dailyFloorGoal: number;    // Adaptive floor goal (starts at 3, adjusts +10%/-5%)
  currentStreak: number;     // Days meeting at least baseline (1500 steps OR 1 floor)
  goalHistory: Array<{
    date: string;            // 'YYYY-MM-DD'
    stepsAchieved: number;
    floorsAchieved: number;
    stepGoalMet: boolean;    // Hit adaptive goal (not just baseline)
    floorGoalMet: boolean;
  }>;

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

  // --- Master Program Hidden Sub-Levels (Dynamic Child Mapping) ---
  // For Master Programs (e.g., "Full Body"), track sub-levels separately.
  // Keys are the master programId, values are Record<childProgramId, level>.
  // Example: { "full_body": { "push": 3, "pull": 2, "legs": 4 } }
  masterProgramSubLevels?: {
    [masterProgramId: string]: Record<string, number>;
  };

  // --- Domain-Specific Progression Tracks ---
  // Firestore structure: progression.tracks.[programId]
  // Tracks independent level and percentage for each domain
  tracks?: {
    [programId: string]: DomainTrackProgress;
  };

  // --- Ready for Split Recommendation ---
  // Triggered when full_body level reaches threshold (10)
  // Suggests transitioning to split training (upper/lower)
  readyForSplit?: ReadyForSplitStatus;

  // --- Program Progress Tracking (Golden Content Hyper-Personalization) ---
  // Progress percentage (0-100) in the user's current primary program
  // Used by the scoring engine for Level-Up content targeting (90-100% = +5 bonus)
  programProgress?: number;
  
  // Current program name for @שם_תוכנית tag (e.g., 'pulling', 'pushing', 'core')
  currentProgram?: string;
  
  // Target level for @רמה_הבאה tag
  targetLevel?: number;

  // --- Level Goal Progress Tracking ---
  // Tracks user's performance on admin-defined target exercises per level
  levelGoalProgress?: UserLevelGoalProgress[];

  // --- 48-Hour Muscle Shield (Split Engine) ---
  /** Muscle groups trained in the last session. Excluded from next session for Habit Builder path. */
  lastSessionMuscleGroups?: import('@/features/content/exercises/core/exercise.types').MuscleGroup[];
  /** Date of last session 'YYYY-MM-DD' */
  lastSessionDate?: string;
  /** Focus of last session ('push' | 'pull') for Push/Pull rotation */
  lastSessionFocus?: string;

  /** Ordered skill IDs for multi-skill hybrid (Path C, 2+ skills). Drives P1/P2/P3 rotation in calisthenics_upper. */
  skillFocusIds?: string[];
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
export type DashboardMode = 'DEFAULT' | 'RUNNING' | 'PERFORMANCE' | 'HYBRID';

// ==========================================
// 4.2 Primary Track (Persona Engine)
// Derived from questionnaire goals during onboarding.
// Drives dashboard mode, ring priority, and future WHO compliance.
// ==========================================
export type PrimaryTrack = 'health' | 'strength' | 'run' | 'hybrid';

// ==========================================
// 4.2 Access Control — Tiered Affiliations
// ==========================================

/** Access tier: 1 = Starter (free), 2 = Municipal (city), 3 = Pro/Elite (school/company) */
export type AccessTier = 1 | 2 | 3;

export interface UserAffiliation {
  type: 'city' | 'school' | 'company';
  id: string;           // e.g., 'tel-aviv', 'school_123', 'intel'
  tier: AccessTier;
  name?: string;        // Display name (e.g., "תל אביב", "בית ספר הרצוג")
  joinedAt?: Date;
}

/** Onboarding path chosen at the Gateway */
export type OnboardingPath = 'MAP_ONLY' | 'FULL_PROGRAM';

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

    // Active Reserve Status — gives +20 scoring boost to reservist-targeted content
    isActiveReserve?: boolean;

    // --- Access Control (Modular Onboarding) ---
    /** Computed effective access level: Math.max() across all affiliations. Default: 1 */
    accessLevel?: AccessTier;
    /** List of affiliations granting access (cities via GPS, schools/companies via code) */
    affiliations?: UserAffiliation[];
    /** Individually unlocked program IDs (purchase/code bypass) */
    unlockedProgramIds?: string[];
    /** Whether the user's identity has been verified (onboardingProgress = 100%) */
    isVerified?: boolean;

    /** Age group for Safe-City Map segregation — derived from birthDate */
    ageGroup?: 'minor' | 'adult';

    /** Viral gate: count of friends successfully referred. Social features unlock at 1. */
    referralCount?: number;
  };

  // ── Pillar 1 — Social graph (denormalized for fast client queries) ───────────
  social?: {
    /** IDs of community_groups the user has joined (mirrors group_members sub-collection) */
    groupIds?: string[];
    /** Cached display of referralCount for partner-count widgets */
    partnerCount?: number;
  };

  // כאן יושבת המערכת החדשה המאוחדת
  progression: UserProgression;

  equipment: EquipmentProfile;

  // Optional user goals (e.g., daily steps target)
  goals?: {
    dailySteps: number;
    // More goals can be added here later (e.g., weeklyMinutes, weeklyRuns)
  };

  // User selected fitness goals (up to 3)
  selectedGoals?: string[]; // ['glutes_abs', 'skills', 'mass_building', 'fat_loss']

  lifestyle: {
    hasDog: boolean;
    commute: { method: 'bus' | 'car' | 'bike' | 'walk'; workLocation?: { lat: number; lng: number }; enableChallenges: boolean };
    scheduleDays?: string[]; // Array of Hebrew day letters: ['א', 'ב', 'ג'] - workout days (legacy, kept for backward compat)
    trainingTime?: string; // HH:MM format - preferred workout time (consumed by UTS Momentum Guard)
    trainingHistory?: 'none' | '1-2' | '3+'; // Training frequency from lifestyle wizard
    dashboardMode?: DashboardMode; // Explicit dashboard mode override (DEFAULT/RUNNING/PERFORMANCE)
    primaryTrack?: PrimaryTrack; // Persona-derived track: drives dashboard mode, ring priority, WHO compliance
    lifestyleTags?: string[]; // Lifestyle tags from selected persona (e.g., ['office_worker', 'student'])
    /**
     * UTS Phase 1 — per-day program assignment template.
     * Keys = Hebrew day letters (Sun='א'…Sat='ש').
     * Values = Firestore program document ID array for that day.
     * Empty array value = explicit rest day (generates active recovery).
     * Omitted key = silent rest day (no document written).
     *
     * Example: { 'א': ['push_prog_id'], 'ג': ['pull_prog_id', 'core_prog_id'], 'ה': [] }
     */
    recurringTemplate?: RecurringTemplate;
  };
  
  // Persona (Lemur) selection
  personaId?: string; // ID of selected persona
  profileCompleted?: boolean; // Whether deep dive refinement questionnaire was completed

  // --- Onboarding & Completion Tracking ---
  /** 0-100 profile completion percentage (drives Verified Badge at 100%) */
  onboardingProgress?: number;
  /** Gateway path chosen: MAP_ONLY (quick explore) or FULL_PROGRAM (full onboarding) */
  onboardingPath?: OnboardingPath;
  /** Current onboarding status: tracks position in the adaptive waterfall */
  onboardingStatus?: 'IN_PROGRESS' | 'COMPLETED' | 'PENDING_LIFESTYLE' | 'MAP_ONLY' | 'ONBOARDING';
  /** Current onboarding step within the flow */
  onboardingStep?: string;
  /** Whether the first workout has been generated and is ready */
  firstWorkoutReady?: boolean;
  /** Location context for the first generated workout */
  firstWorkoutLocation?: string;
  /** Park ID used for the first workout (if park workout) */
  firstWorkoutParkId?: string;

  health: { injuries: string[]; connectedWatch: 'apple' | 'garmin' | 'none' };

  /** User settings (push notifications, calendar sync, etc.) */
  settings?: {
    pushEnabled?: boolean;
    calendarSync?: boolean;
  };

  running: RunningProfile; // מתוך קובץ הריצה הנפרד

  // Timestamps
  createdAt?: any; // Firebase serverTimestamp() - user registration/joining date
  updatedAt?: any; // Firebase serverTimestamp() - last profile update
  lastActive?: any; // Firebase serverTimestamp() - last active timestamp
}

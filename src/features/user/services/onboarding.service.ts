import { 
  UserFullProfile, 
  UserProgression, 
  DomainProgress, 
  TrainingDomainId,
  EquipmentProfile 
} from '@/types/user-profile';
import { RunningProfile } from '@/features/running/types/running.types';

// ==========================================
// הגדרת מפות רמות לכל תחום (Max Levels)
// ==========================================
const DOMAIN_MAX_LEVELS: Record<TrainingDomainId, number> = {
  upper_body: 22,
  lower_body: 10,
  full_body: 15,
  core: 18,
  flexibility: 12,
  running: 20,
  handstand: 25,
  pull_up_pro: 20,
};

// ==========================================
// תשובות Onboarding (מהמנוע הדינמי)
// ==========================================
import { OnboardingAnswers as EngineAnswers } from '@/features/onboarding/types';

// אנו משתמשים ב-OnboardingAnswers מהמנוע הדינמי
export type OnboardingAnswers = EngineAnswers;

// ==========================================
// פונקציה: יצירת UserProgression לפי רמת כושר
// ==========================================
export function createInitialProgression(
  fitnessTier: 1 | 2 | 3
): UserProgression {
  // מיפוי רמת כושר לרמת domain
  // Tier 1 (בקושי זז) -> רמה 1 בכל התחומים
  // Tier 2 (מתאמן מדי פעם) -> רמה 3
  // Tier 3 (מתאמן קבוע) -> רמה 5
  const domainLevelMap: Record<1 | 2 | 3, number> = {
    1: 1,
    2: 3,
    3: 5,
  };

  const initialLevel = domainLevelMap[fitnessTier];
  
  // יצירת domains עם כל התחומים
  const domains: Record<TrainingDomainId, DomainProgress> = {} as Record<
    TrainingDomainId,
    DomainProgress
  >;

  // אתחול כל התחומים
  (Object.keys(DOMAIN_MAX_LEVELS) as TrainingDomainId[]).forEach((domainId) => {
    domains[domainId] = {
      currentLevel: initialLevel,
      maxLevel: DOMAIN_MAX_LEVELS[domainId],
      isUnlocked: true, // כל התחומים פתוחים מההתחלה
    };
  });

  return {
    globalLevel: 1,
    globalXP: 0,
    avatarId: 'avatar_1', // דמות ברירת מחדל
    unlockedBadges: [],
    domains,
    activePrograms: [],
    unlockedBonusExercises: [],
    coins: 0,
    totalCaloriesBurned: 0,
    hasUnlockedAdvancedStats: false,
  };
}

// ==========================================
// פונקציה: יצירת פרופיל ציוד ברירת מחדל
// ==========================================
function createDefaultEquipmentProfile(): EquipmentProfile {
  // New structure: Array of gear definition IDs
  return {
    home: [],
    office: [],
    outdoor: [],
  };
}

// ==========================================
// פונקציה: יצירת RunningProfile ברירת מחדל
// ==========================================
function createDefaultRunningProfile(): RunningProfile {
  return {
    isUnlocked: false, // לא נפתח עד שהמשתמש יבחר בזה
    currentGoal: 'couch_to_5k',
    paceProfile: undefined,
    activeProgram: undefined,
  };
}

// ==========================================
// פונקציה: עדכון פרופיל ציוד לפי תשובות
// ==========================================
function updateEquipmentProfile(
  answers: OnboardingAnswers,
  defaultProfile: EquipmentProfile
): EquipmentProfile {
  const updated = { ...defaultProfile };
  const answersAny = answers as any;

  // תמיכה בשני פורמטים: הישן והחדש
  let equipmentValue = answersAny.equipment;
  let equipmentItems: string[] | undefined;

  // פורמט חדש: { category: 'home', items: [...] }
  if (equipmentValue && typeof equipmentValue === 'object' && equipmentValue.category) {
    equipmentItems = equipmentValue.items;
    equipmentValue = equipmentValue.category;
  } else {
    // פורמט ישן: equipment = 'home', equipment_items = [...]
    equipmentItems = answersAny.equipment_items;
  }

  // אם נבחר ציוד בית - items should be gear definition IDs
  if (equipmentValue === 'home' && equipmentItems && Array.isArray(equipmentItems)) {
    // equipmentItems are now gear definition IDs (strings)
    updated.home = [...equipmentItems];
  }

  // Note: office and outdoor equipment would be set elsewhere if needed
  // For now, we only handle home equipment from onboarding

  return updated;
}

// ==========================================
// פונקציה ראשית: תרגום תשובות לפרופיל מלא
// ==========================================
export function mapAnswersToProfile(
  answers: OnboardingAnswers,
  assignedLevel?: number,
  assignedProgramId?: string,
  masterProgramSubLevels?: {
    upper_body_level?: number;
    lower_body_level?: number;
    core_level?: number;
  },
  assignedResults?: Array<{
    programId: string;
    levelId: string;
    masterProgramSubLevels?: {
      upper_body_level?: number;
      lower_body_level?: number;
      core_level?: number;
    };
  }>
): UserFullProfile {
  const answersAny = answers as any;
  
  // ✅ מיפוי רמת כושר ל-initialFitnessTier עם default
  // Priority: assignedLevel (from dynamic questionnaire) > answers.fitness_level > default 1
  const initialFitnessTier = assignedLevel 
    ? (Math.min(Math.max(assignedLevel, 1), 3) as 1 | 2 | 3) // Clamp to 1-3
    : (Number(answersAny.fitness_level) as 1 | 2 | 3) || 1;
  const progression = createInitialProgression(initialFitnessTier);
  
  // ✅ Handle multiple assignedResults (NEW) or legacy single assignment
  if (assignedResults && assignedResults.length > 0) {
    // Process all results - add each program to active programs
    assignedResults.forEach((result) => {
      const programExists = progression.activePrograms?.some(
        p => p.templateId === result.programId || p.id === result.programId
      );
      if (!programExists && progression.activePrograms) {
        progression.activePrograms.push({
          id: `program-${result.programId}-${Date.now()}`,
          templateId: result.programId,
          name: 'Active Program', // Will be fetched from program doc
          startDate: new Date(),
          durationWeeks: 12, // Default
          currentWeek: 1,
          focusDomains: ['full_body'], // Default, will be updated from program doc
        });
      }

      // ✅ Initialize Master Program Sub-Levels if provided for this result
      if (result.masterProgramSubLevels && result.programId) {
        if (!progression.masterProgramSubLevels) {
          progression.masterProgramSubLevels = {};
        }
        progression.masterProgramSubLevels[result.programId] = {
          upper_body_level: result.masterProgramSubLevels.upper_body_level || 1,
          lower_body_level: result.masterProgramSubLevels.lower_body_level || 1,
          core_level: result.masterProgramSubLevels.core_level || 1,
        };

        // ✅ Update domain levels to match sub-levels (for workout generator)
        if (result.masterProgramSubLevels.upper_body_level) {
          const existing = progression.domains.upper_body;
          progression.domains.upper_body = {
            currentLevel: result.masterProgramSubLevels.upper_body_level,
            maxLevel: existing?.maxLevel || 22,
            isUnlocked: existing?.isUnlocked !== false,
          };
        }
        if (result.masterProgramSubLevels.lower_body_level) {
          const existing = progression.domains.lower_body;
          progression.domains.lower_body = {
            currentLevel: result.masterProgramSubLevels.lower_body_level,
            maxLevel: existing?.maxLevel || 10,
            isUnlocked: existing?.isUnlocked !== false,
          };
        }
        if (result.masterProgramSubLevels.core_level) {
          const existing = progression.domains.core;
          progression.domains.core = {
            currentLevel: result.masterProgramSubLevels.core_level,
            maxLevel: existing?.maxLevel || 18,
            isUnlocked: existing?.isUnlocked !== false,
          };
        }
      }
    });
  } else if (assignedProgramId) {
    // Legacy: single assignment
    // Add program to active programs if it doesn't exist
    // Note: UserActiveProgram uses 'id' and 'templateId', not 'programId'
    const programExists = progression.activePrograms?.some(p => p.templateId === assignedProgramId || p.id === assignedProgramId);
    if (!programExists && progression.activePrograms) {
      progression.activePrograms.push({
        id: `program-${assignedProgramId}-${Date.now()}`,
        templateId: assignedProgramId,
        name: 'Active Program', // Will be fetched from program doc
        startDate: new Date(),
        durationWeeks: 12, // Default
        currentWeek: 1,
        focusDomains: ['full_body'], // Default, will be updated from program doc
      });
    }

    // ✅ Initialize Master Program Sub-Levels if provided
    if (masterProgramSubLevels && assignedProgramId) {
      if (!progression.masterProgramSubLevels) {
        progression.masterProgramSubLevels = {};
      }
      progression.masterProgramSubLevels[assignedProgramId] = {
        upper_body_level: masterProgramSubLevels.upper_body_level || 1,
        lower_body_level: masterProgramSubLevels.lower_body_level || 1,
        core_level: masterProgramSubLevels.core_level || 1,
      };

      // ✅ Update domain levels to match sub-levels (for workout generator)
      if (masterProgramSubLevels.upper_body_level) {
        const existing = progression.domains.upper_body;
        progression.domains.upper_body = {
          currentLevel: masterProgramSubLevels.upper_body_level,
          maxLevel: existing?.maxLevel || 22,
          isUnlocked: existing?.isUnlocked !== false,
        };
      }
      if (masterProgramSubLevels.lower_body_level) {
        const existing = progression.domains.lower_body;
        progression.domains.lower_body = {
          currentLevel: masterProgramSubLevels.lower_body_level,
          maxLevel: existing?.maxLevel || 10,
          isUnlocked: existing?.isUnlocked !== false,
        };
      }
      if (masterProgramSubLevels.core_level) {
        const existing = progression.domains.core;
        progression.domains.core = {
          currentLevel: masterProgramSubLevels.core_level,
          maxLevel: existing?.maxLevel || 18,
          isUnlocked: existing?.isUnlocked !== false,
        };
      }
    }
  }
  
  // וידוא שה-XP מאותחל ל-0
  progression.globalXP = 0;
  progression.globalLevel = 1;

  // קביעת trackingMode לפי המטרה
  const trackingMode: 'wellness' | 'performance' = 
    answersAny.goal === 'healthy_lifestyle' ? 'wellness' : 'performance';

  // בניית פרופיל ציוד
  const equipmentProfile = updateEquipmentProfile(
    answers,
    createDefaultEquipmentProfile()
  );

  // בניית פרופיל בריאות
  const healthInjuries: string[] = [];
  if (answersAny.health_declaration) {
    if (answersAny.health_declaration.heart_disease) {
      healthInjuries.push('heart_disease');
    }
    if (answersAny.health_declaration.chest_pain_rest) {
      healthInjuries.push('chest_pain_rest');
    }
    if (answersAny.health_declaration.chest_pain_activity) {
      healthInjuries.push('chest_pain_activity');
    }
  }

  // בניית פרופיל lifestyle
  const workLocation = (answers as any).location
    ? { lat: 0, lng: 0 } // TODO: Geocode את המיקום
    : undefined;

  // ✅ FIXED: All numeric fields have safe defaults
  // וודא שכל ה-numeric fields לא null
  const weight = Number(answersAny.weight) || 70;
  const name = answersAny.personal_name || 'משתמש';
  const gender = answersAny.personal_gender || 'other';
  const mainGoal = answersAny.goal || 'healthy_lifestyle';
  const birthDate = answersAny.personal_birthdate || undefined;

  const profile: UserFullProfile = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // מזהה ייחודי
    core: {
      name,
      initialFitnessTier,
      trackingMode,
      mainGoal,
      gender,
      weight, // ✅ עם default fallback
      birthDate,
    },
    progression,
    equipment: equipmentProfile,
    lifestyle: {
      hasDog: false,
      commute: {
        method: 'walk',
        workLocation,
        enableChallenges: true,
      },
    },
    health: {
      injuries: healthInjuries,
      connectedWatch: 'none',
    },
    running: createDefaultRunningProfile(),
     // מתחיל מאפס - בונוס הרשמה יוסף מאוחר יותר
  };
  
  return profile;
}
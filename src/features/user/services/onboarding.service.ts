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
  };
}

// ==========================================
// פונקציה: יצירת פרופיל ציוד ברירת מחדל
// ==========================================
function createDefaultEquipmentProfile(): EquipmentProfile {
  return {
    home: {
      dumbbells: false,
      bands: false,
      pullUpBar: false,
      mat: false,
      kettlebell: false,
    },
    office: {
      stableChair: false,
      desk: false,
      privateSpace: false,
      stairs: false,
    },
    studies: {
      stableChair: false,
      stairs: false,
      campusOutdoorArea: false,
    },
    outdoor: {
      bench: false,
      lowBar: false,
      highBar: false,
      dipStation: false,
      wall: false,
      stairs: false,
    },
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

  // אם נבחר ציוד בית
  if (equipmentValue === 'home' && equipmentItems && Array.isArray(equipmentItems)) {
    equipmentItems.forEach((item: string) => {
      switch (item) {
        case 'pullUpBar':
          updated.home.pullUpBar = true;
          break;
        case 'parallelBars':
          // אין שדה ספציפי - נשמור ב-outdoor
          updated.outdoor.lowBar = true;
          break;
        case 'resistanceBand':
          updated.home.bands = true;
          break;
        case 'weights':
          updated.home.dumbbells = true;
          break;
        case 'trx':
          updated.home.bands = true; // TRX נחשב כגומייה
          break;
        case 'rings':
          updated.home.pullUpBar = true; // טבעות דורשות מתח
          break;
      }
    });
  }

  return updated;
}

// ==========================================
// פונקציה ראשית: תרגום תשובות לפרופיל מלא
// ==========================================
export function mapAnswersToProfile(
  answers: OnboardingAnswers
): UserFullProfile {
  const answersAny = answers as any;
  
  // מיפוי רמת כושר ל-initialFitnessTier
  const initialFitnessTier = answersAny.fitness_level || 1;
  const progression = createInitialProgression(initialFitnessTier);
  
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

  const profile: UserFullProfile = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // מזהה ייחודי
    core: {
      name: (answers as any).personal_name || 'משתמש',
      initialFitnessTier,
      trackingMode,
      mainGoal: (answers as any).goal || 'healthy_lifestyle',
      gender: (answers as any).personal_gender || 'other',
      weight: 70, // ברירת מחדל - ניתן להוסיף שאלה
      birthDate: (answers as any).personal_birthdate,
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
    coins: 0, // מתחיל מאפס - בונוס הרשמה יוסף מאוחר יותר
  };
  
  return profile;
}

// ==========================================
// Mock Questionnaire Data
// לפי התמונות והזרימה המלאה
// ==========================================

import { QuestionnaireNode } from '../types';

export const ONBOARDING_QUESTIONNAIRE: QuestionnaireNode[] = [
  // ==========================================
  // 1. מסך פתיחה (מידע כללי)
  // ==========================================
  {
    id: 'welcome',
    viewType: 'info_screen',
    titleKey: 'onboarding.welcome.title',
    subtitleKey: 'onboarding.welcome.subtitle',
    skippable: false,
  },

  // ==========================================
  // 2. פרטים אישיים - שם
  // ==========================================
  {
    id: 'personal_name',
    viewType: 'text_input',
    titleKey: 'onboarding.personal.title',
    subtitleKey: 'onboarding.personal.name.question',
    validation: {
      required: true,
      minLength: 2,
      maxLength: 50,
    },
    skippable: false,
  },

  // ==========================================
  // 3. תאריך לידה
  // ==========================================
  {
    id: 'personal_birthdate',
    viewType: 'date_picker',
    titleKey: 'onboarding.personal.birthdate.question',
    descriptionKey: 'onboarding.personal.birthdate.minAge',
    validation: {
      required: true,
      minAge: 14,
    },
    skippable: false,
  },

  // ==========================================
  // 4. מגדר
  // ==========================================
  {
    id: 'personal_gender',
    viewType: 'simple_selection',
    titleKey: 'onboarding.personal.gender.question',
    options: [
      {
        id: 'male',
        labelKey: 'onboarding.personal.gender.male',
        value: 'male',
        nextStepId: 'goal',
      },
      {
        id: 'female',
        labelKey: 'onboarding.personal.gender.female',
        value: 'female',
        nextStepId: 'goal',
      },
      {
        id: 'other',
        labelKey: 'onboarding.personal.gender.other',
        value: 'other',
        nextStepId: 'goal',
      },
    ],
    skippable: false,
  },

  // ==========================================
  // 5. מטרה (cards with images)
  // ==========================================
  {
    id: 'goal',
    viewType: 'cards_with_image',
    titleKey: 'onboarding.goal.title',
    subtitleKey: 'onboarding.goal.subtitle',
    options: [
      {
        id: 'healthy_lifestyle',
        labelKey: 'onboarding.goal.healthy_lifestyle',
        value: 'healthy_lifestyle',
        imageRes: '/images/goals/healthy-lifestyle.jpg',
        nextStepId: 'fitness_level', // דילוג על ציוד
      },
      {
        id: 'performance_boost',
        labelKey: 'onboarding.goal.performance_boost',
        value: 'performance_boost',
        imageRes: '/images/goals/performance.jpg',
        nextStepId: 'fitness_level',
      },
      {
        id: 'weight_loss',
        labelKey: 'onboarding.goal.weight_loss',
        value: 'weight_loss',
        imageRes: '/images/goals/weight-loss.jpg',
        nextStepId: 'fitness_level',
      },
      {
        id: 'skill_mastery',
        labelKey: 'onboarding.goal.skill_mastery',
        value: 'skill_mastery',
        imageRes: '/images/goals/skill-mastery.jpg',
        nextStepId: 'fitness_level',
      },
    ],
    skippable: false,
  },

  // ==========================================
  // 6. רמת כושר (cards with images)
  // ==========================================
  {
    id: 'fitness_level',
    viewType: 'cards_with_image',
    titleKey: 'onboarding.fitness.title',
    subtitleKey: 'onboarding.fitness.subtitle',
    options: [
      {
        id: 'beginner',
        labelKey: 'onboarding.fitness.beginner.title' as any,
        value: 1, // initialFitnessTier: 1
        imageRes: '/images/fitness/beginner.jpg',
        nextStepId: 'schedule_frequency',
      },
      {
        id: 'intermediate',
        labelKey: 'onboarding.fitness.intermediate.title' as any,
        value: 2, // initialFitnessTier: 2
        imageRes: '/images/fitness/intermediate.jpg',
        nextStepId: 'schedule_frequency',
      },
      {
        id: 'advanced',
        labelKey: 'onboarding.fitness.advanced.title' as any,
        value: 3, // initialFitnessTier: 3
        imageRes: '/images/fitness/advanced.jpg',
        nextStepId: 'schedule_frequency',
      },
    ],
    skippable: false,
  },

  // ==========================================
  // 7. תדירות אימון (כמה פעמים בשבוע)
  // ==========================================
  {
    id: 'schedule_frequency',
    viewType: 'simple_selection',
    titleKey: 'onboarding.schedule.frequency.question',
    subtitleKey: 'onboarding.schedule.frequency.subtitle',
    options: Array.from({ length: 7 }, (_, i) => ({
      id: `freq_${i + 1}`,
      labelKey: `${i + 1}` as any, // מספר פשוט
      value: i + 1,
      nextStepId: 'schedule_days',
    })),
    skippable: false,
  },

  // ==========================================
  // 8. ימי אימון (multi-select)
  // ==========================================
  {
    id: 'schedule_days',
    viewType: 'multi_day_selector',
    titleKey: 'onboarding.schedule.days.question',
    descriptionKey: 'onboarding.schedule.days.restRecommendation',
    defaultValue: [],
    skippable: false,
  },

  // ==========================================
  // 9. שעת אימון
  // ==========================================
  {
    id: 'schedule_time',
    viewType: 'time_picker',
    titleKey: 'onboarding.schedule.time.question',
    defaultValue: { hour: 20, minute: 0 }, // 20:00
    skippable: false,
  },

  // ==========================================
  // 10. ציוד (רק אם לא דילגנו)
  // ==========================================
  {
    id: 'equipment',
    viewType: 'equipment_selector',
    titleKey: 'onboarding.equipment.title',
    options: [
      {
        id: 'none',
        labelKey: 'onboarding.equipment.none',
        value: 'none',
        nextStepId: 'health_declaration',
      },
      {
        id: 'home',
        labelKey: 'onboarding.equipment.home',
        value: 'home',
        nextStepId: 'health_declaration',
      },
      {
        id: 'gym',
        labelKey: 'onboarding.equipment.gym',
        value: 'gym',
        nextStepId: 'health_declaration',
      },
    ],
    conditionalLogic: {
      dependsOnQuestionId: 'goal',
      matchValue: 'healthy_lifestyle',
      jumpToStepId: 'health_declaration', // דילוג על ציוד
    },
    skippable: true,
  },

  // ==========================================
  // 11. תנאי שימוש
  // ==========================================
  {
    id: 'terms_of_use',
    viewType: 'terms_of_use',
    titleKey: 'onboarding.terms.title',
    skippable: false,
  },

  // ==========================================
  // 12. הצהרת בריאות
  // ==========================================
  {
    id: 'health_declaration',
    viewType: 'boolean_toggle',
    titleKey: 'onboarding.health.title',
    descriptionKey: 'onboarding.health.disclaimer',
    options: [
      {
        id: 'heart_disease',
        labelKey: 'onboarding.health.heartDisease',
        value: false, // ברירת מחדל: לא
        nextStepId: 'health_declaration',
      },
      {
        id: 'chest_pain_rest',
        labelKey: 'onboarding.health.chestPainRest',
        value: false,
        nextStepId: 'health_declaration',
      },
      {
        id: 'chest_pain_activity',
        labelKey: 'onboarding.health.chestPainActivity',
        value: false,
        nextStepId: 'loader', // מעבר ל-Loader במקום location
      },
    ],
    skippable: false,
  },

  // ==========================================
  // 13. Loader - "מחשבים לך את התוכנית..."
  // ==========================================
  {
    id: 'loader',
    viewType: 'loader',
    titleKey: 'onboarding.summary.loading',
    nextStepId: 'summary_reveal',
    skippable: false,
    defaultValue: true, // מתחיל אוטומטית
  },

  // ==========================================
  // 14. Summary Reveal - הרמה והניתוח
  // ==========================================
  {
    id: 'summary_reveal',
    viewType: 'summary_reveal',
    titleKey: 'onboarding.summary.welcome',
    subtitleKey: 'onboarding.summary.greeting',
    skippable: false,
  },

  // ==========================================
  // 15. שמירת התקדמות - הסבר לפני OTP
  // ==========================================
  {
    id: 'save_progress',
    viewType: 'save_progress',
    titleKey: 'onboarding.saveProgress.title',
    subtitleKey: 'onboarding.saveProgress.description',
    skippable: false,
  },

  // ==========================================
  // 16. OTP - טלפון
  // ==========================================
  {
    id: 'phone',
    viewType: 'phone_input',
    titleKey: 'onboarding.otp.title',
    subtitleKey: 'onboarding.otp.description',
    validation: {
      required: true,
      pattern: '^[0-9]{10}$', // 10 ספרות
    },
    skippable: false,
  },

  // ==========================================
  // 17. OTP - קוד אימות
  // ==========================================
  {
    id: 'otp_verify',
    viewType: 'otp_input',
    titleKey: 'onboarding.otp.verify',
    validation: {
      required: true,
      pattern: '^[0-9]{4}$', // 4 ספרות
    },
    skippable: false,
  },

  // ==========================================
  // 18. מיקום (אחרי OTP)
  // ==========================================
  {
    id: 'location',
    viewType: 'text_input',
    titleKey: 'onboarding.location.title',
    subtitleKey: 'onboarding.location.question',
    descriptionKey: 'onboarding.location.description',
    validation: {
      required: false, // ניתן לדלג
    },
    skippable: true,
  },
];

// ==========================================
// מזהה השאלה הראשונה
// ==========================================
export const START_NODE_ID = 'welcome';

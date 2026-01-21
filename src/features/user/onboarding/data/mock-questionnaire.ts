import { QuestionnaireNode } from '../types';

export const ONBOARDING_QUESTIONNAIRE: QuestionnaireNode[] = [
  // ==========================================
  // 1. רמת כושר (התחלה חדשה)
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
        imageRes: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&q=80&w=400', // Jogging/Walking
        nextStepId: 'personal_gender',
      },
      {
        id: 'intermediate',
        labelKey: 'onboarding.fitness.intermediate.title' as any,
        value: 2, // initialFitnessTier: 2
        imageRes: 'https://images.unsplash.com/photo-1552674605-46d536d2f6d1?auto=format&fit=crop&q=80&w=400', // Runner at gym
        nextStepId: 'personal_gender',
      },
      {
        id: 'advanced',
        labelKey: 'onboarding.fitness.advanced.title' as any,
        value: 3, // initialFitnessTier: 3
        imageRes: 'https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?auto=format&fit=crop&q=80&w=400', // Sprinter/Athlete
        nextStepId: 'personal_gender',
      },
    ],
    skippable: false,
  },

  // ==========================================
  // 2. סטטיסטיקות: מגדר -> משקל -> גיל
  // ==========================================
  {
    id: 'personal_gender',
    viewType: 'simple_selection',
    titleKey: 'onboarding.personal.gender.question',
    options: [
      { id: 'male', labelKey: 'onboarding.personal.gender.male', value: 'male', nextStepId: 'personal_weight' },
      { id: 'female', labelKey: 'onboarding.personal.gender.female', value: 'female', nextStepId: 'personal_weight' },
      { id: 'other', labelKey: 'onboarding.personal.gender.other', value: 'other', nextStepId: 'personal_weight' },
    ],
    skippable: false,
  },
  {
    id: 'personal_weight',
    viewType: 'text_input', // Or dedicated weight picker if available, strictly text for now
    titleKey: 'onboarding.personal.weight.title',
    subtitleKey: 'onboarding.personal.weight.question',
    validation: {
      required: true,
      min: 30,
      max: 300,
      pattern: '^[0-9]+$',
    },
    skippable: false,
    nextStepId: 'personal_birthdate', // Link manually if needed or engine handles linear? Engine is graph based.
    // We need to ensure engine handles nextStepId or we rely on flow.
    // The engine usually looks up nextStepId from option OR relies on index if linear?
    // Looking at previous mock, mostly options have nextStepId.
    // For text_input, nextStepId should be defined on the node if supported, or we need a default flow.
    // I'll add a custom property `nextStepId` to the node for my updated engine logic if needed, 
    // or rely on the `onNext` finding the next node in array?
    // The previous `mock-questionnaire.ts` didn't have `nextStepId` on `personal_name`.
    // Let's rely on array order if nextStepId is missing, commonly implemented in engines.
    // But I will be explicit where I can.
  },
  {
    id: 'personal_birthdate',
    viewType: 'date_picker',
    titleKey: 'onboarding.personal.birthdate.question',
    descriptionKey: 'onboarding.personal.birthdate.minAge',
    validation: { required: true, minAge: 14 },
    skippable: false,
  },

  // ==========================================
  // 3. מטרה
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
        imageRes: 'https://images.unsplash.com/photo-1544367563-12123d8965cd?auto=format&fit=crop&q=80&w=400', // Yoga/Meditation/Health
        nextStepId: 'health_declaration_strict',
      },
      {
        id: 'performance_boost',
        labelKey: 'onboarding.goal.performance_boost',
        value: 'performance_boost',
        imageRes: 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?auto=format&fit=crop&q=80&w=400', // Gym/Weights
        nextStepId: 'health_declaration_strict',
      },
      {
        id: 'weight_loss',
        labelKey: 'onboarding.goal.weight_loss',
        value: 'weight_loss',
        imageRes: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&q=80&w=400', // Cardio/Sweat
        nextStepId: 'health_declaration_strict',
      },
      {
        id: 'skill_mastery',
        labelKey: 'onboarding.goal.skill_mastery',
        value: 'skill_mastery',
        imageRes: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=400', // Calisthenics/Skill
        nextStepId: 'health_declaration_strict',
      },
    ],
    skippable: false,
  },

  // ==========================================
  // 4. הצהרת בריאות (Strict)
  // ==========================================
  {
    id: 'health_declaration_strict',
    viewType: 'health_declaration_strict',
    titleKey: 'onboarding.health.title',
    descriptionKey: 'onboarding.health.strictTerms',
    skippable: false,
    // No options needed, it's a checkbox
  },

  // ==========================================
  // 5. סיום / התחברות
  // ==========================================
  {
    id: 'save_progress',
    viewType: 'save_progress',
    titleKey: 'onboarding.saveProgress.title',
    subtitleKey: 'onboarding.saveProgress.description',
    skippable: false,
  },

  // Keeping these for legacy/fallback structure if referenced, but main flow ends at save_progress logic
  {
    id: 'loader',
    viewType: 'loader',
    titleKey: 'onboarding.summary.loading',
    nextStepId: 'summary_reveal',
    skippable: false,
    defaultValue: true,
  },
  {
    id: 'summary_reveal',
    viewType: 'summary_reveal',
    titleKey: 'onboarding.summary.welcome',
    subtitleKey: 'onboarding.summary.greeting',
    skippable: false,
  },
];

export const START_NODE_ID = 'fitness_level';


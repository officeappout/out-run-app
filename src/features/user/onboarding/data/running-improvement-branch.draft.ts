/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  DRAFT — Running Dynamic Decision Tree (3.3.26 PDF)                 ║
 * ║                                                                      ║
 * ║  DO NOT UPLOAD TO FIRESTORE — awaiting confirmation.                 ║
 * ║                                                                      ║
 * ║  This file defines DynamicQuestionNode-compatible question/answer    ║
 * ║  documents for the full Running Onboarding Decision Tree as          ║
 * ║  specified in "קובץ מפורט לממשק ריצה למתכנתים - עדכון 3.3.26.pdf". ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │  FULL FLOW DIAGRAM (from PDF Pages 2-4)                              │
 * │                                                                       │
 * │  [q_run_goal] "מה המטרה שלך?"                                       │
 * │    ├── "להתחיל לרוץ"          → q_run_beginner_distance               │
 * │    ├── "לשפר תוצאת ריצה"     → q_run_improve_distance                │
 * │    └── "לשמור על כושר ריצה"  → q_run_maintain_ability                │
 * │                                                                       │
 * │  ─── PATH A: להתחיל לרוץ ──────────────────────────────────────────  │
 * │  [q_run_beginner_distance] "בחרו מרחק יעד"                          │
 * │    ├── 3K ─┐                                                          │
 * │    └── 5K ─┤                                                          │
 * │            ▼                                                          │
 * │  [q_run_beginner_ability] "כמה זמן אתם יכולים לרוץ ברצף?"          │
 * │    ├── "הצעד הראשון - לא רץ בכלל"  (abilityTier='none')             │
 * │    ├── "5-15 דקות"                   (abilityTier='5_15')             │
 * │    └── "15-30 דקות"                  (abilityTier='15_30')            │
 * │    → TERMINAL → routes to /onboarding-new/running-schedule            │
 * │                                                                       │
 * │  ─── PATH B: לשפר תוצאת ריצה ─────────────────────────────────────  │
 * │  [q_run_improve_distance] "בחרו מרחק יעד לשיפור"                    │
 * │    ├── 3K ──┐                                                         │
 * │    ├── 5K ──┤                                                         │
 * │    └── 10K ─┤                                                         │
 * │             ▼                                                         │
 * │  [q_run_pace_input] "הזינו תוצאה עדכנית"                            │
 * │    (time-input: HH:MM:SS for selected distance)                       │
 * │    → TERMINAL → routes to /onboarding-new/running-schedule            │
 * │                                                                       │
 * │  ─── PATH C: לשמור על כושר ריצה ──────────────────────────────────  │
 * │  [q_run_maintain_ability] "כמה זמן אתם יכולים לרוץ ברצף?"          │
 * │    ├── "15-30 דקות"  (abilityTier='15_30')                            │
 * │    ├── "30-45 דקות"  (abilityTier='30_45')                            │
 * │    └── "45+ דקות"    (abilityTier='45_plus')                          │
 * │             ▼                                                         │
 * │  [q_run_maintain_distance] "בחרו מרחק יעד"                          │
 * │    ├── 3K, 5K, 10K                                                    │
 * │    → TERMINAL → routes to /onboarding-new/running-schedule            │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * SPRINT ZONE NOTE (Claude's feedback, missing in PDF):
 *   The PDF defines zones from Walk through Interval Short. Our engine also
 *   has a 'sprint' zone (RunZoneType = 'sprint') used for hill sprints and
 *   maximal efforts. The PDF omits this because it's effort-based (not
 *   pace-percentage). The code correctly handles it via blockMode: 'effort'
 *   with effortConfig.effortLevel = 'max'. No pace-map percentage needed.
 *
 * PACE ZONES FROM PDF (for reference — already implemented in PaceMapConfig):
 *   Profile 1 (Fast, basePace < 6:00/km) — percentages of 5K basePace:
 *     walk:            fixed 8:30-11:30
 *     jogging:         160-180%
 *     recovery:        145-165%
 *     easy:            130-145%
 *     long_run:        130-160%
 *     fartlek_medium:  115-120%
 *     tempo:           105-112%
 *     fartlek_fast:    103-107% (= 10K pace)
 *     interval_long:   103-107% (800-2000m)
 *     interval_short:  98-102%  (200-600m)
 *     sprint:          effort-based, no percentage
 *
 *   Profile 2 (Slow, basePace >= 6:00/km) — percentages of 5K basePace:
 *     walk:            fixed 8:30-11:30
 *     recovery:        123-137%
 *     easy:            108-127%  (combined with long_run)
 *     fartlek_medium:  106-114%
 *     tempo:           101-109%
 *     fartlek_fast:    96-104%   (= 10K pace)
 *     interval_long:   96-104%   (800-2000m)
 *     interval_short:  94-101%   (200-600m)
 *     sprint:          effort-based, no percentage
 *
 *   3K distance adjustment: subtract 5 seconds from basePace
 *   10K distance adjustment: add 10 seconds to basePace
 *
 * INTEGRATION:
 *   - Questions go into Firestore `onboarding_questions` collection
 *   - Answers go into Firestore `onboarding_answers` collection
 *   - Entry: connect q_run_goal via conditionalRoute from sport selection
 *   - Terminal answers save to sessionStorage('onboarding_running_answers')
 *   - Flow then routes to /onboarding-new/running-schedule for frequency + days
 *   - running-onboarding-bridge.service.ts reads from sessionStorage on COMPLETED
 */

// ══════════════════════════════════════════════════════════════════════
// Types (matching DynamicOnboardingEngine format)
// ══════════════════════════════════════════════════════════════════════

interface DraftQuestion {
  id: string;
  title: { he: { neutral: string } };
  description?: { he: { neutral: string } };
  type: 'choice' | 'input';
  part: 'assessment';
  layoutType: 'large-card' | 'horizontal-list';
  isFirstQuestion: boolean;
  /** Numeric order — required by Firestore orderBy('order') in the admin query. */
  order: number;
  progressIcon?: string;
  logic?: {
    visibility?: Array<{
      type: 'answer_equals' | 'answer_not_equals';
      field: string;
      operator: '==' | '!=';
      value: string;
    }>;
    category?: string;
  };
}

interface DraftAnswer {
  id: string;
  questionId: string;
  text: { he: { neutral: string } };
  imageUrl?: string;
  nextQuestionId: string | null;
  order: number;
  metadata?: Record<string, unknown>;
  widgetTrigger?: 'RUNNING';
  assignedResults?: Array<{ programId: string; levelId: string }>;
}

// ══════════════════════════════════════════════════════════════════════
// QUESTIONS (7 nodes)
// ══════════════════════════════════════════════════════════════════════

export const RUNNING_QUESTIONS: DraftQuestion[] = [
  // ── Q1: Root — Runner's Goal (ENTRY POINT for running track) ─────
  {
    id: 'q_run_goal',
    title: { he: { neutral: 'מה המטרה שלך?' } },
    description: { he: { neutral: 'נתאים לך תוכנית ריצה אישית' } },
    type: 'choice',
    part: 'assessment',
    layoutType: 'large-card',
    isFirstQuestion: true,
    order: 900,
    progressIcon: 'Target',
    logic: { category: 'running' },
  },

  // ── Q2a: Beginner Distance ────────────────────────────────────────
  {
    id: 'q_run_beginner_distance',
    title: { he: { neutral: 'בחרו מרחק יעד' } },
    description: { he: { neutral: 'מתאים למי שרוצה להתחיל לרוץ לראשונה או לחזור אחרי הפסקה ארוכה' } },
    type: 'choice',
    part: 'assessment',
    layoutType: 'large-card',
    isFirstQuestion: false,
    order: 901,
    progressIcon: 'MapPin',
    logic: { category: 'running' },
  },

  // ── Q2b: Improvement Distance ─────────────────────────────────────
  {
    id: 'q_run_improve_distance',
    title: { he: { neutral: 'בחרו מרחק יעד לשיפור' } },
    description: { he: { neutral: 'לשפר זמנים לקראת מרוצים — תוכנית ספציפית למרחק שלך' } },
    type: 'choice',
    part: 'assessment',
    layoutType: 'large-card',
    isFirstQuestion: false,
    order: 902,
    progressIcon: 'MapPin',
    logic: { category: 'running' },
  },

  // ── Q2c: Maintenance Ability ──────────────────────────────────────
  {
    id: 'q_run_maintain_ability',
    title: { he: { neutral: 'כמה זמן אתם יכולים לרוץ ברצף?' } },
    description: { he: { neutral: 'אני כבר רץ/ה ופשוט רוצה להישאר פעיל/ה ולשמור על הבריאות' } },
    type: 'choice',
    part: 'assessment',
    layoutType: 'horizontal-list',
    isFirstQuestion: false,
    order: 903,
    progressIcon: 'Activity',
    logic: { category: 'running' },
  },

  // ── Q2d: Maintenance Distance ─────────────────────────────────────
  {
    id: 'q_run_maintain_distance',
    title: { he: { neutral: 'בחרו מרחק יעד' } },
    type: 'choice',
    part: 'assessment',
    layoutType: 'large-card',
    isFirstQuestion: false,
    order: 904,
    progressIcon: 'MapPin',
    logic: { category: 'running' },
  },

  // ── Q3: Beginner Ability Level ────────────────────────────────────
  {
    id: 'q_run_beginner_ability',
    title: { he: { neutral: 'כמה זמן אתם יכולים לרוץ ברצף?' } },
    type: 'choice',
    part: 'assessment',
    layoutType: 'horizontal-list',
    isFirstQuestion: false,
    order: 905,
    progressIcon: 'Activity',
    logic: { category: 'running' },
  },

  // ── Q4: Pace Input (Improvers only) ───────────────────────────────
  {
    id: 'q_run_pace_input',
    title: { he: { neutral: 'הזינו תוצאה עדכנית של הריצה שלך' } },
    description: { he: { neutral: 'הזינו תוצאת שיא שלך עד 3 חודשים אחורה או תוצאה המשקפת את הכושר הנוכחי שלך' } },
    type: 'input',
    part: 'assessment',
    layoutType: 'large-card',
    isFirstQuestion: false,
    order: 906,
    progressIcon: 'Gauge',
    logic: { category: 'running' },
  },

  // q_run_injuries REMOVED — David: cut from flow
  // q_run_experience REMOVED — redundant; running history is inferred
  // from ability tier + pace input. Saves one screen.
  // q_run_frequency REMOVED — frequency is now collected by
  // RunningScheduleStep (/onboarding-new/running-schedule)
];

// ══════════════════════════════════════════════════════════════════════
// ANSWERS
// ══════════════════════════════════════════════════════════════════════

export const RUNNING_ANSWERS: DraftAnswer[] = [
  // ══════════════════════════════════════════════════════════════════
  // Q1: Runner's Goal (root)
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'a_run_goal_start',
    questionId: 'q_run_goal',
    text: { he: { neutral: 'להתחיל לרוץ' } },
    imageUrl: '/icons/running/start.svg',
    nextQuestionId: 'q_run_beginner_distance',
    metadata: { goalPath: 'start_running' },
    order: 1,
  },
  {
    id: 'a_run_goal_improve',
    questionId: 'q_run_goal',
    text: { he: { neutral: 'לשפר תוצאת ריצה' } },
    imageUrl: '/icons/running/speed.svg',
    nextQuestionId: 'q_run_improve_distance',
    metadata: { goalPath: 'improve_time' },
    order: 2,
  },
  {
    id: 'a_run_goal_maintain',
    questionId: 'q_run_goal',
    text: { he: { neutral: 'לשמור על כושר ריצה' } },
    imageUrl: '/icons/running/endurance.svg',
    nextQuestionId: 'q_run_maintain_ability',
    metadata: { goalPath: 'maintain_fitness' },
    order: 3,
  },

  // ══════════════════════════════════════════════════════════════════
  // Q2a: Beginner Distance
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'a_run_beg_dist_3k',
    questionId: 'q_run_beginner_distance',
    text: { he: { neutral: '3 ק״מ' } },
    nextQuestionId: 'q_run_beginner_ability',
    metadata: { targetDistance: '3k' },
    order: 1,
  },
  {
    id: 'a_run_beg_dist_5k',
    questionId: 'q_run_beginner_distance',
    text: { he: { neutral: '5 ק״מ' } },
    nextQuestionId: 'q_run_beginner_ability',
    metadata: { targetDistance: '5k' },
    order: 2,
  },

  // ══════════════════════════════════════════════════════════════════
  // Q2b: Improvement Distance
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'a_run_imp_dist_3k',
    questionId: 'q_run_improve_distance',
    text: { he: { neutral: '3 ק״מ' } },
    nextQuestionId: 'q_run_pace_input',
    metadata: { targetDistance: '3k' },
    order: 1,
  },
  {
    id: 'a_run_imp_dist_5k',
    questionId: 'q_run_improve_distance',
    text: { he: { neutral: '5 ק״מ' } },
    nextQuestionId: 'q_run_pace_input',
    metadata: { targetDistance: '5k' },
    order: 2,
  },
  {
    id: 'a_run_imp_dist_10k',
    questionId: 'q_run_improve_distance',
    text: { he: { neutral: '10 ק״מ' } },
    nextQuestionId: 'q_run_pace_input',
    metadata: { targetDistance: '10k' },
    order: 3,
  },

  // ══════════════════════════════════════════════════════════════════
  // Q2c: Maintenance Ability
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'a_run_maint_ability_15_30',
    questionId: 'q_run_maintain_ability',
    text: { he: { neutral: '15-30 דקות' } },
    nextQuestionId: 'q_run_maintain_distance',
    metadata: { abilityTier: '15_30', continuousTimeMinutes: 22 },
    order: 1,
  },
  {
    id: 'a_run_maint_ability_30_45',
    questionId: 'q_run_maintain_ability',
    text: { he: { neutral: '30-45 דקות' } },
    nextQuestionId: 'q_run_maintain_distance',
    metadata: { abilityTier: '30_45', continuousTimeMinutes: 37 },
    order: 2,
  },
  {
    id: 'a_run_maint_ability_45_plus',
    questionId: 'q_run_maintain_ability',
    text: { he: { neutral: '45 דקות ומעלה' } },
    nextQuestionId: 'q_run_maintain_distance',
    metadata: { abilityTier: '45_plus', continuousTimeMinutes: 50 },
    order: 3,
  },

  // ══════════════════════════════════════════════════════════════════
  // Q2d: Maintenance Distance — TERMINAL (PATH C)
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'a_run_maint_dist_3k',
    questionId: 'q_run_maintain_distance',
    text: { he: { neutral: '3 ק״מ' } },
    nextQuestionId: null,
    widgetTrigger: 'RUNNING',
    assignedResults: [{ programId: 'running_dynamic', levelId: 'generated' }],
    metadata: { targetDistance: '3k' },
    order: 1,
  },
  {
    id: 'a_run_maint_dist_5k',
    questionId: 'q_run_maintain_distance',
    text: { he: { neutral: '5 ק״מ' } },
    nextQuestionId: null,
    widgetTrigger: 'RUNNING',
    assignedResults: [{ programId: 'running_dynamic', levelId: 'generated' }],
    metadata: { targetDistance: '5k' },
    order: 2,
  },
  {
    id: 'a_run_maint_dist_10k',
    questionId: 'q_run_maintain_distance',
    text: { he: { neutral: '10 ק״מ' } },
    nextQuestionId: null,
    widgetTrigger: 'RUNNING',
    assignedResults: [{ programId: 'running_dynamic', levelId: 'generated' }],
    metadata: { targetDistance: '10k' },
    order: 3,
  },

  // ══════════════════════════════════════════════════════════════════
  // Q3: Beginner Ability Level — TERMINAL (PATH A)
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'a_run_ability_none',
    questionId: 'q_run_beginner_ability',
    text: { he: { neutral: 'הצעד הראשון — לא רץ/ה בכלל' } },
    nextQuestionId: null,
    widgetTrigger: 'RUNNING',
    assignedResults: [{ programId: 'running_dynamic', levelId: 'generated' }],
    metadata: { abilityTier: 'none', canRunContinuous: false, continuousTimeMinutes: 0 },
    order: 1,
  },
  {
    id: 'a_run_ability_5_15',
    questionId: 'q_run_beginner_ability',
    text: { he: { neutral: '5-15 דקות' } },
    nextQuestionId: null,
    widgetTrigger: 'RUNNING',
    assignedResults: [{ programId: 'running_dynamic', levelId: 'generated' }],
    metadata: { abilityTier: '5_15', canRunContinuous: true, continuousTimeMinutes: 10 },
    order: 2,
  },
  {
    id: 'a_run_ability_15_30',
    questionId: 'q_run_beginner_ability',
    text: { he: { neutral: '15-30 דקות' } },
    nextQuestionId: null,
    widgetTrigger: 'RUNNING',
    assignedResults: [{ programId: 'running_dynamic', levelId: 'generated' }],
    metadata: { abilityTier: '15_30', canRunContinuous: true, continuousTimeMinutes: 22 },
    order: 3,
  },

  // ══════════════════════════════════════════════════════════════════
  // Q4: Pace Input (Improvers only) — TERMINAL (PATH B)
  // Free-form HH:MM:SS input. After submission the dynamic page
  // treats it as terminal and routes to /onboarding-new/running-schedule.
  // ══════════════════════════════════════════════════════════════════

  // q_run_injuries REMOVED — David: cut from flow
  // q_run_experience REMOVED — David: cut from flow
  // q_run_frequency REMOVED — collected by RunningScheduleStep
];

// ══════════════════════════════════════════════════════════════════════
// WEEKS LOOKUP TABLE (from PDF Pages 3-4)
//
// Key: `${goalPath}|${targetDistance}|${abilityTier}|${frequency}`
// Value: totalWeeks for the generated program
//
// For 'improve_time', abilityTier is always 'runner' since they can
// already run. For 'maintain_fitness', abilityTier comes from Q2c.
// ══════════════════════════════════════════════════════════════════════

/**
 * Ability Tier Enum — numeric index for compact lookup keys.
 *   0 = 'none'     (can't run at all)
 *   1 = '5_15'     (5-15 min continuous)
 *   2 = '15_30'    (15-30 min continuous)
 *   3 = '30_45'    (30-45 min continuous)
 *   4 = '45_plus'  (45+ min continuous)
 *
 * For 'improve_time' paths the ability tier is always 'runner' (experienced).
 * For 'maintain_fitness' paths the tier comes from Q2c.
 */
export const ABILITY_TIER_INDEX: Record<string, number> = {
  'none':     0,
  '5_15':     1,
  '15_30':    2,
  '30_45':    3,
  '45_plus':  4,
  'runner':   4,
};

export const ABILITY_TIER_LABEL: Record<number, string> = {
  0: 'לא רץ בכלל',
  1: '5-15 דקות',
  2: '15-30 דקות',
  3: '30-45 דקות',
  4: '45+ דקות',
};

export const WEEKS_LOOKUP: Record<string, number> = {
  // ── PATH A: Start Running — 2K ───────────────────────────────────
  'start_running|2k|none|2':     6,
  'start_running|2k|none|3':     4,
  'start_running|2k|5_15|2':     4,
  'start_running|2k|5_15|3':     4,
  'start_running|2k|15_30|2':    4,
  'start_running|2k|15_30|3':    4,

  // ── PATH A: Start Running — 3K ───────────────────────────────────
  'start_running|3k|none|1':     12,
  'start_running|3k|none|2':     8,
  'start_running|3k|none|3':     6,
  'start_running|3k|5_15|1':     8,
  'start_running|3k|5_15|2':     6,
  'start_running|3k|5_15|3':     4,
  'start_running|3k|15_30|2':    8,
  'start_running|3k|15_30|3':    6,

  // ── PATH A: Start Running — 5K ───────────────────────────────────
  'start_running|5k|none|2':     8,
  'start_running|5k|none|3':     6,
  'start_running|5k|5_15|2':     6,
  'start_running|5k|5_15|3':     4,
  'start_running|5k|15_30|2':    4,
  'start_running|5k|15_30|3':    2,

  // ── PATH B: Improve Time — 2K ────────────────────────────────────
  'improve_time|2k|runner|2':    6,
  'improve_time|2k|runner|3':    4,

  // ── PATH B: Improve Time — 3K ────────────────────────────────────
  'improve_time|3k|runner|2':    8,
  'improve_time|3k|runner|3':    4,

  // ── PATH B: Improve Time — 5K ────────────────────────────────────
  'improve_time|5k|runner|2':    12,
  'improve_time|5k|runner|3':    6,
  'improve_time|5k|runner|4':    8,

  // ── PATH B: Improve Time — 10K ───────────────────────────────────
  'improve_time|10k|runner|2':   8,
  'improve_time|10k|runner|3':   8,
  'improve_time|10k|runner|4':   10,

  // ── PATH C: Maintain Fitness ──────────────────────────────────────
  'maintain_fitness|2k|15_30|2':  6,
  'maintain_fitness|2k|15_30|3':  6,
  'maintain_fitness|2k|30_45|2':  6,
  'maintain_fitness|2k|30_45|3':  6,
  'maintain_fitness|3k|15_30|1':  8,
  'maintain_fitness|3k|15_30|2':  8,
  'maintain_fitness|3k|15_30|3':  8,
  'maintain_fitness|3k|30_45|1':  8,
  'maintain_fitness|3k|30_45|2':  8,
  'maintain_fitness|3k|30_45|3':  8,
  'maintain_fitness|3k|45_plus|1':8,
  'maintain_fitness|3k|45_plus|2':8,
  'maintain_fitness|3k|45_plus|3':8,
  'maintain_fitness|5k|15_30|1':  8,
  'maintain_fitness|5k|15_30|2':  8,
  'maintain_fitness|5k|15_30|3':  8,
  'maintain_fitness|5k|30_45|1':  8,
  'maintain_fitness|5k|30_45|2':  8,
  'maintain_fitness|5k|30_45|3':  8,
  'maintain_fitness|5k|45_plus|1':8,
  'maintain_fitness|5k|45_plus|2':8,
  'maintain_fitness|5k|45_plus|3':8,
  'maintain_fitness|10k|15_30|2':  8,
  'maintain_fitness|10k|15_30|3':  8,
  'maintain_fitness|10k|30_45|2':  8,
  'maintain_fitness|10k|30_45|3':  8,
  'maintain_fitness|10k|45_plus|2':8,
  'maintain_fitness|10k|45_plus|3':8,
};

// ══════════════════════════════════════════════════════════════════════
// ANSWER PERSISTENCE MODEL
//
// When the questionnaire reaches a TERMINAL answer (nextQuestionId: null),
// the engine collects ALL accumulated answers and their metadata, then:
//
// 1. Builds a flat Record<string, string | number | boolean> from
//    each answer's `metadata` fields:
//      {
//        goalPath: 'improve_time',
//        targetDistance: '5k',
//        hasInjuries: false,
//        runningHistoryMonths: 9,
//        weeklyFrequency: 3,
//        paceInputSeconds: 1650,  // (only for improve path)
//        abilityTier: 'runner',   // (only for beginner/maintain)
//        canRunContinuous: true,
//        continuousTimeMinutes: 30,
//      }
//
// 2. Saves to sessionStorage('onboarding_running_answers') as JSON
//
// 3. On COMPLETED, running-onboarding-bridge.service.ts:
//    a) Reads from sessionStorage
//    b) Calls aggregateRunningOnboardingData() to build RunningOnboardingData
//    c) Looks up totalWeeks from WEEKS_LOOKUP
//    d) Calls PlanGeneratorService.generateProgramTemplate()
//    e) Writes result to user.running on Firestore
// ══════════════════════════════════════════════════════════════════════

/**
 * Example flow trace for a 5K improver:
 *
 * 1. q_run_goal → a_run_goal_improve                  {goalPath:'improve_time'}
 * 2. q_run_improve_distance → a_run_imp_dist_5k       {targetDistance:'5k'}
 * 3. q_run_pace_input → [user enters 32:30]           {paceInputSeconds:1950}
 *    → TERMINAL → routes directly to /onboarding-new/running-schedule
 * 4. RunningScheduleStep → user selects 3 days        {weeklyFrequency:3}
 *
 * Bridge computes:
 *   WEEKS_LOOKUP['improve_time|5k|runner|3'] = 6
 *   basePace = calibrateBasePace(1950, 5, 5) = 390 sec/km (6:30)
 *   profileType = 2 (slow improver, >= 360)
 *   → 6-week program, maxIntensityRank=3.0, deload every 3 weeks
 */

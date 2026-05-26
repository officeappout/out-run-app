/**
 * Achievement Definitions — single source of truth.
 *
 * These are seeded to Firestore (achievements collection) via
 * scripts/seed-achievements.ts.  The client loads from Firestore with
 * this array as a hard-coded fallback so the UI is never empty.
 *
 * Schema per document matches AchievementDefinition from achievement.types.ts.
 */

import type { AchievementDefinition } from '../types/achievement.types';

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [

  // ── RUNNING — ריצה ─────────────────────────────────────────────────────

  {
    id: 'first_kilometer',
    name_he: 'הקילומטר הראשון',
    description_he: 'רצת קילומטר ראשון!',
    category: 'running',
    type: 'one_time',
    emoji: '🎽',
    iconUrl: '',
    condition: { type: 'total_running_km', value: 1 },
    xp: 100,
  },
  {
    id: 'first_5k',
    name_he: 'חמישה קילומטר',
    description_he: 'הגעת ל-5 ק״מ ריצה מצטברים',
    category: 'running',
    type: 'one_time',
    emoji: '🏃',
    iconUrl: '',
    condition: { type: 'total_running_km', value: 5 },
    xp: 100,
  },
  {
    id: 'first_10k',
    name_he: 'עשרה קילומטר',
    description_he: 'הגעת ל-10 ק״מ ריצה מצטברים',
    category: 'running',
    type: 'one_time',
    emoji: '🏅',
    iconUrl: '',
    condition: { type: 'total_running_km', value: 10 },
    xp: 100,
  },
  {
    id: 'distance_runner',
    name_he: 'רץ מרחקים',
    description_he: 'צבור קילומטרי ריצה מצטברים',
    category: 'running',
    type: 'tiered',
    emoji: '📏',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'total_running_km', value: 50 },  xp: 50 },
      silver: { condition: { type: 'total_running_km', value: 200 }, xp: 150 },
      gold:   { condition: { type: 'total_running_km', value: 500 }, xp: 300 },
    },
  },
  {
    id: 'longest_run',
    name_he: 'ריצת מרתון',
    description_he: 'ריצה רצופה ארוכה בסשן בודד',
    category: 'running',
    type: 'tiered',
    emoji: '🦅',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'longest_run_km', value: 5 },  xp: 50 },
      silver: { condition: { type: 'longest_run_km', value: 10 }, xp: 150 },
      gold:   { condition: { type: 'longest_run_km', value: 21 }, xp: 300 },
    },
  },
  {
    id: 'weekly_runner',
    name_he: 'שבוע ריצה',
    description_he: '4 ריצות בתוך 7 ימים',
    category: 'running',
    type: 'one_time',
    emoji: '🗓️',
    iconUrl: '',
    condition: { type: 'runs_in_7_days', value: 4 },
    xp: 100,
  },

  // ── STRENGTH — כוח ─────────────────────────────────────────────────────

  {
    id: 'pull_up_king',
    name_he: 'מלך המתח',
    description_he: 'מספר עליות מתח מירבי בסט אחד',
    category: 'strength',
    type: 'tiered',
    emoji: '💪',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'pullup_max_reps', value: 5 },  xp: 50 },
      silver: { condition: { type: 'pullup_max_reps', value: 15 }, xp: 150 },
      gold:   { condition: { type: 'pullup_max_reps', value: 30 }, xp: 300 },
    },
  },
  {
    id: 'pushup_master',
    name_he: 'מאסטר שכיבות שמיכה',
    description_he: 'מספר שכיבות שמיכה מירבי בסט אחד',
    category: 'strength',
    type: 'tiered',
    emoji: '🤸',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'pushup_max_reps', value: 20 },  xp: 50 },
      silver: { condition: { type: 'pushup_max_reps', value: 50 },  xp: 150 },
      gold:   { condition: { type: 'pushup_max_reps', value: 100 }, xp: 300 },
    },
  },
  {
    id: 'squat_champion',
    name_he: 'אלוף הסקוואט',
    description_he: 'מספר סקוואטים מירבי בסט אחד',
    category: 'strength',
    type: 'tiered',
    emoji: '🏋️',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'squat_max_reps', value: 30 },  xp: 50 },
      silver: { condition: { type: 'squat_max_reps', value: 75 },  xp: 150 },
      gold:   { condition: { type: 'squat_max_reps', value: 150 }, xp: 300 },
    },
  },
  {
    id: 'plank_iron',
    name_he: 'ברזל פלאנק',
    description_he: 'זמן פלאנק מירבי בסט אחד (שניות)',
    category: 'strength',
    type: 'tiered',
    emoji: '🧱',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'plank_max_seconds', value: 60 },  xp: 50 },
      silver: { condition: { type: 'plank_max_seconds', value: 180 }, xp: 150 },
      gold:   { condition: { type: 'plank_max_seconds', value: 300 }, xp: 300 },
    },
  },
  {
    id: 'strength_week',
    name_he: 'שבוע כוח',
    description_he: '3 אימוני כוח בתוך 7 ימים',
    category: 'strength',
    type: 'one_time',
    emoji: '⚡',
    iconUrl: '',
    condition: { type: 'strength_in_7_days', value: 3 },
    xp: 100,
  },
  {
    id: 'strength_month',
    name_he: 'חודש כוח',
    description_he: '10 אימוני כוח בתוך 30 ימים',
    category: 'strength',
    type: 'one_time',
    emoji: '🗓️',
    iconUrl: '',
    condition: { type: 'strength_in_30_days', value: 10 },
    xp: 100,
  },
  {
    id: 'gym_addict',
    name_he: 'מכור לחדר הכושר',
    description_he: '50 אימונים בחוץ',
    category: 'strength',
    type: 'one_time',
    emoji: '🏟️',
    iconUrl: '',
    condition: { type: 'outdoor_workouts', value: 50 },
    xp: 100,
  },

  // ── CONSISTENCY — עקביות ────────────────────────────────────────────────

  {
    id: 'park_starter',
    name_he: 'מתחיל בפארק',
    description_he: '10 אימונים בחוץ',
    category: 'consistency',
    type: 'one_time',
    emoji: '🌳',
    iconUrl: '',
    condition: { type: 'outdoor_workouts', value: 10 },
    xp: 100,
  },
  {
    id: 'workout_count',
    name_he: 'לוחם אימונים',
    description_he: 'סה״כ אימונים שהשלמת',
    category: 'consistency',
    type: 'tiered',
    emoji: '🏆',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'total_workouts', value: 20 },  xp: 50 },
      silver: { condition: { type: 'total_workouts', value: 50 },  xp: 150 },
      gold:   { condition: { type: 'total_workouts', value: 100 }, xp: 300 },
    },
  },
  {
    id: 'monthly_streak',
    name_he: 'חודש פעיל',
    description_he: '30 ימי פעילות מצטברים',
    category: 'consistency',
    type: 'one_time',
    emoji: '📅',
    iconUrl: '',
    condition: { type: 'days_active', value: 30 },
    xp: 100,
  },
  {
    id: 'half_year',
    name_he: 'חצי שנה',
    description_he: '180 ימי פעילות מצטברים',
    category: 'consistency',
    type: 'one_time',
    emoji: '🎖️',
    iconUrl: '',
    condition: { type: 'days_active', value: 180 },
    xp: 100,
  },
  {
    id: 'weekly_streak',
    name_he: 'רצף שבועי',
    description_he: 'ימי פעילות רצופים',
    category: 'consistency',
    type: 'tiered',
    emoji: '🔥',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'streak_days', value: 7 },   xp: 50 },
      silver: { condition: { type: 'streak_days', value: 30 },  xp: 150 },
      gold:   { condition: { type: 'streak_days', value: 100 }, xp: 300 },
    },
  },

  // ── SOCIAL — חברתי ──────────────────────────────────────────────────────

  {
    id: 'workout_partner',
    name_he: 'שותף אימון',
    description_he: 'אימונים עם שותפים',
    category: 'social',
    type: 'tiered',
    emoji: '🤝',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'partner_workouts', value: 1 },  xp: 50 },
      silver: { condition: { type: 'partner_workouts', value: 10 }, xp: 150 },
      gold:   { condition: { type: 'partner_workouts', value: 50 }, xp: 300 },
    },
  },
  {
    id: 'active_follower',
    name_he: 'עוקב פעיל',
    description_he: 'מספר משתמשים שאתה עוקב אחריהם',
    category: 'social',
    type: 'tiered',
    emoji: '👥',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'following_count', value: 5 },  xp: 50 },
      silver: { condition: { type: 'following_count', value: 20 }, xp: 150 },
      gold:   { condition: { type: 'following_count', value: 50 }, xp: 300 },
    },
  },
  {
    id: 'popular',
    name_he: 'פופולרי',
    description_he: 'מספר עוקבים שיש לך',
    category: 'social',
    type: 'tiered',
    emoji: '⭐',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'followers_count', value: 10 },  xp: 50 },
      silver: { condition: { type: 'followers_count', value: 50 },  xp: 150 },
      gold:   { condition: { type: 'followers_count', value: 200 }, xp: 300 },
    },
  },
  {
    id: 'group_member',
    name_he: 'חבר קבוצה',
    description_he: 'הצטרפות לקבוצות אימון',
    category: 'social',
    type: 'tiered',
    emoji: '🏘️',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'groups_joined', value: 1 }, xp: 50 },
      silver: { condition: { type: 'groups_joined', value: 3 }, xp: 150 },
      gold:   { condition: { type: 'groups_joined', value: 5 }, xp: 300 },
    },
  },
  {
    id: 'first_message',
    name_he: 'ההודעה הראשונה',
    description_he: 'שלחת הודעה ראשונה בצ׳אט',
    category: 'social',
    type: 'one_time',
    emoji: '💬',
    iconUrl: '',
    condition: { type: 'bool_messages_sent', value: 1 },
    xp: 100,
  },

  // ── LEAGUES — ליגות ─────────────────────────────────────────────────────

  {
    id: 'top_10',
    name_he: 'טופ 10',
    description_he: 'דירוג בליגה השבועית',
    category: 'leagues',
    type: 'tiered',
    emoji: '🏆',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'league_rank_lte', value: 10 }, xp: 50 },
      silver: { condition: { type: 'league_rank_lte', value: 3 },  xp: 150 },
      gold:   { condition: { type: 'league_rank_lte', value: 1 },  xp: 300 },
    },
  },
  {
    id: 'weekly_winner',
    name_he: 'מנצח שבועי',
    description_he: 'ניצחונות שבועיים בליגה',
    category: 'leagues',
    type: 'tiered',
    emoji: '🥇',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'league_weekly_wins', value: 1 },  xp: 50 },
      silver: { condition: { type: 'league_weekly_wins', value: 3 },  xp: 150 },
      gold:   { condition: { type: 'league_weekly_wins', value: 10 }, xp: 300 },
    },
  },

  // ── MAP / PARKS — מפה ───────────────────────────────────────────────────

  {
    id: 'park_explorer',
    name_he: 'חוקר פארקים',
    description_he: 'פארקים שביקרת בהם',
    category: 'map',
    type: 'tiered',
    emoji: '🗺️',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'unique_parks', value: 3 },  xp: 50 },
      silver: { condition: { type: 'unique_parks', value: 7 },  xp: 150 },
      gold:   { condition: { type: 'unique_parks', value: 20 }, xp: 300 },
    },
  },
  {
    id: 'local_legend',
    name_he: 'אגדה מקומית',
    description_he: 'סשנים שביצעת באותו פארק',
    category: 'map',
    type: 'tiered',
    emoji: '📍',
    iconUrl: '',
    tiers: {
      bronze: { condition: { type: 'park_sessions', value: 10 },  xp: 50 },
      silver: { condition: { type: 'park_sessions', value: 50 },  xp: 150 },
      gold:   { condition: { type: 'park_sessions', value: 100 }, xp: 300 },
    },
  },

  // ── SPECIAL — מיוחד ─────────────────────────────────────────────────────

  {
    id: 'early_bird',
    name_he: 'ציפור מוקדמת',
    description_he: 'אימון לפני השעה 07:00',
    category: 'special',
    type: 'one_time',
    emoji: '🌅',
    iconUrl: '',
    condition: { type: 'bool_workout_before_7am', value: 1 },
    xp: 100,
  },
  {
    id: 'friday_warrior',
    name_he: 'לוחם שישי',
    description_he: 'אימון ביום שישי',
    category: 'special',
    type: 'one_time',
    emoji: '📆',
    iconUrl: '',
    condition: { type: 'bool_workout_on_friday', value: 1 },
    xp: 100,
  },
  {
    id: 'rain_warrior',
    name_he: 'לוחם הגשם',
    description_he: 'אימון בחוץ בגשם',
    category: 'special',
    type: 'one_time',
    emoji: '🌧️',
    iconUrl: '',
    condition: { type: 'bool_workout_in_rain', value: 1 },
    xp: 100,
  },
];

/** O(1) lookup by achievement id. */
export const ACHIEVEMENT_MAP: Record<string, AchievementDefinition> = Object.fromEntries(
  ACHIEVEMENT_DEFINITIONS.map((a) => [a.id, a]),
);

/** All achievements for a given category, in definition order. */
export function getAchievementsByCategory(
  category: string,
): AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.filter((a) => a.category === category);
}

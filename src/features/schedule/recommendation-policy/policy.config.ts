/**
 * THE recommendation policy (enable_home_v2, owner 20.10.2026) — one table to tune.
 *
 * Plain JSON-safe data on purpose: the same object can later live in a Firestore
 * config doc (admin / Kelly edits) and be handed to resolveRecommendation()
 * unchanged. Owner-readable copy: agent-briefs/recommendation-policy.md.
 *
 * How it reads: base number by level band → rules top to bottom (a rule fires when
 * every field of `when` matches) → hard-skill minimum → bounds → available days.
 * The split is NOT chosen here: it is the workout generator's own SPLIT_MATRIX cell
 * for the final number × level tier (split-decision.types.ts), so the card never
 * promises a split the workouts won't deliver. `{n}` / `{runs}` / `{split}` in a
 * reason are filled with the final values.
 */
import type { RecommendationPolicy } from './types';

export const RECOMMENDATION_POLICY: RecommendationPolicy = {
  version: 1,
  saturdayDefaultOff: true,
  defaultAvailableDays: 6,

  strength: {
    base: {
      beginner: { frequency: 3, reasonHe: 'מתחיל · {split} {n} פעמים — הכי יעיל ברמה הזו' },
      intermediate: { frequency: 3, reasonHe: 'ביניים · {split} {n} פעמים בשבוע' },
      advanced: { frequency: 4, reasonHe: 'מתקדם · {split} {n} פעמים בשבוע' },
    },
    bounds: { min: 1, max: 6 },
    // = MIN_DAYS_FOR_HARD_SKILLS (engine/scheduleRules.ts) — 1 skill → 2 days …
    skillMinDays: { '1': 2, '2': 3, '3': 4, '4': 5 },
    skillMinReasonHe: 'סקילים · לפחות {n} ימים כדי שכל סקיל יקבל את שלו',
  },

  running: {
    base: {
      beginner: { frequency: 3, reasonHe: 'ריצה למתחילים · {runs} ריצות קצרות — בונים בסיס בהדרגה' },
      intermediate: { frequency: 3, reasonHe: '{runs} ריצות בשבוע · איכות, קלה וארוכה' },
      advanced: { frequency: 4, reasonHe: 'רץ מנוסה · {runs} ריצות בשבוע' },
    },
    // = MIN_RUNNING_FREQUENCY / MAX_RUNNING_FREQUENCY (lib/running-frequency-bounds.ts)
    bounds: { min: 2, max: 4 },
  },

  rules: [
    {
      id: 'senior',
      note: 'גיל הזהב (פרסונה vatikim או גיל 60+): פחות ימים, יום מנוחה ביניהם, מוביליטי',
      when: { audiences: ['senior'] },
      then: {
        strengthFrequency: 2,
        strengthMax: 3,
        runFrequency: 2,
        runMax: 3,
        addOns: [{ kind: 'mobility', minutes: 10, perWeek: 2, labelHe: 'מוביליטי 10′ ×2' }],
        reasonHe: 'מותאם לגיל הזהב · יום מנוחה בין אימונים',
      },
    },
    {
      id: 'athlete',
      note: 'ספורטאי קצה (pro_athlete): לפחות 4 אימוני כוח',
      when: { audiences: ['athlete'], tracks: ['strength'] },
      then: { strengthMin: 4, strengthFrequency: 4, reasonHe: 'מותאם לספורטאי' },
    },
    {
      id: 'muscle_intermediate',
      note: 'ביניים+ שרוצה מסה / ביצועים ויש לו 5+ ימים: יום רביעי',
      when: { strengthBands: ['intermediate'], goalsAny: ['muscle', 'performance'], minAvailableDays: 5, tracks: ['strength'] },
      then: { strengthFrequency: 4, reasonHe: 'מטרה: מסה וביצועים · יום רביעי לנפח' },
    },
    {
      id: 'health_cap',
      note: 'שגרה / בריאות בלי מטרת ביצועים: לא יותר מ-3',
      when: { goalsAny: ['health'], goalsNone: ['muscle', 'performance', 'skills'], strengthBands: ['beginner', 'intermediate'] },
      then: { strengthMax: 3, reasonHe: 'שגרה ובריאות · 3 אימונים מספיקים' },
    },
    {
      id: 'skills_focus',
      note: 'מטרת סקילים: אימוני סקיל עם תמיכה',
      when: { goalsAny: ['skills'], minHardSkills: 1 },
      then: { reasonHe: 'סקילים · כל אימון פותח בסקיל ואחריו תרגילי תמיכה' },
    },
    {
      id: 'core_micro',
      note: 'ירידה בשומן / בטן: 2 אימוני ליבה קצרים בערב, בנוסף לשבוע',
      when: { goalsAny: ['fat_loss', 'core_abs'] },
      then: {
        addOns: [{ kind: 'core', minutes: 10, perWeek: 2, window: 'evening', labelHe: 'ליבה 10′ ×2 בערב' }],
        reasonHe: 'בטן וליבה · 2 אימוני ליבה קצרים של 10′ בערב',
      },
    },
    {
      id: 'both_tracks',
      note: 'כוח + ריצה: אימון כוח אחד פחות (לא פחות מ-2) כדי שהריצות יתאוששו',
      when: { tracks: ['both'] },
      then: { strengthDelta: -1, strengthMin: 2, reasonHe: 'כוח וריצה יחד · אימון כוח אחד פחות כדי שהריצות יתאוששו' },
    },
    {
      id: 'both_beginner_runner',
      note: 'כוח + ריצה, רץ מתחיל: 2 ריצות מספיקות בהתחלה',
      when: { tracks: ['both'], runBands: ['beginner'] },
      then: { runFrequency: 2 },
    },
    {
      id: 'run_long_distance',
      note: 'ריצה בלבד, ביניים, יעד 10 ק״מ ומעלה ו-5+ ימים: ריצה רביעית',
      when: { tracks: ['running'], runBands: ['intermediate'], targetDistances: ['10k', 'half', 'marathon'], minAvailableDays: 5 },
      then: { runFrequency: 4, reasonHe: 'יעד 10 ק״מ · ריצה רביעית קלה לנפח' },
    },
  ],

  splitNamesHe: {
    full_body_basic: 'כל הגוף',
    full_body_high: 'כל הגוף',
    full_body_max: 'כל הגוף',
    full_body_ab: 'כל הגוף',
    upper_lower: 'עליון / תחתון',
    push_pull_mixed: 'דחיפה / משיכה',
    habit_builder: 'כל הגוף · קצר',
    push_pull_rotation: 'דחיפה / משיכה ברוטציה',
    skill_dominance: 'סקיל + תמיכה',
    habit_builder_ultra: 'כל הגוף · קצר',
    push_pull_legs: 'דחיפה / משיכה / רגליים',
    hyper_skill_blocks: 'בלוקים של סקילים',
  },

  skillSplitNameHe: 'סקיל + תמיכה',

  availableDaysReasonHe: 'לפי {n} הימים הפנויים שלך',
};

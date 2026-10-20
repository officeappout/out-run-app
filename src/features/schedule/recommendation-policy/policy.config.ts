/**
 * THE recommendation policy (enable_home_v2, owner 20.10.2026) — one table to tune.
 *
 * Plain JSON-safe data on purpose: the same object can later live in a Firestore
 * config doc (admin / Kelly edits) and be handed to resolveRecommendation()
 * unchanged. Owner-readable copy: agent-briefs/recommendation-policy.md.
 *
 * How it reads: base number by level band → rules top to bottom (a rule fires when
 * every field of `when` matches) → hard-skill minimum → bounds → available days →
 * the split = `strength.splits[band][final number]`. `{n}` / `{runs}` / `{split}` in
 * a reason are filled with the final values; `{k}` in an add-on label = its count.
 *
 * Strength rules approved 20.10.2026 (agent-briefs/strength-matrix-proposal.md):
 * 3 days → full body ×3 (every level), 4+ days → upper / lower ×4 for intermediate+,
 * beginners with 5+ days → 3 strength + light movement / walk days on the rest;
 * advanced (and intermediate with a muscle / performance goal) who CHOSE 6 days →
 * push / pull / legs ×2.
 * The level is the average of push / pull / legs (strengthLevelOf).
 * `splits` is this policy's own table (v2 users only). The workout generator's
 * SPLIT_MATRIX — shared by every user — is unchanged; the cells the owner didn't
 * change are copied from it (tested). Skill logic is untouched (set aside).
 */
import type { RecommendationPolicy } from './types';

export const RECOMMENDATION_POLICY: RecommendationPolicy = {
  version: 2,
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
    // sessions a week → split. 3 = full body for every level; 4 = upper / lower for
    // intermediate+. 1–2 / 5 / 6 and the beginner 4 = the generator's SPLIT_MATRIX.
    splits: {
      beginner: {
        '1': 'full_body_basic', '2': 'full_body_basic', '3': 'full_body_ab',
        '4': 'habit_builder', '5': 'habit_builder', '6': 'habit_builder_ultra',
      },
      intermediate: {
        '1': 'full_body_high', '2': 'full_body_high', '3': 'full_body_ab',
        '4': 'upper_lower', '5': 'push_pull_rotation', '6': 'push_pull_legs',
      },
      advanced: {
        '1': 'full_body_max', '2': 'full_body_max', '3': 'full_body_max',
        // 6 → push / pull / legs ×2 (owner 20.10.2026, rule ppl_six_days; was hyper_skill_blocks).
        '4': 'upper_lower', '5': 'skill_dominance', '6': 'push_pull_legs',
      },
    },
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
      id: 'upper_lower_intermediate',
      note: 'ביניים עם 4+ ימים פנויים (כוח בלבד): עליון / תחתון ×4 — כל שריר פעמיים בשבוע. אושר 20.10.2026 (החליף את muscle_intermediate)',
      when: { strengthBands: ['intermediate'], minAvailableDays: 4, tracks: ['strength'], audiences: ['general'] },
      then: { strengthFrequency: 4, reasonHe: 'כל שריר פעמיים בשבוע, עם מנוחה מלאה בין לבין' },
    },
    {
      id: 'ppl_six_days_advanced',
      note: 'מתקדם שבחר 6 ימים (כוח בלבד, בלי סקילים): דחיפה / משיכה / רגליים ×2. אושר 20.10.2026',
      when: { strengthBands: ['advanced'], minChosenDays: 6, tracks: ['strength'], audiences: ['general', 'athlete'], maxHardSkills: 0 },
      then: { strengthFrequency: 6, reasonHe: '6 ימים · דחיפה, משיכה ורגליים — כל אחד פעמיים בשבוע' },
    },
    {
      id: 'ppl_six_days_intermediate',
      note: 'ביניים עם מטרת מסה / ביצועים שבחר 6 ימים (כוח בלבד, בלי סקילים): דחיפה / משיכה / רגליים ×2. אושר 20.10.2026',
      when: { strengthBands: ['intermediate'], goalsAny: ['muscle', 'performance'], minChosenDays: 6, tracks: ['strength'], audiences: ['general'], maxHardSkills: 0 },
      then: { strengthFrequency: 6, reasonHe: '6 ימים · דחיפה, משיכה ורגליים — כל אחד פעמיים בשבוע' },
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
    {
      id: 'beginner_light_days',
      note: 'מתחיל עם 5+ ימים פנויים (כוח בלבד): 3 אימוני כוח, ובשאר הימים תנועה קלה / הליכה — לא עוד כוח. אושר 20.10.2026',
      when: { strengthBands: ['beginner'], minAvailableDays: 5, tracks: ['strength'], audiences: ['general'], maxHardSkills: 0 },
      then: {
        addOns: [{ kind: 'movement', minutes: 20, perWeek: 0, fillsFreeDays: true, labelHe: 'הליכה / תנועה קלה 20′ ×{k}' }],
        reasonHe: '3 אימוני כוח טובים, ובשאר הימים תנועה קלה — ככה בונים הרגל',
      },
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

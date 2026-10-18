/**
 * Coach Note ("דגשי האימון") — 2–4 short Hebrew sentences rendered from a
 * DecisionRecord (decision-record.ts):
 *
 *   1–2. why this combination (the top 1–2 ranked reasons)
 *   2–3. what to expect: exercises + minutes, plus ONE of sets × reps / rest
 *        (then an optional protocol line)
 *   opt. a calm line for evening / night / recovery
 *
 * Voice rules (brand): short, simple, no jargon, no English, no em-dashes, no
 * emoji, gender-neutral (impersonal / plural, "בנינו לך"). Every number in
 * the text comes from the record — templates never invent a fact.
 *
 * Phrases live in ONE table (DEFAULT_COACH_PHRASEBOOK) with 2–3 variants per
 * key, picked deterministically from the record's seed so the same workout
 * always reads the same way while different workouts read differently.
 * `renderCoachNote(record, { phrasebook })` accepts a partial override — the
 * seam for admin-editable rows later (load rows → pass them in); no admin UI
 * exists yet.
 */

import type { DecisionReason, DecisionRecord, NumRange } from './decision-record';
import { stableHash } from './decision-record';

// ============================================================================
// PHRASEBOOK
// ============================================================================

export type CoachPhraseKey =
  | 'RECOVERY_DAY'
  | 'RETURNING'
  | 'DELOAD_WEEK'
  | 'PEAK_WEEK'
  | 'BUILD_WEEK'
  | 'WEEKLY_GAP'
  | 'SKILL_FOCUS'
  | 'PROGRAM_FOCUS'
  | 'WEATHER_RAIN'
  | 'WEATHER_HEAT'
  | 'WEATHER_COLD'
  | 'WEATHER_UV'
  | 'LOCATION_bodyweight'
  | 'LOCATION_equipment'
  | 'TIME_morning'
  | 'TIME_evening'
  | 'TIME_night'
  | 'DIFFICULTY_easy'
  | 'DIFFICULTY_balanced'
  | 'DIFFICULTY_intense'
  | 'LEVEL_CEILING'
  | 'MUSCLES_RESTED'
  | 'EXPECT_volume'
  | 'EXPECT_rest'
  | 'EXPECT_short'
  | 'PROTOCOL_pyramid'
  | 'PROTOCOL_antagonist'
  | 'PROTOCOL_superset'
  | 'PROTOCOL_emom'
  | 'PROTOCOL_tabata'
  | 'CALM_evening'
  | 'CALM_night'
  | 'CALM_recovery';

/** Admin-editable later: same keys, same {placeholders}, any number of variants. */
export type CoachPhrasebook = Partial<Record<CoachPhraseKey, string[]>>;

export const DEFAULT_COACH_PHRASEBOOK: Record<CoachPhraseKey, string[]> = {
  RECOVERY_DAY: [
    'היום יום התאוששות, אז בנינו לך אימון רגוע שמניע את הגוף בלי להעמיס.',
    'הגוף צריך היום מנוחה פעילה, ולכן האימון קל ונעים.',
    'זה יום של התאוששות, מזיזים את הגוף בעדינות ושומרים כוח להמשך.',
  ],
  RETURNING: [
    'עברו {days} ימים מהאימון האחרון, אז חוזרים בהדרגה ועם פחות עומס.',
    'אחרי הפסקה של {days} ימים חוזרים בעדינות, כדי שהגוף יתרגל מחדש.',
    'חוזרים לשגרה אחרי {days} ימים, בקצב נוח ובלי למהר.',
  ],
  DELOAD_WEEK: [
    'השבוע מורידים עומס כדי לתת לשרירים ולגידים להתאושש.',
    'זה שבוע קל במחזור האימונים, עם פחות סטים ויותר התאוששות.',
    'השבוע הוא שבוע הורדת עומס, והגוף מתחזק דווקא במנוחה.',
  ],
  PEAK_WEEK: [
    'זה שבוע השיא במחזור, אז האימון קצת יותר עמוס מהרגיל.',
    'השבוע הוא שבוע שיא, ולכן מוסיפים קצת נפח ואתגר.',
  ],
  BUILD_WEEK: [
    'זה שבוע {week} במחזור, וממשיכים לבנות כוח בהדרגה.',
    'אנחנו בשבוע {week} של המחזור, שלב של בנייה יציבה.',
  ],
  WEEKLY_GAP: [
    'השבוע נשאר הכי הרבה להשלים ב{domain}, אז האימון משלים את החסר.',
    'כדי לאזן את השבוע, היום יש יותר {domain}.',
    'ב{domain} חסרים עוד {pct}% מהיעד השבועי, אז היום משלימים.',
  ],
  SKILL_FOCUS: [
    'שילבנו באימון עבודה על {skill}, המיומנות שבחרת.',
    'חלק מהאימון מוקדש ל{skill}, צעד אחרי צעד.',
    'יש באימון תרגילים שמקדמים אותך ל{skill}.',
  ],
  PROGRAM_FOCUS: [
    'האימון מותאם לרמה {level} בתוכנית {program}.',
    'התרגילים נבחרו לפי הרמה שלך, רמה {level} בתוכנית {program}.',
    'הכול בנוי סביב רמה {level} בתוכנית {program}.',
  ],
  WEATHER_RAIN: [
    'גשום היום, אז בנינו לך אימון לבית.',
    'בחוץ יורד גשם, ולכן האימון היום בבית.',
    'היום גשום, אז מתאמנים בבית ונשארים יבשים.',
  ],
  WEATHER_HEAT: [
    'חם מאוד היום, אז האימון קצר יותר ועם יותר מנוחה.',
    'בחום כזה מקצרים את האימון ונותנים יותר זמן למנוחה.',
    'היום חם במיוחד, ולכן האימון קצר יותר והמנוחות ארוכות יותר.',
  ],
  WEATHER_COLD: [
    'קר בחוץ, אז מתחילים בחימום ארוך יותר.',
    'ביום קר הגוף צריך יותר זמן להתחמם, ולכן החימום ארוך יותר.',
    'היום קר, אז מקדישים עוד כמה דקות לחימום.',
  ],
  WEATHER_UV: [
    'השמש חזקה היום, אז האימון קצר יותר ועם יותר מנוחה.',
    'קרינת השמש גבוהה היום, ולכן מקצרים את האימון ומוסיפים מנוחה.',
    'בשמש חזקה כזו עדיף אימון קצר יותר, עם מנוחות ארוכות יותר.',
  ],
  LOCATION_bodyweight: [
    'בנינו לך אימון {locIn} עם משקל הגוף בלבד, בלי ציוד.',
    'את כל התרגילים אפשר לעשות {locIn}, בלי שום ציוד.',
  ],
  LOCATION_equipment: [
    'בנינו לך אימון {locIn} עם הציוד שיש במקום.',
    'התרגילים נבחרו לפי מה שיש {locIn}.',
  ],
  TIME_morning: [
    'אימון בוקר שמעיר את הגוף ונותן אנרגיה ליום.',
    'מתחילים את הבוקר בתנועה, וזה מורגש כל היום.',
  ],
  TIME_evening: [
    'אימון ערב בקצב שמאפשר להירגע אחריו.',
    'אימון ערב שסוגר את היום בתנועה טובה.',
  ],
  TIME_night: [
    'שעה מאוחרת, אז עובדים בקצב נוח ובלי לחץ.',
    'בשעה כזו עובדים רגוע, בלי לרדוף אחרי שיאים.',
  ],
  DIFFICULTY_easy: [
    'זו הגרסה הקלה, עם תרגילים נוחים ויותר זרימה.',
    'בחרנו גרסה קלה יותר, כדי שיהיה נעים להתמיד.',
  ],
  DIFFICULTY_balanced: [
    'זו גרסה מאוזנת, עם מספיק אתגר ובלי להגזים.',
    'האימון מאוזן, לא קל מדי ולא קשה מדי.',
  ],
  DIFFICULTY_intense: [
    'זו הגרסה העצימה, עם תרגילים קשים יותר ומנוחות ארוכות.',
    'בחרנו גרסה מאתגרת, שדוחפת קצת מעבר לרגיל.',
  ],
  LEVEL_CEILING: [
    'בחלק מהתרגילים הרמה מעט נמוכה, כי זו הגבוהה ביותר שיש לנו כרגע.',
    'בכמה תרגילים בחרנו את הרמה הגבוהה ביותר שקיימת כרגע בספרייה.',
  ],
  MUSCLES_RESTED: [
    'השרירים שעבדו לאחרונה נחים היום, והעבודה עוברת לאחרים.',
    'נותנים מנוחה לשרירים שעבדו לאחרונה ומחזקים את האחרים.',
  ],
  EXPECT_volume: [
    '{n}, כ־{dur} דקות, {sets} של {reps}.',
    'מחכים לך {n} בכ־{dur} דקות, {sets} של {reps} בכל אחד.',
  ],
  EXPECT_rest: [
    '{n}, כ־{dur} דקות, עם {rest} מנוחה בין סטים.',
    'מחכים לך {n} בכ־{dur} דקות, ומנוחה של {rest} בין סטים.',
  ],
  EXPECT_short: [
    '{n}, כ־{dur} דקות.',
    'מחכים לך {n} בכ־{dur} דקות.',
  ],
  PROTOCOL_pyramid: [
    'אחד התרגילים בנוי כפירמידה, וכל סט בו מאתגר קצת יותר.',
    'יש באימון תרגיל פירמידה שמתקדם מסט לסט.',
  ],
  PROTOCOL_antagonist: [
    'חלק מהתרגילים באים בזוגות, כך ששריר אחד נח בזמן שהשני עובד.',
    'כמה תרגילים מחוברים בזוגות, אחד אחרי השני, וכך חוסכים זמן.',
  ],
  PROTOCOL_superset: [
    'כמה תרגילים מגיעים בזוגות, ברצף ובלי הפסקה ביניהם.',
    'חלק מהתרגילים עושים ברצף, שניים בלי עצירה.',
  ],
  PROTOCOL_emom: [
    'חלק מהאימון בנוי כך שבתחילת כל דקה מתחילים סט חדש.',
    'בחלק מהאימון כל דקה פותחת סט חדש, והזמן שנשאר הוא המנוחה.',
  ],
  PROTOCOL_tabata: [
    'בסוף מחכה סבב טבטה: {workSec} שניות עבודה ו־{restSec} שניות מנוחה, {rounds} פעמים.',
    'האימון נגמר בטבטה קצרה של {rounds} סבבים, {workSec} שניות עבודה ו־{restSec} מנוחה.',
  ],
  CALM_evening: [
    'כדאי לסיים בכמה נשימות רגועות ולרדת להילוך נמוך לקראת הלילה.',
    'בסוף האימון כדאי לנשום עמוק ולסיים רגועים.',
  ],
  CALM_night: [
    'אין צורך למהר, העיקר לסיים בתחושה טובה.',
    'מסיימים רגוע, כדי שיהיה קל להירדם אחר כך.',
  ],
  CALM_recovery: [
    'אין פה מה להוכיח, רק לזוז ולהרגיש טוב יותר.',
    'העיקר היום הוא תנועה נעימה, לא מאמץ.',
  ],
};

// ============================================================================
// HEBREW NAMES (slug → display). Unknown slug ⇒ the sentence is dropped,
// never shown in English.
// ============================================================================

export const DOMAIN_NAME_HE: Record<string, string> = {
  push: 'דחיפה',
  pull: 'משיכה',
  legs: 'רגליים',
  core: 'ליבה',
  planche: 'פלאנץ׳',
  front_lever: 'פרונט לבר',
  back_lever: 'בק לבר',
  handstand: 'עמידת ידיים',
  handstand_pushup: 'שכיבות סמיכה בעמידת ידיים',
  hspu: 'שכיבות סמיכה בעמידת ידיים',
  one_arm_pullup: 'מתח ביד אחת',
  oap: 'מתח ביד אחת',
  one_arm_pushup: 'שכיבת סמיכה ביד אחת',
  muscle_up: 'עליית כוח',
  human_flag: 'דגל אנושי',
};

export const PROGRAM_NAME_HE: Record<string, string> = {
  ...DOMAIN_NAME_HE,
  full_body: 'כל הגוף',
  upper_body: 'פלג גוף עליון',
  lower_body: 'פלג גוף תחתון',
  calisthenics_upper: 'קליסטניקס עליון',
};

const LOCATION_IN_HE: Record<string, string> = {
  home: 'בבית',
  park: 'בפארק',
  gym: 'בחדר הכושר',
  office: 'במשרד',
  street: 'בחוץ',
  school: 'בבית הספר',
  airport: 'בשדה התעופה',
  library: 'בספרייה',
  desk: 'ליד השולחן',
};

// ============================================================================
// FORMATTING
// ============================================================================

function fmtRange(r: NumRange): string {
  return r.min === r.max ? `${r.min}` : `${r.min} עד ${r.max}`;
}

/** One value when the range is narrow (spread ≤ `narrow`), else the range as is. */
function collapse(r: NumRange, narrow: number, step = 1): NumRange {
  if (r.max - r.min > narrow) return r;
  const v = Math.round((r.min + r.max) / 2 / step) * step;
  return { min: v, max: v };
}

function fmtCount(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

function fmtSets(range: NumRange): string {
  const r = collapse(range, 1);
  return r.max === 1 ? 'סט אחד' : `${fmtRange(r)} סטים`;
}

function fmtReps(range: NumRange & { unit: 'reps' | 'seconds' }): string {
  if (range.unit === 'seconds') return `${fmtRange(collapse(range, 5, 5))} שניות`;
  const r = collapse(range, 1);
  return r.max === 1 ? 'חזרה אחת' : `${fmtRange(r)} חזרות`;
}

function fmtMinutes(sec: number): string {
  const halves = Math.round(sec / 30);
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (whole === 0) return 'חצי דקה';
  if (whole === 1) return half ? 'דקה וחצי' : 'דקה';
  return half ? `${whole} דקות וחצי` : `${whole} דקות`;
}

function fmtRestValue(sec: number): string {
  return sec >= 90 ? fmtMinutes(sec) : `${Math.round(sec / 15) * 15} שניות`;
}

/**
 * Rest. A narrow range (spread ≤ 60s) becomes ONE rounded value ("2 דקות
 * וחצי", never "2 דקות עד 2 דקות וחצי"); a wide one stays a range.
 */
export function fmtRest(r: NumRange): string {
  if (r.max - r.min <= 60) return fmtRestValue((r.min + r.max) / 2);
  if (r.max < 120) return `${fmtRange(r)} שניות`;
  const lo = r.min >= 60 ? fmtMinutes(r.min) : `${Math.round(r.min / 15) * 15} שניות`;
  const hi = fmtMinutes(r.max);
  if (lo === hi) return lo;
  const a = Math.round(r.min / 30) / 2;
  const b = Math.round(r.max / 30) / 2;
  // "2 עד 3 דקות" when both are whole minutes ≥ 2, otherwise spell both out.
  if (Number.isInteger(a) && Number.isInteger(b) && a >= 2) return `${a} עד ${b} דקות`;
  return `${lo} עד ${hi}`;
}

// ============================================================================
// RENDERER
// ============================================================================

type Vars = Record<string, string | number | undefined>;

function fill(template: string, vars: Vars): string | null {
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined || v === '') {
      missing = true;
      return '';
    }
    return String(v);
  });
  return missing ? null : out;
}

/** Voice guard — anything that slips through is dropped, never shown. */
export function violatesVoice(sentence: string): boolean {
  return (
    /[A-Za-z]/.test(sentence) || // no English (also catches unresolved slugs)
    /[—–]/.test(sentence) || // no em/en dashes
    /[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/.test(sentence) // no emoji
  );
}

function pick(
  book: Record<CoachPhraseKey, string[]>,
  key: CoachPhraseKey,
  seed: number,
  vars: Vars,
): string | null {
  const variants = book[key] ?? [];
  if (variants.length === 0) return null;
  const start = (seed + stableHash(key)) % variants.length;
  // Try the picked variant first, then the others, until one fills cleanly.
  for (let i = 0; i < variants.length; i++) {
    const s = fill(variants[(start + i) % variants.length], vars);
    if (s && !violatesVoice(s)) return s;
  }
  return null;
}

function reasonSentence(
  book: Record<CoachPhraseKey, string[]>,
  r: DecisionReason,
  seed: number,
): string | null {
  switch (r.code) {
    case 'RECOVERY_DAY':
    case 'DELOAD_WEEK':
    case 'PEAK_WEEK':
    case 'LEVEL_CEILING':
    case 'MUSCLES_RESTED':
    case 'WEATHER_RAIN':
    case 'WEATHER_HEAT':
    case 'WEATHER_COLD':
    case 'WEATHER_UV':
      return pick(book, r.code, seed, {});
    case 'RETURNING':
      return pick(book, 'RETURNING', seed, { days: r.days });
    case 'BUILD_WEEK':
      return pick(book, 'BUILD_WEEK', seed, { week: r.week });
    case 'WEEKLY_GAP':
      return pick(book, 'WEEKLY_GAP', seed, { domain: DOMAIN_NAME_HE[r.domain], pct: r.pct });
    case 'SKILL_FOCUS':
      return pick(book, 'SKILL_FOCUS', seed, { skill: DOMAIN_NAME_HE[r.skill] });
    case 'PROGRAM_FOCUS':
      return pick(book, 'PROGRAM_FOCUS', seed, { program: PROGRAM_NAME_HE[r.program], level: r.level });
    case 'LOCATION':
      return pick(book, `LOCATION_${r.gearSummary}`, seed, { locIn: LOCATION_IN_HE[r.loc] });
    case 'TIME':
      return pick(book, `TIME_${r.slot}`, seed, {});
    case 'DIFFICULTY':
      return pick(book, `DIFFICULTY_${r.level}`, seed, {});
    default:
      return null;
  }
}

export interface RenderCoachNoteOptions {
  /** Partial override of DEFAULT_COACH_PHRASEBOOK (future admin rows). */
  phrasebook?: CoachPhrasebook;
}

/** 2–4 Hebrew sentences, or [] when nothing trustworthy can be said. */
export function renderCoachNoteSentences(
  record: DecisionRecord | null | undefined,
  opts: RenderCoachNoteOptions = {},
): string[] {
  if (!record || record.v !== 1) return [];
  const book = { ...DEFAULT_COACH_PHRASEBOOK, ...(opts.phrasebook ?? {}) } as Record<CoachPhraseKey, string[]>;
  const seed = record.seed >>> 0;
  const { expect } = record;
  const isRecovery = record.reasons.some((r) => r.code === 'RECOVERY_DAY');
  const timeSlot = (record.reasons.find((r) => r.code === 'TIME') as { slot?: string } | undefined)?.slot;

  // ── Why (top 1–2 renderable reasons). Evening/night TIME is saved for the
  //    calm line instead of spending a "why" slot on it.
  const why: string[] = [];
  const hasLevelNews = record.reasons.some((r) => r.code === 'LEVEL_CEILING');
  const hasRainHome = record.reasons.some((r) => r.code === 'WEATHER_RAIN');
  for (const r of record.reasons) {
    if (why.length >= 2) break;
    if (r.code === 'TIME' && r.slot !== 'morning') continue;
    // "Built around level X in program Y" is true of EVERY workout, so it says
    // nothing — only worth a slot when the level itself is news (the content
    // ceiling clamped it).
    if (r.code === 'PROGRAM_FOCUS' && !hasLevelNews) continue;
    // Rain already said "a home workout" — LOCATION would repeat it.
    if (r.code === 'LOCATION' && hasRainHome) continue;
    const s = reasonSentence(book, r, seed);
    if (s) why.push(s);
  }

  // ── What to expect: exercises + minutes, plus the single most useful
  //    extra fact (sets × reps; rest only when there are no reps to quote).
  const n = expect.exercisesCount;
  const vars: Vars = {
    n: n > 0 ? fmtCount(n, 'תרגיל אחד', 'תרגילים') : undefined,
    sets: expect.setsRange ? fmtSets(expect.setsRange) : undefined,
    reps: expect.repRange ? fmtReps(expect.repRange) : undefined,
    rest: expect.restRange ? fmtRest(expect.restRange) : undefined,
    dur: expect.durationMin > 0 ? expect.durationMin : undefined,
  };
  const expectSentence =
    (!isRecovery ? pick(book, 'EXPECT_volume', seed, vars) ?? pick(book, 'EXPECT_rest', seed, vars) : null) ??
    pick(book, 'EXPECT_short', seed, vars);

  let protocolSentence: string | null = null;
  if (expect.protocol !== 'straight') {
    protocolSentence = pick(book, `PROTOCOL_${expect.protocol}`, seed, {
      workSec: expect.tabata?.workSec,
      restSec: expect.tabata?.restSec,
      rounds: expect.tabata?.rounds,
    });
  }

  // ── Optional calm line.
  let calm: string | null = null;
  if (isRecovery) calm = pick(book, 'CALM_recovery', seed, {});
  else if (timeSlot === 'evening') calm = pick(book, 'CALM_evening', seed, {});
  else if (timeSlot === 'night') calm = pick(book, 'CALM_night', seed, {});

  // ── Assemble: 2–4 sentences. Drop order when over 4: calm, protocol, why #2.
  const why2 = why[1] ?? null;
  const parts: Array<string | null> = [why[0] ?? null, why2, expectSentence, protocolSentence, calm];
  for (const dropMe of [calm, protocolSentence, why2]) {
    if (parts.filter(Boolean).length <= 4) break;
    if (dropMe) parts[parts.indexOf(dropMe)] = null;
  }
  const out = parts.filter((x): x is string => !!x);
  return out.length >= 2 ? out : [];
}

/** Convenience: the note as one paragraph ('' when nothing to say). */
export function renderCoachNote(
  record: DecisionRecord | null | undefined,
  opts: RenderCoachNoteOptions = {},
): string {
  return renderCoachNoteSentences(record, opts).join(' ');
}

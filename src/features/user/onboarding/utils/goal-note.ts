/**
 * Program-path "יש עוד משהו שחשוב לך?" — optional free-text goal note
 * (enable_home_v2). Pure helpers: age bracket, the rotating placeholder
 * examples (by age bracket AND gender), the sanitiser, and the
 * sessionStorage hand-off shape read by onboarding-sync.service.ts.
 */

export const GOAL_NOTE_MAX_LENGTH = 300;
export const GOAL_NOTE_STORAGE_KEY = 'onboarding_goal_note';

export type AgeBracket = 'under_18' | '18_29' | '30_44' | '45_59' | '60_plus';
export type GoalNoteGender = 'male' | 'female';

export const AGE_BRACKET_LABELS_HE: Record<AgeBracket, string> = {
  under_18: 'מתחת ל-18',
  '18_29': '18–29',
  '30_44': '30–44',
  '45_59': '45–59',
  '60_plus': '60+',
};

/** Whole years between birthDate and now (null for an invalid date). */
export function ageFromBirthDate(birthDate: Date | null | undefined, now: Date = new Date()): number | null {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function ageBracketFor(age: number | null | undefined): AgeBracket | null {
  if (age == null || !Number.isFinite(age) || age < 0) return null;
  if (age < 18) return 'under_18';
  if (age < 30) return '18_29';
  if (age < 45) return '30_44';
  if (age < 60) return '45_59';
  return '60_plus';
}

/** 'YYYY-MM-DD' (onboarding_personal_dob) → local Date, or null. */
export function parseIsoDay(day: string | null | undefined): Date | null {
  if (!day) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Placeholder examples ─────────────────────────────────────────────

type Example = string | { m: string; f: string; only?: GoalNoteGender };

const EXAMPLES: Record<AgeBracket, Example[]> = {
  // Minors: no dating / relationship examples, by design.
  under_18: [
    'להתכונן לגיבוש',
    { m: 'להיות חזק יותר בספורט שלי', f: 'להיות חזקה יותר בספורט שלי' },
    'להתאמן עם חברים בפארק',
    'לעשות מתח ראשון',
  ],
  '18_29': [
    'לרדת במשקל לקראת הקיץ',
    'להכיר חברים חדשים להתאמן איתם',
    { m: 'להכיר מישהי דרך הספורט', f: 'להכיר מישהו דרך הספורט' },
    'להתכונן לגיוס',
    'לשמור על כושר במילואים',
    'לעשות 10 מתח',
  ],
  '30_44': [
    { m: 'להיות אבא חזק', f: 'להיות אמא חזקה' },
    { m: '', f: 'לחזור לכושר אחרי לידה', only: 'female' },
    'לשמור על כושר במילואים',
    'לרדת במשקל',
    { m: 'למצוא שותף לאימונים', f: 'למצוא שותפה לאימונים' },
  ],
  '45_59': [
    'לחזק את הגב',
    'לשמור על כושר לאורך שנים',
    'להתאמן עם חברים בשכונה',
    'לרדת במשקל',
  ],
  '60_plus': [
    'לשמור על שיווי משקל',
    { m: 'להישאר חזק ועצמאי', f: 'להישאר חזקה ועצמאית' },
    'להכיר חברים חדשים בשכונה',
  ],
};

/** Unknown age: a neutral set (no dating, no army/birth specifics). */
const FALLBACK_EXAMPLES: Example[] = [
  'לרדת במשקל',
  'לעשות מתח ראשון',
  'לחזק את הגב',
  'לשמור על כושר לאורך שנים',
];

/**
 * The placeholder sentences for an age bracket + gender. Anything other
 * than 'female' gets the masculine forms (same convention as the rest of
 * onboarding: isFemale ? f : m).
 */
export function goalNoteExamples(bracket: AgeBracket | null, gender: string | null | undefined): string[] {
  const g: GoalNoteGender = gender === 'female' ? 'female' : 'male';
  const list = bracket ? EXAMPLES[bracket] : FALLBACK_EXAMPLES;
  const out: string[] = [];
  for (const ex of list) {
    if (typeof ex === 'string') { out.push(ex); continue; }
    if (ex.only && ex.only !== g) continue;
    const text = g === 'female' ? ex.f : ex.m;
    if (text) out.push(text);
  }
  return out;
}

export function goalNotePlaceholder(example: string): string {
  return `למשל: ${example}…`;
}

// ── Sanitiser ────────────────────────────────────────────────────────

/**
 * Trimmed, control-character-free, at most GOAL_NOTE_MAX_LENGTH characters
 * (counted by code point so an emoji is never cut in half). Line breaks are
 * kept but runs of blank lines collapse to one. Empty → null.
 */
// Control chars (except \t and \n — collapsed below), zero-width chars, line/paragraph separators, BOM.
const STRIP_CHARS = new RegExp('[\\u0000-\\u0008\\u000B-\\u001F\\u007F\\u200B-\\u200D\\u2028\\u2029\\uFEFF]', 'g');

export function sanitizeGoalNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .replace(STRIP_CHARS, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned) return null;
  const chars = Array.from(cleaned);
  return chars.length > GOAL_NOTE_MAX_LENGTH ? chars.slice(0, GOAL_NOTE_MAX_LENGTH).join('').trim() : cleaned;
}

// ── sessionStorage hand-off ──────────────────────────────────────────

export interface GoalNoteHandoff {
  text: string;
  /** The single chosen card (health / body_focus / skills). */
  goal: string | null;
  ageBracket: AgeBracket | null;
  gender: GoalNoteGender | 'other' | null;
}

/** Parses the stored hand-off; re-sanitises the text. null when absent/invalid. */
export function parseGoalNoteHandoff(raw: string | null | undefined): GoalNoteHandoff | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<GoalNoteHandoff>;
    const text = sanitizeGoalNote(v?.text);
    if (!text) return null;
    const brackets: AgeBracket[] = ['under_18', '18_29', '30_44', '45_59', '60_plus'];
    return {
      text,
      goal: v.goal === 'health' || v.goal === 'body_focus' || v.goal === 'skills' ? v.goal : null,
      ageBracket: brackets.includes(v.ageBracket as AgeBracket) ? (v.ageBracket as AgeBracket) : null,
      gender: v.gender === 'male' || v.gender === 'female' || v.gender === 'other' ? v.gender : null,
    };
  } catch {
    return null;
  }
}

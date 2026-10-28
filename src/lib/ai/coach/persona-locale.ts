/**
 * Kelly server locale: the system prompt per reply language. Pure.
 *
 * Hebrew (the default) is COACH_SYSTEM_PROMPT / coachSystemPrompt() untouched: flag off or locale he
 * returns the very same string. English is derived from the Hebrew prompt by replacing exactly the
 * Hebrew-specific lines (voice, grammar, Hebrew example phrases, the Israeli emergency line), so every
 * rule that is not about the language stays in one place. A test fails if a replaced line drifts
 * (EN prompt must contain no Hebrew letters) so the two can't silently diverge.
 *
 * English voice: docs/i18n/EN-VOICE.md (warm, plain, confident, honest; contractions; no exclamation
 * marks, emoji or em dashes; sentence case). Kelly is male ("he"), but English first person needs no gender.
 */
import { COACH_SYSTEM_PROMPT } from './persona';
import { coachSystemPrompt } from './round4/prompt';
import type { CoachLocale } from './coach-locale';

const EN_LANGUAGE_AND_VOICE = `Language and voice
- Always answer in English only, in the user's app language. Never write Hebrew letters. The user sheet, the session context and tool results may contain Hebrew (program names, day names, labels): translate them into natural English. Write exercise names exactly as the tool results give them; when a name is only in Hebrew, translate it plainly.
- Kelly is a man, and speaks as "I". Never refer to yourself as a woman. Never use "he" or "she" for the user.
- Use the user's first name naturally now and then (a greeting, encouragement), not in every message.
- Fit the tone to what you know: their goals, persona and age range. For users aged 60+ keep it gentle: easier starts and a calm pace.
- Voice: a friendly, capable coach who respects the user's time. Warm, plain, confident, honest. Use contractions (I'll, you're, can't). Address the user as "you". English has no grammatical gender, so never guess one and never write he/she or s/he for the user.
- Short, warm, simple sentences, like a good coach texting, readable by non-native speakers: common words, no idioms. One to four short sentences per reply. No lists, except the per-day schedule list described below.
- No emoji. No exclamation marks, except for a real milestone. No em dashes or en dashes. No markdown, no headings, no bold. Use sentence case.`;

const LANGUAGE_BLOCK_HE_START = 'Language and voice\n';
const LANGUAGE_BLOCK_HE_END = '\n\nFacts and grounding';

/** [Hebrew text in COACH_SYSTEM_PROMPT, English replacement]. */
const EN_LINES: ReadonlyArray<readonly [string, string]> = [
  ['Kelly (קלי)', 'Kelly'],
  ['persona (פרסונה)', 'persona'],
  ['For example: יום שני 18:00, כוח, כל הגוף. Never', 'For example: Monday 18:00, strength, full body. Never'],
  ['(אפשר לפתוח את הלו״ז בכפתור למטה)', '(you can open the schedule with the button below)'],
  [
    'Body areas: בטן or ליבה → core. רגליים or ישבן → legs. גב or משיכה → pull. חזה, כתפיים, ידיים or דחיפה → push. כל הגוף → leave domains empty.',
    'Body areas: abs or core → core. legs or glutes → legs. back or pulling → pull. chest, shoulders, arms or pushing → push. full body → leave domains empty.',
  ],
  [
    'Location: בבית → home. בפארק, בגינה, במתקנים → park. בעבודה, במשרד → office. בחוץ בלי מתקנים, ברחוב → street.',
    'Location: at home → home. at the park, the garden, outdoor gym equipment → park. at work, at the office → office. outside without equipment, on the street → street.',
  ],
  [
    'for example: אני זוכר את השיחה הזו ואת הסיכום שלה, והצוות משפר אותי לפי השיחות.',
    "for example: I remember this conversation and its summary, and the team improves me based on conversations.",
  ],
  [
    'for example: התכוונת "השתפרת"? כן, הצוות משפר אותי לפי השיחות.',
    'for example: Did you mean "improved"? Yes, the team improves me based on conversations.',
  ],
  [
    'they should call מד״א at 101.',
    'they should call their local emergency number right away (101 in Israel).',
  ],
  [
    'Words like דוקטור, דוק, רופא or אחי used as a nickname',
    'Words like "doc", "doctor" or "bro" used as a nickname',
  ],
];

const EN_LOCALE_NOTE = `

Reply language
- Hebrew text that is quoted anywhere in these instructions, in the session context or in tool results is source data or an example of the Hebrew voice. Never copy it into a reply: say the same thing in English. The app's schedule, builder and confirm buttons are labeled in English for this user.`;

const HEBREW_LETTERS = /[֐-׿]/;

/** The English system prompt: the Hebrew one with its Hebrew-specific lines replaced. Pure, deterministic. */
export function englishSystemPrompt(base: string): string {
  const start = base.indexOf(LANGUAGE_BLOCK_HE_START);
  const end = base.indexOf(LANGUAGE_BLOCK_HE_END, start);
  let out = start >= 0 && end > start ? base.slice(0, start) + EN_LANGUAGE_AND_VOICE + base.slice(end) : base;
  for (const [he, en] of EN_LINES) out = out.replace(he, en);
  return out + EN_LOCALE_NOTE;
}

/** Whether a prompt still carries Hebrew letters (tests: the English prompt must not). */
export function hasHebrewLetters(s: string): boolean {
  return HEBREW_LETTERS.test(s);
}

/**
 * The stable (cached) system prompt for one request. 'he' returns the same string as before
 * (COACH_SYSTEM_PROMPT / coachSystemPrompt({ round4 })).
 */
export function coachSystemPromptFor(locale: CoachLocale, opts: { round4?: boolean } = {}): string {
  const he = opts.round4 ? coachSystemPrompt({ round4: true }) : COACH_SYSTEM_PROMPT;
  return locale === 'en' ? englishSystemPrompt(he) : he;
}

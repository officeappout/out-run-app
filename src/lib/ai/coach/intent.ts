/**
 * AI coach — deterministic reading of the user's own words for generate_workout. Pure.
 *
 * The model maps "אימון בטן בבית 10 דק׳" to tool input, and it gets it wrong sometimes
 * (owner review 18.10.2026: "אימון בטן" was built with no domains → elbow extensions and
 * Romanian deadlifts). The user's words are the ground truth, so the server re-reads the
 * latest user message and overrides the body area, location, minutes and intensity when
 * the message states them explicitly. Anything the message doesn't state is left to the
 * model.
 *
 * Hebrew matching works on whole tokens with up to two one-letter prefixes (ו ה ב ל מ ש כ),
 * so "גב" matches "לגב" / "הגב" but never "גבוהה".
 */
import type { CoachLocation, GenerateWorkoutInputT } from './tools';

export type BaseDomain = 'push' | 'pull' | 'legs' | 'core';

const PREFIX = /^[והבלמשכ]{1,2}$/;
const NIQQUD = /[֑-ׇ]/g;

function tokens(text: string): string[] {
  return (text ?? '')
    .normalize('NFC')
    .replace(NIQQUD, '')
    .toLowerCase()
    .split(/[^א-תa-z0-9]+/)
    .filter(Boolean);
}

function tokenIs(token: string, stem: string): boolean {
  if (token === stem) return true;
  if (token.length <= stem.length || !token.endsWith(stem)) return false;
  return PREFIX.test(token.slice(0, token.length - stem.length));
}

function hasStem(toks: string[], stems: readonly string[]): boolean {
  return toks.some((t) => stems.some((s) => tokenIs(t, s)));
}

/** Single-token stems per domain (Hebrew + the few English words people type). */
const DOMAIN_STEMS: Record<BaseDomain, readonly string[]> = {
  core: ['בטן', 'ליבה', 'קוביות', 'פלאנק', 'core', 'abs'],
  legs: ['רגליים', 'רגלים', 'ישבן', 'טוסיק', 'ירכיים', 'ירך', 'תאומים', 'סקוואט', 'סקוואטים', 'legs'],
  pull: ['גב', 'משיכה', 'משיכות', 'מתח', 'מתחים', 'ביספס', 'חתירה', 'חתירות', 'pull'],
  push: ['חזה', 'כתפיים', 'כתף', 'ידיים', 'טרייספס', 'דחיפה', 'דחיפות', 'שכיבות', 'push'],
};

/** Two-word phrases checked on the raw text first. */
const DOMAIN_PHRASES: Array<{ re: RegExp; domain: BaseDomain }> = [
  { re: /יד(יים)?\s+קדמי(ת|ות)/, domain: 'pull' },
  { re: /יד(יים)?\s+אחורי(ת|ות)/, domain: 'push' },
];

const FULL_BODY = /כל\s+ה?גוף|גוף\s+מלא|פול\s*באדי|full\s*body/i;

export interface BodyIntent {
  /** Base domains named in the text, in a fixed order (push, pull, legs, core). */
  domains: BaseDomain[];
  /** The user asked for the whole body explicitly. */
  fullBody: boolean;
}

export function inferBodyIntent(text: string): BodyIntent {
  const raw = (text ?? '').normalize('NFC').replace(NIQQUD, '');
  const toks = tokens(raw);
  const found = new Set<BaseDomain>();
  for (const p of DOMAIN_PHRASES) if (p.re.test(raw)) found.add(p.domain);
  // "יד קדמית" already decided; don't let the bare "ידיים" add push on top of it.
  const handPhrase = DOMAIN_PHRASES.some((p) => p.re.test(raw));
  for (const d of ['push', 'pull', 'legs', 'core'] as const) {
    const stems = handPhrase ? DOMAIN_STEMS[d].filter((s) => s !== 'ידיים') : DOMAIN_STEMS[d];
    if (hasStem(toks, stems)) found.add(d);
  }
  // "רגליים למתח" is the hanging leg raise (core), not legs + pull.
  if (/רגליים\s+למתח/.test(raw)) {
    found.delete('legs');
    found.delete('pull');
    found.add('core');
  }
  const order: BaseDomain[] = ['push', 'pull', 'legs', 'core'];
  return { domains: order.filter((d) => found.has(d)), fullBody: FULL_BODY.test(raw) };
}

export function inferLocation(text: string): CoachLocation | null {
  const toks = tokens(text);
  if (toks.some((t) => ['בבית', 'לבית', 'הביתה', 'בסלון'].includes(t))) return 'home';
  if (toks.some((t) => ['בפארק', 'לפארק', 'בגינה', 'לגינה', 'במתקנים', 'מתקנים', 'בגינת'].includes(t))) return 'park';
  if (toks.some((t) => ['במשרד', 'למשרד', 'בעבודה'].includes(t))) return 'office';
  if (toks.some((t) => ['ברחוב', 'בחוץ'].includes(t))) return 'street';
  return null;
}

export function inferMinutes(text: string): number | null {
  const m = (text ?? '').match(/(\d{1,2})\s*(?:דק(?:ות|ה|׳|')?|ד׳|min(?:utes)?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 5 && n <= 90 ? n : null;
}

export function inferDifficulty(text: string): 1 | 2 | 3 | null {
  const raw = (text ?? '').normalize('NFC');
  if (/רמה\s+גבוהה|קשה|אינטנסיבי|מאתגר|חזק\s+במיוחד/.test(raw)) return 3;
  if (/קליל|רגוע|רמה\s+נמוכה/.test(raw) || tokens(raw).includes('קל')) return 1;
  return null;
}

export interface IntentApplication {
  input: GenerateWorkoutInputT;
  /** Human-readable notes of what was overridden (for the review log). */
  changes: string[];
}

/**
 * Overrides the model's generate_workout input with what the user's message states.
 * Skill domains the model chose (planche, front_lever…) are kept when the text names no
 * base body area.
 */
export function applyUserIntent(input: GenerateWorkoutInputT, userText: string): IntentApplication {
  const out: GenerateWorkoutInputT = { ...input, domains: [...input.domains], equipment: [...input.equipment] };
  const changes: string[] = [];

  const body = inferBodyIntent(userText);
  if (body.domains.length > 0) {
    const same = out.domains.length === body.domains.length && body.domains.every((d) => out.domains.includes(d));
    if (!same) {
      changes.push(`domains:${out.domains.join('+') || 'none'}→${body.domains.join('+')}`);
      out.domains = [...body.domains];
    }
  } else if (body.fullBody && out.domains.length > 0) {
    changes.push(`domains:${out.domains.join('+')}→full_body`);
    out.domains = [];
  }

  const loc = inferLocation(userText);
  if (loc && loc !== out.location) {
    changes.push(`location:${out.location}→${loc}`);
    out.location = loc;
    out.equipment = []; // gear ids belong to the old location's bucket
  }

  const min = inferMinutes(userText);
  if (min && min !== out.durationMin) {
    changes.push(`minutes:${out.durationMin}→${min}`);
    out.durationMin = min;
  }

  const diff = inferDifficulty(userText);
  if (diff && diff !== out.difficulty) {
    changes.push(`difficulty:${out.difficulty}→${diff}`);
    out.difficulty = diff;
  }

  return { input: out, changes };
}

// ─── Titles ──────────────────────────────────────────────────────────────────

const DOMAIN_TITLE: Record<BaseDomain, string> = {
  core: 'בטן',
  legs: 'רגליים',
  pull: 'גב',
  push: 'חזה וכתפיים',
};

const LOCATION_TITLE: Record<CoachLocation, string> = {
  home: 'בבית',
  park: 'בפארק',
  office: 'במשרד',
  street: 'בחוץ',
};

/**
 * The title of an AI-built workout, from the request itself ("אימון בטן בבית"). The
 * engine's metadata titles are picked by persona and situation (e.g. a guard-duty title
 * for reservists) and don't describe what the user asked the chat for.
 */
export function aiWorkoutTitle(domains: readonly string[], location: CoachLocation): string {
  const base = domains.filter((d): d is BaseDomain => d in DOMAIN_TITLE);
  let what: string;
  if (domains.length === 0) what = 'אימון גוף מלא';
  else if (base.length === 0) what = 'אימון כוח';
  else if (base.length === 1) what = `אימון ${DOMAIN_TITLE[base[0]]}`;
  else {
    const names = base.map((d) => DOMAIN_TITLE[d]);
    what = `אימון ${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`;
  }
  return `${what} ${LOCATION_TITLE[location]}`;
}

// ─── Schedule questions ──────────────────────────────────────────────────────

const SCHEDULE_Q =
  /בתוכנית|התוכנית\s+(שלי|השבוע)|לוח\s+(ה)?זמנים|לו["״׳']?ז|ביומן|מתוכנן|מה\s+(מחכה|מצפה)\s+לי|מה\s+יש\s+לי|אילו\s+אימונים|איזה\s+אימונים|מתי\s+(יש\s+לי\s+)?(ה)?אימון|האימונים\s+שלי|השבוע\s+שלי/;
const BUILD_REQ = /תבנה|תבני|תבנו|בנה\s+לי|תכין|תן\s+לי\s+אימון|תני\s+לי\s+אימון/;

/** "מה מצפה לי השבוע?", "מה בתוכנית השבוע?" — a question about the user's own schedule. */
export function inferScheduleQuestion(text: string): boolean {
  const t = (text ?? '').normalize('NFC').replace(NIQQUD, '');
  return SCHEDULE_Q.test(t) && !BUILD_REQ.test(t);
}

// ─── Typo hints ──────────────────────────────────────────────────────────────
//
// Owner thread after #434: "היי חזרתי השצפרת" (meant "השתפרת", צ and ת are neighbours on
// the Hebrew keyboard) → Kelly guessed "הצפרת". The server never rewrites the user's words:
// it only lists likely intended words as a HINT in the session context, and the prompt tells
// Kelly to confirm briefly when relying on one ("התכוונת 'השתפרת'?").

/** Keys next to each other on the Hebrew (SI-1452) keyboard, plus sound-alike letters. */
const CONFUSABLE_PAIRS: ReadonlyArray<string> = [
  // keyboard rows: ק ר א ט ו ן ם פ / ש ד ג כ ע י ח ל ך ף / ז ס ב ה נ מ צ ת ץ
  'קר', 'רא', 'אט', 'טו', 'ון', 'ןם', 'םפ',
  'שד', 'דג', 'גכ', 'כע', 'עי', 'יח', 'חל', 'לך', 'ךף',
  'זס', 'סב', 'בה', 'הנ', 'נמ', 'מצ', 'צת', 'תץ',
  // sound-alike
  'טת', 'כח', 'כק', 'סש', 'אע', 'בו', 'צס',
];

const CONFUSABLE: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const pair of CONFUSABLE_PAIRS) {
    const a = pair[0];
    const b = pair[1];
    (m[a] ??= []).push(b);
    (m[b] ??= []).push(a);
  }
  return m;
})();

/** Words users of a coaching app type (full forms, 4+ letters). */
const COACH_LEXICON: ReadonlySet<string> = new Set([
  'השתפרת', 'השתפרתי', 'השתפר', 'השתפרה', 'השתפרו', 'משתפר', 'משתפרת', 'להשתפר', 'שיפור', 'שיפרו', 'שיפרת',
  'התקדמת', 'התקדמתי', 'התקדמות', 'מתקדם', 'מתקדמת', 'להתקדם',
  'אימון', 'אימונים', 'האימון', 'האימונים', 'להתאמן', 'מתאמן', 'מתאמנת', 'התאמנתי', 'התאמנת',
  'תוכנית', 'התוכנית', 'השבוע', 'שבוע', 'היום', 'אתמול', 'מחרתיים',
  'רגליים', 'כתפיים', 'ידיים', 'ישבן', 'ליבה', 'לחזק', 'לחיזוק', 'חיזוק', 'שכיבות', 'סמיכה', 'מתחים',
  'סקוואט', 'פלאנק', 'מתיחות', 'גמישות', 'ריצה', 'הליכה', 'לרוץ', 'ללכת', 'כושר', 'מאמן',
  'תבנה', 'לבנות', 'בניתי', 'אפליקציה', 'זמנים', 'פארק', 'בבית', 'בפארק', 'דקות',
  'קליל', 'עייף', 'עייפה', 'כואב', 'שרירים', 'חימום', 'להתחיל', 'תודה', 'חזרתי', 'זוכר', 'זכרון',
  'למדת', 'לומד', 'מבין', 'הבנת', 'חזרה', 'מצוין', 'מעולה',
]);

/** Common words that must never be "corrected". */
const COMMON: ReadonlySet<string> = new Set(['היי', 'הלו', 'שלום', 'אחי', 'אחלה', 'סבבה', 'יאללה', 'תודה', 'רגע', 'בוקר', 'ערב', 'לילה', 'טוב', 'אני', 'אתה', 'שלי', 'שלך']);

const PREFIX_LETTERS = 'והשבלמכ';

function oneEditVariants(w: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < w.length; i++) {
    for (const r of CONFUSABLE[w[i]] ?? []) out.push(w.slice(0, i) + r + w.slice(i + 1));
    if (i + 1 < w.length && w[i] !== w[i + 1]) out.push(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  }
  return out;
}

/** The token is a lexicon / common word, with up to two prefix letters ("באימונים"). */
function isKnown(tok: string, depth = 0): boolean {
  if (COACH_LEXICON.has(tok) || COMMON.has(tok)) return true;
  return depth < 2 && tok.length > 3 && PREFIX_LETTERS.includes(tok[0]) && isKnown(tok.slice(1), depth + 1);
}

function correctToken(tok: string): string | null {
  if (tok.length < 4 || isKnown(tok)) return null;
  for (const v of oneEditVariants(tok)) if (COACH_LEXICON.has(v)) return v;
  // One leading prefix letter (ו / ש / ה …) + a lexicon word.
  if (PREFIX_LETTERS.includes(tok[0]) && tok.length >= 5) {
    const rest = tok.slice(1);
    for (const v of oneEditVariants(rest)) if (COACH_LEXICON.has(v)) return tok[0] + v;
  }
  return null;
}

export interface TypoHint {
  /** As the user typed it. */
  word: string;
  /** The likely intended word. */
  suggestion: string;
}

/**
 * Likely typos in the user's message (one keyboard-neighbour / sound-alike swap or one
 * transposition away from a coaching word). A hint for the model only, never applied.
 */
export function typoHints(text: string): TypoHint[] {
  const out: TypoHint[] = [];
  const seen = new Set<string>();
  for (const tok of (text ?? '').normalize('NFC').replace(NIQQUD, '').split(/[^א-ת]+/)) {
    if (!tok || seen.has(tok)) continue;
    seen.add(tok);
    const s = correctToken(tok);
    if (s && s !== tok) out.push({ word: tok, suggestion: s });
    if (out.length >= 3) break;
  }
  return out;
}

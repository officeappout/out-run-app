/**
 * AI coach review — deterministic detectors shared by the daily reviewer's pre-checks
 * (prechecks.ts) and the regression runner's assertion engine (eval-assertions.ts). Pure,
 * no model calls.
 *
 * Hebrew has no \b in JS regexes (it is ASCII-only), so words are matched on tokens with up
 * to two one-letter prefixes stripped (ו ב ל ה מ ש כ): "לבית" → "בית", "ובבית" → "בית".
 */

// ─── Tokens ──────────────────────────────────────────────────────────────────

const PREFIX = /^[ובלהמשכ]/;

function tokens(text: string): string[] {
  return (text ?? '')
    .normalize('NFC')
    .split(/[^\u0590-\u05FFA-Za-z0-9]+/)
    .filter(Boolean);
}

/** The token plus its prefix-stripped variants. */
function variants(tok: string): string[] {
  const out = [tok];
  let t = tok;
  for (let i = 0; i < 2 && t.length > 2 && PREFIX.test(t); i++) {
    t = t.slice(1);
    out.push(t);
  }
  return out;
}

function hasWord(text: string, words: ReadonlySet<string>): boolean {
  return tokens(text).some((tok) => variants(tok).some((v) => words.has(v)));
}

// ─── Request parsing ─────────────────────────────────────────────────────────

export type ReqDomain = 'core' | 'legs' | 'push' | 'pull';
export type ReqLocation = 'home' | 'park' | 'office' | 'street';

const DOMAIN_WORDS: Record<ReqDomain, ReadonlySet<string>> = {
  core: new Set(['בטן', 'ליבה', 'קור', 'core', 'abs']),
  legs: new Set(['רגליים', 'רגלים', 'ישבן', 'ירכיים', 'סקוואט', 'סקוואטים']),
  push: new Set(['חזה', 'כתפיים', 'כתף', 'טרייספס', 'שכיבות', 'דחיפה', 'דחיפות']),
  pull: new Set(['גב', 'ביספס', 'מתח', 'מתחים', 'משיכה', 'משיכות']),
};
const DOMAIN_PHRASES: Array<[RegExp, ReqDomain]> = [
  [/יד\s+אחורית/, 'push'],
  [/יד\s+קדמית/, 'pull'],
];

const LOCATION_WORDS: Record<ReqLocation, ReadonlySet<string>> = {
  home: new Set(['בית', 'הבית', 'סלון']),
  park: new Set(['פארק', 'גינה', 'גן', 'מתקנים', 'מתקן']),
  office: new Set(['משרד', 'עבודה']),
  street: new Set(['רחוב']),
};

const WORKOUT_REQUEST = /אימון|אימונים|תבנה|תבני|תבנו|בנה\s+לי|תכין|תכיני|תן\s+לי\s+אימון|תני\s+לי\s+אימון|להתאמן/;
const HIGH_INTENSITY = /רמה\s+גבוהה|ברמה\s+גבוהה|קשה|אינטנסיבי|מאתגר|חזק\s+במיוחד/;
const LOW_INTENSITY = /רמה\s+נמוכה|קליל|קל\s|קל$|רגוע/;

export interface ParsedRequest {
  isWorkoutRequest: boolean;
  domains: ReqDomain[];
  location: ReqLocation | null;
  minutes: number | null;
  intensity: 1 | 3 | null;
  isScheduleQuestion: boolean;
}

export function parseMinutes(text: string): number | null {
  const t = (text ?? '').normalize('NFC');
  const m = t.match(/(\d{1,3})\s*(?:דקות|דקה|דק['׳]?|ד['׳]|min)/);
  if (m) return Number(m[1]);
  if (/חצי\s+שעה/.test(t)) return 30;
  if (/רבע\s+שעה/.test(t)) return 15;
  if (/שעה\s+וחצי/.test(t)) return 90;
  return null;
}

export function parseRequest(text: string): ParsedRequest {
  const t = (text ?? '').normalize('NFC');
  const domains = (Object.keys(DOMAIN_WORDS) as ReqDomain[]).filter((d) => hasWord(t, DOMAIN_WORDS[d]));
  for (const [re, d] of DOMAIN_PHRASES) if (re.test(t) && !domains.includes(d)) domains.push(d);
  const location = (Object.keys(LOCATION_WORDS) as ReqLocation[]).find((l) => hasWord(t, LOCATION_WORDS[l])) ?? null;
  const isWorkoutRequest = WORKOUT_REQUEST.test(t);
  return {
    isWorkoutRequest,
    domains: /כל\s+הגוף/.test(t) ? [] : domains,
    location,
    minutes: isWorkoutRequest ? parseMinutes(t) : null,
    intensity: HIGH_INTENSITY.test(t) ? 3 : LOW_INTENSITY.test(t) ? 1 : null,
    isScheduleQuestion: /בתוכנית|התוכנית|לוח\s+זמנים|לו["״]ז|מתוכנן|מה\s+מחכה|השבוע/.test(t) && !isWorkoutRequest,
  };
}

// ─── Reply detectors ─────────────────────────────────────────────────────────

/** Latin words allowed in a reply (the product name and the "AI" label). */
const ALLOWED_LATIN = /\b(?:AI|OUT|OUTRUN)\b/g;

/** The first Latin word (2+ letters) in a reply, or null. */
export function findEnglish(text: string): string | null {
  const m = (text ?? '').replace(ALLOWED_LATIN, ' ').match(/[A-Za-z]{2,}(?:[\s'-]+[A-Za-z]{2,})*/);
  return m ? m[0] : null;
}

/** The fixed safety reply (or a model-written paraphrase of it). */
export function looksLikeSafetyReply(text: string): boolean {
  const t = (text ?? '').normalize('NFC');
  return /מד["״']?א/.test(t) || /(^|\D)101(\D|$)/.test(t) || /עוצר(?:ת)?\s+כאן\s+רגע/.test(t);
}

const FEMININE_SELF =
  /אני\s+(?:לא\s+|גם\s+|רק\s+|כן\s+|עדיין\s+)?(יכולה|ממליצה|בודקת|עוצרת|מציעה|חושבת|רואה|זוכרת|יודעת|מבינה|רופאה|מאמנת|שמחה|בונה|מכינה|צריכה|מנסה|שומרת|מסכימה|מתנצלת|מקשיבה|זמינה|כאן\s+בשבילך\s+בתור\s+מאמנת)/;

/** A feminine first-person self-reference ("אני יכולה") — Kelly is a male coach. */
export function findFeminineSelfReference(text: string): string | null {
  const m = (text ?? '').normalize('NFC').match(FEMININE_SELF);
  if (m) return m[0];
  const m2 = (text ?? '').match(/המאמנת\s+הדיגיטלית|אני\s+קלי,\s+המאמנת/);
  return m2 ? m2[0] : null;
}

export const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

/** Weekday indexes (0 = Sunday) named in the text ("יום שלישי", "בשבת"). */
export function weekdaysMentioned(text: string): number[] {
  const t = (text ?? '').normalize('NFC');
  const out = new Set<number>();
  const re = /(?:יום|ימי|ביום|וביום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) out.add(WEEKDAYS_HE.indexOf(m[1] as (typeof WEEKDAYS_HE)[number]));
  if (tokens(t).some((tok) => variants(tok).includes('שבת'))) out.add(6);
  return Array.from(out).sort();
}

export function hasDigits(text: string): boolean {
  return /\d/.test(text ?? '');
}

/** Rough sentence count (Hebrew punctuation + newlines). */
export function sentenceCount(text: string): number {
  return (text ?? '')
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1).length;
}

// ─── Workout evidence (what was actually built) ──────────────────────────────

export interface EvidenceExercise {
  name: string;
  /** Training domain when known (push / pull / legs / core / skill domains). */
  domain: string | null;
  /** Locations the chosen method is valid for, when known. */
  locations: string[] | null;
}

export interface WorkoutEvidence {
  ok: boolean;
  error: string | null;
  /** Tool input as the model sent it (null when only a card is known). */
  input: { durationMin?: number; location?: string; difficulty?: number; domains?: string[] } | null;
  location: string | null;
  minutes: number | null;
  exerciseCount: number | null;
  title: string | null;
  exercises: EvidenceExercise[] | null;
  reasonCodes: string[];
}

const asStrList = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : null;

function parseExercises(v: unknown): EvidenceExercise[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      name: typeof e.name === 'string' ? e.name : '',
      domain:
        typeof e.domain === 'string'
          ? e.domain
          : typeof e.primaryDomain === 'string'
            ? e.primaryDomain
            : (asStrList(e.domains)?.[0] ?? null),
      locations: asStrList(e.locations) ?? asStrList(e.methodLocations) ?? asStrList(e.location),
    }));
}

function parseInput(v: unknown): WorkoutEvidence['input'] {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  return {
    durationMin: typeof r.durationMin === 'number' ? r.durationMin : undefined,
    location: typeof r.location === 'string' ? r.location : undefined,
    difficulty: typeof r.difficulty === 'number' ? r.difficulty : undefined,
    domains: asStrList(r.domains) ?? undefined,
  };
}

/**
 * generate_workout input + its result (a resultSummary from the message log, or the tool
 * result the eval runner saw). Tolerant of shapes: `{ok:false,error}`, `{error}`, a string
 * error, or a WorkoutToolResult-like object (optionally richer: per-exercise domain / locations).
 */
export function evidenceFromToolCall(input: unknown, result: unknown): WorkoutEvidence {
  const inp = parseInput(input);
  const base: WorkoutEvidence = {
    ok: false,
    error: null,
    input: inp,
    location: inp?.location ?? null,
    minutes: null,
    exerciseCount: null,
    title: null,
    exercises: null,
    reasonCodes: [],
  };
  if (result == null) return { ...base, error: 'no_result' };
  if (typeof result === 'string') {
    try {
      return evidenceFromToolCall(input, JSON.parse(result));
    } catch {
      return { ...base, error: result.slice(0, 120) };
    }
  }
  if (typeof result !== 'object') return { ...base, error: 'unknown_result' };
  const r = result as Record<string, unknown>;
  if (r.ok === false || r.isError === true || r.is_error === true || typeof r.error === 'string') {
    return { ...base, error: typeof r.error === 'string' ? r.error : 'error' };
  }
  const body = (r.result && typeof r.result === 'object' ? r.result : r) as Record<string, unknown>;
  const exercises = parseExercises(body.exercises);
  const reasons = (body.decisionRecord as { reasons?: unknown } | undefined)?.reasons;
  return {
    ...base,
    ok: true,
    location: typeof body.location === 'string' ? body.location : base.location,
    minutes: typeof body.minutes === 'number' ? body.minutes : null,
    exerciseCount:
      typeof body.exerciseCount === 'number' ? body.exerciseCount : exercises ? exercises.length : null,
    title: typeof body.title === 'string' ? body.title : null,
    exercises,
    reasonCodes: Array.isArray(reasons)
      ? reasons.map((x) => (x && typeof x === 'object' ? String((x as { code?: unknown }).code ?? '') : '')).filter(Boolean)
      : asStrList(body.reasonCodes) ?? [],
  };
}

export function evidenceFromCard(card: {
  title: string;
  minutes: number;
  exerciseCount: number;
  location: string;
  reasonCodes?: string[];
}): WorkoutEvidence {
  return {
    ok: true,
    error: null,
    input: null,
    location: card.location || null,
    minutes: card.minutes || null,
    exerciseCount: card.exerciseCount,
    title: card.title || null,
    exercises: null,
    reasonCodes: card.reasonCodes ?? [],
  };
}

/** Domain words found in a workout title (for title_mismatch). */
export function titleDomains(title: string): ReqDomain[] {
  return parseRequest(title).domains;
}

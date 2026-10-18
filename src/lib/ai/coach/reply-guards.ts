/**
 * AI coach — output validators that run on Kelly's final reply text, before it is sent.
 * Pure.
 *
 *   grounding  the reply states schedule / progress facts (clock times, "N אימונים",
 *              weekdays in a schedule sentence, "רמה N") that appear neither in the user
 *              sheet (pre-loaded into every turn) nor in a tool result of this turn.
 *              Owner review 18.10.2026: "מה בתוכנית השבוע?" was answered with three
 *              invented workouts ("ראשון ב-15:00, שלישי, חמישי") while the week held four.
 *   foreign    Latin-letter words in the Hebrew reply ("ביום suspicious..."), except a
 *              short allow list, single letters (ישיבת L) and words that appear as a VALUE
 *              in this turn's evidence (an exercise name that really contains Latin
 *              letters). Internal identifiers are never allowed, even when the evidence
 *              holds them: JSON keys ("workoutId" leaked into a reply, review 18.10.2026),
 *              ids like "ai-1734…", snake_case tool names, camelCase, letters mixed with digits.
 *   feminine   Kelly (a man) speaking about himself in the feminine ("לא בטוחה שהבנתי");
 *              detector shared with the review agent (gender-voice.ts).
 *
 * The turn engine re-prompts ONCE on any issue; after that, foreign words are stripped and
 * feminine self-references are rewritten to the masculine deterministically.
 */
import type { UserContextSheet } from './context-sheet';
import type { CoachGender } from './persona';
import { findFeminineSelfReferences } from './gender-voice';

export interface GroundingFacts {
  times: Set<string>;
  counts: Set<number>;
  levels: Set<number>;
  weekdays: Set<number>;
  /**
   * The evidence's string VALUES, lower-cased (never the JSON keys: a key like "workoutId"
   * is not a word the reply may use).
   */
  text: string;
}

export type ReplyIssue =
  | { kind: 'ungrounded'; claims: string[] }
  | { kind: 'foreign'; words: string[] }
  | { kind: 'feminine'; forms: string[] };

const ALLOWED_LATIN = new Set(['ai', 'out', 'emom', 'amrap', 'hiit', 'trx']);

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const NUMBER_WORDS: Record<string, number> = {
  אחד: 1, אחת: 1,
  שניים: 2, שתיים: 2, שני: 2, שתי: 2,
  שלושה: 3, שלוש: 3,
  ארבעה: 4, ארבע: 4,
  חמישה: 5, חמש: 5,
  שישה: 6, שש: 6,
  שבעה: 7, שבע: 7,
};

const dowOf = (isoDay: string): number | null => {
  const t = Date.parse(`${isoDay}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t).getUTCDay() : null;
};

function normTime(h: string, m: string): string {
  return `${h.padStart(2, '0')}:${m}`;
}

const TIME_RE = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;

function addTimesFromText(text: string, into: Set<string>): void {
  for (const m of Array.from(text.matchAll(TIME_RE))) into.add(normTime(m[1], m[2]));
}

/** Walks parsed tool-result JSON and collects the fact sets. */
function walk(v: unknown, f: GroundingFacts, key = ''): void {
  if (Array.isArray(v)) {
    if (['entries', 'thisWeek', 'today', 'lastWorkouts'].includes(key)) {
      f.counts.add(v.length);
      f.counts.add(v.filter((e) => (e as { type?: unknown })?.type !== 'rest').length);
    }
    for (const x of v) walk(x, f);
    return;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, f, k);
    return;
  }
  if (typeof v === 'number') {
    if (['level', 'currentLevel'].includes(key)) f.levels.add(v);
    if (['workouts', 'activeDays', 'streakDays', 'days'].includes(key)) f.counts.add(v);
    return;
  }
  if (typeof v === 'string') {
    f.text += `${v.toLowerCase()}\n`;
    if (key === 'date' || key === 'from' || key === 'to') {
      const d = dowOf(v);
      if (d !== null) f.weekdays.add(d);
    }
    addTimesFromText(v, f.times);
  }
}

/** Facts the reply may state: the sheet, this turn's tool results, today's weekday. */
export function factsFromEvidence(
  sheet: UserContextSheet | null,
  toolResultTexts: string[],
  todayDow: number | null,
): GroundingFacts {
  const f: GroundingFacts = { times: new Set(), counts: new Set(), levels: new Set(), weekdays: new Set(), text: '' };
  if (sheet) walk(sheet, f);
  for (const t of toolResultTexts) {
    try {
      walk(JSON.parse(t), f);
    } catch {
      // Plain-text tool results (errors, notes) are prose: all of it is a value.
      f.text += `${t.toLowerCase()}\n`;
      addTimesFromText(t, f.times);
    }
  }
  if (todayDow !== null) f.weekdays.add(todayDow);
  return f;
}

const FACT_CONTEXT = /השבוע|החודש|מתוכננ|בתוכנית|עשית|השלמת|היו לך|יש לך|ביצעת|סיימת/;

const SCHEDULE_CONTEXT = /בתוכנית|מתוכננ|בלו[״"]?ז|ביומן|קבעת|קבוע|יש לך|מחכה לך|מחכים לך|השבוע|אימונים/;

/** Schedule / progress statements in the reply that the facts don't support. */
export function findUngroundedClaims(reply: string, f: GroundingFacts): string[] {
  const out: string[] = [];
  const text = (reply ?? '').normalize('NFC');

  for (const m of Array.from(text.matchAll(TIME_RE))) {
    const t = normTime(m[1], m[2]);
    if (!f.times.has(t)) out.push(`time ${t}`);
  }

  for (const m of Array.from(text.matchAll(/רמה\s+(\d{1,2})/g))) {
    const n = Number(m[1]);
    if (!f.levels.has(n)) out.push(`level ${n}`);
  }

  // Counts are judged only when stated as the user's facts, not as a suggestion
  // ("אפשר לעשות שלושה אימונים בשבוע").
  const countContext = FACT_CONTEXT.test(text);
  for (const m of countContext ? Array.from(text.matchAll(/(\d{1,2}|[א-ת]+)\s+אימונים/g)) : []) {
    const raw = m[1];
    const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
    if (n === undefined) continue;
    if (!f.counts.has(n)) out.push(`${n} workouts`);
  }

  if (SCHEDULE_CONTEXT.test(text)) {
    const re = /([ובהל]{0,2})(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?![\u05D0-\u05EA])/g;
    for (const m of Array.from(text.matchAll(re))) {
      const start = m.index ?? 0;
      if (start > 0 && /[\u05D0-\u05EA]/.test(text[start - 1])) continue; // inside another word
      if (/^\s+(אימונים|תרגילים|סטים|סבבים)/.test(text.slice(start + m[0].length))) continue; // "שני אימונים" = two
      const day = WEEKDAYS.indexOf(m[2]);
      const before = text.slice(Math.max(0, start - 14), start);
      const dayContext =
        /(יום|ימי|בימים)\s*$/.test(before) || /(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)[^\u05D0-\u05EA]{0,6}$/.test(before);
      // "ראשון" / "שני" also mean first / second: judge them only in a day context.
      if ((day === 0 || day === 1) && !dayContext) continue;
      if (!f.weekdays.has(day)) out.push(`weekday ${m[2]}`);
    }
  }
  return Array.from(new Set(out));
}

/** Tokens that are internal identifiers, never words: always flagged. */
export function isInternalIdentifier(w: string): boolean {
  return (
    /_/.test(w) || // get_schedule, pullup_bar
    /[a-z][A-Z]/.test(w) || // workoutId, programIds
    /[A-Za-z]\d|\d[A-Za-z]/.test(w) || // ai-1734abc, H2279XsRGDg9
    /^ai-/i.test(w) || // ai-stub-park-20
    /^(workout|program|entry|user|tool|exercise)ids?$/i.test(w)
  );
}

/** A Latin word, or an id glued to leading digits ("5Rkhx…"). */
const LATIN_TOKEN = /(?<![A-Za-z0-9_])[0-9]*[A-Za-z][A-Za-z0-9_]*(?:['’-][A-Za-z0-9_]+)*/g;

/** Latin-letter words (and internal ids) that don't belong in a Hebrew reply. */
export function findForeignWords(reply: string, evidenceText: string): string[] {
  const out: string[] = [];
  for (const m of Array.from((reply ?? '').matchAll(LATIN_TOKEN))) {
    const w = m[0];
    const lw = w.toLowerCase();
    if (isInternalIdentifier(w)) {
      out.push(w);
      continue;
    }
    if (w.length === 1) continue; // ישיבת L, V-sit as "V"
    if (ALLOWED_LATIN.has(lw)) continue;
    if (evidenceText && new RegExp(`(^|[^a-z])${lw.replace(/[^a-z]/g, '.')}([^a-z]|$)`).test(evidenceText)) continue;
    out.push(w);
  }
  return Array.from(new Set(out));
}

/** Last resort after the one re-prompt: drop the foreign words and tidy the spacing. */
export function stripForeignWords(reply: string, words: string[]): string {
  let s = reply;
  // Longest first, so "workoutId=ai-1" goes before "ai".
  for (const w of [...words].sort((a, b) => b.length - a.length)) s = s.split(w).join('');
  return s
    .replace(/\s*=\s*(?=[\s.,!?)\]]|$)/g, '') // "workoutId=" left with nothing after it
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim();
}

export function checkReply(reply: string, f: GroundingFacts | null, userGender?: CoachGender | null): ReplyIssue[] {
  const issues: ReplyIssue[] = [];
  if (f) {
    const claims = findUngroundedClaims(reply, f);
    if (claims.length) issues.push({ kind: 'ungrounded', claims });
  }
  const words = findForeignWords(reply, f?.text ?? '');
  if (words.length) issues.push({ kind: 'foreign', words });
  const fem = findFeminineSelfReferences(reply, userGender);
  if (fem.length) issues.push({ kind: 'feminine', forms: fem.map((h) => h.text) });
  return issues;
}

/** The internal note that asks the model for a corrected reply. English (instructions). */
export function correctionNote(issues: ReplyIssue[]): string {
  const lines = ['[Internal check, not from the user. The user did not see your last reply.]'];
  for (const i of issues) {
    if (i.kind === 'ungrounded') {
      lines.push(
        `Your reply stated facts that are not in the user sheet or in any tool result of this turn: ${i.claims.join(', ')}. ` +
          'Use only facts from the sheet or a tool result. For the schedule call get_schedule, for progress call get_progress, or say you will check.',
      );
    }
    if (i.kind === 'foreign') {
      lines.push(
        `Your reply contained non-Hebrew words or internal ids: ${i.words.join(', ')}. Write the whole reply in Hebrew and never mention ids, field names or tool names.`,
      );
    }
    if (i.kind === 'feminine') {
      lines.push(
        `You spoke about yourself in the feminine: ${i.forms.join(', ')}. Kelly is a man: use masculine first person (אני בטוח, אני בודק, אני מבין, אני יכול). Keep how you address the user unchanged.`,
      );
    }
  }
  lines.push('Write the reply to the user again, short, in Hebrew.');
  return lines.join('\n');
}

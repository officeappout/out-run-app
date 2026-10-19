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
 *   blind      "I can't see it" about something a data tool answers, with no data tool
 *              called this turn. Owner review 18.10.2026: "מה הפרסונה שלי?" → "אני לא יכול
 *              לראות אותה בשיחה הזו" (persona is in get_user_context), and "מה אתה ממליץ
 *              לי הערב?" answered without get_schedule. The re-prompt asks for the tool.
 *
 * The turn engine re-prompts ONCE on any issue; after that, foreign words are stripped and
 * feminine self-references are rewritten to the masculine deterministically.
 */
import type { UserContextSheet } from './context-sheet';
import type { CoachGender } from './persona';
import { findFeminineSelfReferences } from './gender-voice';
import { PROPOSE_TOOL, findSavedClaim } from './schedule-proposal/claims';

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
  | { kind: 'feminine'; forms: string[] }
  | { kind: 'blind'; claim: string; tools: string[] }
  /** Kelly phase 2: said the schedule was changed while it is only a proposal awaiting the user's tap. */
  | { kind: 'unconfirmed_save'; claim: string };

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

/**
 * After foreign words are stripped, a sentence may have no Hebrew left: "Let me check, ok."
 * becomes ",." and a reply would start with bare punctuation (live evals 19.10.2026).
 * Drops every sentence/line that has no Hebrew letter; returns '' when nothing is left.
 */
export function dropHebrewlessSentences(text: string): string {
  const HEBREW = /[\u05D0-\u05EA]/;
  return text
    .split('\n')
    .map((line) =>
      line
        .split(/(?<=[.!?\u2026])\s+/)
        .filter((s) => HEBREW.test(s))
        .join(' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n')
    .trim();
}

// ─── "I can't see it" when a tool can ────────────────────────────────────────

/** Kelly claiming he can't see / has no access to something. */
const BLIND_CLAIM =
  /(?:לא\s+(?:יכול|יכולה)\s+(?:לראות|לבדוק|לדעת)|לא\s+רואה|אין\s+לי\s+(?:גישה|מידע|אפשרות\s+לראות)|לא\s+מופיע(?:ה)?\s+(?:אצלי|לי|בשיחה)|לא\s+זמינ(?:ה)?\s+לי)[^.!?\n]{0,40}/;

/** The user asks about their profile: persona, levels, goal, age, gear (get_user_context). */
const PROFILE_TOPIC = /פרסונה|פרופיל|הרמה\s+שלי|הרמות\s+שלי|רמות|באיזו\s+רמה|מטרה|מטרות|בן\s+כמה|בת\s+כמה|הגיל\s+שלי|הציוד\s+שלי|הפרטים\s+שלי|מה\s+אתה\s+יודע\s+עלי/;
/** The user asks about their plan or what to do now (get_schedule). */
const SCHEDULE_TOPIC = /לו["״]?ז|לוח\s+(?:ה)?זמנים|בתוכנית|מתוכנ|היום|מחר|השבוע|עכשיו|הערב|בערב|דף\s+הבית|מסך\s+הבית|מה\s+(?:כדאי|לעשות|אתה\s+ממליץ)|להשקיע|לוותר|לדלג/;

/** Data tools: one of them in the turn means the claim was made after looking. */
export const DATA_TOOLS = ['get_user_context', 'get_schedule', 'get_progress', 'get_workout_details', 'explain_workout'] as const;

export interface BlindContext {
  /** This turn's user message. */
  userText: string;
  /** Tools already called this turn (any outcome). */
  toolNames: string[];
}

/**
 * A "can't see" claim about something a data tool answers, with no data tool called this
 * turn → the tools that would have answered it. null = fine.
 */
export function findBlindClaim(reply: string, ctx: BlindContext): { claim: string; tools: string[] } | null {
  const m = (reply ?? '').normalize('NFC').match(BLIND_CLAIM);
  if (!m) return null;
  if (ctx.toolNames.some((n) => (DATA_TOOLS as readonly string[]).includes(n))) return null;
  const u = (ctx.userText ?? '').normalize('NFC');
  const tools: string[] = [];
  if (PROFILE_TOPIC.test(u)) tools.push('get_user_context');
  if (SCHEDULE_TOPIC.test(u)) tools.push('get_schedule');
  return tools.length ? { claim: m[0].trim(), tools } : null;
}

export function checkReply(
  reply: string,
  f: GroundingFacts | null,
  userGender?: CoachGender | null,
  blind?: BlindContext | null,
): ReplyIssue[] {
  const issues: ReplyIssue[] = [];
  if (f) {
    const claims = findUngroundedClaims(reply, f);
    if (claims.length) issues.push({ kind: 'ungrounded', claims });
  }
  const words = findForeignWords(reply, f?.text ?? '');
  if (words.length) issues.push({ kind: 'foreign', words });
  const fem = findFeminineSelfReferences(reply, userGender);
  if (fem.length) issues.push({ kind: 'feminine', forms: fem.map((h) => h.text) });
  const b = blind ? findBlindClaim(reply, blind) : null;
  if (b) issues.push({ kind: 'blind', ...b });
  // Only reachable when propose_schedule_change ran this turn (flag ai_coach_phase2).
  if (blind?.toolNames.includes(PROPOSE_TOOL)) {
    const claim = findSavedClaim(reply);
    if (claim) issues.push({ kind: 'unconfirmed_save', claim });
  }
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
    if (i.kind === 'blind') {
      lines.push(
        `You told the user you can't see it ("${i.claim}"), but ${i.tools.join(' and ')} can answer this. Call ${i.tools.join(' and ')} now and answer from the result. ` +
          'For a persona question, say which persona the user has and what it means in one plain sentence. For "what should I do now", use today\'s entries and the hour. ' +
          'You can\'t see the app\'s screens, but today\'s schedule is what the app plans for the user: answer from it.',
      );
    }
    if (i.kind === 'unconfirmed_save') {
      lines.push(
        `You said the schedule was already changed ("${i.claim}"), but nothing is saved yet: it is only a proposal. Say what will change and that it is saved only after the user taps אשר on the card under your reply.`,
      );
    }
  }
  lines.push('Write the reply to the user again, short, in Hebrew.');
  return lines.join('\n');
}

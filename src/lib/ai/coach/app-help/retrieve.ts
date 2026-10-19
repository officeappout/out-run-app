/**
 * Kelly phase 2 — get_app_help: simple keyword retrieval over APP_HELP_ENTRIES. Pure.
 *
 * Score = phrase hits (a keyword found in the question, prefixes like ה/ו/ב/ל/ש tolerated)
 * weighted by length, + 1 for each question word that starts a keyword word. A topic id
 * (the model may pass one) wins outright. Nothing found → found:false, and the system
 * prompt tells Kelly to offer the team (handoff) instead of guessing.
 */
import { z } from 'zod';
import { APP_HELP_ENTRIES, type AppHelpEntry } from './entries';
import { getAppHelpEntries } from '@/lib/app-help/loader';

export const APP_HELP_TOPICS = APP_HELP_ENTRIES.map((e) => e.id) as [string, ...string[]];

export const GetAppHelpInput = z
  .object({
    topic: z.enum(APP_HELP_TOPICS).optional(),
    query: z.string().trim().min(2).max(300).optional(),
  })
  .refine((v) => !!v.topic || !!v.query, { message: 'give topic or query' });
export type GetAppHelpInputT = z.infer<typeof GetAppHelpInput>;

const NIQQUD = /[֑-ׇ]/g;
const PREFIXES = /^(?:ו|ה|ב|ל|מ|ש|כ){1,2}(?=[א-ת]{2,})/;

export function normalizeHe(text: string): string {
  return (text ?? '')
    .normalize('NFC')
    .replace(NIQQUD, '')
    .replace(/[״"׳']/g, '')
    .toLowerCase()
    .replace(/[^א-תa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Too common to mean anything on their own (single-word matches only). */
const STOP = new Set(['איך', 'מה', 'אני', 'את', 'אתה', 'יש', 'אפשר', 'אפליקציה', 'לי', 'זה', 'עם', 'של', 'על', 'אם', 'לא', 'כן', 'רוצה', 'צריך', 'איפה', 'למה', 'מי', 'שלי']);

const words = (t: string) => normalizeHe(t).split(' ').filter((w) => w.length >= 2);
const stem = (w: string) => w.replace(PREFIXES, '');

export function scoreEntry(entry: AppHelpEntry, query: string): number {
  const q = normalizeHe(query);
  const qWords = words(query).map(stem);
  let score = 0;
  for (const kw of entry.keywords) {
    const k = normalizeHe(kw);
    if (!k) continue;
    if (q.includes(k)) score += 2 + k.split(' ').length;
    else {
      const kWords = k.split(' ').map(stem);
      if (kWords.length > 1 && kWords.every((kw2) => qWords.some((w) => w === kw2 || (kw2.length >= 3 && w.startsWith(kw2))))) score += 2;
    }
  }
  const kwWords = new Set(entry.keywords.flatMap((k) => words(k).map(stem)));
  for (const w of qWords) if (w.length >= 3 && !STOP.has(w) && kwWords.has(w)) score += 1;
  return score;
}

export interface AppHelpHit {
  id: string;
  title: string;
  answer: string;
}

/**
 * `round4` (flag ai_coach_round4): also the round 4 entries (running, Kelly, the tutorial),
 * through the one help loader. Off = exactly APP_HELP_ENTRIES.
 */
export function findAppHelp(input: GetAppHelpInputT, max = 2, opts: { round4?: boolean } = {}): AppHelpHit[] {
  const pick = (e: AppHelpEntry): AppHelpHit => ({ id: e.id, title: e.title, answer: e.answer });
  const entries = opts.round4 ? getAppHelpEntries({ round4: true }) : APP_HELP_ENTRIES;
  if (input.topic) {
    const e = entries.find((x) => x.id === input.topic);
    if (e) return [pick(e)];
  }
  if (!input.query) return [];
  return entries.map((e) => ({ e, s: scoreEntry(e, input.query!) }))
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => pick(x.e));
}

/** What the model reads back. */
export function appHelpToolResult(input: GetAppHelpInputT, opts: { round4?: boolean } = {}): Record<string, unknown> {
  const hits = findAppHelp(input, 2, opts);
  if (hits.length === 0) {
    return {
      found: false,
      noteForCoach:
        'There is no verified answer about this in the app guide. Do not guess how the app works. Say you are not sure and offer to pass the question to the OUT team (handoff_to_human, only after the user agrees).',
    };
  }
  return {
    found: true,
    entries: hits,
    noteForCoach: 'Answer only from these entries, in your own short words and the user\'s grammar. Keep the app\'s button names in quotes as written. If the entry says the app can\'t do it, say so and offer the team.',
  };
}

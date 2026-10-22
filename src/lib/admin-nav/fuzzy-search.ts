/**
 * fuzzy-search — local (in-browser) navigation for the admin assistant, NO model call
 * (docs/admin/ADMIN-AI-ASSISTANT-PLAN.md §3.3). Pure; the same search backs the server's
 * find_admin_page tool, so the drawer and the model see identical results.
 *
 *   searchAdminPages(query, pages)   scored candidates, best first (score 0..1)
 *   decideLocalNav(query, pages)     go (one button) | did_you_mean (2-3) | server
 *
 * Scoring: the query is normalized (normalizeHe), navigation filler ("איפה", "תפתח", "מסך"…)
 * is dropped, and each remaining word is matched against a page's title, synonyms, section /
 * group and description — exact stem, prefix (≥3 letters) or one edit (≥4 letters). A page's
 * score is its best field: matched-word fraction × field weight, + a bonus when the whole query
 * appears as a phrase. Data / analysis questions ("כמה", "למה", "מה המצב", numbers) are never
 * answered locally — they go to the server.
 */
import { normalizeHe, stemHe } from '@/lib/text/hebrew-normalize';
import type { AdminPageEntry } from './page-map';

/** One button when the best is ≥ this and ahead of the 2nd by ≥ GO_GAP. */
export const GO_MIN_SCORE = 0.75;
export const GO_GAP = 0.15;
/** Candidates at or above this are offered as "התכוונת ל…". */
export const SUGGEST_MIN_SCORE = 0.45;
export const MAX_SUGGESTIONS = 3;

/** Navigation filler — removed before scoring. Stems (no ה/ל/ב prefixes). */
const NAV_FILLER = new Set([
  'איפה', 'איך', 'מגיעים', 'מגיע', 'להגיע', 'תפתח', 'פתח', 'לפתוח', 'תפתחי', 'תראה', 'תראי', 'הראה', 'להראות',
  'תביא', 'תביאי', 'קח', 'תיקח', 'אותי', 'לי', 'את', 'של', 'עם', 'על', 'אל', 'עמוד', 'דף', 'מסך', 'טאב', 'לשונית',
  'רוצה', 'צריך', 'צריכה', 'אפשר', 'נמצא', 'נמצאת', 'נמצאים', 'יש', 'זה', 'ה', 'go', 'to', 'open', 'page', 'where',
  'בבקשה', 'מה', 'כל', 'אני', 'מוצא', 'מוצאת', 'למצוא', 'תמצא', 'נכנסים', 'להיכנס', 'תכניס'
]);

/** Words that make it a data / analysis question → the server answers, never a page button. */
const DATA_MARKERS = [
  'כמה', 'למה', 'מדוע', 'מה המצב', 'מה מצב', 'כמות', 'מספר', 'אחוז', 'ממוצע', 'מגמה', 'השווה', 'השוואה', 'תנתח',
  'ניתוח', 'נתח', 'סכם', 'סיכום', 'הסבר', 'מה קרה', 'ירד', 'עלה', 'עלתה', 'ירדה', 'how many', 'why', 'how much',
];

export interface ScoredPage {
  page: AdminPageEntry;
  score: number;
}

export type LocalNavDecision =
  | { kind: 'go'; page: AdminPageEntry; score: number }
  | { kind: 'did_you_mean'; pages: ScoredPage[] }
  | { kind: 'server'; reason: 'empty' | 'data_question' | 'no_match' };

function tokens(text: string): string[] {
  return normalizeHe(text)
    .split(' ')
    .filter(Boolean)
    .map(stemHe);
}

/** Filler as written, with one particle off ("למסך" → "מסך"), or fully stemmed. */
function isFiller(raw: string): boolean {
  return NAV_FILLER.has(raw) || NAV_FILLER.has(raw.replace(/^[והבלמשכ](?=[א-ת]{2,})/, '')) || NAV_FILLER.has(stemHe(raw));
}

/** Query words that carry meaning: filler removed (checked before AND after stemming), stemmed. */
export function queryTerms(query: string): string[] {
  return normalizeHe(query)
    .split(' ')
    .filter(Boolean)
    .filter((raw) => !isFiller(raw))
    .map(stemHe)
    .filter((w) => w.length >= 2);
}

export function isDataQuestion(query: string): boolean {
  const q = ` ${normalizeHe(query)} `;
  if (/\d/.test(q)) return true;
  return DATA_MARKERS.some((m) => q.includes(` ${m} `) || q.startsWith(` ${m}`));
}

/** Levenshtein distance ≤ 1 (cheap, early exit). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** How well one query word matches one field word: 1 exact, 0.85 prefix, 0.7 one edit, else 0. */
function wordMatch(q: string, w: string): number {
  if (q === w) return 1;
  if (q.length >= 3 && w.length >= 3 && (w.startsWith(q) || q.startsWith(w))) return 0.85;
  if (q.length >= 4 && w.length >= 4 && withinOneEdit(q, w)) return 0.7;
  return 0;
}

function fieldScore(terms: string[], fieldText: string, phrase: string): number {
  const words = tokens(fieldText);
  if (!words.length || !terms.length) return 0;
  let sum = 0;
  for (const t of terms) {
    let best = 0;
    for (const w of words) {
      const m = wordMatch(t, w);
      if (m > best) best = m;
      if (best === 1) break;
    }
    sum += best;
  }
  const coverage = sum / terms.length;
  // whole query as a phrase inside the field (e.g. "טבלת כל הערים") → strong signal
  const phraseHit = terms.length >= 2 && phrase.length >= 4 && normalizeHe(fieldText).includes(phrase) ? 0.2 : 0;
  // a field much longer than the query is a weaker match ("ניהול" alone vs a 6-word title)
  const precision = Math.min(1, terms.length / Math.max(1, words.length));
  return Math.min(1, coverage * (0.75 + 0.25 * precision) + phraseHit);
}

const SUB_PAGE_FACTOR = 0.8;

const FIELD_WEIGHT = { title: 1, synonym: 1, section: 0.55, description: 0.4 } as const;

export function scorePage(query: string, page: AdminPageEntry): number {
  const terms = queryTerms(query);
  if (!terms.length) return 0;
  const phrase = normalizeHe(query);
  let best = fieldScore(terms, page.title, phrase) * FIELD_WEIGHT.title;
  for (const s of page.synonyms) best = Math.max(best, fieldScore(terms, s, phrase) * FIELD_WEIGHT.synonym);
  const sectionText = [page.sectionLabel, page.group].filter(Boolean).join(' ');
  if (sectionText) best = Math.max(best, fieldScore(terms, sectionText, phrase) * FIELD_WEIGHT.section);
  if (page.description) best = Math.max(best, fieldScore(terms, page.description, phrase) * FIELD_WEIGHT.description);
  // a sub-page ("ניהול רשויות · חדש", "…/[id]") loses to its parent on the same words
  if (page.titleSource === 'parent' || page.params.length > 0) best *= SUB_PAGE_FACTOR;
  return Math.round(best * 1000) / 1000;
}

/** Best first; ties → shorter title, then href (deterministic). */
export function searchAdminPages(query: string, pages: AdminPageEntry[], limit = 5): ScoredPage[] {
  return pages
    .map((page) => ({ page, score: scorePage(query, page) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.page.title.length - b.page.title.length || a.page.href.localeCompare(b.page.href))
    .slice(0, limit);
}

/**
 * Pages that need an id ([param]) are never offered locally — the browser has no id to fill
 * in; the server's model can (navigate with params).
 */
export function decideLocalNav(query: string, pages: AdminPageEntry[]): LocalNavDecision {
  if (!normalizeHe(query)) return { kind: 'server', reason: 'empty' };
  if (isDataQuestion(query)) return { kind: 'server', reason: 'data_question' };
  const results = searchAdminPages(query, pages.filter((p) => p.params.length === 0), 5);
  const [first, second] = results;
  if (!first || first.score < SUGGEST_MIN_SCORE) return { kind: 'server', reason: 'no_match' };
  if (first.score >= GO_MIN_SCORE && (!second || first.score - second.score >= GO_GAP)) {
    return { kind: 'go', page: first.page, score: first.score };
  }
  return { kind: 'did_you_mean', pages: results.filter((r) => r.score >= SUGGEST_MIN_SCORE).slice(0, MAX_SUGGESTIONS) };
}

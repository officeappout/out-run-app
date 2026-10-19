/**
 * Hebrew-aware matching for unified search: normalize, score a field, split a title into
 * matched / unmatched parts for bolding. Pure.
 */
import { normalizeHe } from '@/lib/ai/coach/app-help/retrieve';

export const MIN_QUERY_CHARS = 2;

/** Leading ו/ה/ב/ל/מ/ש/כ (one or two) before a real word. */
const PREFIXES = /^(?:ו|ה|ב|ל|מ|ש|כ){1,2}(?=[א-ת]{2,})/;

export function norm(s: string | null | undefined): string {
  return normalizeHe(s ?? '');
}

export function words(s: string): string[] {
  return norm(s).split(' ').filter(Boolean);
}

const stem = (w: string) => w.replace(PREFIXES, '');

/**
 * How well `text` matches `query`, 0–100:
 *   100 exact · 80 starts with · 60 a word starts with (Hebrew prefixes tolerated)
 *   40 contains · 30 every query word starts some text word · 0 no match
 */
export function scoreText(text: string | null | undefined, query: string): number {
  const q = norm(query);
  const t = norm(text);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const tw = t.split(' ');
  if (tw.some((w) => w.startsWith(q) || (q.length >= 2 && stem(w).startsWith(q)))) return 60;
  if (t.includes(q)) return 40;
  const qw = q.split(' ').filter((w) => w.length >= 2);
  if (qw.length > 1 && qw.every((w) => tw.some((x) => x.startsWith(w) || stem(x).startsWith(stem(w))))) return 30;
  return 0;
}

/** Best of several fields, each with a weight (1 = title-strength). */
export function scoreFields(fields: ReadonlyArray<readonly [string | null | undefined, number]>, query: string): number {
  let best = 0;
  for (const [text, weight] of fields) best = Math.max(best, scoreText(text, query) * weight);
  return Math.round(best);
}

export interface TextPart { text: string; match: boolean }

/**
 * Split `text` around the first case-insensitive occurrence of the query (or, failing that, of
 * its longest word). No match → one unmatched part. Works on the original string so niqqud and
 * punctuation survive.
 */
export function highlightParts(text: string, query: string): TextPart[] {
  const q = query.trim();
  if (!text || q.length < 1) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const tryNeedle = (needle: string): TextPart[] | null => {
    if (!needle) return null;
    const i = lower.indexOf(needle.toLowerCase());
    if (i < 0) return null;
    const parts: TextPart[] = [];
    if (i > 0) parts.push({ text: text.slice(0, i), match: false });
    parts.push({ text: text.slice(i, i + needle.length), match: true });
    if (i + needle.length < text.length) parts.push({ text: text.slice(i + needle.length), match: false });
    return parts;
  };
  const longest = [...q.split(/\s+/)].sort((a, b) => b.length - a.length)[0];
  return tryNeedle(q) ?? (longest && longest.length >= 2 ? tryNeedle(longest) : null) ?? [{ text, match: false }];
}

/**
 * "אולי חיפשת" — near matches for a query that found nothing. Pure.
 *
 * A candidate qualifies when it shares a meaningful word with the query (≥ 3 letters, Hebrew
 * prefixes tolerated — "פרונט ליבר עם גומיות" → "פרונט ליבר"), or when one of its words is within
 * a small edit distance of a query word (a typo: "פרנט" → "פרונט").
 */
import { norm } from './text';

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const PREFIXES = /^(?:ו|ה|ב|ל|מ|ש|כ){1,2}(?=[א-ת]{3,})/;
const STOP = new Set(['עם', 'של', 'על', 'את', 'איך', 'מה', 'אני', 'בלי', 'לי', 'זה', 'גם']);
const keyWords = (s: string) => norm(s).split(' ').map((w) => w.replace(PREFIXES, '')).filter((w) => w.length >= 3 && !STOP.has(w));

export function nearMatches(query: string, candidates: readonly string[], max = 3): string[] {
  const qw = keyWords(query);
  if (!qw.length) return [];
  const scored: Array<{ c: string; s: number }> = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = norm(c);
    if (!key || seen.has(key) || key === norm(query)) continue;
    seen.add(key);
    const cw = keyWords(c);
    let s = 0;
    for (const w of qw) {
      if (cw.includes(w)) s += 3;
      else if (cw.some((x) => x.startsWith(w) || w.startsWith(x))) s += 2;
      else if (cw.some((x) => Math.abs(x.length - w.length) <= 1 && editDistance(x, w) <= (w.length >= 6 ? 2 : 1))) s += 1;
    }
    if (s > 0) scored.push({ c, s: s * 10 - Math.min(9, cw.length) });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.c);
}

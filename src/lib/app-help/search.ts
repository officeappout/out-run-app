/**
 * Help-hub search — the same Hebrew scoring Kelly's get_app_help uses (app-help/retrieve.ts),
 * over the shared HelpQA shape. Pure.
 */
import { normalizeHe, scoreEntry } from '@/lib/ai/coach/app-help/retrieve';
import type { HelpQA } from './types';

export function searchHelp(entries: readonly HelpQA[], query: string): HelpQA[] {
  const q = normalizeHe(query);
  if (q.length < 2) return [...entries];
  return entries
    .map((e) => {
      const keyword = scoreEntry({ id: e.id, title: e.q, keywords: e.tags, answer: '' }, query);
      const text = normalizeHe(`${e.q} ${e.a.join(' ')}`).includes(q) ? 2 : 0;
      return { e, s: keyword + text };
    })
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);
}

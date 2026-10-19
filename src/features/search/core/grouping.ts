/**
 * Group provider hits for the chips + the "הכל" view. Pure.
 *   counts       per chip (and "all" = the sum)
 *   groups       categories with hits, best-scoring first (ties: chip order), each sorted by score
 *   preview      "הכל" shows 2–3 per type (exercises 2 → one row of the 2-column grid) + "לכל N"
 */
import { KIND_CATEGORY, SEARCH_CATEGORIES, type ResultCategory, type SearchCategory, type SearchHit } from './types';

export const PREVIEW_COUNT: Record<ResultCategory, number> = {
  exercises: 2,
  parks: 3,
  routes: 3,
  social: 3,
  events: 2,
  articles: 2,
  help: 3,
};

export interface HitGroup {
  category: ResultCategory;
  hits: SearchHit[];
  total: number;
  best: number;
}

export function groupHits(hits: readonly SearchHit[]): HitGroup[] {
  const by = new Map<ResultCategory, SearchHit[]>();
  for (const h of hits) {
    if (h.score <= 0) continue;
    const c = KIND_CATEGORY[h.kind];
    const list = by.get(c) ?? [];
    list.push(h);
    by.set(c, list);
  }
  const order = (c: ResultCategory) => SEARCH_CATEGORIES.indexOf(c);
  return Array.from(by.entries())
    .map(([category, list]) => {
      const sorted = [...list].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'he'));
      return { category, hits: sorted, total: sorted.length, best: sorted[0]?.score ?? 0 };
    })
    .sort((a, b) => b.best - a.best || order(a.category) - order(b.category));
}

export function categoryCounts(groups: readonly HitGroup[]): Record<SearchCategory, number> {
  const out = Object.fromEntries(SEARCH_CATEGORIES.map((c) => [c, 0])) as Record<SearchCategory, number>;
  for (const g of groups) {
    out[g.category] = g.total;
    out.all += g.total;
  }
  return out;
}

export function previewOf(group: HitGroup): { shown: SearchHit[]; more: number } {
  const n = PREVIEW_COUNT[group.category];
  return { shown: group.hits.slice(0, n), more: Math.max(0, group.total - n) };
}

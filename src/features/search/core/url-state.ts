/**
 * /search URL ↔ unified-search state. Pure.
 *   ?q=<query>      deep link from the map search ("חיפוש בכל האפליקציה") or anywhere else
 *   ?cat=<chip>     the selected chip
 *   ?tab=<legacy>   today's links (exercises / groups / people / events) keep working
 */
import { SEARCH_CATEGORIES, type SearchCategory } from './types';

const LEGACY_TAB: Record<string, SearchCategory> = {
  exercises: 'exercises',
  groups: 'social',
  people: 'social',
  social: 'social',
  events: 'events',
};

export function categoryFromParams(p: { get(k: string): string | null }): SearchCategory {
  const cat = p.get('cat');
  if (cat && (SEARCH_CATEGORIES as readonly string[]).includes(cat)) return cat as SearchCategory;
  const tab = p.get('tab');
  if (tab && LEGACY_TAB[tab]) return LEGACY_TAB[tab];
  return 'all';
}

export function queryFromParams(p: { get(k: string): string | null }): string {
  return (p.get('q') ?? '').slice(0, 80);
}

export function searchHref(q: string, cat: SearchCategory = 'all'): string {
  const sp = new URLSearchParams();
  if (q.trim()) sp.set('q', q.trim().slice(0, 80));
  if (cat !== 'all') sp.set('cat', cat);
  const s = sp.toString();
  return `/search${s ? `?${s}` : ''}`;
}

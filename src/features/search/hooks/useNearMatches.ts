'use client';

/** "אולי חיפשת" — near matches over every searchable name, computed only when nothing matched. */
import { useEffect, useState } from 'react';
import { nearMatches } from '../core/fuzzy';
import { exerciseNames } from '../providers/exercises';
import { loadParks } from '../providers/places';
import { loadContentCorpus } from '../providers/content';
import type { SearchContext } from './useSearchContext';

export function useNearMatches(query: string, enabled: boolean, ctx: SearchContext): string[] {
  const [out, setOut] = useState<string[]>([]);
  const { groups, events } = ctx;
  useEffect(() => {
    if (!enabled || !query) {
      setOut([]);
      return;
    }
    let alive = true;
    (async () => {
      const [ex, parks, content] = await Promise.all([
        exerciseNames().catch(() => [] as string[]),
        loadParks().then((p) => p.map((x) => x.name)).catch(() => [] as string[]),
        loadContentCorpus().catch(() => ({ articles: [], faq: [], help: [] })),
      ]);
      const names = [
        ...ex,
        ...parks,
        ...groups.map((g) => g.name),
        ...events.map((e) => e.name),
        ...content.articles.map((a) => a.title),
      ];
      if (alive) setOut(nearMatches(query, names, 3));
    })();
    return () => {
      alive = false;
    };
  }, [query, enabled, groups, events]);
  return out;
}

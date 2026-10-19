'use client';

/**
 * Runs every provider for the (debounced) query and returns the grouped results. Async
 * providers land one by one (the UI shows what it has + skeletons for the rest); a newer query
 * drops a stale provider's late answer. Groups / events filter in memory (no network).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MIN_QUERY_CHARS } from '../core/text';
import { categoryCounts, groupHits, type HitGroup } from '../core/grouping';
import type { SearchCategory, SearchHit } from '../core/types';
import { searchExercises } from '../providers/exercises';
import { searchParks, searchRoutes } from '../providers/places';
import { searchPeople } from '../providers/people';
import { searchContent } from '../providers/content';
import { rankEvents, rankGroups } from '../providers/community';
import { useDebounced } from './useDebounced';
import type { SearchContext } from './useSearchContext';

export const SEARCH_DEBOUNCE_MS = 250;
type AsyncProvider = 'exercises' | 'parks' | 'routes' | 'people' | 'content';
const ASYNC: AsyncProvider[] = ['exercises', 'parks', 'routes', 'people', 'content'];

export interface UnifiedSearchState {
  /** The query the results belong to ('' when below MIN_QUERY_CHARS). */
  query: string;
  hits: SearchHit[];
  groups: HitGroup[];
  counts: Record<SearchCategory, number>;
  /** Some provider is still running (or the debounce hasn't fired yet). */
  loading: boolean;
  /** Every provider answered for the current input. */
  settled: boolean;
}

export function useUnifiedSearch(input: string, ctx: SearchContext): UnifiedSearchState {
  const trimmed = input.trim();
  const debounced = useDebounced(trimmed, SEARCH_DEBOUNCE_MS);
  const active = debounced.length >= MIN_QUERY_CHARS ? debounced : '';
  const [asyncHits, setAsyncHits] = useState<{ q: string; by: Partial<Record<AsyncProvider, SearchHit[]>> }>({ q: '', by: {} });
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setAsyncHits((s) => (s.q === active ? s : { q: active, by: {} }));
    const { pos, ageGroup, uid } = ctxRef.current;
    const land = (id: AsyncProvider, p: Promise<SearchHit[]>) => {
      p.catch((err) => {
        console.warn(`[unified-search] ${id} provider failed`, err);
        return [] as SearchHit[];
      }).then((hits) => {
        if (!cancelled) setAsyncHits((s) => (s.q === active ? { q: active, by: { ...s.by, [id]: hits } } : s));
      });
    };
    land('exercises', searchExercises(active));
    land('parks', searchParks(active, pos));
    land('routes', searchRoutes(active, pos));
    land('people', searchPeople(active, ageGroup, uid));
    land('content', searchContent(active).then((r) => [...r.articles, ...r.qa]));
    return () => {
      cancelled = true;
    };
  }, [active]);

  const community = useMemo<SearchHit[]>(() => {
    if (!active) return [];
    return [...rankGroups([...ctx.groups, ...ctx.myGroups], active, ctx.pos), ...rankEvents(ctx.events, active, ctx.pos)];
  }, [active, ctx.groups, ctx.myGroups, ctx.events, ctx.pos]);

  return useMemo(() => {
    const by = asyncHits.q === active ? asyncHits.by : {};
    const hits = active ? [...ASYNC.flatMap((id) => by[id] ?? []), ...community] : [];
    const groups = groupHits(hits);
    const pending = active ? ASYNC.some((id) => !(id in by)) : false;
    const typingAhead = trimmed.length >= MIN_QUERY_CHARS && trimmed !== debounced;
    return {
      query: active,
      hits,
      groups,
      counts: categoryCounts(groups),
      loading: pending || typingAhead,
      settled: !!active && !pending && !typingAhead,
    };
  }, [active, asyncHits, community, trimmed, debounced]);
}

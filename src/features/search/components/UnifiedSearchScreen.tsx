'use client';

/**
 * Unified search (flag enable_unified_search) — the /search screen: one field + chips
 * (הכל · תרגילים · גינות · מסלולים · אנשים וקבוצות · אירועים · מאמרים · עזרה), the empty state,
 * grouped results, per-chip views and the no-results state. Data comes from the providers
 * (one small module each) through useUnifiedSearch; this file only wires state to views.
 */
import nextDynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppHeader from '@/components/ui/AppHeader';
import ExerciseDetailSheet from '@/features/content/exercises/client/components/ExerciseDetailSheet';
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import type { ArticleItem } from '@/lib/content-items/types';
import SearchField from './SearchField';
import CategoryChips from './CategoryChips';
import EmptyState from './EmptyState';
import NoResults from './NoResults';
import AskKellyRow from './AskKellyRow';
import ArticleReader from './ArticleReader';
import CommunityDrawers from './CommunityDrawers';
import { ResultsSkeleton } from './Skeletons';
import AllResults from './results/AllResults';
import PlacesTab from './tabs/PlacesTab';
import SocialTab from './tabs/SocialTab';
import EventsTab from './tabs/EventsTab';
import ArticlesTab from './tabs/ArticlesTab';
import HelpTab from './tabs/HelpTab';
import { MIN_QUERY_CHARS } from '../core/text';
import { categoryFromParams, queryFromParams } from '../core/url-state';
import { countEventsThisWeek, situationSuggestions, type Situation } from '../core/situations';
import type { ResultCategory, SearchCategory } from '../core/types';
import { useSearchContext } from '../hooks/useSearchContext';
import { useUnifiedSearch } from '../hooks/useUnifiedSearch';
import { useSearchRecents } from '../hooks/useSearchRecents';
import { useNearMatches } from '../hooks/useNearMatches';
import { useCommunityActions } from '../hooks/useCommunityActions';
import { loadContentCorpus, type ContentCorpus } from '../providers/content';
import { countParksWithin, loadParks } from '../providers/places';
import { useT } from '@/hooks/useT';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { library } from '@/messages/ns/library';

// The library (exercise corpus parser, filters, sheets) loads only when its chip opens.
const ExercisesTab = nextDynamic(() => import('./tabs/ExercisesTab'), { ssr: false, loading: () => <ResultsSkeleton /> });

export default function UnifiedSearchScreen() {
  // ai_coach_round4: the Help tab also lists every app tour (TourList).
  const aiCoachRound4 = useFeatureFlags().flags.aiCoachRound4 === true;
  const t = useT(library);
  const router = useRouter();
  const params = useSearchParams();
  const ctx = useSearchContext();
  const actions = useCommunityActions();
  const { isOpen: keyboardOpen } = useKeyboardInset();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(() => queryFromParams(params));
  const [category, setCategoryState] = useState<SearchCategory>(() => categoryFromParams(params));
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [article, setArticle] = useState<ArticleItem | null>(null);
  const [corpus, setCorpus] = useState<ContentCorpus | null>(null);
  const [parksNear, setParksNear] = useState<number | null>(null);

  const search = useUnifiedSearch(query, ctx);
  const { recents, add: addRecent, clear: clearRecents } = useSearchRecents(ctx.uid);
  const typed = query.trim().length >= MIN_QUERY_CHARS;
  const noResults = search.settled && search.hits.length === 0;
  const near = useNearMatches(search.query, noResults, ctx);

  // Chip ↔ URL (replace: chips are a view, not history entries).
  const setCategory = useCallback((c: SearchCategory) => {
    setCategoryState(c);
    if (c !== 'exercises') setMuscle(null);
    const sp = new URLSearchParams(params.toString());
    sp.delete('tab');
    if (c === 'all') sp.delete('cat');
    else sp.set('cat', c);
    const s = sp.toString();
    router.replace(`/search${s ? `?${s}` : ''}`, { scroll: false });
  }, [params, router]);

  useEffect(() => {
    let alive = true;
    loadContentCorpus().then((c) => alive && setCorpus(c));
    return () => { alive = false; };
  }, []);

  const lat = ctx.pos?.lat;
  const lng = ctx.pos?.lng;
  useEffect(() => {
    if (lat == null || lng == null) return;
    let alive = true;
    loadParks().then((p) => alive && setParksNear(countParksWithin(p, { lat, lng }, 1))).catch(() => {});
    return () => { alive = false; };
  }, [lat, lng]);

  // ?groupId= deep link (NearbyGroupsRow etc.) — same behaviour as today's search page.
  const groupIdParam = params.get('groupId');
  const { setSelectedGroup } = actions;
  useEffect(() => {
    if (!groupIdParam) return;
    const g = [...ctx.groups, ...ctx.myGroups].find((x) => x.id === groupIdParam);
    if (!g) return;
    setSelectedGroup(g);
    const sp = new URLSearchParams(params.toString());
    sp.delete('groupId');
    const s = sp.toString();
    router.replace(`/search${s ? `?${s}` : ''}`, { scroll: false });
  }, [groupIdParam, ctx.groups, ctx.myGroups, setSelectedGroup, params, router]);

  // A query that found something and stayed put for a moment becomes a recent search.
  useEffect(() => {
    if (!search.settled || !search.hits.length) return;
    const timer = setTimeout(() => addRecent(search.query), 1500);
    return () => clearTimeout(timer);
  }, [search.settled, search.hits.length, search.query, addRecent]);

  const situations = useMemo(() => situationSuggestions({
    hour: new Date().getHours(),
    parksWithin1Km: parksNear,
    eventsThisWeek: countEventsThisWeek(ctx.events.map((e) => e.date as unknown as Date)),
    groupsNearby: ctx.groups.length,
  }), [parksNear, ctx.events, ctx.groups.length]);

  const onSituation = (s: Situation) => {
    if (s.action.type === 'muscle') {
      setMuscle(s.action.muscle);
      setCategory('exercises');
    } else setCategory(s.action.category);
  };
  const pickQuery = (q: string) => {
    setQuery(q);
    inputRef.current?.blur();
  };
  const seeAll = (c: ResultCategory) => setCategory(c);

  const deps = useMemo(() => ({ actions, openArticle: setArticle }), [actions]);
  const hitsOf = (c: ResultCategory) => search.groups.find((g) => g.category === c)?.hits ?? [];

  let body: React.ReactNode;
  if (category === 'exercises') {
    body = <ExercisesTab query={typed ? query.trim() : ''} muscle={muscle} />;
  } else if (category === 'parks' || category === 'routes') {
    body = <PlacesTab kind={category} query={search.query} hits={hitsOf(category)} loading={search.loading} pos={ctx.pos} deps={deps} />;
  } else if (category === 'social') {
    body = <SocialTab query={search.query} hits={hitsOf('social')} loading={search.loading} ctx={ctx} deps={deps} />;
  } else if (category === 'events') {
    body = <EventsTab query={search.query} hits={hitsOf('events')} ctx={ctx} deps={deps} />;
  } else if (category === 'articles') {
    body = <ArticlesTab query={search.query} articles={corpus?.articles ?? []} loading={!corpus} onOpen={setArticle} />;
  } else if (category === 'help') {
    body = <HelpTab query={search.query} corpus={corpus} toursOn={aiCoachRound4} />;
  } else if (!typed) {
    body = (
      <EmptyState
        recents={recents}
        onRecent={pickQuery}
        onClearRecents={clearRecents}
        situations={situations}
        onSituation={onSituation}
        articles={corpus?.articles ?? []}
        onArticle={setArticle}
        onAllArticles={() => setCategory('articles')}
      />
    );
  } else if (noResults) {
    body = <NoResults query={search.query} category={category} nearMatches={near} onPick={pickQuery} onBrowse={seeAll} />;
  } else if (!search.hits.length) {
    body = <ResultsSkeleton />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <AllResults groups={search.groups} query={search.query} deps={deps} onSeeAll={seeAll} />
        {search.loading && <ResultsSkeleton />}
        <AskKellyRow query={search.query} />
      </div>
    );
  }

  const showKellyUnder = typed && category !== 'all' && category !== 'exercises' && search.settled;

  return (
    <div className="min-h-[100dvh] bg-[#f8fafc] text-[#171717]" dir="rtl" style={{ paddingBottom: keyboardOpen ? 16 : '5rem', colorScheme: 'light' }}>
      <h1 className="sr-only">{t('search.title')}</h1>
      <AppHeader zIndex={30}>
        <div className="mx-auto flex max-w-md flex-col gap-2.5 px-4 pb-2.5" dir="rtl">
          <SearchField
            ref={inputRef}
            value={query}
            onChange={setQuery}
            onSubmit={() => { if (typed) addRecent(query); inputRef.current?.blur(); }}
            placeholder={t(`search.placeholder.${category}`)}
            active={typed}
          />
          <CategoryChips value={category} onChange={setCategory} counts={typed && search.query ? search.counts : null} />
        </div>
      </AppHeader>

      <p className="sr-only" aria-live="polite">
        {typed ? (search.loading ? t('search.live.searching') : t('search.live.results', { count: String(search.counts.all) })) : ''}
      </p>

      <div className={`mx-auto max-w-md ${category === 'exercises' ? '' : 'px-4 pt-3'}`}>
        {body}
        {showKellyUnder && <div className="mt-4"><AskKellyRow query={search.query} /></div>}
      </div>

      <CommunityDrawers actions={actions} />
      {category !== 'exercises' && <ExerciseDetailSheet />}
      {article && <ArticleReader article={article} onClose={() => setArticle(null)} />}
    </div>
  );
}

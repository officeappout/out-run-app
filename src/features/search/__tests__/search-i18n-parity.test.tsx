/**
 * i18n wave 2 (library namespace): the unified search screen's copy moves to
 * src/messages/he/library.json. The snapshots below were recorded from the
 * components BEFORE the extraction; the extracted components must render
 * byte-identical Hebrew markup in every state a static render reaches: the
 * screen shell per chip (placeholder, live region), empty state, no results,
 * every chip view (empty and with hits), every card, the map rows.
 *
 * React's text-node separators (<!-- -->) are dropped before comparing: a
 * `{n} תוצאות` JSX pair becomes one `t()` string, which renders the same text
 * without the separator.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const nav = vi.hoisted(() => ({ params: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(nav.params),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="lazy" /> }));
vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/bunny/bunny.config', () => ({ buildBunnyThumbnailUrl: (id: string) => `https://cdn.example/${id}/thumbnail.jpg` }));
vi.mock('@/features/content/exercises/client/components/ExerciseImageCard', () => ({ default: () => <div data-testid="exercise-card" /> }));
vi.mock('@/features/content/exercises/client/components/ExerciseDetailSheet', () => ({ default: () => null }));
vi.mock('@/features/content/exercises/client/store/useExerciseLibraryStore', () => ({
  useExerciseLibraryStore: Object.assign((sel: (s: unknown) => unknown) => sel({ openDetail: () => {} }), { getState: () => ({ setQuery: () => {}, setMuscles: () => {}, filters: { muscles: [] } }) }),
}));
vi.mock('@/features/content/exercises/core/exercise.service', () => ({ getAllExercisesCached: async () => [] }));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: async () => [] }));
vi.mock('@/features/parks/core/services/inventory.service', () => ({ getCachedOfficialRoutes: async () => [] }));
vi.mock('@/lib/content-items/client', () => ({ fetchPublishedContent: async () => [] }));
vi.mock('@/lib/app-help/loader', () => ({ loadHelpEntries: async () => [] }));
vi.mock('@/features/user/onboarding/services/tour-replay', () => ({ requestTourReplay: () => '/home' }));
vi.mock('@/features/social/store/useSocialStore', () => ({
  useSocialStore: (sel: (s: unknown) => unknown) => sel({ following: [], isLoaded: true, loadConnections: () => {} }),
}));
vi.mock('@/features/social/services/user-search.service', () => ({ getUsersByUids: async () => [], searchUsersByName: async () => [] }));
vi.mock('@/components/ui/AppHeader', () => ({ default: ({ children }: { children: React.ReactNode }) => <header>{children}</header> }));
vi.mock('@/hooks/useKeyboardInset', () => ({ useKeyboardInset: () => ({ isOpen: false }) }));

const screen = vi.hoisted(() => ({
  search: { query: '', hits: [] as unknown[], groups: [] as unknown[], counts: { all: 0, exercises: 0, parks: 0, routes: 0, social: 0, events: 0, articles: 0, help: 0 }, loading: false, settled: false },
}));
const CTX = { uid: 'u1', ageGroup: 'adult' as const, pos: null, groups: [], myGroups: [], events: [], hasCityAccess: true };
vi.mock('../hooks/useSearchContext', () => ({ useSearchContext: () => CTX }));
vi.mock('../hooks/useUnifiedSearch', () => ({ useUnifiedSearch: () => screen.search }));
vi.mock('../hooks/useSearchRecents', () => ({ useSearchRecents: () => ({ recents: ['בטן'], add: () => {}, clear: () => {} }) }));
vi.mock('../hooks/useNearMatches', () => ({ useNearMatches: () => [] }));
vi.mock('../components/CommunityDrawers', () => ({ default: () => null }));

import UnifiedSearchScreen from '../components/UnifiedSearchScreen';
import EmptyState from '../components/EmptyState';
import NoResults from '../components/NoResults';
import AskKellyRow from '../components/AskKellyRow';
import CategoryChips from '../components/CategoryChips';
import SearchField from '../components/SearchField';
import ArticleReader from '../components/ArticleReader';
import AllResults from '../components/results/AllResults';
import ArticlesTab from '../components/tabs/ArticlesTab';
import EventsTab from '../components/tabs/EventsTab';
import HelpTab from '../components/tabs/HelpTab';
import PlacesTab from '../components/tabs/PlacesTab';
import SocialTab from '../components/tabs/SocialTab';
import PlaceRow from '../components/cards/PlaceRow';
import PersonCard from '../components/cards/PersonCard';
import GroupResultCard from '../components/cards/GroupResultCard';
import EventResultCard from '../components/cards/EventResultCard';
import MapQuickChips from '../components/map/MapQuickChips';
import MapSearchAllRow from '../components/map/MapSearchAllRow';
import { situationSuggestions } from '../core/situations';
import { groupHits } from '../core/grouping';
import { rankRoutes } from '../providers/places';
import type { SearchHit } from '../core/types';
import type { HitViewDeps } from '../components/results/HitGroupView';

const NOW = new Date('2026-10-21T09:00:00');
const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '');
const snap = (name: string) => `./__snapshots__/search-i18n/${name}.html`;

const deps: HitViewDeps = {
  actions: { joinedGroupIds: new Set(['g2']), joinedEventIds: new Set(['e2']), joiningId: null, setSelectedGroup: noop, setSelectedEvent: noop, joinGroup: async () => {}, joinEvent: async () => {} } as never,
  openArticle: noop,
};

const article = (id: string, title: string, category = 'strength', cover: unknown = { video: 'vid-1' }) =>
  ({ id, type: 'article', slug: id, title, excerpt: 'תקציר', author: 'צוות OUT', date: '2026-10-01', body: [{ type: 'p', text: 'פסקה' }, { type: 'tip', text: 'טיפ' }, { type: 'list', items: ['א', 'ב'] }], category, cover, readMin: 4, tags: [] }) as never;
const group = (id: string, name: string, over: Record<string, unknown> = {}) =>
  ({ id, name, description: '', category: 'running', memberCount: 12, scheduleSlots: [{ dayOfWeek: 2, time: '19:30', frequency: 'weekly' }], meetingLocation: { address: 'פלורנטין' }, ...over }) as never;
const event = (id: string, name: string, over: Record<string, unknown> = {}) =>
  ({ id, name, description: '', category: 'race', date: new Date('2026-10-24T08:00:00'), startTime: '08:00', location: { address: 'נמל' }, maxParticipants: 30, currentRegistrations: 10, isActive: true, ...over }) as never;
const parkHit = { kind: 'park', key: 'park:1', id: '1', title: 'גינת הירקון', subtitle: 'תל אביב', score: 60, distanceKm: 0.4 } as const;
const routeHits = rankRoutes([{ id: 'r1', name: 'טבעת הירקון', city: 'תל אביב', distance: 7.4, path: [[34.79, 32.09]] }] as never, 'הירקון', { lat: 32.08, lng: 34.78 });

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe('unified search — Hebrew markup unchanged by the i18n extraction', () => {
  for (const cat of ['all', 'exercises', 'parks', 'routes', 'social', 'events', 'articles', 'help'] as const) {
    it(`screen · chip ${cat}, empty query`, async () => {
      nav.params = cat === 'all' ? '' : `cat=${cat}`;
      screen.search = { ...screen.search, query: '', settled: false, loading: false };
      await expect(html(<UnifiedSearchScreen />)).toMatchFileSnapshot(snap(`screen-${cat}`));
    });
  }
  it('screen · typed, loading', async () => {
    nav.params = 'q=בטן';
    screen.search = { ...screen.search, query: 'בטן', loading: true, settled: false };
    await expect(html(<UnifiedSearchScreen />)).toMatchFileSnapshot(snap('screen-typed-loading'));
  });
  it('screen · typed, results', async () => {
    nav.params = 'q=הירקון';
    const hits = [parkHit, ...routeHits] as SearchHit[];
    const groups = groupHits(hits);
    screen.search = { query: 'הירקון', hits, groups, counts: { all: 2, exercises: 0, parks: 1, routes: 1, social: 0, events: 0, articles: 0, help: 0 }, loading: false, settled: true };
    await expect(html(<UnifiedSearchScreen />)).toMatchFileSnapshot(snap('screen-typed-results'));
  });

  it('empty state · every situation', async () => {
    const inputs = [
      { hour: 9, parksWithin1Km: 1, eventsThisWeek: 1, groupsNearby: 0 },
      { hour: 19, parksWithin1Km: 3, eventsThisWeek: 4, groupsNearby: 0 },
      { hour: 19, parksWithin1Km: 0, eventsThisWeek: 0, groupsNearby: 5 },
    ];
    const arts = [article('a1', 'בטן חזקה'), article('a2', 'ריצה ראשונה', 'running', { illustration: 'map' })];
    await expect(html(
      <>
        {inputs.map((inp, i) => (
          <EmptyState key={i} recents={i === 0 ? ['בטן', 'מתח'] : []} onRecent={noop} onClearRecents={noop} situations={situationSuggestions(inp)} onSituation={noop} articles={i === 0 ? arts : []} onArticle={noop} onAllArticles={noop} />
        ))}
      </>,
    )).toMatchFileSnapshot(snap('empty-state'));
  });
  it('no results · with and without near matches', async () => {
    await expect(html(<NoResults query="פרנט" category="all" nearMatches={['פרונט ליבר']} onPick={noop} onBrowse={noop} />)).toMatchFileSnapshot(snap('no-results-near'));
    await expect(html(<NoResults query="xyz" category="all" nearMatches={[]} onPick={noop} onBrowse={noop} />)).toMatchFileSnapshot(snap('no-results'));
  });
  it('ask Kelly row · with and without a query', async () => {
    await expect(html(<><AskKellyRow /><AskKellyRow query="איך עושים מתח" /></>)).toMatchFileSnapshot(snap('ask-kelly'));
  });
  it('chips + field', async () => {
    const counts = { all: 14, exercises: 8, parks: 0, routes: 0, social: 1, events: 0, articles: 2, help: 3 };
    await expect(html(<><CategoryChips value="all" onChange={noop} counts={counts} /><SearchField value="בטן" onChange={noop} onSubmit={noop} placeholder="x" active /></>)).toMatchFileSnapshot(snap('chips-field'));
  });
  it('article reader', async () => {
    await expect(html(<ArticleReader article={article('a1', 'בטן חזקה')} onClose={noop} />)).toMatchFileSnapshot(snap('article-reader'));
  });
  it('all results', async () => {
    const hits = [parkHit, { ...parkHit, key: 'park:2', id: '2' }, { ...parkHit, key: 'park:3', id: '3' }, { ...parkHit, key: 'park:4', id: '4' }, ...routeHits] as SearchHit[];
    await expect(html(<AllResults groups={groupHits(hits)} query="הירקון" deps={deps} onSeeAll={noop} />)).toMatchFileSnapshot(snap('all-results'));
  });

  it('articles tab · loading, empty, none matched, list with categories', async () => {
    await expect(html(<ArticlesTab query="" articles={[]} loading={false} onOpen={noop} />)).toMatchFileSnapshot(snap('articles-empty'));
    await expect(html(<ArticlesTab query="zzz" articles={[article('a1', 'בטן חזקה')]} loading={false} onOpen={noop} />)).toMatchFileSnapshot(snap('articles-none'));
    await expect(html(<ArticlesTab query="" articles={[article('a1', 'בטן חזקה'), article('a2', 'ריצה', 'running')]} loading={false} onOpen={noop} />)).toMatchFileSnapshot(snap('articles-list'));
  });
  it('events tab · empty (browse + query) and a list', async () => {
    await expect(html(<EventsTab query="" hits={[]} ctx={CTX} deps={deps} />)).toMatchFileSnapshot(snap('events-empty'));
    await expect(html(<EventsTab query="zzz" hits={[]} ctx={CTX} deps={deps} />)).toMatchFileSnapshot(snap('events-none'));
    const evs = [event('e1', 'מרוץ הלילה'), event('e2', 'סדנת מתח', { category: 'workshop', maxParticipants: undefined }), event('e3', 'אירוע', { category: 'mystery', date: undefined })];
    await expect(html(<EventsTab query="" hits={[]} ctx={{ ...CTX, events: evs }} deps={deps} />)).toMatchFileSnapshot(snap('events-list'));
  });
  it('help tab · loading, browse, none matched', async () => {
    await expect(html(<HelpTab query="" corpus={null} />)).toMatchFileSnapshot(snap('help-loading'));
    const corpus = { articles: [], faq: [{ id: 'f', q: 'מה זה OUT?', a: ['אפליקציה'], tags: [], topic: 'x' }], help: [{ id: 'h', q: 'איך מזיזים אימון?', a: ['בלו״ז'], tags: [], topic: 'x' }] };
    await expect(html(<HelpTab query="" corpus={corpus} />)).toMatchFileSnapshot(snap('help-browse'));
    await expect(html(<HelpTab query="zzz" corpus={corpus} />)).toMatchFileSnapshot(snap('help-none'));
  });
  it('places tab · no location (parks / routes) and query hits', async () => {
    await expect(html(<><PlacesTab kind="parks" query="" hits={[]} loading={false} pos={null} deps={deps} /><PlacesTab kind="routes" query="" hits={[]} loading={false} pos={null} deps={deps} /></>)).toMatchFileSnapshot(snap('places-no-location'));
    await expect(html(<PlacesTab kind="routes" query="הירקון" hits={routeHits as SearchHit[]} loading={false} pos={null} deps={deps} />)).toMatchFileSnapshot(snap('places-hits'));
  });
  it('social tab · groups empty (no access / access / query), groups list', async () => {
    await expect(html(<SocialTab query="" hits={[]} loading={false} ctx={{ ...CTX, hasCityAccess: false }} deps={deps} />)).toMatchFileSnapshot(snap('social-empty-no-access'));
    await expect(html(<SocialTab query="" hits={[]} loading={false} ctx={CTX} deps={deps} />)).toMatchFileSnapshot(snap('social-empty'));
    await expect(html(<SocialTab query="zzz" hits={[]} loading={false} ctx={CTX} deps={deps} />)).toMatchFileSnapshot(snap('social-none'));
    const ctx = { ...CTX, groups: [group('g1', 'רצי פלורנטין'), group('g2', 'כוח בגינה', { category: 'calisthenics', memberCount: undefined }), group('g3', '!!', { category: 'unknown', scheduleSlots: [] })] };
    await expect(html(<SocialTab query="" hits={[]} loading={false} ctx={ctx} deps={deps} />)).toMatchFileSnapshot(snap('social-groups'));
  });
  it('cards · place, person, group (joined / joining), event (joined / joining)', async () => {
    await expect(html(
      <>
        <PlaceRow hit={parkHit} query="הירקון" onOpen={noop} />
        <PlaceRow hit={{ ...parkHit, distanceKm: 3.25 }} onOpen={noop} />
        <PlaceRow hit={{ ...parkHit, distanceKm: null }} onOpen={noop} />
        {routeHits.map((h) => <PlaceRow key={h.key} hit={h} onOpen={noop} />)}
        <PersonCard person={{ uid: 'p1', name: 'נועה לוי', currentLevel: 7 } as never} query="נועה" />
        <PersonCard person={{ uid: 'p2', name: 'איתי', fitnessLevel: 'מתחיל' } as never} />
        <PersonCard person={{ uid: 'p3', name: 'דנה' } as never} />
        <GroupResultCard group={group('g1', 'רצי פלורנטין')} distanceKm={0.8} variant="feature" joined={false} joining={false} onOpen={noop} onJoin={noop} />
        <GroupResultCard group={group('g2', 'כוח', { category: 'yoga' })} distanceKm={12} joined joining={false} onOpen={noop} onJoin={noop} />
        <GroupResultCard group={group('g3', 'x', { category: 'walking' })} distanceKm={null} joined={false} joining onOpen={noop} onJoin={noop} />
        <EventResultCard event={event('e1', 'מרוץ הלילה')} distanceKm={2} joined={false} joining={false} onOpen={noop} onJoin={noop} />
        <EventResultCard event={event('e2', 'יום כושר', { category: 'fitness_day' })} distanceKm={null} joined joining={false} onOpen={noop} onJoin={noop} />
        <EventResultCard event={event('e3', 'מפגש', { category: 'community_meetup' })} distanceKm={null} joined={false} joining onOpen={noop} onJoin={noop} />
      </>,
    )).toMatchFileSnapshot(snap('cards'));
  });
  it('map rows · quick chips, search-all with and without a query', async () => {
    await expect(html(<><MapQuickChips chips={['gyms', 'routes']} active="gyms" onToggle={noop} /><MapSearchAllRow query="" /><MapSearchAllRow query="מתח" /></>)).toMatchFileSnapshot(snap('map-rows'));
  });
});

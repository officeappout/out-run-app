/**
 * i18n wave 2 batch v (namespace `community`, keys `communityPage.*`): snapshots of the /community
 * page's own surfaces (src/app/community/_components — top tabs, drawers' sheet title, feed tab,
 * leagues tab v1 + v2, segments, contribution / setup / invite cards, axis chooser), recorded BEFORE
 * the extraction from unmodified origin/main.
 *
 * Static markup (react-dom/server). Every child that lives outside this folder (the arena widgets,
 * the overlays, the board sheets / toggle / selector button) is a prop-printing stub, so the Hebrew
 * this folder PASSES DOWN (scope labels, sheet titles, toggle options, league card names, the
 * filter label) is pinned too, not only the text it renders itself.
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text
 * nodes; not rendered text).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/features/arena/services/ranking.service', () => ({
  formatPaceSecPerKm: (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`,
}));
vi.mock('@/app/community/CommunityWidgets', async () => {
  const { stub } = await import('./community-stub');
  return ({
  CommunityCircles: stub('CommunityCircles'),
  FeedPostCard: stub('FeedPostCard'),
  GroupCard: stub('GroupCard'),
  LeagueCarousel: stub('LeagueCarousel'),
  CityArenaView: stub('CityArenaView'),
  NeighborhoodLeaderboard: stub('NeighborhoodLeaderboard'),
  UnitLeagueTable: stub('UnitLeagueTable'),
  GroupLeaderboard: stub('GroupLeaderboard'),
  ScopeCompetitionLeaderboard: stub('ScopeCompetitionLeaderboard'),
  ScopeBattleCard: stub('ScopeBattleCard'),
  NationalLeagueBoard: stub('NationalLeagueBoard'),
  GroupLeagueStatsBoard: stub('GroupLeagueStatsBoard'),
  InviteBonusCard: stub('InviteBonusCard'),
  CityChallengeCard: stub('CityChallengeCard'),
  MunicipalPressureCard: stub('MunicipalPressureCard'),
  SchoolOutreachCard: stub('SchoolOutreachCard'),
});
});
vi.mock('@/app/community/CommunityOverlays', async () => {
  const { stub } = await import('./community-stub');
  return ({
  GroupDetailsDrawer: stub('GroupDetailsDrawer'),
  SessionDrawer: stub('SessionDrawer'),
  PostJoinSuccessDrawer: stub('PostJoinSuccessDrawer'),
  CreateGroupWizard: stub('CreateGroupWizard'),
  PlannedActivityComposeSheet: stub('PlannedActivityComposeSheet'),
  LeagueFilterSheet: stub('LeagueFilterSheet'),
});
});
vi.mock('@/features/arena/components/LeagueBoardSheets', async () => {
  const { stub } = await import('./community-stub');
  return ({
  BoardSheet: stub('BoardSheet'),
  ScopePointsContent: stub('ScopePointsContent'),
});
});
vi.mock('@/features/arena/components/LeagueBoard', async () => {
  const { stub } = await import('./community-stub');
  return ({ BoardToggle: stub('BoardToggle') });
});
vi.mock('@/features/arena/components/LeaguesTabChrome', async () => {
  const { stub } = await import('./community-stub');
  return ({ LeagueSelectorButton: stub('LeagueSelectorButton') });
});
vi.mock('@/features/user/onboarding/services/first-run-tour', () => ({
  FIRST_RUN_COACH: { communityLeague: 'community-league', communityInvite: 'community-invite' },
}));
vi.mock('@/app/community/_components/feed/FeedShareBlock', async () => {
  const { stub } = await import('./community-stub');
  return ({ FeedShareBlock: stub('FeedShareBlock') });
});

import { CommunityTopTabs } from '../CommunityTopTabs';
import { CommunityDrawers } from '../CommunityDrawers';
import { FeedEmptyState } from '../feed/FeedEmptyState';
import { FeedFilterBar } from '../feed/FeedFilterBar';
import { FeedTab, type FeedTabProps } from '../feed/FeedTab';
import { LeaguesTab } from '../leagues/LeaguesTab';
import { LeaguesTabV2 } from '../leagues/LeaguesTabV2';
import { ScopeContributionCard } from '../leagues/ScopeContributionCard';
import { NeighborhoodSetupCTA } from '../leagues/NeighborhoodSetupCTA';
import { NeighborhoodInviteCTA } from '../leagues/NeighborhoodInviteCTA';
import { GroupAxisChooser } from '../leagues/GroupAxisChooser';
import type { LeaguesVM } from '../leagues/leagues-vm';

const NOW = new Date('2026-10-15T12:00:00'); // a Thursday → the week closes in 2 days
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/community-components-i18n/${name}.html`;
const noop = () => {};

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });

type Dict = Record<string, unknown>;
const ACCESS: Dict = {
  isLoading: false, hasCityAccess: true, cityName: 'חיפה', cityAuthorityId: 'haifa', hasNeighborhoodAccess: true,
  neighborhoodAuthorityId: 'hood1', orgType: null, orgName: null, orgId: null, preferredParkId: null,
  preferredParkName: null, hasReserveAccess: false, hasUnitLeagueAccess: false, ageGroup: 'adult',
};
const vmOf = (over: Dict = {}, accessOver: Dict = {}, flagsOver: Dict = {}): LeaguesVM => ({
  featureFlags: { enableHomeV2: false, ...flagsOver },
  access: { ...ACCESS, ...accessOver },
  authority: { id: 'haifa', name: 'חיפה', logoUrl: 'https://x/l.png', userCount: 420 },
  isLeagueActive: true,
  arenaLoading: false,
  groups: [{ id: 'g1', name: 'קליסטניקס', category: 'calisthenics' }, { id: 'g2', name: 'ריצה', category: 'running' }],
  myDeclaration: { isReserve: false, orgId: 'org1', unitPathIds: ['u1'] },
  router: { push: noop },
  socialGroups: [{ id: 's1', name: 'משפחה', groupType: 'family', memberCount: 1234 }, { id: 's2', name: 'חברים', groupType: 'friends' }],
  selectedLeague: 'global', setSelectedLeague: noop, leagueSheetOpen: false, setLeagueSheetOpen: noop,
  leaderboardCategory: 'overall', setLeaderboardCategory: noop, leaderboardTimeWindow: 'weekly',
  setLeaderboardTimeWindow: noop, leaderboardGender: 'all', setLeaderboardGender: noop,
  activeMyEntry: null, setActiveMyEntry: noop, activeMyMode: 'general', activeMyIsSegment: false,
  handleMyModeChange: noop, activeScopeEntry: null, setActiveScopeEntry: noop,
  competitionMode: 'individual', setCompetitionMode: noop,
  cityGroupAxis: 'neighborhood', setCityGroupAxis: noop, globalGroupAxis: 'city', setGlobalGroupAxis: noop,
  myScopeKm: null, myScopeKmGranularity: 'neighborhood', myScopeKmKey: 'k',
  leagueTabV2: 'people', setLeagueTabV2: noop, hoodScopeV2: 'city', setHoodScopeV2: noop,
  scopePointsOpen: false, setScopePointsOpen: noop, groupWalkOpen: false, setGroupWalkOpen: noop,
  leagueFilterSheetOpen: false, setLeagueFilterSheetOpen: noop, axisMenuOpen: false, setAxisMenuOpen: noop,
  ...over,
} as unknown as LeaguesVM);

const SCOPE_ENTRY = { scopeId: 'hood1', scopeName: 'נווה שאנן', rank: 3, totalCredit: 99 };
const MY_ENTRY = { rank: 7, uid: 'me', name: 'דנה', totalCredit: 1234, workoutCount: 3, isCurrentUser: true };

describe('top tabs + drawers', () => {
  it.each([
    ['leagues-first', { leaguesFirst: true, isFeedTabAvailable: true, enableLeagues: true, topTab: 'leagues' }],
    ['feed-first', { leaguesFirst: false, isFeedTabAvailable: true, enableLeagues: true, topTab: 'feed' }],
    ['feed-only', { leaguesFirst: false, isFeedTabAvailable: true, enableLeagues: false, topTab: 'feed' }],
  ] as const)('top tabs %s', async (name, p) => {
    await expect(html(<CommunityTopTabs setTopTab={noop} {...p} />)).toMatchFileSnapshot(snap(`top-tabs-${name}`));
  });

  it.each([false, true])('drawers, v2=%s', async (v2) => {
    const overlays = {
      selectedGroup: null, setSelectedGroup: noop, selectedEvent: null, setSelectedEvent: noop,
      joinedGroupIds: new Set(), joinedEventIds: new Set(), joiningId: null, successData: null, setSuccessData: noop,
      wizardOpen: false, setWizardOpen: noop, editGroupId: null, setEditGroupId: noop,
    };
    const el = (
      <CommunityDrawers
        overlays={overlays as never}
        actions={{} as never}
        userId="me"
        openChat={noop}
        enableHomeV2={v2}
        scopePointsOpen
        setScopePointsOpen={noop}
        groupWalkOpen={false}
        setGroupWalkOpen={noop}
      />
    );
    await expect(html(el)).toMatchFileSnapshot(snap(`drawers-v${v2 ? 2 : 1}`));
  });
});

describe('feed', () => {
  it.each([false, true])('empty state, v2=%s', async (v2) => {
    await expect(html(<FeedEmptyState v2={v2} onFindPartners={noop} />)).toMatchFileSnapshot(snap(`feed-empty-v${v2 ? 2 : 1}`));
  });

  it.each(['all', 'partners', 'neighborhood', 'groups'] as const)('filter bar, %s', async (f) => {
    await expect(html(<FeedFilterBar feedFilter={f} setFeedFilter={noop} setPrivacyOpen={noop} onFindPartners={noop} />))
      .toMatchFileSnapshot(snap(`feed-filter-${f}`));
  });

  const feedProps = (over: Partial<FeedTabProps> = {}, v2 = true): FeedTabProps => ({
    featureFlags: { enableHomeV2: v2 } as never,
    profile: { core: { neighborhoodId: 'hood1' }, social: { groupIds: ['g1'] } },
    userId: 'me',
    share: { pendingShare: null, setPrivacyOpen: noop } as never,
    feedPrefs: {} as never,
    feedFilter: 'all',
    setFeedFilter: noop,
    posts: [],
    setPosts: noop,
    loadingPosts: false,
    fetchPosts: async () => {},
    following: Array.from({ length: 1234 }, (_, i) => `u${i}`),
    isPartner: (uid) => uid === 'p1',
    setSelectedGroup: noop,
    handleCreatePress: noop,
    refreshProfile: undefined,
    router: { push: noop } as never,
    ...over,
  });
  const POSTS = [
    { id: 'a', authorUid: 'p1', neighborhoodId: 'x', groupIds: [] },
    { id: 'b', authorUid: 'zz', neighborhoodId: 'hood1', groupIds: [] },
  ] as never;

  it.each([false, true])('feed tab loading / empty / posts, v2=%s', async (v2) => {
    const loading = html(<FeedTab {...feedProps({ loadingPosts: true }, v2)} />);
    const empty = html(<FeedTab {...feedProps({}, v2)} />);
    const posts = html(<FeedTab {...feedProps({ posts: POSTS, following: ['p1'] }, v2)} />);
    const filteredEmpty = html(<FeedTab {...feedProps({ posts: POSTS, feedFilter: 'groups' }, v2)} />);
    await expect([loading, empty, posts, filteredEmpty].join('\n')).toMatchFileSnapshot(snap(`feed-tab-v${v2 ? 2 : 1}`));
  });
});

describe('leagues tab (v1 chrome; the v2 "people" tab renders it too)', () => {
  const cases: Array<[string, Dict, Dict?]> = [
    ['global', {}],
    ['global-group-city-axis', { competitionMode: 'group', globalGroupAxis: 'city', activeScopeEntry: SCOPE_ENTRY }],
    ['global-group-group-axis', { competitionMode: 'group', globalGroupAxis: 'group', axisMenuOpen: true }],
    ['sheet-open', { leagueSheetOpen: true, selectedLeague: 'city', activeMyEntry: MY_ENTRY, leaderboardCategory: 'cardio', leaderboardTimeWindow: 'daily' },
      { orgType: 'work', orgName: 'אינטל', hasReserveAccess: true, preferredParkId: 'p1', preferredParkName: 'גן' }],
    ['sheet-org-university', { leagueSheetOpen: true, leaderboardCategory: 'strength', leaderboardTimeWindow: 'monthly' }, { orgType: 'university', hasCityAccess: false }],
    ['sheet-org-youth', { leagueSheetOpen: true }, { orgType: 'youth_movement' }],
    ['sheet-org-school', { leagueSheetOpen: true }, { orgType: 'school' }],
    ['city-loading', { selectedLeague: 'city', arenaLoading: true }],
    ['city-inactive', { selectedLeague: 'city', isLeagueActive: false }],
    ['city-inactive-no-name', { selectedLeague: 'city', isLeagueActive: false }, { cityName: null }],
    ['city-individual', { selectedLeague: 'city' }],
    ['city-group-hood', { selectedLeague: 'city', competitionMode: 'group', activeScopeEntry: SCOPE_ENTRY, axisMenuOpen: true }],
    ['city-group-no-hood', { selectedLeague: 'city', competitionMode: 'group' }, { hasNeighborhoodAccess: false }],
    ['city-group-group-axis', { selectedLeague: 'city', competitionMode: 'group', cityGroupAxis: 'group', leaderboardGender: 'female' }],
    ['org-work', { selectedLeague: 'org' }, { orgType: 'work', orgId: 'o1' }],
    ['org-youth', { selectedLeague: 'org', competitionMode: 'group' }, { orgType: 'youth_movement' }],
    ['org-school', { selectedLeague: 'org' }, { orgType: 'school', orgName: 'אורט' }],
    ['park-none', { selectedLeague: 'park' }],
    ['park', { selectedLeague: 'park' }, { preferredParkId: 'p1' }],
    ['park-named', { selectedLeague: 'park' }, { preferredParkId: 'p1', preferredParkName: 'גן מאיר' }],
    ['reserve-individual', { selectedLeague: 'reserve' }],
    ['reserve-group', { selectedLeague: 'reserve', competitionMode: 'group' }, { hasUnitLeagueAccess: true }],
    ['league-group', { selectedLeague: 'league_s1' }],
  ];
  it.each([false, true])('all cases, v2=%s', async (v2) => {
    for (const [name, over, acc] of cases) {
      await expect(html(<LeaguesTab vm={vmOf(over, acc, { enableHomeV2: v2 })} />))
        .toMatchFileSnapshot(snap(`leagues-${name}-v${v2 ? 2 : 1}`));
    }
  });
});

describe('leagues tab v2', () => {
  const cases: Array<[string, Dict, Dict?]> = [
    ['people', {}],
    ['hoods-city', { leagueTabV2: 'neighborhoods', activeScopeEntry: SCOPE_ENTRY }],
    ['hoods-city-no-hood', { leagueTabV2: 'neighborhoods' }, { hasNeighborhoodAccess: false, cityName: null }],
    ['hoods-city-no-authority', { leagueTabV2: 'neighborhoods', authority: null }],
    ['hoods-national', { leagueTabV2: 'neighborhoods', hoodScopeV2: 'national' }],
    ['settlements', { leagueTabV2: 'settlements', activeScopeEntry: SCOPE_ENTRY }, { hasUnitLeagueAccess: true }],
    ['settlements-no-authority', { leagueTabV2: 'settlements', authority: null }],
    ['units', { leagueTabV2: 'units', competitionMode: 'group' }, { hasUnitLeagueAccess: true }],
  ];
  it('all cases', async () => {
    for (const [name, over, acc] of cases) {
      await expect(html(<LeaguesTabV2 vm={vmOf(over, acc, { enableHomeV2: true })} />)).toMatchFileSnapshot(snap(`v2-${name}`));
    }
  });

  it.each([
    ['sat', '2026-10-17T12:00:00'],
    ['fri', '2026-10-16T12:00:00'],
    ['sun-jan', '2026-01-18T12:00:00'],
  ])('month + week-closes chips, %s', async (name, iso) => {
    vi.setSystemTime(new Date(iso));
    const out = html(<LeaguesTabV2 vm={vmOf({ leagueTabV2: 'units' }, {}, { enableHomeV2: true })} />);
    vi.setSystemTime(NOW);
    await expect(out).toMatchFileSnapshot(snap(`v2-chips-${name}`));
  });
});

describe('cards', () => {
  it('contribution card, every window / granularity / entry', async () => {
    const out: string[] = [];
    for (const win of ['daily', 'weekly', 'monthly'] as const) {
      for (const gran of ['neighborhood', 'city'] as const) {
        for (const cat of ['overall', 'cardio', 'strength'] as const) {
          out.push(html(
            <ScopeContributionCard
              scopeTypeLabel="השכונה שלך"
              vm={vmOf({
                activeScopeEntry: SCOPE_ENTRY, leaderboardTimeWindow: win, leaderboardCategory: cat,
                myScopeKm: { key: 'k', km: 12.34 }, myScopeKmGranularity: gran,
                activeMyEntry: cat === 'overall' ? null : MY_ENTRY, activeMyMode: cat === 'cardio' ? 'running' : 'strength',
              }, {}, { enableHomeV2: true })}
            />,
          ));
        }
      }
    }
    out.push(html(<ScopeContributionCard scopeTypeLabel="x" vm={vmOf()} />));
    await expect(out.join('\n')).toMatchFileSnapshot(snap('contribution-card'));
  });

  it('setup + invite CTAs', async () => {
    const out = [
      html(<NeighborhoodSetupCTA vm={vmOf()} />),
      html(<NeighborhoodInviteCTA vm={vmOf({ activeScopeEntry: SCOPE_ENTRY })} />),
      html(<NeighborhoodInviteCTA vm={vmOf()} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('ctas'));
  });

  it('axis chooser, every axis / category / window', async () => {
    const out: string[] = [];
    for (const axis of ['city', 'neighborhood', 'group'] as const) {
      for (const [cat, win] of [['overall', 'daily'], ['cardio', 'weekly'], ['strength', 'monthly']] as const) {
        out.push(html(
          <GroupAxisChooser
            vm={vmOf({ leaderboardCategory: cat, leaderboardTimeWindow: win, axisMenuOpen: true })}
            axis={axis}
            setAxis={noop}
            options={['city', 'neighborhood', 'group']}
          />,
        ));
      }
    }
    out.push(html(<GroupAxisChooser vm={vmOf({}, { cityName: null })} axis="neighborhood" setAxis={noop} options={['neighborhood']} />));
    await expect(out.join('\n')).toMatchFileSnapshot(snap('axis-chooser'));
  });
});

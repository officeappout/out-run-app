// @vitest-environment jsdom
/**
 * /community page — split-refactor parity. Recorded from the pre-split
 * 1,967-line page.tsx (the committed snapshot) and must stay byte-identical
 * after the page became a thin composition, in BOTH enable_home_v2 states.
 * Every child surface is a prop-printing stub and every service / router
 * call is logged, so a changed prop, query or call order fails the suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Dict = Record<string, unknown>;

const state = vi.hoisted(() => ({
  flags: {} as Record<string, boolean>,
  flagsLoading: false,
  hydrated: true,
  params: '',
  profile: null as Dict | null,
  access: {} as Dict,
  arena: {} as Dict,
  posts: [] as Dict[],
  pending: null as Dict | null,
  following: [] as string[],
  socialLoaded: true,
  myGroups: [] as Dict[],
  contribution: { totalKm: 12.34 } as Dict | null,
  declaration: { isReserve: false, orgId: null, unitPathIds: [] } as Dict,
}));

const helpers = vi.hoisted(() => () => import('./split-parity-helpers'));

vi.mock('framer-motion', async () => (await helpers()).framerMock);
vi.mock('next/navigation', async () => {
  const { logCall } = await helpers();
  const cache = { key: null as string | null, sp: new URLSearchParams() };
  const router = {
    replace: (...a: unknown[]) => logCall('router.replace', ...a),
    push: (...a: unknown[]) => logCall('router.push', ...a),
  };
  return {
    useRouter: () => router,
    // Stable per URL, like Next's (a fresh object per render would loop effects).
    useSearchParams: () => {
      if (cache.key !== state.params) { cache.key = state.params; cache.sp = new URLSearchParams(state.params); }
      return cache.sp;
    },
  };
});
vi.mock('@/features/user', async () => {
  const { logCall } = await helpers();
  const refreshProfile = async () => logCall('refreshProfile');
  const store = () => ({ profile: state.profile, _hasHydrated: state.hydrated, refreshProfile });
  return {
    useUserStore: (sel?: (s: Dict) => unknown) => (sel ? sel(store()) : store()),
  };
});
vi.mock('@/features/social/store/useSocialStore', async () => {
  const { logCall } = await helpers();
  const loadConnections = (uid: string) => logCall('loadConnections', uid);
  const isPartner = (uid: string) => uid === 'p1';
  return {
    useSocialStore: () => ({ following: state.following, isLoaded: state.socialLoaded, loadConnections, isPartner }),
  };
});
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: state.flags, loading: state.flagsLoading, ready: !state.flagsLoading }),
}));
vi.mock('@/config/feature-flags', () => ({ IS_COMMUNITY_FEED_ENABLED: true }));
vi.mock('@/features/social/services/feed.service', async () => {
  const { logCall } = await helpers();
  return {
    createWorkoutPost: async (...a: unknown[]) => { logCall('createWorkoutPost', ...a); return 'newpost'; },
    getFeedPosts: async (...a: unknown[]) => { logCall('getFeedPosts', ...a); return state.posts.map((p) => ({ ...p })); },
  };
});
vi.mock('@/features/social/services/feed-prefs', async () => {
  const { logCall } = await helpers();
  return {
    applyShareChoice: (p: Dict, c: Dict) => ({ ...p, choice: c }),
    clearPendingShare: () => logCall('clearPendingShare'),
    feedPrefsFrom: (raw: unknown) => ({ audience: 'partners', raw: raw ?? null }),
    readPendingShare: () => (state.pending ? { params: state.pending } : null),
    saveFeedPrefs: async (...a: unknown[]) => logCall('saveFeedPrefs', ...a),
  };
});
vi.mock('@/features/social/components/FeedPublishSheets', async () => {
  const { stub } = await helpers();
  return { FeedPrivacySheet: stub('FeedPrivacySheet'), FeedShareSheet: stub('FeedShareSheet'), SharePromptCard: stub('SharePromptCard') };
});
vi.mock('@/features/arena/hooks/useArenaAccess', () => ({ useArenaAccess: () => state.access }));
vi.mock('@/features/arena/hooks/useHasDeclaredReserveStatus', () => ({ useMyMilitaryDeclaration: () => state.declaration }));
vi.mock('@/features/arena/hooks/usePendingUnitSelfHeal', () => ({ usePendingUnitSelfHeal: () => {} }));
vi.mock('@/features/arena/hooks/useArenaData', () => ({ useArenaData: () => state.arena }));
vi.mock('@/features/social/store/useChatStore', async () => {
  const { logCall } = await helpers();
  const s = { open: () => logCall('chat.open') };
  return { useChatStore: (sel: (x: typeof s) => unknown) => sel(s) };
});
vi.mock('@/features/arena/components/LeagueBoardSheets', async () => {
  const { stub } = await helpers();
  return { BoardSheet: stub('BoardSheet'), ScopePointsContent: stub('ScopePointsContent') };
});
vi.mock('@/features/arena/components/LeagueBoard', async () => {
  const { stub } = await helpers();
  return { BoardToggle: stub('BoardToggle') };
});
vi.mock('@/features/arena/components/LeaguesTabChrome', async () => {
  const { stub } = await helpers();
  return { LeagueSelectorButton: stub('LeagueSelectorButton') };
});
vi.mock('@/app/community/CommunityOverlays', async () => {
  const { stub } = await helpers();
  return {
    FirstRunTour: stub('FirstRunTour'),
    GroupDetailsDrawer: stub('GroupDetailsDrawer'),
    SessionDrawer: stub('SessionDrawer'),
    PostJoinSuccessDrawer: stub('PostJoinSuccessDrawer'),
    CreateGroupWizard: stub('CreateGroupWizard'),
    PlannedActivityComposeSheet: stub('PlannedActivityComposeSheet'),
    LeagueFilterSheet: stub('LeagueFilterSheet'),
    useCommunityOverlayPreload: () => {},
  };
});
vi.mock('@/app/community/CommunityWidgets', async () => {
  const { stub } = await helpers();
  const names = [
    'FeedPostCard', 'GroupCard', 'CommunityCircles', 'LeagueCarousel', 'CityArenaView', 'NeighborhoodLeaderboard',
    'UnitLeagueTable', 'GroupLeaderboard', 'ScopeCompetitionLeaderboard', 'ScopeBattleCard', 'NationalLeagueBoard',
    'GroupLeagueStatsBoard', 'InviteBonusCard', 'CityChallengeCard', 'MunicipalPressureCard', 'SchoolOutreachCard',
  ];
  return Object.fromEntries(names.map((n) => [n, stub(n)]));
});
vi.mock('@/features/arena/services/ranking.service', async () => {
  const { logCall } = await helpers();
  return {
    getMyLeagueContribution: async (...a: unknown[]) => { logCall('getMyLeagueContribution', ...a); return state.contribution; },
    formatPaceSecPerKm: (s: number) => `pace:${s}`,
  };
});
vi.mock('@/features/arena/services/group.service', async () => {
  const { logCall } = await helpers();
  return {
    joinGroup: async (...a: unknown[]) => logCall('joinGroup', ...a),
    leaveGroup: async (...a: unknown[]) => logCall('leaveGroup', ...a),
    getMyGroups: async (...a: unknown[]) => { logCall('getMyGroups', ...a); return state.myGroups; },
  };
});
vi.mock('@/features/admin/services/community.service', async () => {
  const { logCall } = await helpers();
  return { joinEvent: async (...a: unknown[]) => logCall('joinEvent', ...a) };
});
vi.mock('@/features/user/scheduling/services/communitySchedule.service', async () => {
  const { logCall } = await helpers();
  return { addCommunitySessionsToPlanner: async (...a: unknown[]) => logCall('addCommunitySessionsToPlanner', ...a) };
});
vi.mock('@/components/ui/AppHeader', async () => {
  const { stub } = await helpers();
  return { default: stub('AppHeader') };
});

import CommunityPage from '@/app/community/page';
import {
  mount, unmount, snapshot, resetHarness, clickButton, clickSelector, callProp, registry, flush,
} from './split-parity-helpers';
import { act } from 'react';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}

const GROUPS = [
  {
    id: 'g1', name: 'רצים בפארק', category: 'running', groupType: 'neighborhood', createdBy: 'u9',
    scheduleSlots: [{ dayOfWeek: 2, time: '19:00', frequency: 'weekly' }], meetingLocation: { address: 'פארק הירקון' },
  },
  { id: 'g2', name: 'כושר בבית ספר', category: 'calisthenics', schedule: { dayOfWeek: 4, time: '07:00', frequency: 'weekly' } },
  { id: 'g3', name: 'אחרים', category: 'other' },
];
const EVENTS = [{ id: 'e1', name: 'מרוץ העיר', category: 'race' }];
const POSTS = [
  { id: 'p-a', authorUid: 'u2', createdAt: new Date('2026-10-10T10:00:00Z'), neighborhoodId: 'n1', groupIds: ['g1'] },
  { id: 'p-b', authorUid: 'p1', createdAt: new Date('2026-10-09T10:00:00Z'), neighborhoodId: 'n2', groupIds: [] },
  { id: 'p-c', authorUid: 'u3', createdAt: new Date('2026-10-11T10:00:00Z') },
];

function reset(v2: boolean) {
  resetHarness();
  state.flags = { enableHomeV2: v2, enableCommunityFeed: true, enableLeagues: true, enableFirstRunTours: true };
  state.flagsLoading = false;
  state.hydrated = true;
  state.params = '';
  state.profile = {
    id: 'u1',
    core: { name: 'דנה', gender: 'female', photoURL: 'https://x/p.jpg', neighborhoodId: 'n1', isSuperAdmin: false },
    social: { groupIds: ['g1', 'g5'], feedPrefs: { audience: 'public' } },
  };
  state.access = {
    isLoading: false,
    cityAuthorityId: 'city1',
    cityName: 'חיפה',
    neighborhoodAuthorityId: 'n1',
    hasCityAccess: true,
    hasNeighborhoodAccess: true,
    hasUnitLeagueAccess: false,
    hasReserveAccess: false,
    orgType: null,
    orgId: null,
    orgName: null,
    preferredParkId: null,
    preferredParkName: null,
    ageGroup: 'adult',
    activeTabs: [{ key: 'global' }, { key: 'city' }],
  };
  state.arena = {
    events: EVENTS,
    groups: GROUPS,
    authority: { id: 'city1', logoUrl: 'https://x/logo.png', userCount: 420 },
    isLeagueActive: true,
    isLoading: false,
  };
  state.posts = POSTS;
  state.pending = null;
  state.following = ['u2', 'p1'];
  state.socialLoaded = true;
  state.myGroups = [
    { id: 'g5', name: 'משפחת כהן', groupType: 'family', memberCount: 5 },
    { id: 'g6', name: 'עבודה', groupType: 'work' },
    { id: 'g7', name: 'חברים', groupType: 'friends' },
    { id: 'g8', name: 'ללא סוג' },
  ];
  state.contribution = { totalKm: 12.34 };
  state.declaration = { isReserve: false, orgId: null, unitPathIds: [] };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-19T09:00:00Z')); // a Monday
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const page = () => mount(<CommunityPage />);

for (const v2 of [false, true]) {
  const label = v2 ? 'enable_home_v2 ON' : 'enable_home_v2 OFF';

  describe(`${label} — byte-identical to the pre-split page`, () => {
    beforeEach(() => reset(v2));

    it('loading guard (flags loading)', async () => {
      state.flagsLoading = true;
      await page();
      expect(snapshot()).toMatchSnapshot();
    });

    // Owner bug 21.10.2026: flags known, access still loading — the v2 skeleton
    // for v2 users (no old loader first), the old loader for flag-off users.
    it('loading guard (access loading, flags known)', async () => {
      state.access = { ...state.access, isLoading: true };
      await page();
      expect(snapshot()).toMatchSnapshot();
    });

    it('both surfaces off → null + redirect home', async () => {
      state.flags.enableCommunityFeed = false;
      state.flags.enableLeagues = false;
      await page();
      expect(snapshot()).toMatchSnapshot();
    });

    it('feed tab: posts, pending share, filters', async () => {
      state.params = 'tab=feed';
      state.pending = { activityCategory: 'cardio', durationMinutes: 30, distanceKm: 5, title: 'ריצה', parkName: 'הירקון', routeShape: null, extra: 1 };
      await page();
      const steps = [snapshot()];
      if (v2) {
        for (const f of ['שותפים', 'השכונה', 'קבוצות']) {
          const tab = Array.from(document.querySelectorAll('[aria-label="סינון הפיד"] [role="tab"]')).find((b) => b.textContent === f);
          await act(async () => { tab!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
          await flush();
          steps.push(snapshot());
        }
        await clickButton('שותפים');
        await clickSelector('[aria-label="מי רואה את הפוסטים שלי"]');
        steps.push(snapshot());
        await callProp('SharePromptCard', 'onShare');
        await callProp('FeedShareSheet', 'onOpenPrivacy');
        steps.push(snapshot());
        await callProp('FeedPrivacySheet', 'onSave', { audience: 'private' });
        await callProp('FeedShareSheet', 'onPublish', { photo: null });
        steps.push(snapshot());
        await callProp('FeedShareSheet', 'onSkip');
        steps.push(snapshot());
      }
      await clickSelector('[aria-label="רענן"]');
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('feed tab: empty feed + loading state', async () => {
      state.params = 'tab=feed';
      state.posts = [];
      await page();
      const steps = [snapshot()];
      if (v2) {
        await clickButton(/מצא שותפים/);
        steps.push(snapshot());
      }
      expect(steps).toMatchSnapshot();
    });

    it('feed tab: delete a post, open a group, join, leave, chat, edit', async () => {
      state.params = 'tab=feed';
      await page();
      await callProp('FeedPostCard', 'onDeleted', 'p-a');
      await callProp('CommunityCircles', 'onGroupClick', GROUPS[0]);
      const steps = [snapshot()];
      await callProp('GroupDetailsDrawer', 'onJoin', 'g1');
      steps.push(snapshot());
      await callProp('PostJoinSuccessDrawer', 'onPlannerPref', true);
      await callProp('PostJoinSuccessDrawer', 'onOpenChat');
      steps.push(snapshot());
      await callProp('GroupDetailsDrawer', 'onLeave', 'g1');
      await callProp('CommunityCircles', 'onGroupClick', GROUPS[1]);
      await callProp('GroupDetailsDrawer', 'onEdit', 'g2');
      steps.push(snapshot());
      await callProp('CreateGroupWizard', 'onSuccess', 'g2');
      await callProp('CreateGroupWizard', 'onClose');
      steps.push(snapshot());
      if (registry.CommunityCircles?.onCreatePress) {
        await callProp('CommunityCircles', 'onCreatePress');
        await callProp('CreateGroupWizard', 'onSuccess', 'gNew');
        steps.push(snapshot());
      }
      expect(steps).toMatchSnapshot();
    });

    it('feed tab: event join through the session drawer', async () => {
      state.params = 'tab=feed';
      await page();
      await callProp('SessionDrawer', 'onJoin', 'e1');
      const steps = [snapshot()];
      await callProp('PostJoinSuccessDrawer', 'onClose');
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('deep links: ?groupId (open) and ?groupId&joined, ?editGroup, ?openCreate', async () => {
      state.params = 'tab=leagues&groupId=g1';
      await page();
      const steps = [snapshot()];
      unmount();
      reset(v2);
      state.params = 'groupId=g2&joined=true';
      await page();
      steps.push(snapshot());
      unmount();
      reset(v2);
      state.params = 'editGroup=g9&tab=feed';
      await page();
      steps.push(snapshot());
      unmount();
      reset(v2);
      state.params = 'openCreate=true';
      await page();
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('incomplete profile → create press goes to onboarding', async () => {
      state.params = 'tab=feed';
      (state.profile!.core as Dict).name = undefined;
      await page();
      if (registry.CommunityCircles?.onCreatePress) await callProp('CommunityCircles', 'onCreatePress');
      expect(snapshot()).toMatchSnapshot();
    });

    it('leagues: city league, individual → groups axis chooser → neighborhood axis', async () => {
      state.params = 'tab=leagues';
      await page();
      const steps = [snapshot()];
      if (registry.CityArenaView) {
        await callProp('CityArenaView', 'onMyEntryChange', { rank: 3, totalCredit: 1234 });
        await callProp('CityArenaView', 'onMyModeChange', 'general', false);
      }
      steps.push(snapshot());
      // the selector sheet
      await callProp('LeagueSelectorButton', 'onOpen');
      steps.push(snapshot());
      await callProp('LeagueCarousel', 'onSelect', 'city');
      if (!v2) {
        await clickButton('קבוצות');
        steps.push(snapshot());
        await clickButton(/^בין קבוצות/);
        steps.push(snapshot());
        await clickButton('שכונות');
        steps.push(snapshot());
        await callProp('ScopeBattleCard', 'onMyScopeEntryChange', { scopeId: 'n1', scopeName: 'נווה שאנן', rank: 2, totalScore: 99 });
        steps.push(snapshot());
        await clickButton(/^בין שכונות/);
        await clickButton('קבוצות', 1);
        steps.push(snapshot());
        await callProp('LeagueFilterSheet', 'onGenderFilterChange', 'female');
        steps.push(snapshot());
      }
      expect(steps).toMatchSnapshot();
    });

    it('leagues: city league not active, and arena loading', async () => {
      state.params = 'tab=leagues';
      state.arena = { ...state.arena, isLeagueActive: false };
      await page();
      const steps = [snapshot()];
      unmount();
      reset(v2);
      state.params = 'tab=leagues';
      state.arena = { ...state.arena, isLoading: true };
      await page();
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('leagues: global (no city access) with groups axis, then a social group league', async () => {
      state.params = 'tab=leagues';
      state.access = { ...state.access, hasCityAccess: false, activeTabs: [{ key: 'global' }, { key: 'league_g5' }] };
      state.arena = { ...state.arena, authority: null };
      await page();
      const steps = [snapshot()];
      if (!v2) {
        await clickButton('קבוצות');
        steps.push(snapshot());
        await callProp('ScopeBattleCard', 'onMyScopeEntryChange', { scopeId: 'city1', scopeName: 'חיפה', rank: 4, totalScore: 50 });
        steps.push(snapshot());
        await clickButton(/^בין ערים/);
        await clickButton('קבוצות', 1);
        steps.push(snapshot());
      }
      await callProp('LeagueSelectorButton', 'onOpen');
      await callProp('LeagueCarousel', 'onSelect', 'league_g5');
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('leagues: org (work + school + youth movement) segment', async () => {
      const steps: string[] = [];
      for (const orgType of ['work', 'school', 'youth_movement', 'university']) {
        reset(v2);
        state.params = 'tab=leagues';
        state.access = {
          ...state.access, hasCityAccess: false, orgType, orgId: 'org1', orgName: orgType === 'school' ? null : 'אורג',
          activeTabs: [{ key: 'org' }, { key: 'global' }],
        };
        await page();
        steps.push(snapshot());
        if (!v2) {
          await clickButton('קבוצות');
          steps.push(snapshot());
        }
        unmount();
      }
      expect(steps).toMatchSnapshot();
    });

    it('leagues: park segment (with and without a park)', async () => {
      const steps: string[] = [];
      for (const park of [null, 'park1']) {
        reset(v2);
        state.params = 'tab=leagues';
        state.access = { ...state.access, preferredParkId: park, preferredParkName: park ? 'גן העיר' : null, activeTabs: [{ key: 'park' }] };
        await page();
        steps.push(snapshot());
        unmount();
      }
      expect(steps).toMatchSnapshot();
    });

    it('leagues: reserve segment (with and without unit access)', async () => {
      const steps: string[] = [];
      for (const unit of [false, true]) {
        reset(v2);
        state.params = 'tab=leagues';
        state.declaration = { isReserve: true, orgId: unit ? 'unit1' : null, unitPathIds: unit ? ['b1', 'u1'] : [] };
        state.access = {
          ...state.access, hasReserveAccess: true, hasUnitLeagueAccess: unit,
          activeTabs: [{ key: 'reserve' }, { key: 'city' }],
        };
        await page();
        await callProp('LeagueSelectorButton', 'onOpen');
        await callProp('LeagueCarousel', 'onSelect', 'reserve');
        steps.push(snapshot());
        if (!v2 && unit) {
          await clickButton('קבוצות');
          steps.push(snapshot());
        }
        unmount();
      }
      expect(steps).toMatchSnapshot();
    });

    if (v2) {
      it('v2 league tabs: neighborhoods (city/national), settlements, units, points sheet, group walk', async () => {
        state.access = { ...state.access, hasUnitLeagueAccess: true, hasReserveAccess: true };
        state.declaration = { isReserve: true, orgId: 'unit1', unitPathIds: ['b1'] };
        await page();
        const steps = [snapshot()];
        await clickButton('שכונות');
        steps.push(snapshot());
        await callProp('ScopeBattleCard', 'onMyScopeEntryChange', { scopeId: 'n1', scopeName: 'נווה שאנן', rank: 2, totalScore: 99 });
        steps.push(snapshot());
        await callProp('ScopeBattleCard', 'onGroupWalk');
        await clickButton(/איך צוברים נקודות/);
        steps.push(snapshot());
        await callProp('BoardSheet', 'onClose');
        await callProp('PlannedActivityComposeSheet', 'onClose');
        await callProp('BoardToggle', 'onChange', 'national');
        steps.push(snapshot());
        await clickButton('יישובים');
        steps.push(snapshot());
        await callProp('ScopeBattleCard', 'onMyScopeEntryChange', { scopeId: 'city1', scopeName: 'חיפה', rank: 5, totalScore: 10 });
        steps.push(snapshot());
        await clickButton('חטיבות');
        steps.push(snapshot());
        await clickButton('אישי');
        steps.push(snapshot());
        expect(steps).toMatchSnapshot();
      });

      it('v2 neighborhoods tab: no neighborhood access / no authority', async () => {
        state.access = { ...state.access, hasNeighborhoodAccess: false };
        await page();
        await clickButton('שכונות');
        const steps = [snapshot()];
        unmount();
        reset(v2);
        state.arena = { ...state.arena, authority: null };
        state.access = { ...state.access, cityName: null };
        await page();
        await clickButton('שכונות');
        steps.push(snapshot());
        await clickButton('יישובים');
        steps.push(snapshot());
        expect(steps).toMatchSnapshot();
      });

      it('v2 scope km: daily window skips the contribution fetch', async () => {
        await page();
        await clickButton('יישובים');
        await callProp('NationalLeagueBoard', 'onCategoryChange', 'cardio');
        await callProp('ScopeBattleCard', 'onMyScopeEntryChange', { scopeId: 'city1', scopeName: 'חיפה', rank: 1, totalScore: 10 });
        await flush();
        expect(snapshot()).toMatchSnapshot();
      });
    }
  });
}

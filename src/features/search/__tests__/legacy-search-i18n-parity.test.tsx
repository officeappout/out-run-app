/**
 * i18n wave 2 (library namespace): today's /search page (flag enable_unified_search off — what
 * every user sees) moves its copy to src/messages/he/library.json. The snapshots below were
 * recorded from LegacySearchPage BEFORE the extraction; after it the page must render
 * byte-identical Hebrew markup on every tab, v1 and v2 (enable_home_v2), with and without data
 * and city access. States behind a click / effect (שלי mode, people results, the group filter
 * panel) are pinned by src/lib/i18n/__tests__/library-he.test.ts instead.
 *
 * React's text-node separators (<!-- -->) are dropped before comparing (see search-i18n-parity).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const st = vi.hoisted(() => ({
  params: '',
  v2: false,
  hasCityAccess: true,
  groups: [] as unknown[],
  events: [] as unknown[],
  following: [] as string[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(st.params),
}));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="exercise-library" /> }));
vi.mock('@/components/ui/AppHeader', () => ({ default: ({ children }: { children: React.ReactNode }) => <header>{children}</header> }));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'u1', core: { name: 'דנה', ageGroup: 'adult' }, social: { groupIds: ['g2'] } } };
  return { useUserStore: (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state) };
});
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: st.v2 }, loading: false }) }));
vi.mock('@/features/social/store/useSocialStore', () => ({
  useSocialStore: (sel: (s: unknown) => unknown) => sel({ following: st.following, isLoaded: true, loadConnections: () => {} }),
}));
vi.mock('@/features/arena/hooks/useArenaAccess', () => ({ useArenaAccess: () => ({ cityAuthorityId: 'tlv', hasCityAccess: st.hasCityAccess }) }));
vi.mock('@/features/arena/hooks/useArenaData', () => ({ useArenaData: () => ({ events: st.events, groups: st.groups }) }));
vi.mock('@/features/arena/hooks/useMyGroups', () => ({ useMyGroups: () => ({ groups: [] }) }));
vi.mock('@/features/arena/hooks/useUserLocation', () => ({ useUserLocation: () => ({ userCoords: null }) }));
vi.mock('@/features/content/exercises/client/store/useExerciseLibraryStore', () => ({
  useExerciseLibraryStore: Object.assign((sel: (s: unknown) => unknown) => sel({ allExercises: new Array(42) }), { getState: () => ({ setQuery: () => {} }) }),
}));
vi.mock('@/features/social/services/user-search.service', () => ({ searchUsersByName: async () => [], getUsersByUids: async () => [] }));
vi.mock('@/features/social/components/PartnerCard', () => ({ default: () => <div data-testid="partner" /> }));
vi.mock('@/features/arena/components/EventCard', () => ({ default: ({ event }: { event: { name: string } }) => <div data-testid="event">{event.name}</div> }));
vi.mock('@/features/arena/components/GroupCard', () => ({ default: ({ group }: { group: { name: string } }) => <div data-testid="group">{group.name}</div> }));
vi.mock('@/features/arena/components/GroupDetailsDrawer', () => ({ default: () => null }));
vi.mock('@/features/arena/components/SessionDrawer', () => ({ default: () => null }));
vi.mock('@/features/arena/components/PostJoinSuccessDrawer', () => ({ default: () => null }));
vi.mock('@/features/safecity/components/ViralUnlockSheet', () => ({ default: () => null }));
vi.mock('@/features/arena/hooks/useCommunitySessionBanner', () => ({ useCommunitySessionBanner: () => ({ sessions: [] }) }));
vi.mock('@/features/arena/hooks/usePublicGroupPhases', () => ({ usePublicGroupPhases: () => ({}) }));
vi.mock('@/features/arena/services/group.service', () => ({ joinGroup: async () => {}, leaveGroup: async () => {} }));
vi.mock('@/features/admin/services/community.service', () => ({ joinEvent: async () => {} }));
vi.mock('@/features/user/scheduling/services/communitySchedule.service', () => ({ addCommunitySessionsToPlanner: async () => {} }));

import LegacySearchPage from '../legacy/LegacySearchPage';

const html = () => renderToStaticMarkup(<LegacySearchPage />).replace(/<!-- -->/g, '');
const snap = (name: string) => `./__snapshots__/legacy-search-i18n/${name}.html`;

const GROUPS = [
  { id: 'g1', name: 'רצי פלורנטין', description: '', category: 'running' },
  { id: 'g2', name: 'כוח בגינה', description: '', category: 'calisthenics' },
];
const EVENTS = [{ id: 'e1', name: 'מרוץ הלילה', description: '', category: 'race', location: { address: 'נמל' } }];

function set(over: Partial<typeof st>) {
  Object.assign(st, { params: '', v2: false, hasCityAccess: true, groups: GROUPS, events: EVENTS, following: ['x', 'y'] }, over);
}

describe('LegacySearchPage — Hebrew markup unchanged by the i18n extraction', () => {
  for (const v2 of [false, true]) {
    const v = v2 ? 'v2' : 'v1';
    for (const tab of ['exercises', 'groups', 'people', 'events'] as const) {
      it(`${tab} · ${v} · with data`, async () => {
        set({ params: `tab=${tab}`, v2 });
        await expect(html()).toMatchFileSnapshot(snap(`${tab}-${v}`));
      });
    }
  }
  it('no ?tab → exercises (default)', async () => {
    set({});
    await expect(html()).toMatchFileSnapshot(snap('default'));
  });
  for (const access of [true, false]) {
    const a = access ? 'access' : 'no-access';
    it(`groups · empty · ${a}`, async () => {
      set({ params: 'tab=groups', hasCityAccess: access, groups: [], events: [], following: [] });
      await expect(html()).toMatchFileSnapshot(snap(`groups-empty-${a}`));
    });
    it(`events · empty · ${a}`, async () => {
      set({ params: 'tab=events', hasCityAccess: access, groups: [], events: [], following: [] });
      await expect(html()).toMatchFileSnapshot(snap(`events-empty-${a}`));
    });
  }
});

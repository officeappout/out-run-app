/**
 * i18n wave 2 (namespace `map`, `partners.*` keys): the Partner Finder's copy
 * moved to src/messages/he/map.json. The snapshots below were recorded from
 * the components BEFORE the extraction; the extracted components must render
 * the same Hebrew markup in every state that shows text: v1 and v2
 * (enable_home_v2), live / scheduled / group / own-arrival cards, empty states
 * (male / female), radar copy, filter bar rows per activity and tab, the filter
 * sheet, and the overlay (loading, empty, with cards).
 *
 * Zustand stores render their INITIAL state under react-dom/server
 * (useSyncExternalStore's server snapshot is `getInitialState()`), so the
 * filter / locale state for a case is written into that object (`ssrSet`).
 *
 * `<!-- -->` is stripped before comparing: react-dom/server inserts it between
 * two adjacent text nodes (`עד {distance}` is two nodes, `t('…', { distance })`
 * is one). It is not rendered text, and the client DOM never contains it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false };
type UserState = { profile: { id: string; core: { isSuperAdmin: boolean; name: string; gender?: string }; progression?: unknown } };
const userState: UserState = {
  profile: { id: 'me', core: { isSuperAdmin: false, name: 'דנה' } },
};

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => {
  const useUserStore = (sel?: (s: UserState) => unknown) => (sel ? sel(userState) : userState);
  useUserStore.getState = () => userState;
  return { useUserStore };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/workout-engine/services/program-hierarchy.utils', () => ({
  getCachedPrograms: () => new Promise(() => {}),
}));
vi.mock('@/features/parks/client/components/UserProfileSheet', () => ({ default: () => null }));
vi.mock('@/features/parks/core/hooks/useSuppressBottomNav', () => ({ useSuppressBottomNav: () => {} }));
vi.mock('@/features/social/store/useChatStore', () => {
  const s = { openDM: async () => {}, openGroup: async () => {} };
  const useChatStore = () => s;
  useChatStore.getState = () => s;
  return { useChatStore };
});

import { PartnerCard, type PartnerCardProps } from '../PartnerCard';
import { PartnerEmptyState } from '../PartnerEmptyState';
import { RadarAnimation } from '../RadarAnimation';
import { PartnerFilterBar, PartnerFilterRowsV2 } from '../PartnerFilterBar';
import { PartnerFilterSheet } from '../PartnerFilterSheet';
import { PartnerOverlay } from '../PartnerOverlay';
import { usePartnerFilters } from '../../hooks/usePartnerFilters';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { LivePartner, ScheduledPartner } from '@/features/parks/core/hooks/usePartnerData';

const NOW = new Date('2026-10-15T12:00:00');
const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/partners-i18n/${name}.html`;
const at = (h: number, m = 0, dayOffset = 0) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + dayOffset, h, m);

type FilterState = ReturnType<typeof usePartnerFilters.getState>;
const FILTER_DEFAULTS: FilterState = { ...usePartnerFilters.getInitialState(), liveActivity: 'all' };

/** Server-render state: what useSyncExternalStore reads under react-dom/server. */
function ssrFilters(partial: Partial<FilterState>) {
  Object.assign(usePartnerFilters.getInitialState(), partial);
}

function setGender(gender: 'male' | 'female' | undefined) {
  userState.profile.core.gender = gender;
  Object.assign(useLocaleStore.getInitialState(), { gender: gender ?? 'other' });
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  flags.enableHomeV2 = false;
  setGender(undefined);
  userState.profile.progression = undefined;
  ssrFilters(FILTER_DEFAULTS);
});

// ── PartnerCard ──────────────────────────────────────────────────────────────

const cards: Record<string, Omit<PartnerCardProps, 'v2'>> = {
  'live-running': {
    type: 'live', uid: 'u1', name: 'נועה', distanceKm: 0.42, activityStatus: 'running', mockPace: '5:30',
    currentStreak: 12, programName: 'פלג גוף עליון', programLevel: 5, onAvatarTap: noop,
  },
  'live-strength-titled': {
    type: 'live', uid: 'u2', name: 'יוסי', distanceKm: 3.456, activityStatus: 'strength', workoutTitle: 'אימון כוח קצר',
  },
  'live-walking-nopace': { type: 'live', uid: 'u3', name: 'רון', distanceKm: 12.7, activityStatus: 'walking', programName: 'כל הגוף' },
  'live-running-nopace': { type: 'live', uid: 'u3b', name: 'רון', distanceKm: 1, activityStatus: 'running' },
  'live-walking-pace': { type: 'live', uid: 'u3c', name: 'רון', distanceKm: 2, activityStatus: 'walking', mockPace: '9:10' },
  'live-cycling': { type: 'live', uid: 'u4', name: 'מאיה', distanceKm: 2.2, activityStatus: 'cycling' },
  'live-idle': { type: 'live', uid: 'u5', name: 'גיל', distanceKm: 5, lemurStage: 3 },
  'scheduled-range-self': {
    type: 'scheduled', uid: 'me', name: 'דנה', distanceKm: 0.05, startTime: at(17), endTime: at(19),
    locationLabel: 'פארק הירקון', isSelf: true, programName: 'מתח', programLevel: 2,
  },
  'scheduled-single': {
    type: 'scheduled', uid: 'u6', name: 'אבי', distanceKm: 1.5, startTime: at(8, 30), locationLabel: '  ', onAvatarTap: noop,
  },
  'group-members': { type: 'group', uid: 'g1', name: 'x', groupName: 'רצים בפארק', distanceKm: 0.9, memberCount: 7, startTime: at(18) },
};

describe('PartnerCard — Hebrew markup unchanged', () => {
  for (const [name, props] of Object.entries(cards)) {
    for (const v2 of [false, true]) {
      it(`${name} · ${v2 ? 'v2' : 'v1'}`, async () => {
        await expect(html(<PartnerCard {...props} v2={v2} />)).toMatchFileSnapshot(snap(`card-${name}-${v2 ? 'v2' : 'v1'}`));
      });
    }
  }
});

// ── PartnerEmptyState ────────────────────────────────────────────────────────

describe('PartnerEmptyState — Hebrew markup unchanged', () => {
  for (const tab of ['live', 'scheduled'] as const) {
    for (const gender of ['male', 'female', undefined] as const) {
      for (const v2 of [false, true]) {
        const name = `empty-${tab}-${gender ?? 'unset'}-${v2 ? 'v2' : 'v1'}`;
        it(name, async () => {
          setGender(gender);
          await expect(html(<PartnerEmptyState tab={tab} v2={v2} onAction={v2 ? noop : undefined} />)).toMatchFileSnapshot(snap(name));
        });
      }
    }
  }
  it('v2 with a caller label', async () => {
    await expect(html(<PartnerEmptyState tab="live" v2 onAction={noop} actionLabel="שינוי סינון" />)).toMatchFileSnapshot(
      snap('empty-live-v2-label'),
    );
  });
});

// ── RadarAnimation ───────────────────────────────────────────────────────────

describe('RadarAnimation — Hebrew markup unchanged', () => {
  it('live', async () => {
    await expect(html(<RadarAnimation tab="live" isCached onComplete={noop} />)).toMatchFileSnapshot(snap('radar-live'));
  });
  it('scheduled', async () => {
    await expect(html(<RadarAnimation tab="scheduled" isCached={false} onComplete={noop} />)).toMatchFileSnapshot(snap('radar-scheduled'));
  });
  it('caller text', async () => {
    await expect(html(<RadarAnimation tab="live" isCached onComplete={noop} text="מחפש מסלולים..." mode="routes" />)).toMatchFileSnapshot(
      snap('radar-text'),
    );
  });
});

// ── PartnerFilterBar / rows / sheet ──────────────────────────────────────────

const PROGRAMS = {
  activePrograms: [
    { id: 'enr1', templateId: 'full_body', name: 'כל הגוף (שמור)' },
    { id: 'enr2', templateId: 'unknown_slug', name: 'תוכנית שמורה' },
  ],
};

describe('PartnerFilterBar — Hebrew markup unchanged', () => {
  for (const tab of ['live', 'scheduled'] as const) {
    for (const activity of ['all', 'strength', 'running', 'walking'] as const) {
      for (const v2 of [false, true]) {
        const name = `bar-${tab}-${activity}-${v2 ? 'v2' : 'v1'}`;
        it(name, async () => {
          userState.profile.progression = PROGRAMS;
          ssrFilters({ liveActivity: activity, plannedTime: 'today' });
          await expect(html(<PartnerFilterBar tab={tab} onOpenSheet={noop} v2={v2} />)).toMatchFileSnapshot(snap(name));
        });
      }
    }
  }
  it('v2 with extra filters set (count badge + aria)', async () => {
    ssrFilters({ liveActivity: 'running', soloGroupFilter: 'groups', genderFilter: 'female' });
    await expect(html(<PartnerFilterBar tab="live" onOpenSheet={noop} v2 />)).toMatchFileSnapshot(snap('bar-v2-extra-count'));
  });
});

describe('PartnerFilterRowsV2 — Hebrew markup unchanged', () => {
  for (const tab of ['live', 'scheduled'] as const) {
    for (const activity of ['strength', 'running'] as const) {
      const name = `rows-${tab}-${activity}`;
      it(name, async () => {
        userState.profile.progression = PROGRAMS;
        ssrFilters({ liveActivity: activity, plannedTime: 'tomorrow' });
        await expect(html(<PartnerFilterRowsV2 tab={tab} />)).toMatchFileSnapshot(snap(name));
      });
    }
  }
});

describe('PartnerFilterSheet — Hebrew markup unchanged', () => {
  for (const distanceKm of [0.5, 7.5]) {
    it(`v1 · ${distanceKm} km`, async () => {
      ssrFilters({ distanceKm });
      await expect(html(<PartnerFilterSheet isOpen onClose={noop} />)).toMatchFileSnapshot(snap(`sheet-v1-${distanceKm}`));
    });
    it(`v2 · ${distanceKm} km`, async () => {
      flags.enableHomeV2 = true;
      ssrFilters({ distanceKm, liveActivity: 'strength' });
      await expect(html(<PartnerFilterSheet isOpen onClose={noop} tab="scheduled" />)).toMatchFileSnapshot(snap(`sheet-v2-${distanceKm}`));
    });
  }
});

// ── PartnerOverlay ───────────────────────────────────────────────────────────

const LIVE: LivePartner[] = [
  {
    uid: 'u1', name: 'נועה', lat: 0, lng: 0, distanceKm: 0.8, activityStatus: 'strength', startedAt: NOW.getTime(),
    currentStreak: 4, programName: 'פלג גוף עליון', programLevel: 3,
  },
  { uid: 'u2', name: 'יוסי', lat: 0, lng: 0, distanceKm: 2.4, activityStatus: 'running', startedAt: NOW.getTime(), mockPace: '5:10' },
];

const SCHEDULED = [
  {
    id: 's1', userId: 'u6', displayName: 'אבי', photoURL: null, routeId: '', activityType: 'strength', level: '',
    startTime: at(14), endTime: at(16), distanceKm: 1.1, lat: 0, lng: 0, parkName: 'פארק הירקון', source: 'planned',
  },
  {
    id: 's2', userId: 'me', displayName: 'דנה', photoURL: null, routeId: '', activityType: 'running', level: '',
    startTime: at(18), distanceKm: 0.3, lat: 0, lng: 0, routeName: 'מסלול החוף', source: 'ownArrival',
  },
  {
    id: 's3', userId: 'g', displayName: 'קבוצה', photoURL: null, routeId: '', activityType: 'strength', level: '',
    startTime: at(19), distanceKm: 0.6, lat: 0, lng: 0, source: 'group', groupId: 'g1', sessionLabel: 'כושר בפארק',
  },
] as unknown as ScheduledPartner[];

describe('PartnerOverlay — Hebrew markup unchanged', () => {
  const overlay = (over: Partial<Parameters<typeof PartnerOverlay>[0]> = {}) =>
    html(
      <PartnerOverlay
        initialTab="live"
        userLocation={null}
        live={LIVE}
        scheduled={SCHEDULED}
        isLoading={false}
        onClose={noop}
        {...over}
      />,
    );

  for (const v2 of [false, true]) {
    const v = v2 ? 'v2' : 'v1';
    it(`loading · ${v}`, async () => {
      flags.enableHomeV2 = v2;
      await expect(overlay({ isLoading: true })).toMatchFileSnapshot(snap(`overlay-loading-${v}`));
    });
    it(`live cards · ${v}`, async () => {
      flags.enableHomeV2 = v2;
      await expect(overlay()).toMatchFileSnapshot(snap(`overlay-live-${v}`));
    });
    it(`live empty · ${v}`, async () => {
      flags.enableHomeV2 = v2;
      setGender('female');
      await expect(overlay({ live: [] })).toMatchFileSnapshot(snap(`overlay-live-empty-${v}`));
    });
    it(`scheduled cards · ${v}`, async () => {
      flags.enableHomeV2 = v2;
      await expect(overlay({ initialTab: 'scheduled' })).toMatchFileSnapshot(snap(`overlay-scheduled-${v}`));
    });
    it(`scheduled empty · ${v}`, async () => {
      flags.enableHomeV2 = v2;
      await expect(overlay({ initialTab: 'scheduled', scheduled: [] })).toMatchFileSnapshot(snap(`overlay-scheduled-empty-${v}`));
    });
  }
});

/**
 * i18n wave 4: English direction of the partner finder's cards (see the describe below).
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

import { PartnerCard } from '../PartnerCard';
import { PartnerOverlay } from '../PartnerOverlay';
import { usePartnerFilters } from '../../hooks/usePartnerFilters';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { LivePartner } from '@/features/parks/core/hooks/usePartnerData';

const NOW = new Date('2026-10-15T12:00:00');
const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');

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
  Object.assign(useLocaleStore.getInitialState(), { locale: 'he' });
});
beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), { locale: 'he' });
  flags.enableHomeV2 = false;
  setGender(undefined);
  userState.profile.progression = undefined;
  ssrFilters(FILTER_DEFAULTS);
});


const he = (el: ReactElement) => {
  Object.assign(useLocaleStore.getInitialState(), { locale: 'he' });
  return html(el);
};
const en = (el: ReactElement) => {
  Object.assign(useLocaleStore.getInitialState(), { locale: 'en' });
  return html(el);
};

/**
 * i18n wave 4 (ltr-host content): PartnerOverlay's cards sit inside an ltr scroller; they used to hard-code
 * `dir="rtl"`. In English they follow the locale (ltr); Hebrew stays rtl (the existing partners parity snapshots pin it).
 */
describe('Partner overlay + card direction', () => {
  const card = <PartnerCard type="live" uid="u1" name="Noa" distanceKm={0.4} activityStatus="running" mockPace="5:30" v2 />;
  it('PartnerCard: English is ltr, no hard-coded rtl', () => {
    const h = en(card);
    expect(h).toContain('dir="ltr"');
    expect(h).not.toContain('dir="rtl"');
  });
  it('PartnerCard: Hebrew stays rtl', () => {
    expect(he(card)).toContain('dir="rtl"');
  });
  it('PartnerOverlay: the root and the cards follow the locale; the scroller keeps ltr', () => {
    const el = <PartnerOverlay initialTab="live" userLocation={null} live={[{ uid: 'u1', name: 'Noa', lat: 0, lng: 0, distanceKm: 0.8, activityStatus: 'running', startedAt: NOW.getTime() } as LivePartner]} scheduled={[]} isLoading={false} onClose={noop} />;
    const h = en(el);
    // (the filter bar / empty state / radar keep their own rtl: slider-value direction, outside this PR)
    expect(h.match(/ dir="(rtl|ltr)"/)?.[1]).toBe('ltr');
    expect(h).toContain('dir="ltr"');
    expect(he(el).match(/ dir="(rtl|ltr)"/)?.[1]).toBe('rtl');
  });
});

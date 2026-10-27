/**
 * i18n wave 2 batch ar (namespace `map`; keys navHub.* / bottomNav.*): the v1 search overlay of NavigationHub and the
 * bottom tab bar (classic + v2). Snapshots recorded BEFORE the extraction; the extracted components must render the
 * same Hebrew markup. `<!-- -->` is stripped before comparing (react-dom/server's separator, not rendered text).
 * Stores are written into getInitialState() (static markup reads the server snapshot). Taps (quick-action tap text,
 * remove-from-history aria label) are pinned key by key in src/lib/i18n/__tests__/map-batch-ar-he.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false, enableCommunityFeed: true, enableLeagues: false };
const flagState = { loading: false };
let pathname = '/home';
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags, loading: flagState.loading }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: () => {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'u1', core: { gender: 'male', isSuperAdmin: false } } };
  return { useUserStore: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state) };
});
vi.mock('@/features/workout-engine', () => ({ useSessionStore: () => ({ status: 'idle' }) }));

import NavigationHub from '../NavigationHub';
import BottomNavigation from '@/features/navigation/BottomNavbar';
import PlannedRunSlotCard from '../hybrid/PlannedRunSlotCard';
import { useRecentSearchesStore } from '../../store/useRecentSearchesStore';
import { useSavedPlacesStore } from '@/features/user/places/store/useSavedPlacesStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/parks-core-i18n-ar/${name}.html`;
const noop = () => {};
const RECENT_DEFAULTS = { ...useRecentSearchesStore.getInitialState() };
const SAVED_DEFAULTS = { ...useSavedPlacesStore.getInitialState() };

beforeEach(() => {
  flags.enableHomeV2 = false; flags.enableCommunityFeed = true; flags.enableLeagues = false;
  flagState.loading = false; pathname = '/home';
  Object.assign(useRecentSearchesStore.getInitialState(), RECENT_DEFAULTS);
  Object.assign(useSavedPlacesStore.getInitialState(), SAVED_DEFAULTS);
});

const hub = (over: Partial<React.ComponentProps<typeof NavigationHub>> = {}) => (
  <NavigationHub navState="searching" onStateChange={noop} searchQuery="" onSearchChange={noop} suggestions={[]} onAddressSelect={noop} {...over} />
);

describe('NavigationHub (v1 search overlay)', () => {
  it('empty query, no recents', async () => {
    await expect(html(hub())).toMatchFileSnapshot(snap('hub-empty'));
  });
  it('empty query, recents + home saved', async () => {
    Object.assign(useRecentSearchesStore.getInitialState(), {
      recents: [{ text: 'פארק הירקון', coords: [34.8, 32.1], source: 'park', pickedAt: 1 }, { text: 'דיזנגוף 10', coords: [34.7, 32.0], source: 'mapbox', pickedAt: 2 }],
    });
    Object.assign(useSavedPlacesStore.getInitialState(), {
      places: { home: { kind: 'home', label: 'בית', address: 'הרצל 1', coords: [34.7, 32.0] }, work: null },
    });
    await expect(html(hub())).toMatchFileSnapshot(snap('hub-recents'));
  });
  it('results with sources', async () => {
    const suggestions = [
      { text: 'הרצל 5', coords: [34.7, 32.0] as [number, number], _source: 'mapbox' as const },
      { text: 'פארק לאומי', coords: [34.8, 32.1] as [number, number], _source: 'park' as const },
      { text: 'מסלול הים', coords: [34.9, 32.2] as [number, number], _source: 'route' as const },
    ];
    await expect(html(hub({ searchQuery: 'הרצ', suggestions }))).toMatchFileSnapshot(snap('hub-results'));
  });
  it('no results', async () => {
    await expect(html(hub({ searchQuery: 'xyz' }))).toMatchFileSnapshot(snap('hub-none'));
  });
  it('idle renders nothing', () => {
    expect(html(hub({ navState: 'idle' }))).toBe('');
  });
});

describe.each([false, true])('BottomNavigation, v2=%s', (v2) => {
  const tag = v2 ? 'v2' : 'v1';
  it.each([['/home'], ['/map'], ['/community/feed']])('path %s', async (p) => {
    flags.enableHomeV2 = v2; pathname = p;
    await expect(html(<BottomNavigation />)).toMatchFileSnapshot(snap(`nav-${tag}-${p.slice(1).replace('/', '-')}`));
  });
  it('without social', async () => {
    flags.enableHomeV2 = v2; flags.enableCommunityFeed = false;
    await expect(html(<BottomNavigation />)).toMatchFileSnapshot(snap(`nav-${tag}-nosocial`));
  });
});

describe('PlannedRunSlotCard', () => {
  it.each(['planned_run', 'planned_walk'] as const)('%s', async (kind) => {
    const slot = { kind, accent: '#65a30d', title: 'תוכנית ריצה', subtitle: 'ריצה קלה', reason: 'כי היום יום מנוחה', href: '/x', entry: {} };
    await expect(html(<PlannedRunSlotCard slot={slot as never} onArm={noop} onCta={noop} />)).toMatchFileSnapshot(snap(`planned-run-card-${kind}`));
  });
});

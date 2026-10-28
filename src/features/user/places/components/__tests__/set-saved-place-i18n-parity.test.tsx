/**
 * i18n extraction batch ui-2 (namespace `profile`, `savedPlace.*`): SetSavedPlaceSheet copy moves to the catalog.
 * Snapshots recorded from unmodified origin/main (`<!-- -->` stripped), v1 and v2 (enable_home_v2), home and work.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false };
type UserState = { profile: { id: string; core: { isSuperAdmin: boolean } } };
const userState: UserState = { profile: { id: 'u1', core: { isSuperAdmin: false } } };

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => {
  const useUserStore = (sel?: (s: UserState) => unknown) => (sel ? sel(userState) : userState);
  useUserStore.getState = () => userState;
  return { useUserStore };
});
vi.mock('@/features/parks/core/services/mapbox.service', () => ({ MapboxService: { searchAddress: async () => [] } }));

import SetSavedPlaceSheet from '../SetSavedPlaceSheet';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/set-saved-place-i18n/${name}.html`;

beforeEach(() => {
  flags.enableHomeV2 = false;
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
});

it.each([
  [false, 'home'],
  [false, 'work'],
  [true, 'home'],
  [true, 'work'],
] as const)('sheet v2=%s kind=%s', async (v2, kind) => {
  flags.enableHomeV2 = v2;
  await expect(html(<SetSavedPlaceSheet openKind={kind} onClose={() => {}} />)).toMatchFileSnapshot(snap(`v${v2 ? 2 : 1}-${kind}`));
});

it('closed v2 sheet', async () => {
  flags.enableHomeV2 = true;
  await expect(html(<SetSavedPlaceSheet openKind={null} onClose={() => {}} />)).toMatchFileSnapshot(snap('v2-closed'));
});

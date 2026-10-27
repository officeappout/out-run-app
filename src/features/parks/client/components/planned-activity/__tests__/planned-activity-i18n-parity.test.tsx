/**
 * i18n wave 2 batch ar (namespace `map`, keys `plannedActivity.*` / `plusDrawer.*`): the "+" drawer and the
 * "יוצא להתאמן" compose sheet. Snapshots recorded from the components BEFORE the extraction; the extracted
 * components must render the same Hebrew markup in v1 and v2 (enable_home_v2). Static markup, node env.
 * `<!-- -->` is stripped before comparing (not rendered text). States behind a tap / a fetch (scheduled day,
 * loading lists, share text) are pinned key by key in src/lib/i18n/__tests__/map-batch-ar-he.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false };
const userState: { profile: Record<string, unknown> } = { profile: {} };
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: async () => [] }));
vi.mock('@/features/parks/core/services/inventory.service', () => ({ getCachedOfficialRoutes: async () => [] }));
vi.mock('@/features/admin/services/planned-sessions.service', () => ({ createPlannedSession: async () => 'id' }));

import PlannedActivityComposeSheet from '../PlannedActivityComposeSheet';
import UnifiedPlusDrawer from '../UnifiedPlusDrawer';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/planned-activity-i18n/${name}.html`;
const noop = () => {};
const GPS_DEFAULTS = { ...useGPSStore.getInitialState() };

beforeEach(() => {
  flags.enableHomeV2 = false;
  userState.profile = { id: 'u1', core: { gender: 'female' }, progression: { tracks: {}, activePrograms: [] } };
  Object.assign(useGPSStore.getInitialState(), GPS_DEFAULTS);
});

describe.each([false, true])('UnifiedPlusDrawer, v2=%s', (v2) => {
  it('open', async () => {
    flags.enableHomeV2 = v2;
    await expect(html(<UnifiedPlusDrawer isOpen onClose={noop} onGoTrain={noop} onCreateGroup={noop} onAddLocation={noop} onReport={noop} onAddWorkout={noop} />)).toMatchFileSnapshot(snap(`plus-${v2 ? 'v2' : 'v1'}`));
  });
});

describe.each([false, true])('PlannedActivityComposeSheet, v2=%s', (v2) => {
  const tag = v2 ? 'v2' : 'v1';
  it('strength, no level, no gps', async () => {
    flags.enableHomeV2 = v2;
    await expect(html(<PlannedActivityComposeSheet isOpen onClose={noop} />)).toMatchFileSnapshot(snap(`compose-workout-nolevel-${tag}`));
  });
  it('strength with a program level + pinned park', async () => {
    flags.enableHomeV2 = v2;
    userState.profile = { id: 'u1', core: { gender: 'male' }, progression: { tracks: { upper_body: { currentLevel: 7 } }, activePrograms: [{ templateId: 'upper_body' }] } };
    Object.assign(useGPSStore.getInitialState(), { coords: { lat: 32, lng: 34 } });
    await expect(html(<PlannedActivityComposeSheet isOpen onClose={noop} initialPlace={{ kind: 'park', id: 'p1', name: 'פארק הירקון', lat: 32, lng: 34 }} />)).toMatchFileSnapshot(snap(`compose-workout-level-${tag}`));
  });
  it('running, gps but empty lists', async () => {
    flags.enableHomeV2 = v2;
    Object.assign(useGPSStore.getInitialState(), { coords: { lat: 32, lng: 34 } });
    await expect(html(<PlannedActivityComposeSheet isOpen onClose={noop} initialType="running" />)).toMatchFileSnapshot(snap(`compose-running-${tag}`));
  });
  it('walking', async () => {
    flags.enableHomeV2 = v2;
    await expect(html(<PlannedActivityComposeSheet isOpen onClose={noop} initialType="walking" />)).toMatchFileSnapshot(snap(`compose-walking-${tag}`));
  });
});

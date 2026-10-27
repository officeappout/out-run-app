/**
 * i18n wave 2 batch ar (namespace `map`; keys freeRun.*): the free-run drawer, its goal / leg-plan sheets and the
 * address-destination option. Snapshots recorded BEFORE the extraction; the extracted component must render the
 * same Hebrew markup (v1 / v2 = enable_home_v2, every activity, male / female / unset gender, goal sheet open
 * with and without a pending address and an unset weight, leg-plan sheet empty and with stops).
 * Cross-remount stores are written into getInitialState() (static markup reads the server snapshot) — that is also
 * how the sheets open (isComposing). `<!-- -->` is stripped before comparing (not rendered text).
 * Taps (extras sheet, scheduled "later" mode, share text, errors) are pinned key by key in
 * src/lib/i18n/__tests__/map-batch-ar-he.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false, enableRoutePrefShade: true, enableGraphhopperRoutes: true };
const userState: { profile: Record<string, unknown> } = { profile: {} };
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/lib/feature-flag-live', () => ({ readLiveFlag: () => false }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), updateDoc: async () => {} }));
vi.mock('@/features/user', () => {
  const useUserStore = Object.assign(
    (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
    { getState: () => ({ ...userState, updateProfile: () => {} }) },
  );
  return { useUserStore };
});
vi.mock('@/features/workout-engine/components/RunShareBar', () => ({
  default: () => <div data-share-bar />,
  shareRunInviteNow: async () => {},
}));
vi.mock('@/lib/workoutInvite', () => ({ createRunInvite: async () => ({}) }));

import FreeRunDrawer from '../FreeRunDrawer';
import { useLocaleStore } from '@/store/useLocaleStore';
import { usePendingAddressStore } from '../../store/usePendingAddressStore';
import { useLegPlanStore } from '../../store/useLegPlanStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/free-run-drawer-i18n/${name}.html`;
const noop = () => {};
const PENDING_DEFAULTS = { ...usePendingAddressStore.getInitialState() };
const LEG_DEFAULTS = { ...useLegPlanStore.getInitialState() };
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };

beforeEach(() => {
  flags.enableHomeV2 = false;
  userState.profile = { id: 'u1', core: { gender: 'male', weight: 70, weightSetByUser: true } };
  Object.assign(usePendingAddressStore.getInitialState(), PENDING_DEFAULTS);
  Object.assign(useLegPlanStore.getInitialState(), LEG_DEFAULTS);
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS, { gender: 'other' });
});

const setGender = (g: string) => {
  (userState.profile.core as Record<string, unknown>).gender = g;
  Object.assign(useLocaleStore.getInitialState(), { gender: g });
};
const drawer = (over: Partial<React.ComponentProps<typeof FreeRunDrawer>> = {}) => (
  <FreeRunDrawer currentActivity="running" onStartWorkout={noop} onClose={noop} {...over} />
);

describe.each([false, true])('FreeRunDrawer, v2=%s', (v2) => {
  const tag = v2 ? 'v2' : 'v1';
  beforeEach(() => { flags.enableHomeV2 = v2; });

  it.each(['running', 'walking', 'cycling'] as const)('base, %s', async (a) => {
    await expect(html(drawer({ currentActivity: a, cityName: 'תל אביב', userPosition: { lat: 32, lng: 34 }, onRequestRouteGeneration: noop }))).toMatchFileSnapshot(snap(`base-${a}-${tag}`));
  });
  it.each(['female', 'male', 'other'])('base, gender %s, no city', async (g) => {
    setGender(g);
    await expect(html(drawer())).toMatchFileSnapshot(snap(`base-gender-${g}-${tag}`));
  });
  it('hybrid toggle offered', async () => {
    await expect(html(drawer({ enableHybridSlots: true, onStartHybrid: noop }))).toMatchFileSnapshot(snap(`hybrid-${tag}`));
  });
  it.each(['running', 'walking'] as const)('goal sheet open, %s', async (a) => {
    Object.assign(usePendingAddressStore.getInitialState(), { isComposing: true });
    await expect(html(drawer({ currentActivity: a, onRequestAddressDestination: noop, onRequestAddLeg: noop }))).toMatchFileSnapshot(snap(`goal-${a}-${tag}`));
  });
  it('goal sheet, weight missing, female', async () => {
    setGender('female');
    userState.profile = { id: 'u1', core: { gender: 'female' } };
    Object.assign(usePendingAddressStore.getInitialState(), { isComposing: true });
    await expect(html(drawer({ onRequestAddressDestination: noop }))).toMatchFileSnapshot(snap(`goal-noweight-female-${tag}`));
  });
  it('goal sheet with a pending address', async () => {
    Object.assign(usePendingAddressStore.getInitialState(), { isComposing: true, pending: { lat: 32, lng: 34, label: 'דיזנגוף 10' } });
    await expect(html(drawer({ onRequestAddressDestination: noop, onConfirmAddressDestination: noop, onRequestAddLeg: noop }))).toMatchFileSnapshot(snap(`goal-pending-${tag}`));
  });
  it('goal sheet with a pending address without a label + stops count', async () => {
    Object.assign(usePendingAddressStore.getInitialState(), { isComposing: true, pending: { lat: 32, lng: 34 } });
    Object.assign(useLegPlanStore.getInitialState(), { legs: [{ kind: 'to_point', id: 'l1', destination: { lat: 1, lng: 2 } }] });
    await expect(html(drawer({ onRequestAddressDestination: noop, onConfirmAddressDestination: noop, onRequestAddLeg: noop }))).toMatchFileSnapshot(snap(`goal-pending-nolabel-${tag}`));
  });
  it('leg plan sheet, empty', async () => {
    Object.assign(useLegPlanStore.getInitialState(), { isComposing: true, legs: [] });
    await expect(html(drawer({ onRequestAddLeg: noop, onStartLegPlanRun: noop, userPosition: { lat: 32, lng: 34 } }))).toMatchFileSnapshot(snap(`legplan-empty-${tag}`));
  });
  it.each(['running', 'walking', 'cycling'] as const)('leg plan sheet with stops, %s', async (a) => {
    Object.assign(useLegPlanStore.getInitialState(), {
      isComposing: true,
      legs: [
        { kind: 'to_point', id: 'l1', label: 'פארק הירקון', destination: { lat: 32, lng: 34 } },
        { kind: 'to_point', id: 'l2', destination: { lat: 33, lng: 35 } },
      ],
    });
    await expect(html(drawer({ currentActivity: a, onRequestAddLeg: noop, onStartLegPlanRun: noop, userPosition: { lat: 32, lng: 34 } }))).toMatchFileSnapshot(snap(`legplan-stops-${a}-${tag}`));
  });
});

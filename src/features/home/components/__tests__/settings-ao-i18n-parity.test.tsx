/**
 * i18n wave 2 batch ao (namespace `home`, keys `settings.*`): SettingsModal.
 *
 * The snapshots below were recorded from SettingsModal BEFORE the extraction; the extracted component must render
 * the same Hebrew markup in every state reached here. Static markup (react-dom/server, node env).
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text nodes; not rendered
 * text). The modal's screen / sheet state is plain useState, which a static render can't drive, so react's useState
 * is wrapped: a first pass records the initial values, a second pass forces the cases' values by position (the
 * position is found from the distinctive initial values, so it follows the component). Handler-only text (toasts,
 * confirm() dialogs, gendered error copy) is pinned key by key in src/lib/i18n/__tests__/home-ao-he.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const ctl = vi.hoisted(() => ({
  log: [] as unknown[],
  forced: null as null | Record<number, unknown>,
  n: 0,
}));
vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  const useState = (init: unknown) => {
    const i = ctl.n++;
    ctl.log.push(init);
    if (ctl.forced && i in ctl.forced) return actual.useState(ctl.forced[i] as never);
    return actual.useState(init as never);
  };
  return { ...actual, default: { ...actual, useState }, useState };
});

const flags = vi.hoisted(() => ({
  enableHomeV2: false,
  aiCoachRound4: false,
  enableHapticsV1: false,
  aiCoachProactive: false,
  enableCommunityFeed: false,
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {} }) }));
vi.mock('@/lib/calendar-subscription', () => ({
  openCalendarSubscription: () => {},
  useCalendarFeedPath: (uid: string | null) => (uid ? '/cal/feed' : null),
}));

const ui = vi.hoisted(() => ({
  profile: null as unknown,
  editor: {} as Record<string, unknown>,
}));
vi.mock('@/features/user', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  const hook = (sel?: (s: unknown) => unknown) => {
    const s = { profile: ui.profile, resetProfile() {}, updateProfile() {} };
    return sel ? sel(s) : s;
  };
  (hook as unknown as { getState: () => unknown }).getState = () => ({ profile: ui.profile, updateProfile() {} });
  return { ...actual, useUserStore: hook };
});
vi.mock('@/features/profile/hooks/usePersonalInfoEditor', () => ({
  usePersonalInfoEditor: () => ({
    editWeight: '72',
    setEditWeight() {},
    editDob: { day: '04', month: '05', year: '1990' },
    editSaving: false,
    cityDisplay: null,
    cityResolving: false,
    cityAuthorityId: null,
    goToCityEdit() {},
    neighborhoodPickerOpen: false,
    setNeighborhoodPickerOpen() {},
    editNeighborhoodId: null,
    editNeighborhoodName: null,
    setEditNeighborhoodId() {},
    setEditNeighborhoodName() {},
    monthRef: { current: null },
    yearRef: { current: null },
    openPersonalEdit() {},
    savePersonalEdit: async () => true,
    ...ui.editor,
  }),
}));
vi.mock('@/features/home/components/settings/MyPersonasSection', () => ({ default: () => <section data-personas="" /> }));
vi.mock('@/features/schedule/components/push-reask/PushReAskSettingsCard', () => ({ default: () => <section data-reask="" /> }));

import SettingsModal from '../SettingsModal';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { usePrivacyStore } from '@/features/safecity/store/usePrivacyStore';
import { useLocaleStore } from '@/store/useLocaleStore';

const SETTINGS_DEFAULTS = { ...useSettingsStore.getInitialState() };
const GPS_DEFAULTS = { ...useGPSStore.getInitialState() };
const ACT_DEFAULTS = { ...useActivityStore.getInitialState() };
const PRIV_DEFAULTS = { ...usePrivacyStore.getInitialState() };
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/settings-ao-i18n/${name}.html`;

const adult = { id: 'u1', core: { name: 'דנה כהן', email: 'dana@example.com', birthDate: new Date('1990-05-04') } };
const minor = { id: 'u2', core: { name: 'נועם', email: 'n@example.com', birthDate: new Date('2012-05-04') } };

type Pos = Record<string, number>;
/** Positions (in useState call order) of the modal's own states, found from the first pass's initial values. */
function positions(log: unknown[]): Pos {
  const s = log.indexOf('sunday'); // selectedDay
  const screen = log.indexOf('main');
  return {
    screen,
    remindersLoading: s - 4,
    showAddReminder: s - 2,
    remindersExpanded: s - 1,
    reminders: s - 5,
    unitsExpanded: s + 3,
    showDeleteConfirm: s + 6,
    deleteConfirmText: s + 7,
    deleteError: s + 8,
    isDeleting: s + 9,
    cameraStatus: s + 10,
    pushPermStatus: s + 18,
  };
}

function render(force: Record<string, unknown> = {}) {
  ctl.forced = null;
  ctl.log = [];
  ctl.n = 0;
  renderToStaticMarkup(<SettingsModal isOpen onClose={() => {}} />);
  const pos = positions(ctl.log);
  const forced: Record<number, unknown> = {};
  for (const [k, v] of Object.entries(force)) forced[pos[k]] = v;
  ctl.forced = forced;
  ctl.log = [];
  ctl.n = 0;
  const out = html(<SettingsModal isOpen onClose={() => {}} />);
  ctl.forced = null;
  return out;
}

function native(on: boolean) {
  if (on) (globalThis as { window?: unknown }).window = { Capacitor: { isNativePlatform: () => true } };
  else delete (globalThis as { window?: unknown }).window;
}

beforeEach(() => {
  native(false);
  Object.assign(flags, { enableHomeV2: false, aiCoachRound4: false, enableHapticsV1: false, aiCoachProactive: false, enableCommunityFeed: false });
  Object.assign(useSettingsStore.getInitialState(), SETTINGS_DEFAULTS);
  Object.assign(useGPSStore.getInitialState(), GPS_DEFAULTS);
  Object.assign(useActivityStore.getInitialState(), ACT_DEFAULTS);
  Object.assign(usePrivacyStore.getInitialState(), PRIV_DEFAULTS);
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS);
  ui.profile = adult;
  ui.editor = {};
});

const allFlags = { enableHomeV2: true, aiCoachRound4: true, enableHapticsV1: true, aiCoachProactive: true, enableCommunityFeed: true };

describe('main screen', () => {
  it.each([
    ['v1', {}],
    ['v2', allFlags],
  ] as const)('web, %s', async (name, f) => {
    Object.assign(flags, f);
    await expect(render()).toMatchFileSnapshot(snap(`main-web-${name}`));
  });

  it('web, v2, miles + manual step goal + settings loaded', async () => {
    Object.assign(flags, allFlags);
    Object.assign(useSettingsStore.getInitialState(), { units: 'miles', isLoaded: true });
    Object.assign(useActivityStore.getInitialState(), { resolvedStepGoal: 9000 });
    ui.profile = { ...adult, progression: { stepGoalMode: 'manual' } };
    await expect(render({ unitsExpanded: true })).toMatchFileSnapshot(snap('main-web-v2-miles-manual'));
  });

  it('web, v1, auto step goal with a resolved value, units open', async () => {
    Object.assign(useActivityStore.getInitialState(), { resolvedStepGoal: 7500 });
    await expect(render({ unitsExpanded: true })).toMatchFileSnapshot(snap('main-web-v1-auto-units-open'));
  });

  it.each([
    ['denied', 'denied'],
    ['granted', 'granted'],
    ['unknown', 'unknown'],
  ] as const)('native, camera %s', async (cam, gps) => {
    native(true);
    Object.assign(flags, allFlags);
    Object.assign(useGPSStore.getInitialState(), { permissionState: gps });
    Object.assign(useSettingsStore.getInitialState(), { healthBridgeEnabled: cam === 'granted' });
    await expect(render({ cameraStatus: cam === 'unknown' ? 'prompt' : cam })).toMatchFileSnapshot(snap(`main-native-${cam}`));
  });

  it('native, camera still loading', async () => {
    native(true);
    await expect(render()).toMatchFileSnapshot(snap('main-native-loading'));
  });

  it('delete overlay: empty / with error / deleting', async () => {
    await expect(render({ showDeleteConfirm: true })).toMatchFileSnapshot(snap('delete-empty'));
    await expect(
      render({ showDeleteConfirm: true, deleteConfirmText: 'מחק', deleteError: 'שגיאה כלשהי' }),
    ).toMatchFileSnapshot(snap('delete-error'));
    await expect(
      render({ showDeleteConfirm: true, deleteConfirmText: 'מחק', isDeleting: true }),
    ).toMatchFileSnapshot(snap('delete-busy'));
  });
});

describe('sub screens', () => {
  it.each([
    ['v1', {}],
    ['v2', allFlags],
  ] as const)('personal, %s', async (name, f) => {
    Object.assign(flags, f);
    await expect(render({ screen: 'personal' })).toMatchFileSnapshot(snap(`personal-${name}`));
  });

  it('personal, city + neighborhood set / resolving / no city', async () => {
    ui.editor = { cityDisplay: 'תל אביב', cityAuthorityId: 'a1', editNeighborhoodName: 'פלורנטין' };
    await expect(render({ screen: 'personal' })).toMatchFileSnapshot(snap('personal-city-set'));
    ui.editor = { cityResolving: true, cityAuthorityId: 'a1' };
    await expect(render({ screen: 'personal' })).toMatchFileSnapshot(snap('personal-city-resolving'));
    ui.editor = { cityAuthorityId: 'a1' };
    await expect(render({ screen: 'personal' })).toMatchFileSnapshot(snap('personal-city-no-neighborhood'));
  });

  it('personas', async () => {
    await expect(render({ screen: 'personas' })).toMatchFileSnapshot(snap('personas'));
  });

  it.each([
    ['v1', {}],
    ['v2', allFlags],
  ] as const)('notifications, web, %s', async (name, f) => {
    Object.assign(flags, f);
    Object.assign(useSettingsStore.getInitialState(), { isLoaded: true, shabbatObserver: true });
    await expect(render({ screen: 'notifications' })).toMatchFileSnapshot(snap(`notifications-web-${name}`));
  });

  it('notifications, frequency high + reminders expanded with slots', async () => {
    Object.assign(useSettingsStore.getInitialState(), { isLoaded: true, notificationFrequency: 'high' });
    await expect(
      render({
        screen: 'notifications',
        remindersExpanded: true,
        remindersLoading: false,
        reminders: [
          { day: 'sunday', time: '18:00' },
          { day: 'saturday', time: '07:30' },
        ],
      }),
    ).toMatchFileSnapshot(snap('notifications-reminders-open'));
    await expect(
      render({ screen: 'notifications', remindersExpanded: true, remindersLoading: false, showAddReminder: true }),
    ).toMatchFileSnapshot(snap('notifications-reminders-add'));
    await expect(render({ screen: 'notifications', remindersLoading: false })).toMatchFileSnapshot(
      snap('notifications-reminders-none'),
    );
    await expect(
      render({ screen: 'notifications', remindersLoading: false, reminders: [{ day: 'monday', time: '06:00' }] }),
    ).toMatchFileSnapshot(snap('notifications-reminders-one'));
  });

  it.each([['denied'], ['prompt'], ['loading']] as const)('notifications, native push %s', async (st) => {
    native(true);
    Object.assign(flags, allFlags);
    await expect(render({ screen: 'notifications', pushPermStatus: st })).toMatchFileSnapshot(snap(`notifications-native-${st}`));
  });

  it('notifications, native granted', async () => {
    native(true);
    await expect(render({ screen: 'notifications', pushPermStatus: 'granted' })).toMatchFileSnapshot(
      snap('notifications-native-granted'),
    );
  });

  it.each([
    ['adult v1', adult, {}],
    ['adult v2 feed', adult, allFlags],
    ['minor', minor, {}],
  ] as const)('privacy, %s', async (name, p, f) => {
    ui.profile = p;
    Object.assign(flags, f);
    await expect(render({ screen: 'privacy' })).toMatchFileSnapshot(snap(`privacy-${name.replace(/ /g, '-')}`));
  });
});

// @vitest-environment jsdom
/**
 * i18n wave 2 batch ag (namespace `profile`, keys `dashboard.*`): the profile screen's
 * DashboardTab moves its copy to src/messages/he/profile.json. The snapshots below were recorded
 * from the component BEFORE the extraction; the extracted component must render the same Hebrew
 * markup — v1 and v2 (enable_home_v2), the XP strip hydrated / at max level.
 *
 * Rendered with react-dom/client in jsdom. Everything with data or Firestore behind it is mocked;
 * the children owned by other batches (programs / goals / badges / mode widgets, the two sheets)
 * render nothing here — their own text is pinned by their own tests. ProfileHeader, WorkoutGrid,
 * PartnersHighlightsRow and ProgressLinkRow are the real, already-migrated components.
 * IS_XP_ENABLED is a compile-time `false` today; the mock turns it on so the XP strip's text is covered.
 * Normalised (not text): `<!-- -->`, React useId values, framer-motion animation state
 * (style / opacity / stroke-dash attributes).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const H = vi.hoisted(() => {
  const flags = { enableHomeV2: false };
  const userState: { profile: unknown } = { profile: null };
  const prog = { globalXP: 120, globalLevel: 2, currentStreak: 4, isHydrated: true, hydrateFromFirestore: () => {} };
  const NULL = () => null;
  return {
    ROUTER: { back() {}, push() {}, replace() {}, prefetch() {} },
    flags,
    FLAGS_RESULT: { flags, loading: false },
    userState,
    prog,
    NULL,
    useUserStoreFake: Object.assign((sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState), {
      getState: () => ({ _hasHydrated: true }),
    }),
    LEVEL_CFG: {
      getEntry: () => ({ minXP: 0, maxXP: 500 }),
      getNextThreshold: () => 500,
      calcProgress: () => 24,
    },
    WORKOUT_HISTORY: { workouts: [] as unknown[], isLoading: false },
    ACH: { unlockedAchievements: [], toastQueue: [], dismissToast: () => {} },
  };
});
const { flags, userState, prog } = H;

vi.mock('next/navigation', () => ({ useRouter: () => H.ROUTER }));
vi.mock('next/dynamic', () => ({ default: () => H.NULL }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => H.FLAGS_RESULT }));
vi.mock('@/config/feature-flags', () => ({ IS_XP_ENABLED: true }));
vi.mock('@/features/user/identity/store/useUserStore', () => ({ useUserStore: H.useUserStoreFake }));
vi.mock('@/features/user/progression/store/useProgressionStore', () => ({ useProgressionStore: () => H.prog }));
vi.mock('@/features/user/progression/hooks/useLevelConfig', () => ({ useLevelConfig: () => H.LEVEL_CFG }));
vi.mock('@/hooks/useDashboardMode', () => ({ useDashboardMode: () => 'STRENGTH' }));
vi.mock('@/features/profile/hooks/useWorkoutHistory', () => ({ useWorkoutHistory: () => H.WORKOUT_HISTORY }));
vi.mock('@/features/user/progression/hooks/useAchievements', () => ({ useAchievements: () => H.ACH }));
vi.mock('@/features/user/progression/components/BadgeDisplay', () => ({ BadgeDisplay: H.NULL }));
vi.mock('@/features/user/progression/components/AchievementSheet', () => ({ AchievementSheet: H.NULL }));
vi.mock('@/features/user/progression/components/AchievementUnlockToast', () => ({ AchievementUnlockToast: H.NULL }));
vi.mock('../widgets/DashboardModeWidgets', () => ({ StrengthWidgets: H.NULL, RunningWidgets: H.NULL }));
vi.mock('@/components/ui/v2/StreakFlame', () => ({ default: H.NULL }));
vi.mock('../FavoritesSheet', () => ({ default: H.NULL }));
vi.mock('../EditProfileModal', () => ({ default: H.NULL }));

import { MotionGlobalConfig } from 'framer-motion';
import DashboardTab from '../DashboardTab';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
MotionGlobalConfig.skipAnimations = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const clean = (h: string) =>
  h
    .replaceAll('<!-- -->', '')
    .replace(/:r[0-9a-z]+:|«r[0-9a-z]+»/g, ':r:')
    .replace(/ (style|opacity|stroke-dasharray|stroke-dashoffset)="[^"]*"/g, '');
async function mount(el: ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
}
const body = () => clean(document.body.innerHTML);
const snap = (name: string) => `./__snapshots__/profile-dashboard-i18n/${name}.html`;
const V = (v2: boolean) => (v2 ? 'v2' : 'v1');
const noop = () => {};

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = '';
  flags.enableHomeV2 = false;
  Object.assign(prog, { globalXP: 120, globalLevel: 2, currentStreak: 4, isHydrated: true });
  H.WORKOUT_HISTORY.isLoading = false;
  userState.profile = null;
});

const PROFILE = {
  id: 'u1',
  core: { name: 'דנה', gender: 'female', bio: 'רצה בבקרים', trainingTags: ['running', 'morning'], photoURL: '/p.png' },
  social: { partnerCount: 3 },
  progression: { workoutCount: 12 },
};

describe('DashboardTab', () => {
  it.each([false, true])('with a profile, handlers and the XP strip, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    userState.profile = PROFILE;
    await mount(<DashboardTab onOpenSettings={noop} onNavigateToHistory={noop} />);
    await expect(body()).toMatchFileSnapshot(snap(`full-${V(v2)}`));
  });
  it.each([false, true])('max level, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    userState.profile = PROFILE;
    Object.assign(prog, { globalLevel: 10, globalXP: 9000 });
    await mount(<DashboardTab onOpenSettings={noop} onNavigateToHistory={noop} />);
    await expect(body()).toMatchFileSnapshot(snap(`max-${V(v2)}`));
  });
  it.each([false, true])('not hydrated, no name / bio, no handlers, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    userState.profile = { id: 'u1', core: { gender: 'male' } };
    Object.assign(prog, { isHydrated: false });
    H.WORKOUT_HISTORY.isLoading = true;
    await mount(<DashboardTab />);
    await expect(body()).toMatchFileSnapshot(snap(`bare-${V(v2)}`));
  });
});

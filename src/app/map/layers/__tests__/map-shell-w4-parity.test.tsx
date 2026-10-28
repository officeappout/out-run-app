// @vitest-environment jsdom
/**
 * i18n wave 4 (bidirectional layout), map area, part 8: MapShell's own markup (the recenter / heading pill and the
 * referral toast) recorded from UNMODIFIED main in Hebrew. The layers, AppMap, TurnCarousel, stores and hooks are
 * stubs, so the DOM is MapShell's own. Inline `style`, React ids and `<!-- -->` are stripped before comparing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { h, Stub, noop, mapStore, playerState } = vi.hoisted(() => {
  const h = {
    mode: 'discover' as string,
    flags: { enableHomeV2: false } as Record<string, unknown>,
    snapCb: null as null | ((snap: { data: () => unknown }) => void),
    store: {} as Record<string, unknown>,
  };
  const Stub = (name: string) => () => ({ type: 'div', props: { 'data-stub': name }, key: null, ref: null, $$typeof: Symbol.for('react.element'), _owner: null });
  const noop = () => undefined;
  const playerState = () => ({ routeZones: [], isMapFollowEnabled: true, mapHeadingMode: 'north', guidedRouteTurns: [], runMode: 'free', setMapFollowEnabled: noop, setMapHeadingMode: noop, setSimulationActive: noop });
  function storeState(): Record<string, unknown> {
    const base: Record<string, unknown> = { cameraMode: 'follow_user', storyBarHeight: 0, navCardHeight: 0, isLapsOpen: false, isOverviewActive: false, isSuggestionsFocused: false, partnerActivityFilter: 'all', liveUsersVisible: true, freeRunCarouselRoutes: null, ...h.store };
    return new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : /^(set|clear|reset|consume|toggle|open)/.test(k) ? noop : undefined) });
  }
  const mapStore = Object.assign(
    (sel?: (s: Record<string, unknown>) => unknown) => (sel ? sel(storeState()) : storeState()),
    { getState: () => storeState() },
  );
  return { h, Stub, noop, mapStore, playerState };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: noop, replace: noop }), useSearchParams: () => ({ get: () => null }) }));
vi.mock('next/dynamic', () => ({ default: () => Stub('Dynamic') }));
vi.mock('framer-motion', () => {
  const MOTION_PROPS = new Set(['initial', 'animate', 'exit', 'transition', 'layout']);
  const cache = new Map<string, unknown>();
  const motion = new Proxy({}, {
    get: (_t, tag: string) => {
      if (!cache.has(tag)) {
        cache.set(tag, React.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
          const rest: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) if (!MOTION_PROPS.has(k)) rest[k] = v;
          return React.createElement(tag, { ...rest, ref });
        }));
      }
      return cache.get(tag);
    },
  });
  return { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) };
});
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_ref: unknown, cb: (snap: { data: () => unknown }) => void) => { h.snapCb = cb; return () => {}; },
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));
vi.mock('@/features/parks/core/context/MapModeContext', () => ({
  useMapMode: () => ({ mode: h.mode, setMode: noop, activityType: 'running' }),
  MapModeProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: h.flags, rawFlags: h.flags, loading: false }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'me', core: { gender: 'male', name: 'x', authorityId: 'a', isSuperAdmin: false }, personas: [] }, _hasHydrated: true, refreshProfile: async () => {} };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/parks', () => ({
  useMapLogic: () => ({
    isWorkoutActive: false, showSummary: false, showDopamine: false, focusedRoute: null, selectedRoute: null, workoutMode: 'discover', jitState: { isModalOpen: false },
    navState: 'idle', routesToDisplay: [], currentUserPos: null, userBearing: 0, livePath: [], isNavigationMode: false,
    setEffectiveUserPos: noop, setSimulationActive: noop, setShowSummary: noop, setWorkoutMode: noop, handleLocationClick: noop,
  }),
}));
vi.mock('@/lib/firestore.service', () => ({ syncLocationToFirestore: async () => {} }));
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => null }));
vi.mock('@/features/workout-engine/players/running/store/useRunningPlayer', () => ({ useRunningPlayer: Object.assign((sel?: (s: unknown) => unknown) => (sel ? sel(playerState()) : playerState()), { getState: () => playerState() }) }));
vi.mock('@/features/workout-engine/core/store/useSessionStore', () => ({ useSessionStore: (sel: (s: unknown) => unknown) => sel({ status: 'idle' }) }));
vi.mock('@/features/user/onboarding/components/JITSetupModal', () => ({ JITSetupModal: Stub('JITSetupModal') }));
vi.mock('@/features/safecity/hooks/usePresenceLayer', () => ({ usePresenceLayer: () => {} }));
vi.mock('@/features/home/hooks/useGoalCelebration', () => ({ useGoalCelebration: () => ({ celebrate: noop }) }));
vi.mock('@/features/heatmap/hooks/useActiveWorkoutHeartbeat', () => ({ useActiveWorkoutHeartbeat: () => {} }));
vi.mock('@/lib/mapPrefs', () => ({ readOwnedMapPrefs: async () => null, mapPrefsBelongToOtherAccount: () => false }));
vi.mock('@/features/parks/core/hooks/useDevSimulation', () => ({ useDevSimulation: () => ({ isMockEnabled: false, isSimulating: false, effectiveLocation: (p: unknown) => p, mockLocation: null }) }));
vi.mock('@/features/parks/core/store/useMapStore', () => ({ useMapStore: mapStore }));
vi.mock('../../recenter-control', () => ({ isFollowingNow: () => true, recenterControlLabel: () => 'כיוון' }));
vi.mock('@/features/parks/core/services/parks.service', () => ({ getPark: async () => null }));
vi.mock('@/features/parks/core/services/inventory.service', () => ({ InventoryService: Stub('InventoryService') }));
vi.mock('@/features/parks/core/store/useLegPlanStore', () => ({ useLegPlanStore: (sel: (s: unknown) => unknown) => sel({ legs: [] }) }));
vi.mock('@/features/parks/core/hooks/useDemoPresence', () => ({ useDemoPresence: () => [] }));
vi.mock('@/features/workout-engine/core/store/useSharedSession', () => ({ useSharedSession: () => ({ phase: 'idle', groupId: null }) }));
vi.mock('@/features/workout-engine/shared/hooks/useGroupPresenceListener', () => ({ useGroupPresenceListener: () => ({ partnerPositions: [], totalDistanceKm: 0, milestones: [] }) }));
vi.mock('@/features/workout-engine/shared/components/ParticipantStrip', () => ({ default: Stub('ParticipantStrip') }));
vi.mock('@/features/workout-engine/shared/components/MilestoneFeed', () => ({ default: Stub('MilestoneFeed') }));
vi.mock('@/features/workout-engine/shared/components/SessionLobbyOverlay', () => ({ default: Stub('SessionLobbyOverlay') }));
vi.mock('../DiscoverLayer', () => ({ default: Stub('DiscoverLayer') }));
vi.mock('../BuilderLayer', () => ({ default: Stub('BuilderLayer') }));
vi.mock('../NavigateLayer', () => ({ default: Stub('NavigateLayer') }));
vi.mock('../FreeRunLayer', () => ({ default: Stub('FreeRunLayer') }));
vi.mock('../PlannedPreviewLayer', () => ({ default: Stub('PlannedPreviewLayer') }));
vi.mock('../ActiveWorkoutLayer', () => ({ default: Stub('ActiveWorkoutLayer') }));
vi.mock('../SummaryLayer', () => ({ default: Stub('SummaryLayer') }));
vi.mock('@/features/parks/core/components/TurnCarousel', () => ({ default: Stub('TurnCarousel') }));
vi.mock('@/features/workout-engine/hybrid/useHybridRun', () => ({ useHybridRun: (sel: (s: unknown) => unknown) => sel({ phase: 'idle', active: false }) }));
vi.mock('@/hooks/useParkLiveV2', () => ({ useParkLiveV2: () => false }));
vi.mock('@/features/parks/core/services/geoUtils', () => ({ computeRouteTurns: () => [] }));
vi.mock('@/features/parks/core/components/SessionControlBar', () => ({ default: Stub('SessionControlBar') }));
vi.mock('@/features/parks/client/components/UserProfileSheet', () => ({ default: Stub('UserProfileSheet') }));
vi.mock('@/components/ui/AppHeader', () => ({ default: Stub('AppHeader') }));
vi.mock('@/features/workout-engine/players/running/components/RouteRun/v2/RouteRunLiveV2Controller', () => ({ default: Stub('RouteRunLiveV2Controller') }));
vi.mock('@/features/user/onboarding/services/first-run-tour', () => ({ hasMapDeepLink: () => false }));
vi.mock('@/features/user/onboarding/entry-v2-landing', () => ({ consumeEntryV2Landing: () => false }));

import MapShell from '../../MapShell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<MapShell />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
}
const dump = () =>
  document.body.innerHTML.replace(/ style="[^"]*"/g, '').replace(/:r[0-9a-z]+:/g, ':r:').replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/map-shell-w4/${name}.html`;

beforeEach(() => { vi.useFakeTimers(); h.mode = 'discover'; h.flags = { enableHomeV2: false }; h.snapCb = null; h.store = {}; });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.useRealTimers(); });

describe('MapShell', () => {
  it('discover mode', async () => {
    await mount();
    await expect(dump()).toMatchFileSnapshot(snap('discover'));
  });
  it('active mode: recenter / heading pill', async () => {
    h.mode = 'active';
    await mount();
    await expect(dump()).toMatchFileSnapshot(snap('active-pill'));
  });
  it('referral toast', async () => {
    await mount();
    act(() => { h.snapCb!({ data: () => ({ core: { referralCount: 0 } }) }); });
    act(() => { h.snapCb!({ data: () => ({ core: { referralCount: 1 } }) }); });
    await expect(dump()).toMatchFileSnapshot(snap('referral-toast'));
  });
});

// @vitest-environment jsdom
/**
 * i18n wave 4 (bidirectional layout), map area, part 5: Hebrew DOM recorded from UNMODIFIED main for the map
 * layers the wave-4 map PR (#914) skipped for lack of coverage: BuilderLayer (route picker), PlannedPreviewLayer
 * (loading / classic card) and FreeRunLayer (browse, v1 and v2 workout with the group badge).
 * Everything outside the layer's own markup (AppMap, overlays, shells, stores) is a stub, so a changed class
 * can only come from the layer file itself. Inline `style` and React ids are stripped before comparing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { h, Stub } = vi.hoisted(() => { const h = {
  search: new URLSearchParams(''),
  workout: null as unknown,
  flags: { enableHomeV2: false } as Record<string, unknown>,
  participants: [] as unknown[],
  active: false,
  sessionMode: 'free' as string,
}; const Stub = (name: string) => () => ({ type: 'div', props: { 'data-stub': name }, key: null, ref: null, $$typeof: Symbol.for('react.element'), _owner: null }); return { h, Stub }; });


vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (k: string) => h.search.get(k) }),
  useRouter: () => ({ push: () => {} }),
}));
vi.mock('next/dynamic', () => ({ default: () => Stub('AppMap') }));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('@/features/parks/core/context/MapModeContext', () => ({
  useMapMode: () => ({ setMode: () => {}, workoutId: null, activityType: 'running' }),
}));
vi.mock('@/features/parks', () => ({ useMapLogic: () => ({}) }));
vi.mock('@/features/parks/core/hooks/useSuppressBottomNav', () => ({ useSuppressBottomNav: () => {} }));
vi.mock('@/features/parks/core/components/WorkoutPreferencesModal', () => ({
  default: ({ isOpen, onUpdate }: { isOpen: boolean; onUpdate: (p: unknown) => void }) =>
    isOpen ? React.createElement('button', { 'data-prefs': true, onClick: () => onUpdate({ activity: 'running' }) }, 'prefs') : null,
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: h.flags, loading: false }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'me', core: { gender: 'male', isSuperAdmin: false }, personas: [], running: {} }, refreshProfile: async () => {} };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/workout-engine/players/running/store/useRunningPlayer', () => {
  const state = () => ({
    currentWorkout: h.workout, sessionMode: h.sessionMode, isMapFollowEnabled: true, mapHeadingMode: 'north', lastPosition: null,
    setMapFollowEnabled: () => {}, routeZones: [], setGuidedRouteId: () => {}, setGuidedRouteName: () => {},
    setGuidedRouteDistanceKm: () => {}, setActiveRoutePath: () => {}, setCurrentWorkout: () => {},
  });
  const useRunningPlayer = (sel?: (s: ReturnType<typeof state>) => unknown) => (sel ? sel(state()) : state());
  (useRunningPlayer as unknown as { getState: () => unknown }).getState = state;
  return { useRunningPlayer };
});
// PlannedPreviewLayer deps
vi.mock('@/features/workout-engine/core/services/running-admin.service', () => ({
  getRunWorkoutTemplate: async () => null, getPaceMapConfig: async () => null, getRunProgramTemplate: async () => null,
}));
vi.mock('@/features/workout-engine/core/services/running-engine.service', () => ({ materializeWorkout: () => null, computeZones: () => ({}) }));
vi.mock('@/lib/calm-return', () => ({
  calmRunWorkout: () => null, calmCopy: () => ({}), getDaysAway: () => 0, resolveCalmReturn: () => ({ isLightened: false }),
}));
vi.mock('@/lib/feature-flag-live', () => ({ readLiveFlag: () => false }));
vi.mock('@/features/workout-engine/services/running-metadata.service', () => ({ resolveRunningWorkoutMetadata: async () => {} }));
vi.mock('@/features/workout-engine/players/running/components/RunBriefingDrawer', () => ({ default: Stub('RunBriefingDrawer') }));
vi.mock('@/features/workout-engine/players/running/components/overview-v2/RunOverviewMapHost', () => ({ default: Stub('RunOverviewMapHost') }));
vi.mock('@/features/workout-engine/players/running/utils/run-overview/run-edits', () => ({
  applyRunEdits: (w: unknown) => w, isCustomized: () => false, readRunEditParams: () => null,
}));
vi.mock('@/features/workout-engine/players/running/components/preview-v2/useRunPreviewModel', () => ({ useRunPreviewModel: () => null }));
vi.mock('@/features/workout-engine/players/running/utils/run-preview/run-week', () => ({ parseRunWeekParams: () => null }));
// FreeRunLayer deps
vi.mock('@/features/workout-engine/core/store/useSharedSession', () => ({ useSharedSession: () => ({ groupId: null, routeId: null }) }));
vi.mock('@/features/workout-engine/hybrid/HybridStationLayer', () => ({ default: Stub('HybridStationLayer') }));
vi.mock('@/features/workout-engine/hybrid/useHybridRun', () => ({ useHybridRun: () => (h.active ? true : false) }));
vi.mock('../useRouteDirectionAdapt', () => ({ useRouteDirectionAdapt: () => ({ startArrow: null }) }));
vi.mock('@/features/workout-engine/hybrid/hybrid-orchestrator', () => ({ isApproachingStation: () => false }));
vi.mock('@/features/workout-engine/players/running/components/FreeRun/GpsDebugHud', () => ({ default: Stub('GpsDebugHud') }));
vi.mock('@/features/workout-engine/shared/components/LiveSessionShell', () => ({
  default: ({ children, isActive }: { children: (c: Record<string, unknown>) => React.ReactNode; isActive: boolean }) =>
    React.createElement('div', { 'data-shell': isActive }, children({ dragControls: {}, isMinimized: false, onExpand: () => {}, onMinimize: () => {}, isDragging: false })),
}));
vi.mock('@/features/workout-engine/players/running/components/FreeRun/FreeRunOverlay', () => ({
  default: Stub('FreeRunOverlay'), RunMiniDockContent: Stub('RunMiniDockContent'),
}));
vi.mock('@/features/workout-engine/players/running/components/FreeRun/RunLapsList', () => ({ default: Stub('RunLapsList') }));
vi.mock('@/features/workout-engine/shared/hooks/useGroupPresenceListener', () => ({
  useGroupPresenceListener: () => ({ partnerPositions: h.participants }),
}));
vi.mock('@/features/workout-engine/players/running/components/FreeRun/InviteRunButton', () => ({ default: Stub('InviteRunButton') }));
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const state = () => ({
    setIsLapsOpen: noop, setSelectedParticipantUid: noop, setActiveStoryIndex: noop, setGroupParticipants: noop,
    selectedParticipantUid: null, storyBarHeight: 0, navCardHeight: 0,
  });
  const useMapStore = (sel?: (s: Record<string, unknown>) => unknown) => (sel ? sel(state()) : state());
  return { useMapStore };
});
vi.mock('@/features/workout-engine/players/running/components/FreeRun/StatsCarousel/MainMetrics', () => ({ default: Stub('MainMetrics') }));
vi.mock('@/features/workout-engine/players/running/components/FreeRun/StatsCarousel/LapMetrics', () => ({ default: Stub('LapMetrics') }));
vi.mock('@/features/workout-engine/players/running/components/FreeRun/StatsCarousel/VSSlide', () => ({ default: Stub('VSSlide') }));
vi.mock('@/features/workout-engine/players/running/components/FreeRun/v2/FreeRunOverlayV2', () => ({ default: Stub('FreeRunOverlayV2') }));
vi.mock('@/features/workout-engine/players/running/components/FreeRun/v2/FreeRunLapsLayerV2', () => ({ default: Stub('FreeRunLapsLayerV2') }));
vi.mock('@/features/workout-engine/players/running/components/FreeRun/v2/FreeRunMiniV2', () => ({ default: Stub('FreeRunMiniV2') }));
vi.mock('@/features/user/onboarding/components/entry-whatnow/EntryRouteTours', () => ({ RoutePlayerTip: Stub('RoutePlayerTip') }));
vi.mock('@/features/workout-engine/hybrid/v2', () => ({
  HybridPlayerV2Provider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  HybridOverlayV2: Stub('HybridOverlayV2'), HybridSessionListV2: Stub('HybridSessionListV2'),
  HybridMiniV2: Stub('HybridMiniV2'), HybridStationHostV2: Stub('HybridStationHostV2'),
}));

import BuilderLayer from '../BuilderLayer';
import PlannedPreviewLayer from '../PlannedPreviewLayer';
import FreeRunLayer from '../FreeRunLayer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const noop = () => {};

function mount(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}
const dump = () =>
  document.body.innerHTML
    .replace(/ style="[^"]*"/g, '')
    .replace(/:r[0-9a-z]+:/g, ':r:')
    .replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/map-layers-w4/${name}.html`;
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(10); }); };

beforeEach(() => {
  vi.useFakeTimers();
  h.search = new URLSearchParams('');
  h.workout = null;
  h.flags = { enableHomeV2: false };
  h.participants = [];
  h.active = false;
  h.sessionMode = 'free';
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('BuilderLayer route picker', () => {
  const route = (id: string) => ({ id, name: id === 'a' ? 'לולאת הירקון' : '', distance: 4.2, duration: 25 });
  async function open(logic: Record<string, unknown>) {
    mount(<BuilderLayer logic={{ setSmartPaths: noop, setFocusedRoute: noop, setRouteGenerationIndex: noop, updateFilter: noop, handleShuffle: noop, ...logic } as never} />);
    act(() => { (document.querySelector('[data-prefs]') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
  }
  it('generating', async () => {
    await open({ isGenerating: true, routesToDisplay: [] });
    await expect(dump()).toMatchFileSnapshot(snap('builder-generating'));
  });
  it('routes with a focused one', async () => {
    await open({ isGenerating: false, routesToDisplay: [route('a'), route('b')], focusedRoute: route('a'), startActiveWorkout: noop });
    await expect(dump()).toMatchFileSnapshot(snap('builder-routes'));
  });
  it('error + empty', async () => {
    await open({ isGenerating: false, routesToDisplay: [], shuffleOutcome: 'error', preferences: { activity: 'running' } });
    await expect(dump()).toMatchFileSnapshot(snap('builder-error'));
  });
  it('empty', async () => {
    await open({ isGenerating: false, routesToDisplay: [] });
    await expect(dump()).toMatchFileSnapshot(snap('builder-empty'));
  });
});

describe('PlannedPreviewLayer', () => {
  it('auto start, preparing', async () => {
    h.search = new URLSearchParams('autoStart=true');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(<PlannedPreviewLayer logic={{ startActiveWorkout: noop } as never} />).replaceAll('<!-- -->', '').replace(/ style="[^"]*"/g, '');
    await expect(html).toMatchFileSnapshot(snap('planned-preparing'));
  });
  it('loading', async () => {
    // contextWorkoutId is null -> the effect would stop loading; the first paint is the loading card.
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(<PlannedPreviewLayer logic={{ startActiveWorkout: noop } as never} />).replaceAll('<!-- -->', '').replace(/ style="[^"]*"/g, '');
    await expect(html).toMatchFileSnapshot(snap('planned-loading'));
  });
  it('classic card', async () => {
    h.workout = { title: 'ריצת קצב', blocks: [{ label: 'חימום' }, { type: 'run' }, {}] };
    mount(<PlannedPreviewLayer logic={{ startActiveWorkout: noop } as never} />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('planned-card'));
  });
});

describe('FreeRunLayer', () => {
  const logic = { isWorkoutActive: false, preferences: { activity: 'running' }, focusedRoute: null, livePath: [], setFocusedRoute: noop, setWorkoutMode: noop, startActiveWorkout: noop, isNavigationMode: false };
  const partner = { uid: 'u2', name: 'דנה', personaImageUrl: '', color: '#fff', distance: 1, activityStatus: 'running' };
  it('browse', async () => {
    mount(<FreeRunLayer logic={logic as never} effectivePos={null} />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('free-run-browse'));
  });
  it('workout v1 with a partner', async () => {
    h.participants = [partner];
    mount(<FreeRunLayer logic={{ ...logic, isWorkoutActive: true } as never} effectivePos={null} />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('free-run-workout-v1'));
  });
  it('workout v2 with a partner', async () => {
    h.flags = { enableHomeV2: true };
    h.participants = [partner];
    mount(<FreeRunLayer logic={{ ...logic, isWorkoutActive: true } as never} effectivePos={null} />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('free-run-workout-v2'));
  });
});

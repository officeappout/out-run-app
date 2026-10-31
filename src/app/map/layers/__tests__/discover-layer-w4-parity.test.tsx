// @vitest-environment jsdom
/**
 * i18n wave 4 (bidirectional layout), map area, part 7: DiscoverLayer's own chrome (top bar wrapper, layers
 * control, "+" / recenter stack, hybrid entry button, "together" and search-area wrappers) recorded from
 * UNMODIFIED main in Hebrew. Every child component, hook and store is a stub, so the DOM is the layer file's own
 * markup. Inline `style`, React ids and `<!-- -->` are stripped before comparing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { h, Stub, noop, mapStore } = vi.hoisted(() => {
  const h = {
    flags: { enableHomeV2: false, enableHybridSlots: false } as Record<string, unknown>,
    store: {} as Record<string, unknown>,
    logic: {} as Record<string, unknown>,
    bounds: null as unknown,
  };
  const Stub = (name: string) => () => ({ type: 'div', props: { 'data-stub': name }, key: null, ref: null, $$typeof: Symbol.for('react.element'), _owner: null });
  const noop = () => undefined;
  function storeState(): Record<string, unknown> {
    const base: Record<string, unknown> = { isMapVisuallyReady: true, viewportBounds: h.bounds, viewportSearchActive: false, mapEmptyTapTick: 0, pendingCommute: null, pendingRouteStart: null, pendingHybridIntent: null, selectedPark: null, globalSheet: null, ...h.store };
    return new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : /^(set|clear|reset|consume|toggle|on|add|remove)/.test(k) ? noop : undefined) });
  }
  const mapStore = Object.assign(
    (sel?: (s: Record<string, unknown>) => unknown) => (sel ? sel(storeState()) : storeState()),
    { getState: () => storeState() },
  );
  return { h, Stub, noop, mapStore };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: noop }), useSearchParams: () => ({ get: () => null }) }));
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
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));
vi.mock('@/features/parks/core/context/MapModeContext', () => ({ useMapMode: () => ({ setMode: noop, activityType: 'running' }) }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: h.flags, rawFlags: h.flags, loading: false }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'me', core: { gender: 'male', isSuperAdmin: false }, social: { groupIds: [] }, lifestyle: {} } };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/parks', () => ({ useMapLogic: () => h.logic }));
vi.mock('@/features/user/onboarding/services/mini-domain-assessment', () => ({ startMiniDomainAssessment: noop, startFullStrengthQuestionnaire: noop }));
vi.mock('@/features/user/identity/services/access-control.service', () => ({ hasAssessedStrengthDomain: () => false }));
vi.mock('@/features/workout-engine/core/context/build-step-context', () => ({ buildStepContext: () => ({ stepGoal: 0, stepsRemaining: 0 }) }));
vi.mock('@/features/activity/store/useActivityStore', () => ({ useActivityStore: Object.assign((sel: (s: unknown) => unknown) => sel({ today: null }), { getState: () => ({ today: null }) }) }));
vi.mock('@/features/user/onboarding/services/single-domain-assessment.service', () => ({ PRIMARY_CATEGORIES: [] }));
vi.mock('@/features/parks/core/components/BottomJourneyContainer', () => ({ default: Stub('BottomJourneyContainer') }));
vi.mock('@/features/parks/core/components/NavigationHub', () => ({ default: Stub('NavigationHub') }));
vi.mock('@/features/parks/core/components/LegPlanStartPreview', () => ({ default: Stub('LegPlanStartPreview') }));
vi.mock('@/features/parks/core/components/hybrid/HybridOverviewScreen', () => ({ default: Stub('HybridOverviewScreen') }));
vi.mock('@/features/parks/core/components/hybrid/OverviewTitleBar', () => ({ default: Stub('OverviewTitleBar') }));
vi.mock('@/features/workout-engine/adaptation/log-exercise-swap', () => ({ logExerciseSwap: noop }));
vi.mock('@/features/workout-engine/players/strength/hooks/useSwapFixesV1', () => ({ useSwapFixesV1: () => false }));
vi.mock('@/features/workout-engine/players/strength/logic/swap-fixes', () => ({ collectWorkoutExerciseIds: noop }));
vi.mock('@/features/workout-engine/players/strength/logic/pyramid-step-swap', () => ({ swapPyramidStep: noop }));
vi.mock('@/features/workout-engine/hybrid/useHybridSwapPark', () => ({ useHybridSwapPark: () => null }));
vi.mock('@/features/workout-engine/adaptation/exercise-log-stamp', () => ({ adaptationStampForPlan: noop, swapStampForEntry: noop }));
vi.mock('@/features/content/shared/localized-text.types', () => ({ getLocalizedText: noop }));
vi.mock('@/features/workouts/components/workout-preview-drawer/hooks/useProgramMap', () => ({ useProgramMap: () => ({ programMap: {} }) }));
vi.mock('@/lib/scheduleIdle', () => ({ scheduleIdle: noop }));
vi.mock('@/features/parks/core/components/hybrid/HybridSlotCarousel', () => ({ default: Stub('HybridSlotCarousel'), HybridEntryButton: Stub('ShimmerPhraseButton') }));
vi.mock('@/features/workout-engine/hybrid/round-trip', () => ({ composedWorkoutMin: noop, composedCardStats: noop, cardTotalFor: noop, readRoundTripPref: () => null }));
vi.mock('@/components/ui/ShimmerPhraseButton', () => ({ default: Stub('ShimmerPhraseButton') }));
vi.mock('@/features/workout-engine/hybrid/hybrid-slots', () => ({ resolveSlots: () => [], presetToIntent: noop }));
vi.mock('@/features/workout-engine/hybrid/aerobic-kind', () => ({ hybridSessionTitle: noop }));
vi.mock('@/features/workout-engine/core/store/useSuggestionEngineStore', () => ({ useSuggestionEngineStore: Object.assign((sel: (s: unknown) => unknown) => sel({ status: 'idle', suggestions: null }), { getState: () => ({ setContext: noop }) }) }));
vi.mock('@/features/workout-engine/core/context/build-map-user-context', () => ({ buildMapUserContext: noop }));
vi.mock('@/features/workout-engine/core/context/apply-ranked-slot-order', () => ({ applyRankedSlotOrder: (a: unknown) => a }));
vi.mock('@/features/workout-engine/hybrid/planned-run-slot', () => ({ buildPlannedRunSlot: () => null }));
vi.mock('@/features/workout-engine/hybrid/planned-walk-slot', () => ({ buildPlannedWalkSlot: () => null, withTodayPlanSlots: (a: unknown) => a }));
vi.mock('@/features/workout-engine/hybrid/rest-day-slots', () => ({ isMapRestDay: () => false, restDaySlots: (a: unknown) => a }));
vi.mock('@/features/home/hooks/useWalkWeek', () => ({ useWalkWeek: () => ({ isWalker: false, today: null }) }));
vi.mock('@/features/home/utils/home-walk-slot', () => ({ resolveHomeWalkSlot: () => null }));
vi.mock('@/features/home/utils/home-run-slot', () => ({ isQualityRunEntry: noop }));
vi.mock('@/features/home/utils/dailyStrengthTarget', () => ({ isTodayTrainingDay: () => false }));
vi.mock('@/features/schedule/walking/walkHandoff', () => ({ markPendingWalkEntry: noop, consumeWalkAutoRoute: () => false }));
vi.mock('@/features/home/hooks/useHomeRunSlot', () => ({ useHomeRunSlot: () => ({ slot: null, hasRunningPlan: false }) }));
vi.mock('@/features/workout-engine/hybrid/smart-cards/useSmartHybridSlots', () => ({ useSmartHybridSlots: () => ({ slots: null, keySuffix: () => '' }) }));
vi.mock('@/features/weather/core/weather-access', () => ({ isWeatherOnFor: () => false }));
vi.mock('@/features/user/onboarding/components/FirstRunTour', () => ({ default: Stub('FirstRunTour') }));
vi.mock('@/features/user/onboarding/components/TourReplayHost', () => ({ default: Stub('TourReplayHost') }));
vi.mock('@/features/parks/core/components/coach/park-coach-anchor', () => ({ ParkCoachAnchorRequest: Stub('ParkCoachAnchorRequest') }));
vi.mock('@/features/user/onboarding/services/first-run-tour', () => ({ FIRST_RUN_COACH: {}, firstRunToursEnabled: () => false, isMapTourBlocked: () => true }));
vi.mock('@/features/parks/core/services/route-request.utils', () => ({ stepsToTargetKm: noop }));
vi.mock('@/features/parks/core/components/RouteCarousel', () => ({ default: Stub('RouteCarousel') }));
vi.mock('@/features/parks/core/components/overview/route/RouteOverviewOverlay', () => ({ default: Stub('RouteOverviewOverlay') }));
vi.mock('@/features/parks/core/components/overview/CardHiddenUnderDrawer', () => ({ default: Stub('CardHiddenUnderDrawer') }));
vi.mock('@/features/workout-engine/players/running/components/overview-v2/RouteOverviewWithTodayRun', () => ({ default: Stub('RouteOverviewWithTodayRun') }));
vi.mock('@/features/workout-engine/players/running/components/overview-v2/startPlannedRunOnRoute', () => ({ startPlannedRunOnRoute: noop }));
vi.mock('@/features/parks/core/components/overview/route/route-overview', () => ({ playerActivityFor: noop }));
vi.mock('@/features/parks/core/components/FloatingSearchBar', () => ({ default: Stub('FloatingSearchBar') }));
vi.mock('@/features/parks/core/components/MapModeHeader', () => ({ default: Stub('MapModeHeader'), MapMode: Stub('MapMode') }));
vi.mock('@/features/parks/core/components/RouteGenerationLoader', () => ({ default: Stub('RouteGenerationLoader') }));
vi.mock('@/features/parks/client/components/park-preview', () => ({ ParkPreview: Stub('ParkPreview') }));
vi.mock('@/features/parks/core/components/MapLayersControl', () => ({ MapLayersControl: Stub('MapLayersControl') }));
vi.mock('@/features/parks/core/store/useMapStore', () => ({ useMapStore: mapStore }));
vi.mock('@/features/parks/core/hooks/useRouteOverviewHandoff', () => ({ useRouteOverviewHandoff: () => {} }));
vi.mock('@/features/parks/core/store/useLegPlanStore', () => ({ useLegPlanStore: Object.assign((sel?: (s: unknown) => unknown) => (sel ? sel({ plan: [], stops: [] }) : { plan: [], stops: [] }), { getState: () => ({ plan: [], stops: [] }) }) }));
vi.mock('@/features/parks/core/store/usePendingAddressStore', () => ({ usePendingAddressStore: Object.assign((sel?: (s: unknown) => unknown) => (sel ? sel({}) : {}), { getState: () => ({}) }) }));
vi.mock('@/features/workout-engine/players/running/store/useRunningPlayer', () => ({ useRunningPlayer: Object.assign((sel?: (s: unknown) => unknown) => (sel ? sel({ sessionMode: 'free' }) : {}), { getState: () => ({}) }) }));
vi.mock('@/features/workout-engine/core/store/useSharedSession', () => ({ useSharedSession: () => ({ groupId: null, phase: 'idle' }) }));
vi.mock('@/features/parks/core/hooks/usePartnerData', () => ({ usePartnerData: () => ({ live: [], scheduled: [], isLoading: false }) }));
vi.mock('@/features/parks/core/hooks/useUserCityName', () => ({ useUserCityName: () => null }));
vi.mock('@/features/parks/core/store/useRecentSearchesStore', () => ({ useRecentSearchesStore: (sel: (s: unknown) => unknown) => sel({ recents: [] }) }));
vi.mock('@/features/parks/core/components/SearchPickCards', () => ({ SearchDestinationCard: Stub('SearchDestinationCard'), SearchRouteCard: Stub('SearchRouteCard') }));
vi.mock('@/features/parks/core/dest-planner', () => ({ DestinationPlanner: Stub('DestinationPlanner'), defaultPlannerMode: () => 'walking' }));
vi.mock('@/features/parks/core/hooks/useSearchNavigation', () => ({ findOfficialRouteById: noop }));
vi.mock('@/features/partners', () => ({ PartnerBubbles: Stub('PartnerBubbles'), PartnerOverlay: Stub('PartnerOverlay'), RadarAnimation: Stub('RadarAnimation'), usePartnerFilters: (sel: (s: unknown) => unknown) => sel({ distanceKm: 3, liveActivity: 'all', setLiveActivity: noop }) }));
vi.mock('@/features/parks/core/hooks/useCommunityEnrichment', () => ({ useCommunityEnrichment: () => ({ enrichRoutes: (r: unknown) => r }) }));
vi.mock('../DiscoverOverlays', () => ({ FreeRunDrawer: Stub('FreeRunDrawer'), RouteDetailSheet: Stub('RouteDetailSheet'), ExerciseReplacementModal: Stub('ExerciseReplacementModal'), ExerciseDetailDrawer: Stub('ExerciseDetailDrawer'), ContributionWizard: Stub('ContributionWizard'), QuickReportSheet: Stub('QuickReportSheet'), PlannedActivityComposeSheet: Stub('PlannedActivityComposeSheet'), UnifiedPlusDrawer: Stub('UnifiedPlusDrawer'), SetSavedPlaceSheet: Stub('SetSavedPlaceSheet'), useDiscoverOverlayPreload: () => {} }));
vi.mock('@/features/parks/core/hooks/useUserLocationSync', () => ({ useUserLocationSync: () => {} }));
vi.mock('@/lib/planned-run', () => ({ consumePendingPlannedRun: () => null, stashPendingPlannedRun: noop }));
vi.mock('@/features/generation-review/capture/hooks', () => ({ logHybridShown: noop }));
vi.mock('../EntryWhatNowMount', () => ({ default: Stub('EntryWhatNowMount') }));
vi.mock('@/features/user/onboarding/components/entry-whatnow/EntryRouteTours', () => ({ RouteFirstTour: Stub('RouteFirstTour') }));
vi.mock('@/features/user/onboarding/services/entry-whatnow', () => ({ firstWorkoutNote: () => null, mapTourAfterWhatNow: () => false, routeSuggestionFromSlots: () => null }));
vi.mock('@/lib/health-declaration', () => ({ hasAcceptedHealthDeclaration: () => false }));


import DiscoverLayer from '../DiscoverLayer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

function makeLogic(over: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    navState: 'idle', searchQuery: '', suggestions: [], isSearching: false, searchInputRef: { current: null }, currentUserPos: { lat: 32, lng: 34.8 },
    routesToDisplay: [], focusedRoute: null, selectedRoute: null, preferences: { activity: 'running' }, isFollowing: false, userBearing: 0,
    loadingRouteIds: [], ...over,
  };
  return new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : /^(set|handle|start|update|clear|reset)/.test(k) ? noop : undefined) });
}
async function mount(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(el); });
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
}
const dump = () =>
  document.body.innerHTML.replace(/ style="[^"]*"/g, '').replace(/:r[0-9a-z]+:/g, ':r:').replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/discover-layer-w4/${name}.html`;

beforeEach(() => {
  vi.useFakeTimers();
  h.flags = { enableHomeV2: false, enableHybridSlots: false };
  h.store = {};
  h.bounds = null;
  h.logic = makeLogic();
});
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.useRealTimers(); });

describe('DiscoverLayer chrome', () => {
  it('default discover surface, v1', async () => {
    await mount(<DiscoverLayer logic={h.logic as never} />);
    await expect(dump()).toMatchFileSnapshot(snap('discover-v1'));
  });
  it('default discover surface, v2 with the hybrid entry button', async () => {
    h.flags = { enableHomeV2: true, enableHybridSlots: true };
    await mount(<DiscoverLayer logic={h.logic as never} />);
    await expect(dump()).toMatchFileSnapshot(snap('discover-v2-hybrid'));
  });
  it('"search this area" pill after panning', async () => {
    h.bounds = { neLng: 34.9, neLat: 32.1, swLng: 34.7, swLat: 31.9 };
    const el = <DiscoverLayer logic={h.logic as never} />;
    await mount(el);
    h.bounds = { neLng: 35.3, neLat: 32.5, swLng: 35.1, swLat: 32.3 };
    await act(async () => { root!.render(<DiscoverLayer logic={h.logic as never} />); });
    expect(dump()).toContain('>חפש באזור זה<');
    await expect(dump()).toMatchFileSnapshot(snap('discover-search-area'));
  });
});

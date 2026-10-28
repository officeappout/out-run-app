// @vitest-environment jsdom
/**
 * i18n wave 4 (bidirectional layout), map area, part 1: Hebrew DOM recorded from UNMODIFIED main for the
 * components the wave-4 map PR (#914) skipped for lack of coverage. The converted components must render
 * the same Hebrew DOM apart from class tokens (physical -> logical) and `dir="rtl"` removal; that is checked
 * by scripts/i18n/wave4-snapshot-proof.ts, not by this test.
 *
 * Stores and services are fakes; framer-motion is replaced by plain elements. Inline `style` attributes are
 * stripped and React `:rN:` ids normalised before comparing - neither is text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const hoisted = vi.hoisted(() => ({
  saved: { places: { home: null, work: null } as Record<string, unknown> },
}));

vi.mock('framer-motion', () => {
  const MOTION_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants', 'drag', 'dragControls', 'dragListener',
    'dragConstraints', 'dragElastic', 'onDragEnd', 'onDragStart', 'onDrag', 'whileTap', 'whileHover', 'layout',
    'dragMomentum', 'onAnimationComplete', 'onPanEnd', 'layoutId',
  ]);
  const cache = new Map<string, unknown>();
  const motion = new Proxy({}, {
    get: (_t, tag: string) => {
      if (!cache.has(tag)) {
        const Plain = React.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
          const rest: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) if (!MOTION_PROPS.has(k)) rest[k] = v;
          return React.createElement(tag, { ...rest, ref });
        });
        Plain.displayName = `motion.${tag}`;
        cache.set(tag, Plain);
      }
      return cache.get(tag);
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useDragControls: () => ({ start: () => {} }),
    useAnimation: () => ({ start: async () => {} }),
    useMotionValue: (v: unknown) => ({ get: () => v, set: () => {} }),
    useReducedMotion: () => false,
    useAnimationControls: () => ({ start: async () => {}, set: () => {} }),
    MotionGlobalConfig: {},
  };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: true }, loading: false }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => null, setOnboardingPref: () => {} }));
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const state = () => ({
    walkToRouteMinutes: null, setFreeRunCarouselRoutes: noop, setOverviewSheetHeightPx: noop, setIsOverviewActive: noop,
    setHybridRouteStations: noop, setHybridWalkLegs: noop,
  });
  const useMapStore = (sel?: (s: Record<string, unknown>) => unknown) => (sel ? sel(state()) : state());
  (useMapStore as unknown as { getState: () => unknown }).getState = state;
  return { useMapStore };
});
vi.mock('@/features/user/places/store/useSavedPlacesStore', async (orig) => ({
  ...(await orig<typeof import('@/features/user/places/store/useSavedPlacesStore')>()),
  useSavedPlacesStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ places: hoisted.saved.places, setPlace: () => {}, clearPlace: () => {} }),
}));
vi.mock('@/features/workout-engine/players/running', () => ({
  RunLapsTable: () => React.createElement('div', { 'data-laps': true }),
  ActiveDashboard: () => React.createElement('div', { 'data-dash': true }),
  RunControls: () => React.createElement('div', { 'data-controls': true }),
}));
vi.mock('@/features/parks/core/dest-planner/useDestinationPlan', () => ({
  useDestinationPlan: () => ({
    mode: 'walking', preference: null, status: 'ready', options: [], selected: null, available: [],
    setMode: () => {}, setPreference: () => {}, select: () => {}, knownKm: 2.4, minutes: { walking: 30, running: 14, cycling: 9 },
  }),
}));
vi.mock('@/features/parks/core/hooks/useSearchNavigation', () => ({
  MIN_SEARCH_CHARS: 2,
  getNearbySearchSuggestions: async () => [],
  findOfficialRoutesNear: async () => [{ id: 'a', name: 'לולאת הירקון' }, { id: 'b', name: 'טיילת' }],
}));
vi.mock('@/features/parks/core/dest-planner/PlannerRouteCard', () => ({ PlannerRouteCard: () => null }));
vi.mock('@/features/parks/core/dest-planner/PlannerSelectedRow', () => ({ PlannerSelectedRow: () => null }));

import AIChatOverlay from '../AIChatOverlay';
import ActiveWorkoutOverlay from '../ActiveWorkoutOverlay';
import SavedPlacesQuickRow from '../SavedPlacesQuickRow';
import { SearchDestinationCard } from '../SearchPickCards';
import DestinationPlanner from '../../dest-planner/DestinationPlanner';
import type { Route } from '@/features/parks/core/types/route.types';

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
    .replace(/«r[0-9a-z]+»/g, ':r:')
    .replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/map-w4/${name}.html`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T08:40:00'));
  hoisted.saved.places = { home: null, work: null };
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(10); }); };

describe('AIChatOverlay', () => {
  it('first AI message', async () => {
    mount(<AIChatOverlay isOpen onClose={noop} onSendMessage={async () => ({ message: 'x' })} initialMessage="שלום, איך אפשר לעזור?" />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('ai-chat-initial'));
  });
  it('user message + AI loading bubble', async () => {
    mount(<AIChatOverlay isOpen onClose={noop} onSendMessage={() => new Promise(() => {})} initialMessage="שלום" />);
    await flush();
    const input = document.querySelector('input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(input, 'תכנן לי ריצה'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    const send = Array.from(document.querySelectorAll('button')).pop()!;
    await act(async () => { send.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('ai-chat-loading'));
  });
});

describe('ActiveWorkoutOverlay', () => {
  const base = {
    mode: 'running' as const, startTime: 1, distance: 1.2, averagePace: 6, isPaused: false, onPause: noop, onResume: noop,
    onStop: noop, onAction: noop, livePath: [], currentLocation: null, isGuidedMode: false, calories: 50,
  };
  it('free run with a location error', async () => {
    mount(<ActiveWorkoutOverlay {...base} locationError="אין אות GPS" />);
    await expect(dump()).toMatchFileSnapshot(snap('active-overlay-free'));
  });
  it('guided route', async () => {
    const route = { id: 'r', name: 'x', distance: 4, features: { hasGym: true } } as unknown as Route;
    mount(<ActiveWorkoutOverlay {...base} isGuidedMode route={route} distance={2} />);
    await expect(dump()).toMatchFileSnapshot(snap('active-overlay-guided'));
  });
});

describe('SavedPlacesQuickRow', () => {
  it('both unset', async () => {
    mount(<SavedPlacesQuickRow onPick={noop} onSetRequest={noop} />);
    await expect(dump()).toMatchFileSnapshot(snap('saved-row-unset'));
  });
  it('home set, long-press menu open', async () => {
    hoisted.saved.places = { home: { kind: 'home', label: 'בית', coords: [34.8, 32], updatedAt: 1 }, work: null };
    mount(<SavedPlacesQuickRow onPick={noop} onSetRequest={noop} />);
    const btn = document.querySelector('button')!;
    act(() => { btn.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await expect(dump()).toMatchFileSnapshot(snap('saved-row-menu'));
  });
});

describe('SearchDestinationCard', () => {
  it('with routes nearby', async () => {
    const place = { text: 'דיזנגוף 10, תל אביב-יפו, ישראל', coords: [34.77, 32.08] as [number, number] };
    mount(<SearchDestinationCard place={place as never} userPos={{ lat: 32.0, lng: 34.7 }} onClose={noop} onNavigate={noop} onStartActivity={noop} onOpenRoute={noop} />);
    await flush();
    await expect(dump()).toMatchFileSnapshot(snap('search-destination-near-routes'));
  });
});

describe('DestinationPlanner', () => {
  it('compact sheet', async () => {
    mount(<DestinationPlanner userPosition={{ lat: 32, lng: 34.7 }} destination={{ lat: 32.1, lng: 34.8 }} destinationLabel="דיזנגוף 10" initialMode="walking" onBack={noop} onStart={noop} />);
    await expect(dump()).toMatchFileSnapshot(snap('dest-planner'));
  });
});

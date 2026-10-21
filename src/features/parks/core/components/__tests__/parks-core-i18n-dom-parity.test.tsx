// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `map`, parks/core map UI): the states a static render can't reach — behind a tap
 * (the map-layers sheet, "שמור מקום" on the search pick card, the hold-to-stop hint), or after an async
 * load + timers (RouteCarousel's empty / cards phases). Recorded BEFORE the extraction with react-dom/client
 * in jsdom; the extracted components must produce the same DOM.
 *
 * framer-motion is replaced by plain elements (its animation props are dropped) so the DOM is stable; stores
 * and services are replaced by fakes. Inline `style` attributes are stripped and React `:rN:` ids normalised
 * before comparing — neither is text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const hoisted = vi.hoisted(() => ({
  mapState: {
    visibleLayers: ['water'] as string[], liveUsersVisible: true,
  } as Record<string, unknown>,
  partner: { liveActivity: 'all', distanceKm: 3 } as Record<string, unknown>,
  saved: { places: {} as Record<string, unknown> },
  gen: { result: [] as unknown[], reject: null as unknown },
  session: { status: 'active' },
}));

vi.mock('framer-motion', () => {
  const MOTION_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants', 'drag', 'dragControls', 'dragListener',
    'dragConstraints', 'dragElastic', 'onDragEnd', 'onDragStart', 'onDrag', 'whileTap', 'whileHover', 'layout',
    'dragMomentum', 'onAnimationComplete',
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
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: true } }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  return { useUserStore };
});
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const state = () => ({ ...hoisted.mapState, toggleLayer: noop, setLiveUsersVisible: noop, setFreeRunCarouselRoutes: noop });
  const useMapStore = (sel?: (s: Record<string, unknown>) => unknown) => (sel ? sel(state()) : state());
  return { useMapStore };
});
vi.mock('@/features/partners', () => ({
  usePartnerFilters: (sel: (s: Record<string, unknown>) => unknown) => sel(hoisted.partner),
  PartnerFilterSheet: () => null,
}));
vi.mock('@/features/user/places/store/useSavedPlacesStore', async (orig) => ({
  ...(await orig<typeof import('@/features/user/places/store/useSavedPlacesStore')>()),
  useSavedPlacesStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ places: hoisted.saved.places, setPlace: () => {} }),
}));
vi.mock('@/features/parks/core/hooks/useSearchNavigation', () => ({
  MIN_SEARCH_CHARS: 2,
  getNearbySearchSuggestions: async () => [],
  findOfficialRoutesNear: async () => [],
}));
vi.mock('@/features/parks/core/services/route-generator.service', () => ({
  generateDynamicRoutes: async () => {
    if (hoisted.gen.reject) throw hoisted.gen.reject;
    return hoisted.gen.result;
  },
}));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: async () => [] }));
vi.mock('@/features/generation-review/capture/hooks', () => ({ logGeneratedRoutes: (r: unknown) => r }));
vi.mock('@/features/workout-engine/core/store/useSessionStore', () => {
  const useSessionStore = (sel?: (s: Record<string, unknown>) => unknown) => {
    const s = { status: hoisted.session.status, pauseSession: () => {}, resumeSession: () => {} };
    return sel ? sel(s) : s;
  };
  return { useSessionStore };
});
vi.mock('@/features/workout-engine/players/running/store/useRunningPlayer', () => {
  const s = { finishWorkout: async () => {}, triggerLap: () => {}, laps: [] };
  const useRunningPlayer = (sel?: (x: typeof s) => unknown) => (sel ? sel(s) : s);
  (useRunningPlayer as unknown as { getState: () => typeof s }).getState = () => s;
  return { useRunningPlayer };
});

import { MapLayersControl } from '../MapLayersControl';
import RouteCarousel from '../RouteCarousel';
import { SearchDestinationCard } from '../SearchPickCards';
import SessionControlBar from '../SessionControlBar';
import type { Route } from '@/features/parks/core/types/route.types';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
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
    .replace(/«r[0-9a-z]+»/g, ':r:');
const click = (el: Element | null | undefined) => {
  if (!el) throw new Error('element not found');
  act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const byText = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
const snap = (name: string) => `./__snapshots__/parks-core-i18n/dom-${name}.html`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  hoisted.mapState.visibleLayers = ['water'];
  hoisted.mapState.liveUsersVisible = true;
  hoisted.partner.liveActivity = 'all';
  hoisted.partner.distanceKm = 3;
  hoisted.saved.places = {};
  hoisted.gen.result = [];
  hoisted.gen.reject = null;
  hoisted.session.status = 'active';
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null;
  host = null;
  vi.useRealTimers();
});

describe('MapLayersControl — the sheet behind the layers button', () => {
  it.each([
    ['hidden', { liveUsersVisible: false }, {}],
    ['all', {}, { liveActivity: 'all' }],
    ['running-metres', {}, { liveActivity: 'running', distanceKm: 0.5 }],
    ['walking-km', {}, { liveActivity: 'walking', distanceKm: 2.5 }],
    ['strength', {}, { liveActivity: 'strength', distanceKm: 5 }],
    ['unknown-activity', {}, { liveActivity: 'cycling', distanceKm: 10 }],
  ])('%s', async (name, map, partner) => {
    Object.assign(hoisted.mapState, map);
    Object.assign(hoisted.partner, partner);
    mount(<MapLayersControl liveCount={1234} />);
    click(document.querySelector('button'));
    await expect(dump()).toMatchFileSnapshot(snap(`layers-${name}`));
  });
});

const path: [number, number][] = [[34.8, 32.0], [34.801, 32.002], [34.802, 32.004], [34.8, 32.0]];
const near = { lat: 32.0, lng: 34.8 };
const mkRoute = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, distance: 3.04, duration: 21, score: 80, type: 'running', difficulty: 'medium', features: {}, segments: [], path, ...extra }) as unknown as Route;

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
}

describe('RouteCarousel — after generation', () => {
  it.each([
    ['loop-cards', {}, () => [mkRoute('a', 'לולאה ירוקה'), mkRoute('b', '  '), mkRoute('c', 'רחוק', { path: [[35.5, 33.0], [35.5, 33.1]] })]],
    ['commute-cards-dest', { mode: 'commute', destination: { lat: 32.01, lng: 34.81 }, destinationLabel: 'הרצל 14', onActivityChange: noop },
      () => [mkRoute('a', 'דרך א', { variant: 'fastest' }), mkRoute('b', 'דרך ב', { variant: 'quiet' })]],
    ['commute-cards-no-label', { mode: 'commute', destination: { lat: 32.01, lng: 34.81 }, onActivityChange: noop },
      () => [mkRoute('a', 'דרך א')]],
    ['loop-empty', { targetKm: 4.25 }, () => []],
    ['commute-empty-dest', { mode: 'commute', destination: { lat: 32.01, lng: 34.81 }, destinationLabel: 'הרצל 14', onActivityChange: noop }, () => []],
    ['commute-empty-no-dest', { mode: 'commute', onActivityChange: noop }, () => []],
  ])('%s', async (name, extra, routes) => {
    hoisted.gen.result = routes();
    mount(<RouteCarousel userPosition={near} activity="running" targetKm={3} cityName="תל אביב" focusedRouteId={null}
      onSelect={noop} onBack={noop} {...(extra as Record<string, unknown>)} />);
    await settle();
    await expect(dump()).toMatchFileSnapshot(snap(`carousel-${name}`));
  });
  it('generation error without a message → the fallback copy', async () => {
    hoisted.gen.reject = {};
    mount(<RouteCarousel userPosition={near} activity="walking" targetKm={2} cityName="תל אביב" focusedRouteId={null} onSelect={noop} onBack={noop} />);
    await settle();
    await expect(dump()).toMatchFileSnapshot(snap('carousel-error-fallback'));
  });
});

describe('SearchDestinationCard — "שמור מקום" open', () => {
  it('home saved elsewhere (replace), work free', async () => {
    hoisted.saved.places = { home: { kind: 'home', label: 'בית', coords: [34.7, 32.1] } };
    mount(<SearchDestinationCard place={{ text: 'הרצל 14, תל אביב', coords: [34.81, 32.01], placeType: 'street' }}
      userPos={near} onClose={noop} onNavigate={noop} onStartActivity={noop} onOpenRoute={noop} />);
    click(byText('שמירת מקום'));
    await expect(dump()).toMatchFileSnapshot(snap('pick-save-open'));
  });
});

describe('SessionControlBar — hold to stop', () => {
  it('hint while holding', async () => {
    mount(<SessionControlBar />);
    const before = dump();
    const stop = Array.from(document.querySelectorAll('button')).find((b) => b.querySelector('svg.lucide-square'));
    if (!stop) throw new Error('stop button not found');
    act(() => { stop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    const holding = dump();
    expect(holding).not.toBe(before);
    await expect(holding).toMatchFileSnapshot(snap('session-holding'));
  });
});

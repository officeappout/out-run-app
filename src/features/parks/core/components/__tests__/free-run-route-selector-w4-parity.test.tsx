// @vitest-environment jsdom
/**
 * i18n wave 4 (bidirectional layout), map area, part 6: FreeRunRouteSelector (radar, cards, empty state) recorded
 * from UNMODIFIED main. The converted component must render the same Hebrew DOM apart from class tokens and
 * `dir="rtl"` (scripts/i18n/wave4-snapshot-proof.ts). framer-motion is replaced by plain elements; the radar and the
 * route generator are stubs. Inline `style` and React ids are stripped before comparing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const h = vi.hoisted(() => ({ routes: [] as unknown[] }));

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
vi.mock('@/features/partners', () => ({ RadarAnimation: () => React.createElement('div', { 'data-radar': true }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('@/features/parks/core/services/route-generator.service', () => ({
  generateDynamicRoutes: async () => h.routes,
  getLastGenerationDiagnostics: () => null,
  MIN_GENERATION_KM: 1,
}));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: async () => [] }));
vi.mock('@/features/generation-review/capture/hooks', () => ({ logGeneratedRoutes: (r: unknown) => r }));

import FreeRunRouteSelector from '../FreeRunRouteSelector';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const noop = () => {};

async function mount(el: React.ReactElement, ms: number) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(el); });
  for (let t = 0; t < ms; t += 250) await act(async () => { await vi.advanceTimersByTimeAsync(250); });
}
const dump = () =>
  document.body.innerHTML.replace(/ style="[^"]*"/g, '').replace(/:r[0-9a-z]+:/g, ':r:').replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/free-run-route-selector-w4/${name}.html`;
const props = { userPosition: { lat: 32, lng: 34.8 }, activity: 'running' as const, targetKm: 5, cityName: 'תל אביב', onSelect: noop, onCancel: noop };
const route = (id: string, score: number, features: object) =>
  ({ id, name: id === 'a' ? 'לולאת הירקון' : '', distance: 5.1, duration: 30, score, features, segments: [], path: [] });

beforeEach(() => { vi.useFakeTimers(); h.routes = []; });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.useRealTimers(); });

describe('FreeRunRouteSelector', () => {
  it('radar', async () => {
    await mount(<FreeRunRouteSelector {...props} />, 100);
    await expect(dump()).toMatchFileSnapshot(snap('radar'));
  });
  it('cards', async () => {
    h.routes = [route('a', 80, { hasGym: true }), route('b', 50, { scenic: true }), route('c', 10, {})];
    await mount(<FreeRunRouteSelector {...props} />, 3000);
    await expect(dump()).toMatchFileSnapshot(snap('cards'));
  });
  it('empty', async () => {
    await mount(<FreeRunRouteSelector {...props} />, 3000);
    await expect(dump()).toMatchFileSnapshot(snap('empty'));
  });
});

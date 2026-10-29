// @vitest-environment jsdom
/**
 * i18n wave 4 (bidirectional layout), map area, part 3: the route overview drawer's expanded detail body
 * (the "all details" link is behind the "פירוט" toggle), recorded from UNMODIFIED main with react-dom/client
 * in jsdom. `<!-- -->` and inline styles stripped before comparing.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const state = { walkToRouteMinutes: null, setOverviewSheetHeightPx: noop, setIsOverviewActive: noop };
  const useMapStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useMapStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useMapStore };
});
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => null, setOnboardingPref: () => {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));

import RouteOverviewDrawer from '../route/RouteOverviewDrawer';
import type { Route } from '@/features/parks/core/types/route.types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeAll(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T08:40:00'));
  if (!window.matchMedia) {
    window.matchMedia = (q: string) =>
      ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
  }
});
afterAll(() => { vi.useRealTimers(); });

const noop = () => {};

describe('RouteOverviewDrawer, expanded', () => {
  it('detail body with the full-details link', async () => {
    const route = {
      id: 'r1', name: 'לולאת הירקון', distance: 4.2, duration: 25, score: 80, type: 'running', difficulty: 'easy', rating: 4,
      calories: 300, features: {}, segments: [], path: [[34.8, 32], [34.81, 32.01], [34.8, 32.0005]], routeShape: 'loop',
    } as unknown as Route;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<RouteOverviewDrawer route={route} onBack={noop} onStart={noop} onOpenFullDetails={noop} />));
    const toggle = host.querySelector('button[aria-expanded]') as HTMLElement;
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const html = document.body.innerHTML.replace(/ style="[^"]*"/g, '').replace(/:r[0-9a-z]+:/g, ':r:').replaceAll('<!-- -->', '');
    expect(html).toContain('lucide-chevron-left');
    await expect(html).toMatchFileSnapshot('./__snapshots__/map-w4-overview/route-drawer-expanded.html');
    act(() => root.unmount());
  });
});

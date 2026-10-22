// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `map`, `routePreview.*` keys): RouteDetailSheet's
 * copy moved to src/messages/he/map.json. The snapshots below were recorded
 * from the component BEFORE the extraction; the extracted component must
 * render the same Hebrew markup in every state that shows text: full / bare
 * route, short / long distances and durations, the community block (empty,
 * time picker open, sessions today / tomorrow / later / recurring, joined or
 * not, just published), both accordion rows (walk steps or "calculating"),
 * the nav-route activity toggle, the dev simulation block, too far.
 *
 * Rendered with react-dom/client in jsdom (not static markup) so the taps
 * that open the time picker / the accordions can be replayed: the client DOM
 * has no `<!-- -->` separators, so nothing is stripped.
 */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

type Session = Record<string, unknown> & { eventId: string; nextStartTime: string };
const community: { sessions: Session[] } = { sessions: [] };
const registrations = new Set<string>();

vi.mock('@/lib/firebase', () => ({
  db: {}, app: {},
  auth: { currentUser: { uid: 'me', displayName: 'דנה כהן', photoURL: null } },
}));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'me', core: { isSuperAdmin: false }, social: { groupIds: [] }, progression: {} } };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/parks/core/hooks/useCommunityEnrichment', async (orig) => {
  const real = await orig<typeof import('@/features/parks/core/hooks/useCommunityEnrichment')>();
  return {
    ...real,
    useCommunityEnrichment: (ids: string[]) => ({
      enrichRoutes: (r: unknown[]) => r,
      allSessionsMap: new Map(ids.map((id) => [id, community.sessions])),
    }),
  };
});
vi.mock('@/features/parks/core/hooks/useMyRegistrations', () => ({ useMyRegistrations: () => registrations }));
vi.mock('@/features/admin/services/community.service', () => ({ joinEvent: async () => {}, materializeVirtualSession: async () => {} }));
vi.mock('@/features/admin/services/planned-sessions.service', () => ({ createPlannedSession: async () => {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));
// enable_route_shade_tag OFF (its live flag hook needs Firestore): the markup below must stay byte-identical.
vi.mock('@/features/parks/core/services/route-shade/useRouteShade', () => ({ useRouteShade: () => null, useRouteShadeTagEnabled: () => false }));
vi.mock('@/features/workout-engine/components/ShareAsLiveToggle', () => ({
  default: (p: { workoutTitle: string; contextRoute?: { name: string } }) => (
    <div data-share={p.workoutTitle} data-context={p.contextRoute?.name} />
  ),
}));
vi.mock('@/features/parks/client/components/UserProfileSheet', () => ({ default: () => null }));

import { MotionGlobalConfig } from 'framer-motion';
import RouteDetailSheet from '../RouteDetailSheet';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import type { Route } from '@/features/parks/core/types/route.types';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Animations jump to their end state, so a snapshot never catches a mid-flight frame.
MotionGlobalConfig.skipAnimations = true;

const NOW = new Date('2026-10-15T12:00:00');
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });

let root: Root | null = null;
let host: HTMLElement | null = null;
function mount(el: ReactElement): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}
const dump = () => document.body.innerHTML;
function tap(text: string): void {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  if (!btn) throw new Error(`no button "${text}"`);
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
const snap = (name: string) => `./__snapshots__/route-detail-sheet-i18n/${name}.html`;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null;
  host = null;
  community.sessions = [];
  registrations.clear();
  useMapStore.setState({ walkToRouteMinutes: null, walkSteps: null } as never);
});

const at = (h: number, m = 0, dayOffset = 0) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + dayOffset, h, m).toISOString();
const path: [number, number][] = [
  [34.78, 32.08], [34.781, 32.081], [34.783, 32.081], [34.783, 32.083], [34.781, 32.085], [34.78, 32.087],
];
const route = {
  id: 'r1', name: 'טיילת הירקון', distance: 4.25, duration: 75, score: 80, type: 'running', activityType: 'running',
  difficulty: 'medium', rating: 4, calories: 1250, segments: [], path, city: 'תל אביב',
  features: { surface: 'asphalt', environment: 'park', lit: true },
  featureTags: ['has_benches'],
  analytics: { usageCount: 1500 },
  description: 'מסלול לאורך הנחל',
  facilityStops: [{ id: 's1', name: '', lat: 32.083, lng: 34.783, waypointIndex: 3 }],
  qualitySignals: {
    composition: { sidewalkPct: 10, genuinePct: 72, ordinaryPct: 18, otherPct: 0 },
    lighting: { status: 'computed', litCoveragePct: 90, isLit: true }, computedAt: null, source: 'osm_overpass_v1',
  },
} as unknown as Route;
const bare = {
  id: 'nav-1', name: '', distance: 0.6, duration: 60, score: 0, type: 'walking', difficulty: 'easy', rating: 0,
  calories: 0, segments: [], path: [[34.78, 32.08], [34.79, 32.09]],
  features: { surface: 'gravel', environment: 'desert' },
} as unknown as Route;
const sessions: Session[] = [
  { eventId: 'e1', nextStartTime: at(18, 30), eventLabel: 'אימון קהילתי', currentRegistrations: 1234, avatars: [{ uid: 'a', name: 'אבי' }] },
  { eventId: 'e2', nextStartTime: at(7, 5, 1), eventLabel: 'ריצת בוקר', currentRegistrations: 2, avatars: [{ uid: 'me', name: 'דנה' }] },
  { eventId: 'g_x_2026-10-18', nextStartTime: at(19, 0, 3), eventLabel: 'קבוצה', isRecurring: true, groupId: 'g', currentRegistrations: 0, avatars: [] },
];
const noop = () => {};

describe('RouteDetailSheet — Hebrew markup unchanged by the i18n extraction', () => {
  it('full route, no sessions, near the start', async () => {
    mount(<RouteDetailSheet isOpen route={route} onClose={noop} userLocation={{ lat: 32.0805, lng: 34.7805 }} />);
    await expect(dump()).toMatchFileSnapshot(snap('full-empty'));
  });

  it('time picker open', async () => {
    mount(<RouteDetailSheet isOpen route={route} onClose={noop} />);
    tap('אני מגיע ב...');
    await expect(dump()).toMatchFileSnapshot(snap('time-picker'));
  });

  it('just published an arrival', async () => {
    mount(<RouteDetailSheet isOpen route={route} onClose={noop} />);
    tap('אני מגיע ב...');
    tap('פרסם');
    await act(async () => { await Promise.resolve(); });
    await expect(dump()).toMatchFileSnapshot(snap('just-published'));
  });

  it('sessions: today / tomorrow / later / recurring, joined and not', async () => {
    community.sessions = sessions;
    registrations.add('e1');
    mount(<RouteDetailSheet isOpen route={route} onClose={noop} />);
    await expect(dump()).toMatchFileSnapshot(snap('sessions-week'));
  });

  it('sessions: day filters', async () => {
    community.sessions = sessions;
    mount(<RouteDetailSheet isOpen route={route} onClose={noop} />);
    tap('מחר');
    await expect(dump()).toMatchFileSnapshot(snap('sessions-tomorrow'));
    tap('היום');
    await expect(dump()).toMatchFileSnapshot(snap('sessions-today'));
  });

  it('accordions: walk steps + the route', async () => {
    useMapStore.setState({
      walkToRouteMinutes: 1100,
      walkSteps: [
        { instruction: 'פנה שמאלה לרחוב הירקון', distanceMeters: 1250 },
        { instruction: 'פנה ימינה', distanceMeters: 80 },
        { instruction: 'המשך ישר', distanceMeters: 999.6 },
      ],
    } as never);
    mount(<RouteDetailSheet isOpen route={route} onClose={noop} />);
    tap('הליכה למסלול');
    await expect(dump()).toMatchFileSnapshot(snap('accordion-walk'));
    tap('טיילת הירקון');
    await expect(dump()).toMatchFileSnapshot(snap('accordion-route'));
  });

  it('accordion: walk steps still calculating', async () => {
    useMapStore.setState({ walkToRouteMinutes: 7, walkSteps: null } as never);
    mount(<RouteDetailSheet isOpen route={route} onClose={noop} />);
    tap('הליכה למסלול');
    await expect(dump()).toMatchFileSnapshot(snap('accordion-walk-calculating'));
  });

  it('bare nav route: nameless, short, activity toggle, dev simulation', async () => {
    const devSim = { isSimulating: false, simulationProgress: 0, startSimulation: noop, stopSimulation: noop } as never;
    mount(<RouteDetailSheet isOpen route={bare} onClose={noop} onActivityChange={noop} currentActivity="walking" devSim={devSim} />);
    tap('המסלול');
    await expect(dump()).toMatchFileSnapshot(snap('bare-nav'));
  });

  it('dev simulation running', async () => {
    const devSim = { isSimulating: true, simulationProgress: 0.42, startSimulation: noop, stopSimulation: noop } as never;
    mount(<RouteDetailSheet isOpen route={bare} onClose={noop} devSim={devSim} />);
    await expect(dump()).toMatchFileSnapshot(snap('dev-sim-running'));
  });

  it('too far from the start', async () => {
    useMapStore.setState({ walkToRouteMinutes: 40 } as never);
    mount(<RouteDetailSheet isOpen route={route} onClose={noop} userLocation={{ lat: 31.5, lng: 34.5 }} />);
    await expect(dump()).toMatchFileSnapshot(snap('too-far'));
  });
});

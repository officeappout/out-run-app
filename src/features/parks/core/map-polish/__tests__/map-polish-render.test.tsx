/**
 * enable_map_polish_v1 — static-markup render tests: the compact park card,
 * the layers panel rows, the route credits line, and the live user's
 * "ניווט לשם" (only when live + sharing a position).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const polishState = { on: true };
const mapState = { liveUsersVisible: true };
vi.mock('@/features/parks/core/map-polish', async () => {
  const pure = await vi.importActual<typeof import('../navigate-target')>('../navigate-target');
  return { ...pure, useMapPolishV1: () => polishState.on, useNavigateTo: () => () => true };
});
vi.mock('@/features/parks/core/store/useMapStore', () => ({
  useMapStore: (sel: (s: typeof mapState) => unknown) => sel(mapState),
}));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'me', core: { ageGroup: 'adult', name: 'אני' } } };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  return { useUserStore };
});
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: () => new Promise(() => {}) }));
vi.mock('@/features/social/store/useChatStore', () => ({ useChatStore: { getState: () => ({ openDM: () => {} }) } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import ParkCardCompact, { COMPACT_HERO_PX, COMPACT_MAX_CHIPS } from '@/features/parks/client/components/park-preview/ParkCardCompact';
import UserProfileSheet from '@/features/parks/client/components/UserProfileSheet';
import RouteCreditsLine from '@/features/parks/core/components/overview/route/RouteCreditsLine';
import { layerOptionsFor } from '@/features/parks/core/components/MapLayersControl';
import type { Route } from '@/features/parks/core/types/route.types';

const noop = () => {};

describe('ParkCardCompact', () => {
  const html = renderToStaticMarkup(
    <ParkCardCompact
      name="גינת מאיר" heroSrc="https://x/p.jpg" rating={{ avg: 4.5, count: 3 }}
      metaParts={['תל אביב', '400 מ׳', '8 מתקנים']}
      amenityTags={['shaded', 'water_fountain', 'night_lighting', 'has_toilets']}
      onOpen={noop} onClose={noop} onNavigate={noop}
    />,
  );
  it('84px hero, 24px insets, v2 card', () => {
    expect(COMPACT_HERO_PX).toBe(84);
    expect(html).toContain('height:84px');
    expect(html).toContain('left-6 right-6');
    expect(html).toContain('rounded-v2-card');
  });
  it('title + ONE meta line + at most 3 chips, no shelter strip', () => {
    expect(html).toContain('גינת מאיר');
    expect(html).toContain('תל אביב · 400 מ׳ · 8 מתקנים');
    expect(COMPACT_MAX_CHIPS).toBe(3);
    for (const label of ['הצללה', 'ברזיית מים', 'תאורה']) expect(html).toContain(label);
    expect(html).not.toContain('שירותים');
    expect(html).not.toContain('מיגונית');
  });
  it('navigate + close buttons are labelled', () => {
    expect(html).toContain('aria-label="ניווט לגינה"');
    expect(html).toContain('aria-label="סגירה"');
  });
});

describe('layers panel rows', () => {
  it('off → today\'s three rows; on → parks + routes first', () => {
    expect(layerOptionsFor(false).map((o) => o.id)).toEqual(['water', 'gym', 'toilet']);
    expect(layerOptionsFor(true).map((o) => o.id)).toEqual(['parks', 'routes', 'water', 'gym', 'toilet']);
  });
});

describe('RouteCreditsLine', () => {
  it('an OSM route shows its credit; a route with none renders nothing', () => {
    const osm = { id: 'r', origin: 'osm_import', path: [] } as unknown as Route;
    expect(renderToStaticMarkup(<RouteCreditsLine route={osm} />)).toContain('OpenStreetMap');
    expect(renderToStaticMarkup(<RouteCreditsLine route={{ id: 'x', path: [] } as unknown as Route} />)).toBe('');
  });
});

describe('UserProfileSheet — "ניווט לשם"', () => {
  beforeEach(() => { polishState.on = true; mapState.liveUsersVisible = true; });
  const live = { uid: 'u2', name: 'דנה', liveLocation: { lat: 32.07, lng: 34.77 } };
  const render = (user: Parameters<typeof UserProfileSheet>[0]['user']) =>
    renderToStaticMarkup(<UserProfileSheet isOpen onClose={noop} user={user} />);

  it('live on the map + sharing → the button', () => {
    expect(render(live)).toContain('ניווט לשם');
  });
  it('no shared position, live users hidden, self, or flag off → no button', () => {
    expect(render({ uid: 'u2', name: 'דנה' })).not.toContain('ניווט לשם');
    expect(render({ ...live, uid: 'me' })).not.toContain('ניווט לשם');
    mapState.liveUsersVisible = false;
    expect(render(live)).not.toContain('ניווט לשם');
    mapState.liveUsersVisible = true;
    polishState.on = false;
    expect(render(live)).not.toContain('ניווט לשם');
  });
});

import { describe, it, expect, vi } from 'vitest';
import he from '@/messages/he/onboarding.json';
import heMap from '@/messages/he/map.json';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';
import { firstRunTourSteps, presentSteps } from '../first-run-tour';
import { MAP_TUTORIAL_COACH, mapTutorialDoneLabel, pressRouteStart } from '../map-tutorial-tour';
import { whatNowRouteCopy, whatNowRouteCopyV1 } from '../entry-whatnow';
import { DRAWER_COACH } from '@/features/parks/core/components/overview/map-tutorial-coach';

/** enable_map_tutorial_v1 — the first-run map tutorial (boards M1-M8, pilot L3, L5, L7-L13). */

const targets = (tour: Parameters<typeof firstRunTourSteps>[0], v1: boolean) =>
  firstRunTourSteps(tour, 'female', { mapTutorialV1: v1 }).map((s) => s.target);

describe('flag', () => {
  it('fail-closed, super admins preview it, not graduated (the owner tests on the phone first)', () => {
    const def = FLAG_DEFS.find((d) => d.key === 'enableMapTutorialV1');
    expect(def?.firestoreKey).toBe('enable_map_tutorial_v1');
    expect(def?.defaultValue).toBe(false);
    expect(def?.superAdminValue).toBe(true);
    expect((def as { graduated?: boolean } | undefined)?.graduated).toBeUndefined();
  });
});

describe('flag off = today\'s tours', () => {
  it('map, route unchanged; route-drawer does not exist', () => {
    expect(targets('map', false)).toEqual(['map-search', 'map-layers', 'map-park']);
    expect(firstRunTourSteps('map', 'female')[0].text).toBe(he['tour.map.search.text']);
    const route = firstRunTourSteps('route', 'female');
    expect(route.map((s) => s.target)).toEqual(['route-card', 'route-strength-stop', 'route-start']);
    expect(route[0].finger).toBe('swipe');
    expect(targets('route-drawer', false)).toEqual([]);
    expect(mapTutorialDoneLabel('route', false)).toBeUndefined();
  });
});

describe('M3 (L7): the map tour', () => {
  it('search with the new copy, what is on the map, nearby parks', () => {
    const steps = firstRunTourSteps('map', 'female', { mapTutorialV1: true });
    expect(steps.map((s) => s.target)).toEqual(['map-search', 'map-layers', 'map-park']);
    expect(steps[0].text).toBe(heMap['mapTutorial.tour.map.search.text']);
    expect(steps[1].text).toContain('את בוחרת'); // the existing gendered line stays
    expect(steps[2].title).toBe(heMap['mapTutorial.tour.map.park.title']);
  });
  it('"just look around" promises 3 things', () => {
    expect(heMap['mapTutorial.whatNow.browse']).toContain('3 דברים');
  });
});

describe('M6 (L8, L9): the route tour', () => {
  const steps = firstRunTourSteps('route', 'male', { mapTutorialV1: true });
  it('details → garden stop → order varies → start; no swipe finger', () => {
    expect(steps.map((s) => s.target)).toEqual(['route-card', 'route-strength-stop', 'route-card', 'route-start']);
    expect(steps.some((s) => s.finger === 'swipe')).toBe(false);
    expect(steps[2].text).toBe(heMap['mapTutorial.tour.route.order.text']);
  });
  it('no stop marker on the map → that step drops', () => {
    const shown = presentSteps(steps, (t) => t !== 'route-strength-stop');
    expect(shown.map((s) => s.target)).toEqual(['route-card', 'route-card', 'route-start']);
  });
  it('the last button says "יאללה, בואו נתחיל" and presses the real CTA (pointerdown arms it)', () => {
    expect(mapTutorialDoneLabel('route', true)).toBe('יאללה, בואו נתחיל');
    expect(mapTutorialDoneLabel('map', true)).toBeUndefined();
    const click = vi.fn();
    const dispatchEvent = vi.fn();
    const doc = { querySelector: vi.fn(() => ({ click, dispatchEvent })) } as unknown as Document;
    expect(pressRouteStart(doc)).toBe(true);
    expect(doc.querySelector).toHaveBeenCalledWith('[data-coach="route-start"]');
    expect(click).toHaveBeenCalledOnce();
    expect(pressRouteStart({ querySelector: () => null } as unknown as Document)).toBe(false);
  });
});

describe('M7 (L13): the workout drawer tour', () => {
  it('walk → strength → loops → start, on the drawer\'s own targets', () => {
    expect(targets('route-drawer', true)).toEqual([
      'route-drawer-walk', 'route-drawer-strength', 'route-drawer-strip', 'route-drawer-start',
    ]);
  });
  it('the parks-side literals match', () => {
    expect(DRAWER_COACH).toEqual({
      walk: MAP_TUTORIAL_COACH.drawerWalk,
      strength: MAP_TUTORIAL_COACH.drawerStrength,
      strip: MAP_TUTORIAL_COACH.drawerStrip,
      start: MAP_TUTORIAL_COACH.drawerStart,
    });
  });
});

describe('M2 (L5): the what-now route card', () => {
  const route = { minutes: 30, stops: 1, aerobicKind: 'walking' as const };
  it('new copy behind the flag', () => {
    const c = whatNowRouteCopyV1(route, 'גינת הנרקיסים');
    expect(c.title).toBe('זיהינו מסלול עם גינה לידך');
    expect(c.sub).toBe('הליכה 30 דק׳ · עצירת כוח בגינת הנרקיסים');
    expect(c.cta).toBe('ממליצים להתחיל עכשיו');
  });
  it('flag off copy has no cta line', () => {
    expect(whatNowRouteCopy(route, 'x').cta).toBeUndefined();
  });
});

describe('i18n standard', () => {
  const pick = (cat: Record<string, string>, pre: string[]) => Object.entries(cat).filter(([k]) => pre.some((p) => k.startsWith(p)));
  it('every new he string exists and has no long dash', () => {
    const rows = pick(heMap as Record<string, string>, ['mapTutorial.']);
    expect(pick(he as Record<string, string>, ['mapTutorial.'])).toEqual([]);
    expect(rows.length).toBeGreaterThan(40);
    for (const [k, v] of rows) {
      expect(v, k).toBeTruthy();
      expect(v.includes('—'), k).toBe(false);
    }
  });
});

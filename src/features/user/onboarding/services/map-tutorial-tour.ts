/**
 * map-tutorial-tour — the first-run map tutorial's tours (enable_map_tutorial_v1, canvas boards M3/M6/M7,
 * pilot notes L7-L9, L13). Pure step builders run by the existing FirstRunTour (seen-once per user,
 * new users only, the one 'entry' bubble). Flag off → first-run-tour.ts's steps, unchanged.
 *
 *   map          (M3, L7)  search → what's on the map → nearby parks
 *   route        (M6, L8)  the card's details → the garden stop → the order varies → "צפה במסלול";
 *                          its last button says "יאללה, בואו נתחיל" and opens the route (L9)
 *   route-drawer (M7, L13) the walk block → the strength block → most routes are loops → start
 */
import type { FirstRunTourStep } from './first-run-tour';
import { makeLiveT } from '@/lib/i18n/live-t';
import { map } from '@/messages/ns/map';

// The tutorial's copy lives under `mapTutorial.*` in the map catalog (he only until it graduates).
const t = makeLiveT(map);

/** `data-coach` targets of the workout drawer (HybridOverviewScreen; literals there, no cross-domain import). */
export const MAP_TUTORIAL_COACH = {
  drawerWalk: 'route-drawer-walk',
  drawerStrength: 'route-drawer-strength',
  drawerStrip: 'route-drawer-strip',
  drawerStart: 'route-drawer-start',
} as const;

// The first-run targets this file points at (first-run-tour.ts FIRST_RUN_COACH; literals avoid a cycle).
const MAP_SEARCH = 'map-search';
const MAP_LAYERS = 'map-layers';
const MAP_PARK = 'map-park';
const ROUTE_CARD = 'route-card';
const ROUTE_STOP = 'route-strength-stop';
const ROUTE_START = 'route-start';

export type MapTutorialTourId = 'map' | 'route' | 'route-drawer';

export function isMapTutorialTour(tour: string): tour is MapTutorialTourId {
  return tour === 'map' || tour === 'route' || tour === 'route-drawer';
}

/** The v1 steps of a map tutorial tour. `layersText` = the existing gendered "what's on the map" line. */
export function mapTutorialSteps(tour: MapTutorialTourId, layers: { title: string; text: string }): FirstRunTourStep[] {
  switch (tour) {
    case 'map':
      return [
        { target: MAP_SEARCH, title: t('mapTutorial.tour.map.search.title'), text: t('mapTutorial.tour.map.search.text') },
        { target: MAP_LAYERS, title: layers.title, text: layers.text },
        { target: MAP_PARK, title: t('mapTutorial.tour.map.park.title'), text: t('mapTutorial.tour.map.park.text'), finger: true },
      ];
    case 'route':
      return [
        // L8: no swipe finger (the swipe leads to the questionnaire card, not to more routes).
        { target: ROUTE_CARD, title: t('mapTutorial.tour.route.card.title'), text: t('mapTutorial.tour.route.card.text') },
        // No stop marker on the map → the step drops (never a centred bubble over a dimmed map).
        { target: ROUTE_STOP, title: t('mapTutorial.tour.route.stop.title'), text: t('mapTutorial.tour.route.stop.text'), finger: true },
        { target: ROUTE_CARD, title: t('mapTutorial.tour.route.order.title'), text: t('mapTutorial.tour.route.order.text') },
        { target: ROUTE_START, title: t('mapTutorial.tour.route.start.title'), text: t('mapTutorial.tour.route.start.text'), finger: true },
      ];
    case 'route-drawer':
      return [
        { target: MAP_TUTORIAL_COACH.drawerWalk, title: t('mapTutorial.tour.drawer.walk.title'), text: t('mapTutorial.tour.drawer.walk.text') },
        { target: MAP_TUTORIAL_COACH.drawerStrength, title: t('mapTutorial.tour.drawer.strength.title'), text: t('mapTutorial.tour.drawer.strength.text') },
        { target: MAP_TUTORIAL_COACH.drawerStrip, title: t('mapTutorial.tour.drawer.loop.title'), text: t('mapTutorial.tour.drawer.loop.text') },
        { target: MAP_TUTORIAL_COACH.drawerStart, title: t('mapTutorial.tour.drawer.start.title'), text: t('mapTutorial.tour.drawer.start.text'), ring: true },
      ];
    default:
      return [];
  }
}

/** L9: the route tour's last button. Other tours keep CoachMarks' own "הבנתי". */
export function mapTutorialDoneLabel(tour: string, v1: boolean): string | undefined {
  return v1 && tour === 'route' ? t('mapTutorial.tour.route.go') : undefined;
}

/**
 * L9: "יאללה, בואו נתחיל" also opens the route. The start CTA arms on pointerdown (anti-ghost-click,
 * HybridSlotCarousel), so the tap is replayed as pointerdown + click. Returns whether a CTA was found.
 */
export function pressRouteStart(doc: Pick<Document, 'querySelector'> | null | undefined): boolean {
  const el = doc?.querySelector<HTMLElement>(`[data-coach="${ROUTE_START}"]`);
  if (!el) return false;
  if (typeof PointerEvent === 'function') el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  el.click();
  return true;
}

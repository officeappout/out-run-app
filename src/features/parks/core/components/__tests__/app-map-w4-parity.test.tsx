// @vitest-environment jsdom
/**
 * i18n wave 4 (bidirectional layout), map area, part 9: AppMap's own React markup (hybrid / leg-plan stop name
 * pills, the facility popup, the admin infrastructure toggle) recorded from UNMODIFIED main in Hebrew.
 * react-map-gl is replaced by plain elements (Map renders its children and fires onLoad / onZoomEnd with a fake map),
 * mapbox-gl and every map hook / marker component are stubs. Canvas, layers and camera math are NOT covered (they
 * are not part of the conversion). Inline `style` and React ids are stripped before comparing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { h, Stub, noop, mapStore } = vi.hoisted(() => {
  const h = { facilities: [] as unknown[] };
  const Stub = (name: string) => () => ({ type: 'div', props: { 'data-stub': name }, key: null, ref: null, $$typeof: Symbol.for('react.element'), _owner: null });
  const noop = () => undefined;
  function storeState(): Record<string, unknown> {
    const base: Record<string, unknown> = { visibleLayers: ['parks', 'routes', 'water', 'toilet', 'gym'], selectedPark: null, pressureLevel: 0, hybridRouteStations: null, hybridWalkLegs: null, commuteDestination: null, activeTurnIdx: 0, turnFlyToTarget: null };
    return new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : /^(set|clear|reset|consume|toggle|open|sync)/.test(k) ? noop : undefined) });
  }
  const mapStore = Object.assign(
    (sel?: (s: Record<string, unknown>) => unknown) => (sel ? sel(storeState()) : storeState()),
    { getState: () => storeState(), setState: noop, subscribe: () => noop },
  );
  return { h, Stub, noop, mapStore };
});

vi.mock('mapbox-gl', () => ({ default: { workerCount: 1, getRTLTextPluginStatus: () => 'loaded', setRTLTextPlugin: noop } }));
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));
vi.mock('react-map-gl', () => {
  const fakeMap = new Proxy({
    getStyle: () => ({ layers: [] }), on: noop, off: noop, isStyleLoaded: () => true, getZoom: () => 15, getCenter: () => ({ lat: 32, lng: 34.8 }),
    getBounds: () => ({ contains: () => true, getNorthEast: () => ({ lat: 32.1, lng: 34.9 }), getSouthWest: () => ({ lat: 31.9, lng: 34.7 }) }),
    hasImage: () => true, getLayer: () => undefined, getSource: () => undefined, getCanvas: () => ({ style: {} }), getBearing: () => 0, getPitch: () => 0,
  } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : noop) });
  const Map = React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    React.useImperativeHandle(ref, () => new Proxy({ getMap: () => fakeMap } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : (fakeMap as Record<string, unknown>)[k]) }) as never);
    React.useEffect(() => {
      (props.onLoad as ((e: unknown) => void) | undefined)?.({ target: fakeMap });
      (props.onZoomEnd as ((e: unknown) => void) | undefined)?.({ viewState: { zoom: 15 } });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement('div', { 'data-map': true }, props.children as React.ReactNode);
  });
  const Marker = (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-marker': true, onClick: () => (props.onClick as ((e: unknown) => void) | undefined)?.({ originalEvent: { stopPropagation: noop } }) }, props.children as React.ReactNode);
  const Popup = (props: Record<string, unknown>) => React.createElement('div', { 'data-popup': true }, props.children as React.ReactNode);
  const Nothing = () => null;
  return { default: Map, Source: Nothing, Layer: Nothing, Marker, Popup };
});
vi.mock('lucide-react', async (orig) => await orig());
vi.mock('../../services/parks.service', () => ({ fetchRealParks: async () => [] }));
vi.mock('../../store/useMapStore', () => ({ useMapStore: mapStore }));
vi.mock('../../hooks/useFacilities', () => ({ useFacilities: () => ({ facilities: h.facilities }) }));
vi.mock('../../hooks/useCameraController', () => ({ useCameraController: () => ({ centerOnUser: noop, onMapReady: noop }) }));
vi.mock('../../hooks/useWalkToRoute', () => ({ useWalkToRoute: () => ({ targetEndpoint: null, geoJSON: null }) }));
vi.mock('../../hooks/useMapPerfMonitor', () => ({ useMapPerfMonitor: noop }));
vi.mock('../../hooks/useAdaptiveShed', () => ({ useAdaptiveShed: noop }));
vi.mock('../coach/ParkCoachAnchor', () => ({ default: Stub('ParkCoachAnchor') }));
vi.mock('../coach/park-coach-anchor', () => ({ useParkCoachAnchorWanted: () => false }));
vi.mock('@/features/parks/core/components/LemurMarker', () => ({ default: Stub('LemurMarker') }));
vi.mock('@/features/parks/core/lib/lemurMarkerImages', () => ({ preloadLemurMarkerImages: noop }));
vi.mock('../PartnerMarker', () => ({ default: Stub('PartnerMarker') }));
vi.mock('../ParkPhotoMarker', () => ({ default: Stub('ParkPhotoMarker') }));
vi.mock('../DestinationMarker', () => ({ default: Stub('DestinationMarker') }));
vi.mock('@/features/parks/core/components/MapLoadingSkeleton', () => ({ default: Stub('MapLoadingSkeleton') }));
vi.mock('@/features/workout-engine/players/running/components/RouteRun/v2/RouteRunMapLayersV2', () => ({ default: Stub('RouteRunMapLayersV2') }));
vi.mock('@/features/workout-engine/players/shared/v2/useRunPlayerDrawerV1', () => ({ useRunPlayerDrawerV1: () => false }));
vi.mock('../mapPinIcons', () => ({ registerPinImage: noop, registerArrowTipImage: noop, registerArrowImage: noop, drawPullUpBarIcon: noop, drawDumbbellIcon: noop, drawDotIcon: noop, MINOR_URBAN_TYPES: [] }));
vi.mock('../mapStyleConfig', () => ({ applyFitnessMapStyle: noop, resetFitnessMapStyle: noop, WALK_LEG_LINE_PAINT: {} }));
vi.mock('@/lib/haptics', () => ({ hapticLight: noop }));

import AppMap from '../AppMap';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(el); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
}
const dump = () =>
  document.body.innerHTML.replace(/ style="[^"]*"/g, '').replace(/:r[0-9a-z]+:/g, ':r:').replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/app-map-w4/${name}.html`;
const base = { currentLocation: { lat: 32, lng: 34.8 }, initialCenter: { lat: 32, lng: 34.8 }, hasAccurateLocationSeed: true };

beforeEach(() => { vi.useFakeTimers(); h.facilities = []; });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.useRealTimers(); });

describe('AppMap markup', () => {
  it('stop name pills (hybrid + leg plan) and the admin toggle', async () => {
    await mount(<AppMap {...base} isAdmin
      hybridStations={[{ lat: 32.01, lng: 34.8, name: 'תחנת כוח הירקון' }, { lat: 32.02, lng: 34.81 }] as never}
      legPlanStops={[{ id: 's1', lat: 32.03, lng: 34.8, label: 'גינת הפארק' }, { id: 's2', lat: 32.04, lng: 34.8 }] as never} />);
    await expect(dump()).toMatchFileSnapshot(snap('pills-and-admin'));
  });
  it('facility popup', async () => {
    h.facilities = [{ id: 'f1', type: 'gym', name: 'מתקן כושר', location: { lat: 32.005, lng: 34.8 } }];
    await mount(<AppMap {...base} />);
    const marker = document.querySelectorAll('[data-marker]')[1] as HTMLElement | undefined;
    expect(marker).not.toBeNull();
    act(() => { marker!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await expect(dump()).toMatchFileSnapshot(snap('facility-popup'));
  });
});

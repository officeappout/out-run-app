import { describe, expect, it } from 'vitest';
import { boundaryPayload, routeFeature, routeStatus, routesPayload } from '../layer-geojson';
import { bboxOf, capped, parseLayerPayload } from '../layer-payload';
import { HUB_LAYER_FEATURE_CAP, fetchLayersFor, isHubFetchLayer } from '../layers';
import { DEFAULT_HUB_URL_STATE, parseHubUrlState, serializeHubUrlState } from '../url-state';

const path = [{ lng: 34.8, lat: 31.2 }, { lng: 34.8001, lat: 31.20001 }, { lng: 34.81, lat: 31.21 }];

describe('routeStatus / routeFeature', () => {
  it('published ⇒ approved, unpublished pending ⇒ pending, archived ⇒ hidden', () => {
    expect(routeStatus({ published: true })).toBe('approved');
    expect(routeStatus({ published: false, status: 'pending' })).toBe('pending');
    expect(routeStatus({ published: false, status: 'archived' })).toBeNull();
  });
  it('stored {lng,lat} objects ⇒ simplified [lng,lat] line with minimal props', () => {
    const f = routeFeature('r1', { published: false, status: 'pending', name: 'לולאה', distance: 3.2, path, secret: 'x' })!;
    expect(f.geometry.coordinates[0]).toEqual([34.8, 31.2]);
    expect(f.geometry.coordinates.length).toBeLessThanOrEqual(3);
    expect(f.properties).toMatchObject({ id: 'r1', kind: 'route', status: 'pending', name: 'לולאה', distanceKm: 3.2 });
    expect(f.properties).not.toHaveProperty('secret');
  });
  it('a route with < 2 valid points is dropped, not drawn as a dot', () => {
    expect(routeFeature('r', { published: true, path: [{ lng: 1, lat: NaN }] })).toBeNull();
  });
});

describe('routesPayload', () => {
  it('dedupes by id across the authorityId and city-name queries', () => {
    const d = { published: true, path };
    const p = routesPayload([{ id: 'a', data: d }, { id: 'a', data: d }, { id: 'b', data: { ...d, published: false, status: 'rejected' } }]);
    expect(p.featureCollection.features.map((f) => f.id)).toEqual(['a']);
    expect(p).toMatchObject({ truncated: false, total: 1 });
  });
  it('caps and says so', () => {
    const many = Array.from({ length: HUB_LAYER_FEATURE_CAP + 3 }, () => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }) as GeoJSON.Feature);
    const p = capped(many);
    expect(p.featureCollection.features).toHaveLength(HUB_LAYER_FEATURE_CAP);
    expect(p).toMatchObject({ truncated: true, total: HUB_LAYER_FEATURE_CAP + 3 });
  });
});

describe('boundary / bbox / wire', () => {
  const poly = JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[34, 31], [35, 31], [35, 32], [34, 31]]] } });
  it('stored JSON string ⇒ one polygon; garbage ⇒ empty', () => {
    expect(boundaryPayload(poly).featureCollection.features).toHaveLength(1);
    expect(boundaryPayload('{nope').featureCollection.features).toHaveLength(0);
  });
  it('bbox over several collections', () => {
    expect(bboxOf(boundaryPayload(poly).featureCollection, undefined)).toEqual([34, 31, 35, 32]);
    expect(bboxOf()).toBeNull();
  });
  it('parseLayerPayload drops malformed features', () => {
    const p = parseLayerPayload({ featureCollection: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null }, { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] } }] }, truncated: 'yes' });
    expect(p.featureCollection.features).toHaveLength(1);
    expect(p.truncated).toBe(false);
  });
});

describe('layers vocab + URL', () => {
  it('closed list; boundary always fetched with a selection', () => {
    expect(isHubFetchLayer('routes')).toBe(true);
    expect(isHubFetchLayer('users')).toBe(false);
    expect(fetchLayersFor([])).toEqual(['boundary']);
    expect(fetchLayersFor(['routes_pending'])).toEqual(['boundary', 'routes']);
  });
  it('layers param: absent ⇒ defaults; empty ⇒ none; junk dropped', () => {
    expect(parseHubUrlState(new URLSearchParams('')).layers).toEqual(DEFAULT_HUB_URL_STATE.layers);
    expect(parseHubUrlState(new URLSearchParams('layers=')).layers).toEqual([]);
    expect(parseHubUrlState(new URLSearchParams('layers=evil,routes_pending')).layers).toEqual(['routes_pending']);
    expect(serializeHubUrlState({ ...DEFAULT_HUB_URL_STATE, layers: ['routes_pending'] })).toBe('layers=routes_pending');
    expect(serializeHubUrlState({ ...DEFAULT_HUB_URL_STATE, layers: [] })).toBe('layers=');
  });
});

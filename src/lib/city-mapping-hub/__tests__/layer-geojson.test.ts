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
    expect(fetchLayersFor([])).toEqual(['boundary', 'parks', 'contributions']);
    expect(fetchLayersFor(['routes_pending', 'benches'])).toEqual(['boundary', 'routes', 'parks', 'benches', 'contributions']);
  });
  it('layers param: absent ⇒ defaults; empty ⇒ none; junk dropped', () => {
    expect(parseHubUrlState(new URLSearchParams('')).layers).toEqual(DEFAULT_HUB_URL_STATE.layers);
    expect(parseHubUrlState(new URLSearchParams('layers=')).layers).toEqual([]);
    expect(parseHubUrlState(new URLSearchParams('layers=evil,routes_pending')).layers).toEqual(['routes_pending']);
    expect(serializeHubUrlState({ ...DEFAULT_HUB_URL_STATE, layers: ['routes_pending'] })).toBe('layers=routes_pending');
    expect(serializeHubUrlState({ ...DEFAULT_HUB_URL_STATE, panel: 'parks' })).toBe('panel=parks');
    expect(parseHubUrlState(new URLSearchParams('panel=evil')).panel).toBe('gaps');
    expect(serializeHubUrlState({ ...DEFAULT_HUB_URL_STATE, layers: [] })).toBe('layers=');
  });
});

import { amenityFeature, contributionFeature, parkFeature, pointOf, pointsPayload } from '../layer-geojson';

describe('points (H2)', () => {
  it('pointOf: {lat,lng} or legacy lat/lng; outside Israel ⇒ null', () => {
    expect(pointOf({ location: { lat: 31.5, lng: 34.6 } })).toEqual([34.6, 31.5]);
    expect(pointOf({ lat: 31.5, lng: 34.6 })).toEqual([34.6, 31.5]);
    expect(pointOf({ location: { lat: 0, lng: 0 } })).toBeNull();
  });
  it('park: published ⇒ approved, pending_review ⇒ pending, draft ⇒ hidden; cover photo + counts; https only', () => {
    const f = parkFeature('p', { published: false, contentStatus: 'pending_review', location: { lat: 31.5, lng: 34.6 }, name: 'פארק', images: ['https://a/1.jpg', 'javascript:x', 'https://a/2.jpg'], gymEquipment: [{}, {}] })!;
    expect(f.properties).toMatchObject({ kind: 'park', status: 'pending', photo: 'https://a/1.jpg', photoCount: 2, equipmentCount: 2 });
    expect(parkFeature('p', { published: true, location: { lat: 31.5, lng: 34.6 } })!.properties.status).toBe('approved');
    expect(parkFeature('p', { published: false, contentStatus: 'draft', location: { lat: 31.5, lng: 34.6 } })).toBeNull();
  });
  it('amenity: rejected hidden', () => {
    expect(amenityFeature('a', { status: 'rejected', location: { lat: 31.5, lng: 34.6 } })).toBeNull();
    expect(amenityFeature('a', { status: 'pending', category: 'bench', location: { lat: 31.5, lng: 34.6 } })!.properties).toMatchObject({ kind: 'amenity', status: 'pending', category: 'bench' });
  });
  it('contribution: pending only; no user id on the wire; Timestamp-shaped createdAt read via toDate (axioms §31)', () => {
    const ts = { toDate: () => new Date('2026-10-20T08:00:00Z'), toMillis: () => 0 };
    const f = contributionFeature('c', { status: 'pending', type: 'new_location', userId: 'u1', location: { lat: 31.5, lng: 34.6 }, photoUrl: 'https://p/c.jpg', parkName: 'גינה', gymEquipment: [{}], createdAt: ts })!;
    expect(f.properties).toMatchObject({ kind: 'contribution', type: 'new_location', name: 'גינה', photo: 'https://p/c.jpg', equipmentCount: 1, createdAt: '2026-10-20T08:00:00.000Z' });
    expect(JSON.stringify(f)).not.toContain('u1');
    expect(contributionFeature('c', { status: 'approved', location: { lat: 31.5, lng: 34.6 } })).toBeNull();
  });
  it('pointsPayload puts pending first (a cap never cuts what waits for a decision)', () => {
    const loc = { lat: 31.5, lng: 34.6 };
    const p = pointsPayload([{ id: 'a', data: { status: 'published', location: loc } }, { id: 'b', data: { status: 'pending', location: loc } }], amenityFeature);
    expect(p.featureCollection.features.map((f) => f.properties?.id)).toEqual(['b', 'a']);
  });
});

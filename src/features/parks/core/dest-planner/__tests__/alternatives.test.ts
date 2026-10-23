import { describe, it, expect } from 'vitest';
import type { Route } from '../../types/route.types';
import { availablePreferences, selectPlannerOptions, shortestOf, visiblePlannerPrefs } from '../alternatives';
import type { PlannerCandidates, ViaParkCandidate } from '../types';

const route = (id: string, distance: number, duration: number, extra: Partial<Route> = {}): Route =>
  ({ id, name: id, distance, duration, path: [[34.78, 32.08], [34.79, 32.09]], ...extra }) as unknown as Route;

const via = (id: string, distance: number): ViaParkCandidate => ({
  route: route(id, distance, Math.round(distance * 12), { includesFitnessStop: true }),
  stop: { parkId: `p-${id}`, name: `park ${id}`, location: { lat: 32.085, lng: 34.785 }, afterKm: 1.1 },
});

const fastest = route('fastest', 1.8, 22, { variant: 'fastest' });
const alt = route('alt', 2.1, 25, { variant: 'alternative' });
const lit = { qualitySignals: { lighting: { status: 'computed', isLit: true } } } as unknown as Partial<Route>;

describe('shortestOf', () => {
  it('picks the shortest distance, ties broken by duration, ignores empty distances', () => {
    expect(shortestOf([alt, fastest])?.id).toBe('fastest');
    expect(shortestOf([route('a', 2, 30), route('b', 2, 25)])?.id).toBe('b');
    expect(shortestOf([route('z', 0, 1)])).toBeNull();
  });
});

describe('selectPlannerOptions — no preference', () => {
  it('via park → recommended first, shortest second', () => {
    const c: PlannerCandidates = { commute: [fastest, alt], viaParks: [via('v1', 2.3)] };
    const out = selectPlannerOptions(c, null);
    expect(out.map((o) => [o.id, o.kind, o.badge])).toEqual([
      ['v1', 'via_park', 'recommended'],
      ['fastest', 'shortest', 'shortest'],
    ]);
    expect(out[0].stop?.name).toBe('park v1');
  });

  it('no via park and no alternative with more strengths → shortest + alternative, nothing "recommended"', () => {
    const out = selectPlannerOptions({ commute: [alt, fastest], viaParks: [] }, null);
    expect(out.map((o) => [o.id, o.badge])).toEqual([['fastest', 'shortest'], ['alt', null]]);
  });

  it('an alternative with more measured strengths than the shortest is recommended', () => {
    const litAlt = route('litAlt', 2.0, 24, { ...lit, variant: 'alternative' });
    const out = selectPlannerOptions({ commute: [fastest, litAlt], viaParks: [] }, null);
    expect(out.map((o) => [o.id, o.badge])).toEqual([['litAlt', 'recommended'], ['fastest', 'shortest']]);
  });

  it('only one route → one option; nothing at all → empty', () => {
    expect(selectPlannerOptions({ commute: [fastest], viaParks: [] }, null)).toHaveLength(1);
    expect(selectPlannerOptions({ commute: [], viaParks: [] }, null)).toEqual([]);
  });
});

describe('selectPlannerOptions — preferences', () => {
  const c: PlannerCandidates = { commute: [fastest, alt], viaParks: [via('v1', 2.3), via('v2', 2.7)] };

  it('park → two via-park options with the stop badge', () => {
    expect(selectPlannerOptions(c, 'park').map((o) => [o.id, o.badge])).toEqual([['v1', 'stop'], ['v2', 'stop']]);
  });

  it('park with one park → that park + shortest', () => {
    const one = { ...c, viaParks: [via('v1', 2.3)] };
    expect(selectPlannerOptions(one, 'park').map((o) => o.id)).toEqual(['v1', 'fastest']);
  });

  it('shortest → shortest first', () => {
    expect(selectPlannerOptions(c, 'shortest').map((o) => o.id)).toEqual(['fastest', 'v1']);
  });

  it('lit → the lit option first', () => {
    const litVia: ViaParkCandidate = { ...via('v3', 2.5), route: route('v3', 2.5, 30, lit) };
    const out = selectPlannerOptions({ commute: [fastest, alt], viaParks: [litVia] }, 'lit');
    expect(out[0].id).toBe('v3');
  });

  it('shade → highest measured shade first', () => {
    const shady = route('shady', 2.2, 26, { shadeInfo: { shadedPct: 64 } });
    const out = selectPlannerOptions({ commute: [fastest, shady], viaParks: [] }, 'shade');
    expect(out.map((o) => o.id)).toEqual(['shady', 'fastest']);
  });

  it('an unavailable preference falls back to the default view', () => {
    expect(selectPlannerOptions(c, 'shade')).toEqual(selectPlannerOptions(c, null));
  });

  it('never repeats a route, never more than 2', () => {
    const out = selectPlannerOptions(c, 'shortest', 5);
    expect(new Set(out.map((o) => o.id)).size).toBe(out.length);
    expect(selectPlannerOptions(c, 'shortest')).toHaveLength(2);
  });
});

describe('availablePreferences', () => {
  it('shade / lit only with measured data; park only with a via-park route', () => {
    expect(availablePreferences({ commute: [fastest], viaParks: [] })).toEqual({ park: false, shortest: true, lit: false, shade: false });
    const withData = { commute: [route('s', 2, 20, { shadeInfo: { shadedPct: 40 } })], viaParks: [{ ...via('v', 2), route: route('v', 2, 20, lit) }] };
    expect(availablePreferences(withData)).toEqual({ park: true, shortest: true, lit: true, shade: true });
  });
  it('a measured 0% shade does not enable the chip', () => {
    expect(availablePreferences({ commute: [route('s', 2, 20, { shadeInfo: { shadedPct: 0 } })], viaParks: [] }).shade).toBe(false);
  });
});

describe('visiblePlannerPrefs — only chips that can act (no "בקרוב" placeholders)', () => {
  const none = { park: false, lit: false, shortest: false, shade: false };
  it('hides shade when no option carries measured shade, shows it when one does', () => {
    expect(visiblePlannerPrefs('walking', { ...none, shortest: true })).toEqual(['shortest']);
    expect(visiblePlannerPrefs('walking', { ...none, shortest: true, shade: true })).toEqual(['shortest', 'shade']);
  });
  it('park chip: on foot only, and only with a via-park route', () => {
    expect(visiblePlannerPrefs('running', { ...none, park: true })).toEqual(['park']);
    expect(visiblePlannerPrefs('cycling', { ...none, park: true })).toEqual([]);
    expect(visiblePlannerPrefs('walking', none)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  classifyConnectors,
  hideConnectorRoutes,
  isConnectorRoute,
  type ConnectorCandidate,
} from '../display-role';
import { buildValidatedDoc, RouteDocValidationError } from '../validate';

// ~111 m per 0.001° latitude; at lat 31.5 ~95 m per 0.001° longitude.
const LAT = 31.52;
const LNG = 34.6;
const pt = (dx: number, dy: number): [number, number] => [LNG + dx * 0.001, LAT + dy * 0.001];

/** A closed square loop, ~400 m a side. */
const loop: ConnectorCandidate = { id: 'loop', name: 'שכונת הכרמים קלאסי', path: [pt(0, 0), pt(4, 0), pt(4, 4), pt(0, 4), pt(0, 0)] };

describe('hideConnectorRoutes / isConnectorRoute', () => {
  const routes = [{ id: 'a' }, { id: 'b', displayRole: 'connector' as const }, { id: 'c', displayRole: null }];

  it('flag off → the same array instance (byte-identical)', () => {
    expect(hideConnectorRoutes(routes, false)).toBe(routes);
  });

  it('flag on → skips displayRole connector only', () => {
    expect(hideConnectorRoutes(routes, true).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('only the exact value counts', () => {
    expect(isConnectorRoute({ displayRole: 'connector' })).toBe(true);
    expect(isConnectorRoute({ displayRole: 'Connector' })).toBe(false);
    expect(isConnectorRoute({})).toBe(false);
    expect(isConnectorRoute(null)).toBe(false);
  });
});

describe('classifyConnectors', () => {
  it('a "מקטע" piece open between two points on another route → connector', () => {
    const seg: ConnectorCandidate = { id: 'seg', name: 'מקטע 2', path: [pt(0, 2), pt(-1, 2), pt(-2, 3), pt(-1, 4), pt(0, 4)] };
    const v = classifyConnectors([loop, seg]).find((x) => x.id === 'seg')!;
    expect(v.connector).toBe(true);
    if (v.connector) expect(v.startTo).toBe('loop');
  });

  it('"תוספת" and "הפרד" prefixes count, with surrounding whitespace', () => {
    const a: ConnectorCandidate = { id: 'a', name: '  תוספת א שכונת הנביאים ', path: [pt(4, 1), pt(5, 2), pt(4, 3)] };
    const b: ConnectorCandidate = { id: 'b', name: 'הפרד במסלל', path: [pt(1, 4), pt(2, 5), pt(3, 4)] };
    const out = classifyConnectors([loop, a, b]);
    expect(out.find((x) => x.id === 'a')!.connector).toBe(true);
    expect(out.find((x) => x.id === 'b')!.connector).toBe(true);
  });

  it('a short route with a REAL name stays visible (length alone never decides)', () => {
    const park: ConnectorCandidate = { id: 'park', name: 'פארק המוסיקה', path: [pt(0, 2), pt(-1, 2), pt(0, 4)] };
    const v = classifyConnectors([loop, park]).find((x) => x.id === 'park')!;
    expect(v).toMatchObject({ connector: false, reason: 'name' });
  });

  it('a closed loop named "מקטע 21" is a real loop, not a connector', () => {
    const closed: ConnectorCandidate = { id: 'm21', name: 'מקטע 21', path: [pt(10, 10), pt(14, 10), pt(14, 14), pt(10, 10)] };
    expect(classifyConnectors([loop, closed]).find((x) => x.id === 'm21')).toMatchObject({ connector: false, reason: 'closed' });
  });

  it('a connector-named piece that does not touch another route at both ends is left alone', () => {
    const loose: ConnectorCandidate = { id: 'loose', name: 'מקטע 9', path: [pt(0, 2), pt(-3, 2), pt(-6, 2)] };
    expect(classifyConnectors([loop, loose]).find((x) => x.id === 'loose')).toMatchObject({ connector: false, reason: 'detached' });
  });

  it('no usable path → not a connector', () => {
    expect(classifyConnectors([{ id: 'x', name: 'מקטע 1', path: [pt(0, 0)] }])[0]).toMatchObject({ connector: false, reason: 'no_path' });
  });
});

describe('schema — displayRole on official_routes update', () => {
  const ctx = { mode: 'update' as const, knownAuthorityIds: new Set(['A']), existing: { authorityId: 'A', city: 'שדרות' } };

  it("accepts 'connector' and null", () => {
    expect(buildValidatedDoc('official_routes', { displayRole: 'connector' }, ctx)).toEqual({ displayRole: 'connector' });
    expect(buildValidatedDoc('official_routes', { displayRole: null }, ctx)).toEqual({ displayRole: null });
  });

  it('rejects any other value', () => {
    expect(() => buildValidatedDoc('official_routes', { displayRole: 'hidden' }, ctx)).toThrow(RouteDocValidationError);
  });
});

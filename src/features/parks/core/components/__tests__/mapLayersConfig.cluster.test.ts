import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';
import { PARK_CLUSTERS, PARK_CLUSTERS_GLOW, PARK_CLUSTER_COUNT, CLUSTER_BRAND, CLUSTER_STEPS } from '../mapLayersConfig';

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Walks an expression: arrays must start with a string operator; step needs ascending numeric stops.
function check(expr: unknown): void {
  if (!Array.isArray(expr)) return;
  expect(typeof expr[0]).toBe('string');
  if (expr[0] === 'step') {
    const stops = expr.slice(3).filter((_, i) => i % 2 === 0) as number[];
    expect(stops.every((n, i) => typeof n === 'number' && (i === 0 || n > stops[i - 1]))).toBe(true);
  }
  expr.slice(1).forEach(check);
}

const require = createRequire(import.meta.url);

describe('park cluster layer config', () => {
  it('passes the installed mapbox-gl style-spec validator', () => {
    const spec = require('mapbox-gl/src/style-spec/dist/index.cjs');
    const mk = (id: string, c: any) => ({ id, type: 'circle', source: 's', filter: c.filter, paint: c.paint });
    const errors = spec.validate({
      version: 8,
      sources: { s: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
      layers: [mk('g', PARK_CLUSTERS_GLOW), mk('c', PARK_CLUSTERS)],
    });
    expect(errors.map((e: any) => e.message)).toEqual([]);
  });
  it('white count text meets WCAG AA on the cluster fill', () => {
    expect(contrast(CLUSTER_BRAND.text, CLUSTER_BRAND.fill)).toBeGreaterThanOrEqual(4.5);
  });
  it('fill is a solid, fully opaque brand-cyan disc with an opaque ring', () => {
    expect(PARK_CLUSTERS.paint['circle-color']).toBe('#00c9f2');
    expect(PARK_CLUSTERS.paint['circle-opacity']).toBe(1);
    expect(PARK_CLUSTERS.paint['circle-stroke-opacity']).toBe(1);
    expect(PARK_CLUSTERS.paint['circle-stroke-width']).toBeGreaterThan(0);
    expect(PARK_CLUSTERS_GLOW.paint['circle-color']).toBe('#00c9f2');
  });
  it('fill is not a near-black disc (reads as see-through on the light map)', () => {
    expect(lum(CLUSTER_BRAND.fill)).toBeGreaterThan(0.2);
  });
  it('halo stays faint so it never reads as a translucent disc', () => {
    expect(PARK_CLUSTERS_GLOW.paint['circle-opacity']).toBeLessThanOrEqual(0.2);
  });
  it('size steps grow with count and halo is larger than disc', () => {
    const r = CLUSTER_STEPS.radius, h = CLUSTER_STEPS.haloRadius;
    expect(r.small < r.mid && r.mid < r.large && r.large < r.xlarge).toBe(true);
    (['small', 'mid', 'large', 'xlarge'] as const).forEach((k) => expect(h[k]).toBeGreaterThan(r[k]));
  });
  it('all expressions are well-formed and filters match the count layer', () => {
    [PARK_CLUSTERS.paint, PARK_CLUSTERS_GLOW.paint].forEach((p) => Object.values(p).forEach(check));
    check(PARK_CLUSTERS.filter);
    expect(PARK_CLUSTERS.filter).toEqual(PARK_CLUSTER_COUNT.filter);
    expect(PARK_CLUSTERS_GLOW.filter).toEqual(PARK_CLUSTER_COUNT.filter);
  });
});

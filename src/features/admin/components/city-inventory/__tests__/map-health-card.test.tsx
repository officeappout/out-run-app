// @vitest-environment jsdom
/**
 * MapHealthCard (RC4 I2) — rendered in jsdom with react-dom/client; the loader
 * is injected (no fetch, no Firestore). Not seen on a real screen — these
 * tests are the only UI verification of this PR.
 */
process.env.TZ = 'UTC';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MapHealthCard from '../MapHealthCard';
import { CityInventoryHealthError, type CityInventoryHealth } from '@/features/admin/services/city-inventory-health';
import { emptyLayer } from '@/lib/city-inventory/doc';
import type { CityInventory, CityInventoryRun, InventoryLayer, InventoryLayerKey } from '@/lib/city-inventory/types';
import { NOW, allMeasured, measuredLayer } from '@/lib/city-inventory/__tests__/fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function render(load: (id: string) => Promise<CityInventoryHealth>, authorityId = 'auth_bsv') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MapHealthCard authorityId={authorityId} cityLabel="באר שבע" load={load} />);
  });
  await act(async () => { await Promise.resolve(); });
  return host;
}

const q = (sel: string) => host!.querySelector(sel);
const text = (sel: string) => q(sel)?.textContent ?? null;

function layers(): Record<InventoryLayerKey, InventoryLayer> {
  const L = allMeasured();
  L.shade = emptyLayer(); // not measured
  L.toilets = measuredLayer({ count: 0, density: 0, method: 'osm_density_vs_peers', coveragePct: null });
  L.drinking_water = measuredLayer({ count: 11, density: 0.012, method: 'osm_density_vs_peers', coveragePct: 6, quality: ['single_source', 'below_expected_density'] });
  L.bike_unknown = measuredLayer({ count: 3, lengthKm: 1.2, coveragePct: null, method: 'osm_count' });
  L.lighting = measuredLayer({ count: null, lengthKm: 40.5, coveragePct: 6.4, method: 'osm_tag_coverage', quality: ['untagged_majority'] });
  return L;
}

function inventory(): CityInventory {
  return {
    authorityId: 'auth_bsv',
    city: 'באר שבע',
    authorityType: 'city',
    areaKm2: 117.5,
    snapshot: { osmPbfDate: '2026-10-01', builtAt: NOW, builtBy: 'scripts/city-inventory/run.ts', runId: 'ci-2' },
    layers: layers(),
    readiness: { score: 62, level: 'yellow', missing: ['shade'], blockers: ['shade not measured'] },
    schemaVersion: 2,
    updatedAt: new Date('2026-10-21T09:30:00Z'),
  };
}

function run(runId: string, createdAt: string, over: Partial<Record<InventoryLayerKey, Partial<InventoryLayer>>> = {}): CityInventoryRun {
  const L = layers();
  const out = {} as CityInventoryRun['layers'];
  for (const k of Object.keys(L) as InventoryLayerKey[]) {
    const { files: _f, ...rest } = { ...L[k], ...(over[k] ?? {}) };
    out[k] = rest;
  }
  return {
    authorityId: 'auth_bsv',
    runId,
    snapshot: { osmPbfDate: '2026-10-01', builtAt: NOW, builtBy: 'x', runId },
    layers: out,
    readiness: { score: 62, level: 'yellow', missing: [], blockers: [] },
    schemaVersion: 2,
    createdAt: new Date(createdAt),
  };
}

const health = (h: Partial<CityInventoryHealth> = {}): CityInventoryHealth => ({
  authorityId: 'auth_bsv',
  inventory: inventory(),
  runs: [run('ci-2', '2026-10-21T08:00:00Z', { benches: { count: 0 } }), run('ci-1', '2026-10-20T08:00:00Z')],
  ...h,
});

describe('MapHealthCard', () => {
  it('readiness badge, header meta and one row per layer', async () => {
    await render(async () => health());
    const badge = q('[data-testid="map-health-card"] > div [data-testid="readiness-badge"]')!;
    expect(badge.getAttribute('data-level')).toBe('yellow');
    expect(badge.textContent).toBe('צהוב · 62/100');
    expect(host!.textContent).toContain('מצב מיפוי — באר שבע');
    expect(host!.textContent).toContain('snapshot OSM: 2026-10-01');
    expect(host!.querySelectorAll('tbody tr')).toHaveLength(18);
    expect(host!.textContent).toContain('shade not measured');
  });

  it('"not measured" is never shown as 0; a real 0 is shown as 0', async () => {
    await render(async () => health());
    expect(text('[data-testid="layer-amount-shade"]')).toBe('לא נמדד');
    expect(text('[data-testid="layer-coverage-shade"]')).toBe('לא נמדד');
    expect(text('[data-testid="layer-gaps-shade"]')).toContain('לא חושב');
    expect(text('[data-testid="layer-amount-toilets"]')).toBe('0');
    expect(text('[data-testid="layer-gaps-toilets"]')).toContain('אין ב-OSM');
    // measured, but no coverage % defined ⇒ the density + a reason, not "0%"
    expect(text('[data-testid="layer-coverage-toilets"]')).toBe('0 לק״מ רחוב');
    expect(q('[data-testid="layer-coverage-toilets"]')!.getAttribute('title')).toContain('חציון');
  });

  it('values, units, coverage and quality flags (single_source hidden)', async () => {
    await render(async () => health());
    expect(text('[data-testid="layer-amount-lighting"]')).toBe('40.5 ק״מ');
    expect(text('[data-testid="layer-coverage-lighting"]')).toBe('6.4%');
    expect(text('[data-testid="layer-gaps-lighting"]')).toBe('רוב לא מתויג');
    expect(text('[data-testid="layer-amount-bike_unknown"]')).toBe('3 · 1.2 ק״מ');
    expect(text('[data-testid="layer-gaps-drinking_water"]')).toBe('מתחת לצפוי (צפיפות מול ערים דומות)');
    expect(q('[data-testid="layer-row-parks"]')!.textContent).toContain('OSM · ODbL-1.0 · 2026-10-01');
    expect(q('[data-testid="layer-row-parks"]')!.textContent).toContain('21.10.2026');
  });

  it('run history newest first, flags a layer that dropped to zero', async () => {
    await render(async () => health());
    const items = host!.querySelectorAll('[data-testid="map-health-runs"] li');
    expect(Array.from(items).map((li) => li.getAttribute('data-testid'))).toEqual(['run-ci-2', 'run-ci-1']);
    expect(text('[data-testid="run-regression-ci-2"]')).toContain('ספסלים');
    expect(q('[data-testid="run-regression-ci-1"]')).toBeNull();
  });

  it('no doc yet ⇒ an explicit empty state, no table, no zeros', async () => {
    await render(async () => health({ inventory: null, runs: [] }));
    expect(q('[data-testid="map-health-empty"]')).not.toBeNull();
    expect(q('table')).toBeNull();
    expect(q('[data-testid="readiness-badge"]')).toBeNull();
  });

  it.each([
    [403, 'super admin'],
    [401, 'להתחבר'],
    [500, 'city inventory read failed'],
  ])('error %i ⇒ message, no table', async (status, expected) => {
    await render(async () => { throw new CityInventoryHealthError(status === 500 ? 'city inventory read failed' : 'x', status); });
    expect(host!.textContent).toContain(expected);
    expect(q('table')).toBeNull();
  });

  it('loads by authorityId and reloads on demand', async () => {
    const load = vi.fn(async () => health());
    await render(load);
    expect(load).toHaveBeenCalledWith('auth_bsv');
    const btn = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent?.includes('טען מחדש'))!;
    await act(async () => { btn.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

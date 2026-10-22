// @vitest-environment jsdom
/**
 * CityMappingHub H0 — jsdom, injected loader (no fetch, no Firestore, no router).
 * NOTE: proves render + interaction logic only; not seen on a real screen.
 */
process.env.TZ = 'UTC';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import CityMappingHub from '../CityMappingHub';
import type { HubRow } from '@/lib/city-mapping-hub/rows';
import { DEFAULT_HUB_URL_STATE, type HubUrlState } from '@/lib/city-mapping-hub/url-state';

// The real map needs WebGL (not in jsdom): a stand-in that exposes what the live HubMap receives.
vi.mock('../HubMap', () => ({
  default: (p: {
    selected: { authorityId: string } | null; data: Record<string, { featureCollection: { features: unknown[] } } | undefined>; layers: string[]; rows: unknown[];
    onSelectAuthority: (id: string) => void; onFeatureClick?: (f: unknown) => void; selectedFeatureId?: string | null; focusPoint?: [number, number] | null;
  }) => (
    <div data-testid="hub-map" data-selected={p.selected?.authorityId ?? ''} data-routes={p.data.routes?.featureCollection.features.length ?? -1}
      data-parks={p.data.parks?.featureCollection.features.length ?? -1} data-boundary={p.data.boundary ? 1 : 0} data-layers={p.layers.join(',')}
      data-focus={p.selectedFeatureId ?? ''} data-focus-point={p.focusPoint ? p.focusPoint.join(',') : ''}>
      <button type="button" data-testid="map-dot-arad" onClick={() => p.onSelectAuthority('arad')}>dot</button>
      <button type="button" data-testid="map-point-c1" onClick={() => p.onFeatureClick?.({ kind: 'contribution', id: 'c1', properties: { id: 'c1' }, lngLat: [34.8, 31.2] })}>pt</button>
      <button type="button" data-testid="map-route-r2" onClick={() => p.onFeatureClick?.({ kind: 'route', id: 'r2', properties: { id: 'r2', status: 'pending' }, lngLat: [34.8, 31.2] })}>route</button>
    </div>
  ),
}));
// The moderation dispatcher (approval-center services) — recorded, controllable.
const mod = vi.hoisted(() => ({ one: [] as unknown[], bulk: [] as unknown[], amen: [] as unknown[], fail: false }));
vi.mock('@/features/admin/services/city-mapping-hub-moderation.service', () => ({
  moderateOne: async (i: unknown) => { mod.one.push(i); if (mod.fail) throw new Error('permission-denied'); },
  bulkApproveRoutes: async (ids: string[]) => { mod.bulk.push(ids); return ids.length; },
  moderateAmenities: async (...a: unknown[]) => { mod.amen.push(a); return { updated: a[1], skipped: [] }; },
}));
// MapHealthCard reads the inventory route; not under test here.
vi.mock('../../city-inventory/MapHealthCard', () => ({ default: (p: { authorityId: string }) => <div data-testid="map-health" data-id={p.authorityId} /> }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });

const row = (id: string, name: string, over: Partial<HubRow> = {}): HubRow => ({
  authorityId: id, name, authorityType: 'city', measured: true, level: 'yellow', score: 50, approvedRoutes: 4, pendingRoutes: 0, pendingParks: 0, pendingContributions: 0,
  quota: { min: 8, max: 15 }, shadeCoveragePct: 40, lightingCoveragePct: 60, benchesDensity: 1.2, waterDensity: 0.3, toiletsDensity: 0.1,
  gaps: ['quota'], isActiveClient: false, population: null, center: null, lastRefreshAt: '2026-10-20T05:00:00.000Z', ...over,
});
const ROWS = [
  row('bsv', 'באר שבע', { level: 'green', score: 80, approvedRoutes: 30, gaps: [] }),
  row('arad', 'ערד', { level: 'red', score: 20, pendingRoutes: 3, gaps: ['quota', 'shade', 'lighting'] }),
  row('sderot', 'שדרות', { measured: false, level: null, score: null, shadeCoveragePct: null, lightingCoveragePct: null, benchesDensity: null, waterDensity: null, toiletsDensity: null, gaps: ['not_measured'], lastRefreshAt: null }),
];

const changes: HubUrlState[] = [];
const layerCalls: string[] = [];
const route = (id: string, status: string) => ({ type: 'Feature', properties: { id, kind: 'route', status }, geometry: { type: 'LineString', coordinates: [[34.8, 31.2], [34.81, 31.21]] } });
const pt = (id: string, kind: string, status: string, extra: Record<string, unknown> = {}) => ({ type: 'Feature', properties: { id, kind, status, ...extra }, geometry: { type: 'Point', coordinates: [34.8, 31.2] } });
const loadLayer = vi.fn(async (authorityId: string, layer: string) => {
  layerCalls.push(`${authorityId}:${layer}`);
  const features = layer === 'routes' ? [route('r1', 'approved'), route('r2', 'pending'), route('r3', 'pending')]
    : layer === 'contributions' ? [pt('c1', 'contribution', 'pending', { type: 'new_location', name: 'גינה חדשה', photo: 'https://img.example/c1.jpg', equipmentCount: 3 })]
    : layer === 'parks' ? [pt('p1', 'park', 'pending', { name: 'פארק הנחל', photoCount: 2, equipmentCount: 5 }), pt('p2', 'park', 'approved', { name: 'גן העיר' })]
    : [];
  return { featureCollection: { type: 'FeatureCollection' as const, features: features as never[] }, truncated: layer === 'routes', total: layer === 'routes' ? 6000 : features.length };
});
let rowLoads = 0;
const ADMIN = { adminId: 'u1', adminName: 'דוד' };
function Harness({ initial, admin = ADMIN }: { initial: HubUrlState; admin?: typeof ADMIN | null }) {
  const [s, setS] = useState(initial);
  return <CityMappingHub state={s} onStateChange={(n) => { changes.push(n); setS(n); }} loadRows={async () => { rowLoads++; return ROWS; }} loadLayer={loadLayer} admin={admin} />;
}

async function render(initial: HubUrlState = DEFAULT_HUB_URL_STATE, admin: typeof ADMIN | null = ADMIN) {
  changes.length = 0;
  layerCalls.length = 0;
  rowLoads = 0;
  mod.one = []; mod.bulk = []; mod.amen = []; mod.fail = false;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<Harness initial={initial} admin={admin} />); });
  await act(async () => { await Promise.resolve(); });
  return host;
}
const names = (h: HTMLElement) => Array.from(h.querySelectorAll('[data-testid="hub-row"]')).map((r) => r.getAttribute('data-id'));

describe('CityMappingHub (H0)', () => {
  it('every authority shows; worst score first; unmeasured last and "לא נמדד", never 0', async () => {
    const h = await render();
    expect(names(h)).toEqual(['arad', 'bsv', 'sderot']);
    const sderot = h.querySelector('[data-id="sderot"]')!;
    expect(sderot.textContent).toContain('לא נמדד');
    expect(sderot.textContent).not.toMatch(/\b0%/);
    expect(h.querySelector('[data-testid="hub-count"]')!.textContent).toBe('3 מוצגות מתוך 3');
    const kpis = Array.from(h.querySelectorAll('[data-testid="hub-kpi"]')).map((k) => k.textContent);
    expect(kpis).toContain('3רשויות');
    expect(kpis).toContain('1לא נמדדו');
  });
  it('level filter "red" shows only red (and selects it — one result)', async () => {
    const h = await render();
    const red = Array.from(h.querySelectorAll('button')).find((b) => b.textContent === 'אדום')!;
    await act(async () => { red.click(); });
    expect(names(h)).toEqual(['arad']);
    expect(changes.at(-1)).toMatchObject({ level: 'red', authority: 'arad' });
    expect(h.querySelector('[data-testid="hub-summary"]')!.textContent).toContain('ערד');
  });
  it('row click selects the authority (URL state) and shows its gaps', async () => {
    const h = await render();
    await act(async () => { (h.querySelector('[data-id="bsv"]') as HTMLElement).click(); });
    expect(changes.at(-1)?.authority).toBe('bsv');
    expect(h.querySelector('[data-id="bsv"]')!.getAttribute('aria-selected')).toBe('true');
    expect(h.textContent).toContain('אין פערים ידועים');
  });
  it('header click sorts; second click flips the direction', async () => {
    const h = await render();
    const byName = Array.from(h.querySelectorAll('th button')).find((b) => b.textContent?.startsWith('רשות'))! as HTMLButtonElement;
    await act(async () => { byName.click(); });
    expect(names(h)).toEqual(['bsv', 'arad', 'sderot']);
    await act(async () => { byName.click(); });
    expect(names(h)).toEqual(['sderot', 'arad', 'bsv']);
  });
  it('H1: no selection = national map, no layer reads; selecting loads boundary + routes for THAT authority only', async () => {
    const h = await render();
    expect(h.querySelector('[data-testid="hub-map"]')!.getAttribute('data-selected')).toBe('');
    expect(layerCalls).toEqual([]);
    await act(async () => { (h.querySelector('[data-testid="map-dot-arad"]') as HTMLElement).click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(changes.at(-1)?.authority).toBe('arad');
    expect(layerCalls.sort()).toEqual(['arad:boundary', 'arad:contributions', 'arad:fitness', 'arad:parks', 'arad:routes']);
    const map = h.querySelector('[data-testid="hub-map"]')!;
    expect(map.getAttribute('data-selected')).toBe('arad');
    expect(map.getAttribute('data-routes')).toBe('3');
    expect(h.querySelector('[data-testid="chip-routes_approved"]')!.textContent).toContain('1');
    expect(h.querySelector('[data-testid="chip-routes_pending"]')!.textContent).toContain('2');
    expect(h.querySelector('[data-testid="hub-map-crumb"]')!.textContent).toContain('ערד');
    expect(h.textContent).toContain('מוצגים 3 מתוך 6000'); // truncated is a banner, never silent
  });
  it('H1: a chip toggles its layer in the URL state without refetching', async () => {
    const h = await render({ ...DEFAULT_HUB_URL_STATE, authority: 'arad' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const n = layerCalls.length;
    await act(async () => { (h.querySelector('[data-testid="chip-routes_pending"]') as HTMLElement).click(); });
    expect(changes.at(-1)?.layers).toEqual(['routes_approved', 'parks', 'fitness', 'contributions']);
    expect(h.querySelector('[data-testid="hub-map"]')!.getAttribute('data-layers')).toBe('routes_approved,parks,fitness,contributions');
    expect(layerCalls.length).toBe(n);
  });
  it('H2: contributions + parks show in the panel from the same loaded layer; a list click focuses the map', async () => {
    const h = await render({ ...DEFAULT_HUB_URL_STATE, authority: 'arad', panel: 'contributions' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const list = h.querySelector('[data-testid="hub-list-contributions"]')!;
    expect(list.textContent).toContain('גינה חדשה');
    expect(list.textContent).toContain('3 מתקנים');
    expect(list.querySelector('img')!.getAttribute('src')).toBe('https://img.example/c1.jpg');
    await act(async () => { (list.querySelector('[data-id="c1"] button') as HTMLElement).click(); });
    expect(h.querySelector('[data-testid="hub-map"]')!.getAttribute('data-focus')).toBe('c1');
    expect(h.querySelector('[data-testid="hub-map"]')!.getAttribute('data-focus-point')).toBe('34.8,31.2');
    const parksTab = Array.from(h.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith('מיקומים'))! as HTMLElement;
    expect(parksTab.textContent).toBe('מיקומים (2)');
    await act(async () => { parksTab.click(); });
    expect(changes.at(-1)?.panel).toBe('parks');
    const items = Array.from(h.querySelectorAll('[data-testid="hub-list-parks"] [data-testid="hub-list-item"]'));
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining('ממתין'), expect.stringContaining('מאושר')]);
    expect(items[0].textContent).toContain('2 תמונות');
  });
  it('H2: a map click on a contribution opens the contributions tab; data-only layers are disabled, never empty maps', async () => {
    const h = await render({ ...DEFAULT_HUB_URL_STATE, authority: 'arad' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { (h.querySelector('[data-testid="map-point-c1"]') as HTMLElement).click(); });
    expect(changes.at(-1)?.panel).toBe('contributions');
    const toilets = h.querySelector('[data-testid="chip-dataonly-toilets"]')!;
    expect(toilets.getAttribute('aria-disabled')).toBe('true');
    expect(toilets.getAttribute('title')).toContain('אין גאומטריה');
    expect(h.querySelector('[data-testid="chip-parks"]')!.textContent).toContain('2');
  });
  it('H3: approve a pending route from the map → the approval-center service, line turns approved, table re-read', async () => {
    const h = await render({ ...DEFAULT_HUB_URL_STATE, authority: 'arad' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { (h.querySelector('[data-testid="map-route-r2"]') as HTMLElement).click(); });
    expect(h.querySelector('[data-testid="hub-popover"]')).not.toBeNull();
    const loadsBefore = rowLoads;
    await act(async () => { (h.querySelector('[data-testid="hub-approve"]') as HTMLElement).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(mod.one).toEqual([{ kind: 'route', id: 'r2', authorityId: 'arad', action: 'approve', reason: null, admin: ADMIN }]);
    expect(h.querySelector('[data-testid="chip-routes_pending"]')!.textContent).toContain('1');
    expect(h.querySelector('[data-testid="chip-routes_approved"]')!.textContent).toContain('2');
    expect(h.querySelector('[data-testid="hub-popover"]')!.textContent).toContain('מאושר');
    expect(rowLoads).toBe(loadsBefore + 1);
    expect(h.querySelector('[data-testid="hub-notice"]')!.textContent).toContain('אושר');
  });
  it('H3: reject asks for a reason (chip) and the line leaves the map', async () => {
    const h = await render({ ...DEFAULT_HUB_URL_STATE, authority: 'arad' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { (h.querySelector('[data-testid="map-route-r2"]') as HTMLElement).click(); });
    await act(async () => { (h.querySelector('[data-testid="hub-reject"]') as HTMLElement).click(); });
    const chip = Array.from(h.querySelectorAll('[data-testid="hub-popover"] button')).find((b) => b.textContent === 'כפול') as HTMLElement;
    await act(async () => { chip.click(); });
    await act(async () => { (h.querySelector('[data-testid="hub-reject-confirm"]') as HTMLElement).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(mod.one).toEqual([expect.objectContaining({ kind: 'route', id: 'r2', action: 'reject', reason: 'כפול' })]);
    expect(h.querySelector('[data-testid="hub-map"]')!.getAttribute('data-routes')).toBe('2');
    expect(h.querySelector('[data-testid="hub-popover"]')).toBeNull();
  });
  it('H3: a failed write reverts the map and says so', async () => {
    const h = await render({ ...DEFAULT_HUB_URL_STATE, authority: 'arad' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    mod.fail = true;
    await act(async () => { (h.querySelector('[data-testid="map-route-r2"]') as HTMLElement).click(); });
    await act(async () => { (h.querySelector('[data-testid="hub-approve"]') as HTMLElement).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(h.querySelector('[data-testid="chip-routes_pending"]')!.textContent).toContain('2');
    expect(h.querySelector('[data-testid="hub-notice"]')!.getAttribute('role')).toBe('alert');
    expect(h.querySelector('[data-testid="hub-notice"]')!.textContent).toContain('permission-denied');
  });
  it('H3: bulk approve is per authority with an exact-count confirm; cancel writes nothing', async () => {
    const h = await render({ ...DEFAULT_HUB_URL_STATE, authority: 'arad' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const btn = h.querySelector('[data-testid="hub-bulk-routes"]') as HTMLElement;
    expect(btn.textContent).toBe('אשר 2 מסלולים ממתינים');
    await act(async () => { btn.click(); });
    expect(document.querySelector('[data-testid="hub-bulk-count"]')!.textContent).toBe('2');
    expect(document.querySelector('[data-testid="hub-bulk-confirm"]')!.textContent).toContain('ערד');
    const cancel = Array.from(document.querySelectorAll('[data-testid="hub-bulk-confirm"] button')).find((b) => b.textContent === 'ביטול') as HTMLElement;
    await act(async () => { cancel.click(); });
    expect(mod.bulk).toEqual([]);
    await act(async () => { btn.click(); });
    await act(async () => { (document.querySelector('[data-testid="hub-bulk-ok"]') as HTMLElement).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(mod.bulk).toEqual([['r2', 'r3']]);
    expect(h.querySelector('[data-testid="chip-routes_pending"]')!.textContent).toContain('0');
    expect(document.querySelector('[data-testid="hub-bulk-confirm"]')).toBeNull();
  });
  it('H3: no admin identity ⇒ no bulk bar and no approve buttons', async () => {
    const h = await render({ ...DEFAULT_HUB_URL_STATE, authority: 'arad' }, null);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(h.querySelector('[data-testid="hub-bulk-routes"]')).toBeNull();
    await act(async () => { (h.querySelector('[data-testid="map-route-r2"]') as HTMLElement).click(); });
    expect(h.querySelector('[data-testid="hub-approve"]')).toBeNull();
  });
  it('a loader failure is shown, not swallowed', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const fail = async () => { throw Object.assign(new Error('city mapping hub is off'), { status: 403 }); };
    await act(async () => { root!.render(<CityMappingHub state={DEFAULT_HUB_URL_STATE} onStateChange={() => {}} loadRows={fail} />); });
    await act(async () => { await Promise.resolve(); });
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('city mapping hub is off');
  });
});

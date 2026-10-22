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
function Harness({ initial }: { initial: HubUrlState }) {
  const [s, setS] = useState(initial);
  return <CityMappingHub state={s} onStateChange={(n) => { changes.push(n); setS(n); }} loadRows={async () => ROWS} />;
}

async function render(initial: HubUrlState = DEFAULT_HUB_URL_STATE) {
  changes.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<Harness initial={initial} />); });
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

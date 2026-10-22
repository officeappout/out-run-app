// @vitest-environment jsdom
/**
 * AllCitiesTable (RC8 step 5) — jsdom, injected loader (no fetch, no Firestore).
 */
process.env.TZ = 'UTC';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AllCitiesTable from '../AllCitiesTable';
import type { CityOverviewRow } from '@/lib/city-inventory/overview';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });

const row = (id: string, city: string, score: number, level: CityOverviewRow['level'], light: number | null): CityOverviewRow => ({
  authorityId: id, city, authorityType: 'city', level, score, approvedRoutes: 3, quota: { min: 8, max: 15 }, shadeSource: id === 'a' ? 'technion_shade' : null, shadeCoveragePct: id === 'a' ? 42 : null, lightingCoveragePct: light, lastRefreshAt: '2026-10-22T05:00:00.000Z',
});

async function render(onSelect = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<AllCitiesTable onSelectCity={onSelect} load={async () => [row('a', 'אשקלון', 70, 'yellow', 60), row('b', 'ערד', 30, 'red', null)]} />); });
  await act(async () => { await Promise.resolve(); });
  return host;
}

describe('AllCitiesTable', () => {
  it('renders one row per city, worst readiness first; "not measured" is never 0', async () => {
    const h = await render();
    const rows = Array.from(h.querySelectorAll('[data-testid="all-cities-row"]'));
    expect(rows.map((r) => r.querySelector('button')?.textContent)).toEqual(['ערד', 'אשקלון']);
    expect(rows[0].textContent).toContain('לא נמדד');
    expect(rows[1].textContent).toContain('טכניון · 42%');
    expect(h.textContent).toContain('🔴1 🟡1 🟢0');
  });
  it('sorts on header click and opens the per-city card on a city click', async () => {
    const onSelect = vi.fn();
    const h = await render(onSelect);
    const header = Array.from(h.querySelectorAll('th button')).find((b) => b.textContent?.includes('מוכנות'))!;
    await act(async () => { (header as HTMLButtonElement).click(); });
    expect(Array.from(h.querySelectorAll('[data-testid="all-cities-row"] td:first-child button')).map((b) => b.textContent)).toEqual(['אשקלון', 'ערד']);
    await act(async () => { (h.querySelector('[data-testid="all-cities-row"] button') as HTMLButtonElement).click(); });
    expect(onSelect).toHaveBeenCalledWith('אשקלון', 'a');
  });
});

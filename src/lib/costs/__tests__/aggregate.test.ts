import { describe, expect, it } from 'vitest';
import { detectSpikes, linearForecast, pctChange, pickVendorSnapshots, summarizeMonth } from '../aggregate';
import type { ConnectorSnapshot, CostItem, MonthDoc } from '../cost-types';

const snap = (amount: number, extra: Partial<ConnectorSnapshot> = {}): ConnectorSnapshot => ({
  status: 'ok', amount, currency: 'USD', breakdown: [], fetchedAtMs: 0, ...extra,
});
const FX = { USD: 3, EUR: 4, source: 'manual' as const };

const item = (over: Partial<CostItem>): CostItem => ({
  id: 'i1', name: 'Workspace', vendor: 'Google', amount: 150, currency: 'ILS', cadence: 'monthly',
  startDate: '2026-01-01', category: 'tools', active: true, ...over,
});

describe('pickVendorSnapshots', () => {
  it('the official Anthropic report replaces the ledger estimate (no double count)', () => {
    const doc: MonthDoc = { month: '2026-10', connectors: { ai_ledger: snap(4), anthropic_admin: snap(5) } };
    expect(pickVendorSnapshots(doc).anthropic?.id).toBe('anthropic_admin');
  });
  it('falls back to the ledger when the admin connector is not ok', () => {
    const doc: MonthDoc = { month: '2026-10', connectors: { ai_ledger: snap(4), anthropic_admin: snap(0, { status: 'error' }) } };
    expect(pickVendorSnapshots(doc).anthropic?.id).toBe('ai_ledger');
  });
});

describe('summarizeMonth', () => {
  const doc: MonthDoc = { month: '2026-10', fx: FX, connectors: { ai_ledger: snap(10), vercel: snap(20) } };

  it('converts to ILS with the month FX and forecasts usage linearly, fixed in full', () => {
    // 2026-10-10: 10 of 31 days elapsed
    const s = summarizeMonth('2026-10', doc, [item({})], '2026-10-10');
    const ai = s.rows.find((r) => r.key === 'v:anthropic')!;
    expect(ai.ils).toBe(30);
    expect(ai.forecastIls).toBe(93);
    const ws = s.rows.find((r) => r.key === 'i:i1')!;
    expect(ws.forecastIls).toBe(150);
    expect(s.totalIls).toBe(30 + 60 + 150);
    expect(s.forecastIls).toBe(93 + 186 + 150);
  });

  it('a past month: forecast = actual', () => {
    const s = summarizeMonth('2026-10', doc, [], '2026-11-03');
    expect(s.forecastIls).toBe(s.totalIls);
  });

  it('a manual item tagged with a reporting connector vendor is covered, not added twice', () => {
    const s = summarizeMonth('2026-10', doc, [item({ id: 'v', name: 'Vercel Pro', vendorKey: 'vercel', amount: 20, currency: 'USD' })], '2026-10-10');
    expect(s.rows.find((r) => r.key === 'i:v')?.covered).toBe(true);
    expect(s.totalIls).toBe(90);
  });

  it('no month doc → default FX, only fixed items', () => {
    const s = summarizeMonth('2026-08', null, [item({ amount: 10, currency: 'USD' })], '2026-10-10');
    expect(s.totalIls).toBeCloseTo(31, 2);
  });
});

describe('forecast / change helpers', () => {
  it('linearForecast', () => {
    expect(linearForecast(10, 10, 30)).toBe(30);
    expect(linearForecast(10, 0, 30)).toBe(10);
    expect(linearForecast(10, 30, 30)).toBe(10);
  });
  it('pctChange', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 0)).toBeNull();
  });
});

describe('detectSpikes', () => {
  const month = (m: string, vercelUsd: number) => summarizeMonth(m, { month: m, fx: FX, connectors: { vercel: snap(vercelUsd) } }, [], '2026-10-31');

  it('flags a vendor above 1.5× its 3-month average', () => {
    const spikes = detectSpikes(month('2026-10', 40), [month('2026-09', 20), month('2026-08', 20), month('2026-07', 20)]);
    expect(spikes).toHaveLength(1);
    expect(spikes[0]).toMatchObject({ key: 'v:vercel', currentIls: 120, avgIls: 60, ratio: 2 });
  });
  it('not at 1.5× exactly, not for a brand-new vendor, not for pocket change', () => {
    expect(detectSpikes(month('2026-10', 30), [month('2026-09', 20), month('2026-08', 20), month('2026-07', 20)])).toHaveLength(0);
    expect(detectSpikes(month('2026-10', 40), [month('2026-09', 0), month('2026-08', 0), month('2026-07', 0)])).toHaveLength(0);
    expect(detectSpikes(month('2026-10', 6), [month('2026-09', 1), month('2026-08', 1), month('2026-07', 1)])).toHaveLength(0);
  });
  it('a yearly fixed renewal is never a spike', () => {
    const items = [item({ cadence: 'yearly', amount: 1000, startDate: '2025-10-05' })];
    const cur = summarizeMonth('2026-10', { month: '2026-10', fx: FX }, items, '2026-10-31');
    expect(detectSpikes(cur, [])).toHaveLength(0);
  });
});

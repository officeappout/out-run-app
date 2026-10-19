import { describe, expect, it } from 'vitest';
import { buildDashboard } from '../dashboard';
import type { ConnectorSnapshot, MonthDoc } from '../cost-types';

const snap = (amount: number): ConnectorSnapshot => ({ status: 'ok', amount, currency: 'USD', breakdown: [], fetchedAtMs: 0 });
const FX = { USD: 3, EUR: 4, source: 'manual' as const };
const doc = (m: string, vercel: number): MonthDoc => ({ month: m, fx: FX, connectors: { vercel: snap(vercel) } });

describe('buildDashboard', () => {
  const docs: Record<string, MonthDoc | null> = {
    '2026-05': null,
    '2026-06': doc('2026-06', 10),
    '2026-07': doc('2026-07', 10),
    '2026-08': doc('2026-08', 10),
    '2026-09': doc('2026-09', 10),
    '2026-10': doc('2026-10', 15), // 15 of 31 days → forecast 31 USD
  };
  const d = buildDashboard({ month: '2026-10', today: '2026-10-15', docs, items: [], env: { VERCEL_BILLING_TOKEN: 'x', VERCEL_TEAM_ID: 'y' }, todayAiUsd: null });

  it('trend is 6 months oldest first', () => {
    expect(d.trend.months).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(d.trend.totals).toEqual([0, 30, 30, 30, 30, 45]);
    expect(d.trend.byRow['v:vercel']).toEqual([0, 30, 30, 30, 30, 45]);
  });

  it('running month compares its forecast to last month; spike at 3.1×', () => {
    expect(d.summary.forecastIls).toBe(93);
    expect(d.changePct).toBe(210);
    expect(d.spikes[0]).toMatchObject({ key: 'v:vercel', ratio: 3.1 });
  });

  it('connector status says configured, never echoes env values', () => {
    const v = d.connectors.find((c) => c.id === 'vercel')!;
    expect(v.configured).toBe(true);
    expect(d.connectors.find((c) => c.id === 'github')!.configured).toBe(false);
    expect(JSON.stringify(d)).not.toContain('"x"');
  });
});

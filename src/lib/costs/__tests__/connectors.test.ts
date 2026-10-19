/**
 * Connector parsers + fetch steps against fixtures shaped exactly like each vendor's documented
 * response (docs links in each connector's header; no live keys were used — owner adds them).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('server-only', () => ({}));

import { anthropicCostUrl, parseAnthropicCostPages, runAnthropicAdmin } from '../connectors/anthropic-admin';
import { buildBillingQuery, parseBigQueryBilling, parseTableRef } from '../connectors/gcp-billing';
import { parseVercelJsonl, runVercel } from '../connectors/vercel';
import { parseBunnyBilling, runBunny } from '../connectors/bunny';
import { parseGithubUsage, runGithub } from '../connectors/github';
import { parseLedgerDays } from '../connectors/ai-ledger';
import { groupLines } from '../connectors/types';

const fx = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const json = (name: string) => JSON.parse(fx(name));
const NOW = new Date('2026-10-19T09:00:00Z');

function fakeFetch(responses: Array<{ status?: number; body: string }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses.shift()!;
    return new Response(r.body, { status: r.status ?? 200 });
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe('Anthropic cost report', () => {
  it('sums cents strings across pages into USD, grouped by model / cost type', () => {
    const p = parseAnthropicCostPages([json('anthropic-cost-report.page1.json'), json('anthropic-cost-report.page2.json')]);
    expect(p.currency).toBe('USD');
    expect(p.amount).toBeCloseTo(5.0, 6);
    expect(p.breakdown[0]).toEqual({ label: 'claude-sonnet-4-6', amount: 4.2345 });
    expect(p.breakdown.map((l) => l.label)).toContain('web_search');
  });

  it('caps ending_at at tomorrow for the running month, full month for a past one', () => {
    expect(anthropicCostUrl('2026-10', NOW)).toContain('ending_at=2026-10-20T00%3A00%3A00Z');
    expect(anthropicCostUrl('2026-09', NOW)).toContain('ending_at=2026-10-01T00%3A00%3A00Z');
    expect(anthropicCostUrl('2026-10', NOW)).toContain('group_by%5B%5D=description');
  });

  it('follows next_page and sends the admin key only to api.anthropic.com', async () => {
    const { f, calls } = fakeFetch([{ body: fx('anthropic-cost-report.page1.json') }, { body: fx('anthropic-cost-report.page2.json') }]);
    const snap = await runAnthropicAdmin('2026-10', { env: { ANTHROPIC_ADMIN_KEY: 'sk-ant-admin-test' }, fetch: f, now: NOW });
    expect(snap).not.toBe('keep');
    expect(snap !== 'keep' && snap.amount).toBeCloseTo(5, 6);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('page=page_');
    for (const c of calls) {
      expect(new URL(c.url).host).toBe('api.anthropic.com');
      expect((c.init?.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-admin-test');
    }
  });

  it('a non-2xx becomes http_<status> — no body, no key in the error', async () => {
    const { f } = fakeFetch([{ status: 401, body: '{"error":"invalid x-api-key sk-ant-admin-test"}' }]);
    await expect(runAnthropicAdmin('2026-10', { env: { ANTHROPIC_ADMIN_KEY: 'sk-ant-admin-test' }, fetch: f, now: NOW })).rejects.toMatchObject({ code: 'http_401', message: 'http_401' });
  });
});

describe('Google Cloud billing export (BigQuery)', () => {
  it('validates the table name (no injection through the env var)', () => {
    expect(parseTableRef('appout-1.billing_export.gcp_billing_export_v1_01AB23_45CD67_89EF01')).toEqual({
      project: 'appout-1',
      fqtn: 'appout-1.billing_export.gcp_billing_export_v1_01AB23_45CD67_89EF01',
    });
    expect(parseTableRef('appout-1.ds.t`; DROP TABLE x; --')).toBeNull();
    expect(parseTableRef('just_a_table')).toBeNull();
    expect(parseTableRef(undefined)).toBeNull();
  });

  it('query nets credits and filters by the invoice month parameter', () => {
    const q = buildBillingQuery('p-123.d.t');
    expect(q).toContain('UNNEST(credits)');
    expect(q).toContain('invoice.month = @invoice_month');
    expect(q).toContain('`p-123.d.t`');
  });

  it('parses jobs.query rows into a per-service breakdown', () => {
    const p = parseBigQueryBilling(json('bigquery-billing.json'));
    expect(p.currency).toBe('USD');
    expect(p.amount).toBeCloseTo(23.500001, 6);
    expect(p.breakdown[0]).toEqual({ label: 'Cloud Firestore', amount: 12.5 });
    expect(p.breakdown.find((l) => l.label === 'Cloud Functions')).toBeUndefined(); // < 0.0001 dropped
  });

  it('refuses an incomplete job or mixed currencies instead of guessing', () => {
    expect(() => parseBigQueryBilling({ jobComplete: false })).toThrow('bq_job_incomplete');
    const mixed = json('bigquery-billing.json');
    mixed.rows[1].f[1].v = 'ILS';
    expect(() => parseBigQueryBilling(mixed)).toThrow('bq_mixed_currency');
  });
});

describe('Vercel FOCUS charges (JSONL)', () => {
  it('sums BilledCost (numbers or strings, credits negative) by ServiceName, skips blank lines', () => {
    const p = parseVercelJsonl(fx('vercel-charges.jsonl'));
    expect(p.amount).toBeCloseTo(21, 6);
    expect(p.breakdown[0]).toEqual({ label: 'Pro Seat', amount: 20 });
    expect(p.breakdown.find((l) => l.label === 'Function Duration')?.amount).toBeCloseTo(2, 6);
  });

  it('calls /v1/billing/charges with team + UTC month range', async () => {
    const { f, calls } = fakeFetch([{ body: fx('vercel-charges.jsonl') }]);
    await runVercel('2026-09', { env: { VERCEL_BILLING_TOKEN: 't', VERCEL_TEAM_ID: 'team_x' }, fetch: f, now: NOW });
    const u = new URL(calls[0].url);
    expect(u.host).toBe('api.vercel.com');
    expect(u.pathname).toBe('/v1/billing/charges');
    expect(u.searchParams.get('from')).toBe('2026-09-01T00:00:00Z');
    expect(u.searchParams.get('to')).toBe('2026-10-01T00:00:00Z');
    expect(u.searchParams.get('teamId')).toBe('team_x');
  });
});

describe('Bunny billing', () => {
  it('ThisMonthCharges is the total; MonthlyCharges* > 0 are the breakdown', () => {
    const p = parseBunnyBilling(json('bunny-billing.json'));
    expect(p.amount).toBe(6.42);
    expect(p.breakdown).toEqual([
      { label: 'Traffic EU', amount: 4.5 },
      { label: 'Storage', amount: 1.2 },
      { label: 'Traffic US', amount: 0.72 },
    ]);
  });

  it('a past month is kept (Bunny only reports the running month) — no request made', async () => {
    const { f, calls } = fakeFetch([]);
    expect(await runBunny('2026-09', { env: { BUNNY_ACCOUNT_API_KEY: 'k' }, fetch: f, now: NOW })).toBe('keep');
    expect(calls).toHaveLength(0);
  });

  it('sends the account key as AccessKey to api.bunny.net', async () => {
    const { f, calls } = fakeFetch([{ body: fx('bunny-billing.json') }]);
    await runBunny('2026-10', { env: { BUNNY_ACCOUNT_API_KEY: 'k' }, fetch: f, now: NOW });
    expect(calls[0].url).toBe('https://api.bunny.net/billing');
    expect((calls[0].init?.headers as Record<string, string>).AccessKey).toBe('k');
  });
});

describe('GitHub billing usage', () => {
  it('sums netAmount per product', () => {
    const p = parseGithubUsage(json('github-usage.json'));
    expect(p.amount).toBe(35);
    expect(p.breakdown).toEqual([
      { label: 'copilot', amount: 19 },
      { label: 'actions', amount: 16 },
    ]);
  });

  it('defaults to the officeappout org, month without leading zero', async () => {
    const { f, calls } = fakeFetch([{ body: fx('github-usage.json') }]);
    await runGithub('2026-09', { env: { GITHUB_BILLING_TOKEN: 'g' }, fetch: f, now: NOW });
    const u = new URL(calls[0].url);
    expect(u.pathname).toBe('/organizations/officeappout/settings/billing/usage');
    expect(u.searchParams.get('year')).toBe('2026');
    expect(u.searchParams.get('month')).toBe('9');
  });
});

describe('AI ledger + shared helpers', () => {
  it('sums costUsd/calls with field guards', () => {
    const p = parseLedgerDays([
      { day: '2026-10-01', costUsd: 0.5, calls: 10 },
      { day: '2026-10-02', costUsd: 'x', calls: undefined },
      { day: '2026-10-03', costUsd: 1.25, calls: 3 },
    ]);
    expect(p.amount).toBe(1.75);
    expect(p.calls).toBe(13);
  });

  it('groupLines folds the tail into "אחר"', () => {
    const lines = groupLines(Array.from({ length: 15 }, (_, i) => [`s${i}`, 15 - i] as [string, number]), 5);
    expect(lines).toHaveLength(5);
    expect(lines[4].label).toBe('אחר');
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(120);
  });
});

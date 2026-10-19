/**
 * Anthropic — official cost report (Admin API).
 *   GET https://api.anthropic.com/v1/organizations/cost_report
 *       ?starting_at=<RFC3339>&ending_at=<RFC3339>&bucket_width=1d&limit=31&group_by[]=description
 *   headers: x-api-key: <ANTHROPIC_ADMIN_KEY (sk-ant-admin…)>, anthropic-version: 2023-06-01
 * Docs: https://platform.claude.com/docs/en/api/admin-api/usage-cost/get-cost-report (checked 19.10.2026)
 * `amount` is a decimal STRING in the lowest currency unit (cents): "123.45" USD = $1.2345.
 * Paginated with has_more / next_page → page.
 */
import type { ConnectorRun, ParsedCost } from './types';
import { ensureOk, FETCH_TIMEOUT_MS, groupLines, num, okSnapshot } from './types';
import { monthUtcRange } from '../month';

const URL_BASE = 'https://api.anthropic.com/v1/organizations/cost_report';
const MAX_PAGES = 5;

interface CostResult {
  amount?: unknown;
  currency?: unknown;
  description?: unknown;
  model?: unknown;
  cost_type?: unknown;
}
export interface CostReportPage {
  data?: Array<{ starting_at?: string; results?: CostResult[] }>;
  has_more?: boolean;
  next_page?: string | null;
}

export function parseAnthropicCostPages(pages: CostReportPage[]): ParsedCost {
  const pairs: Array<[string, number]> = [];
  for (const page of pages) {
    for (const bucket of page.data ?? []) {
      for (const r of bucket.results ?? []) {
        if (r.currency !== undefined && r.currency !== 'USD') continue;
        const usd = num(r.amount) / 100;
        const label = typeof r.model === 'string' && r.model ? r.model
          : typeof r.cost_type === 'string' && r.cost_type ? r.cost_type
          : typeof r.description === 'string' && r.description ? r.description
          : 'Anthropic';
        pairs.push([label, usd]);
      }
    }
  }
  return { amount: pairs.reduce((s, [, v]) => s + v, 0), currency: 'USD', breakdown: groupLines(pairs) };
}

/** ending_at is capped at the start of tomorrow (UTC) so the running month never asks for the future. */
export function anthropicCostUrl(month: string, now: Date, page?: string): string {
  const { from, to } = monthUtcRange(month);
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString().replace('.000Z', 'Z');
  const end = tomorrow < to ? tomorrow : to;
  const qs = new URLSearchParams({ starting_at: from, ending_at: end, bucket_width: '1d', limit: '31' });
  qs.append('group_by[]', 'description');
  if (page) qs.set('page', page);
  return `${URL_BASE}?${qs.toString()}`;
}

export const runAnthropicAdmin: ConnectorRun = async (month, deps) => {
  const key = deps.env.ANTHROPIC_ADMIN_KEY!.trim();
  const pages: CostReportPage[] = [];
  let next: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await ensureOk(
      await deps.fetch(anthropicCostUrl(month, deps.now, next), {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
    );
    const body = (await res.json()) as CostReportPage;
    pages.push(body);
    if (!body.has_more || !body.next_page) break;
    next = body.next_page;
  }
  return okSnapshot(parseAnthropicCostPages(pages), deps.now);
};

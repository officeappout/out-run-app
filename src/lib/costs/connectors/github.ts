/**
 * GitHub — organization billing usage report (enhanced billing platform).
 *   GET https://api.github.com/organizations/{org}/settings/billing/usage?year=YYYY&month=M
 *   Authorization: Bearer <GITHUB_BILLING_TOKEN>, Accept: application/vnd.github+json,
 *   X-GitHub-Api-Version: 2026-03-10
 * Docs: https://docs.github.com/en/rest/billing/usage (checked 19.10.2026)
 * usageItems[]: date, product, sku, quantity, unitType, pricePerUnit, grossAmount,
 * discountAmount, netAmount (USD), organizationName, repositoryName. We sum netAmount.
 * Token: fine-grained, resource owner = the org, organization permission "Administration: read";
 * the token's owner must be an org owner / billing manager.
 */
import type { ConnectorRun, ParsedCost } from './types';
import { ensureOk, FETCH_TIMEOUT_MS, groupLines, num, okSnapshot } from './types';

export const DEFAULT_GITHUB_ORG = 'officeappout';

export function parseGithubUsage(body: { usageItems?: Array<Record<string, unknown>> }): ParsedCost {
  const pairs: Array<[string, number]> = (body?.usageItems ?? []).map((i) => [
    typeof i.product === 'string' && i.product ? i.product : 'GitHub',
    num(i.netAmount),
  ]);
  return { amount: pairs.reduce((s, [, v]) => s + v, 0), currency: 'USD', breakdown: groupLines(pairs) };
}

export const runGithub: ConnectorRun = async (month, deps) => {
  const org = (deps.env.GITHUB_BILLING_ORG ?? '').trim() || DEFAULT_GITHUB_ORG;
  const [y, m] = month.split('-');
  const qs = new URLSearchParams({ year: y, month: String(Number(m)) });
  const res = await ensureOk(
    await deps.fetch(`https://api.github.com/organizations/${encodeURIComponent(org)}/settings/billing/usage?${qs.toString()}`, {
      headers: {
        Authorization: `Bearer ${deps.env.GITHUB_BILLING_TOKEN!.trim()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
  );
  return okSnapshot(parseGithubUsage((await res.json()) as { usageItems?: Array<Record<string, unknown>> }), deps.now);
};

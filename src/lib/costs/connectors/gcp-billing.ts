/**
 * Google Cloud / Firebase (incl. Cloud Run GraphHopper) — Cloud Billing "Standard usage cost"
 * export to BigQuery, grouped by service for one invoice month.
 *
 * Table: GCP_BILLING_EXPORT_TABLE = project.dataset.gcp_billing_export_v1_<BILLING_ACCOUNT_ID>
 * Columns used (docs: https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage):
 *   service.description, cost, currency, invoice.month ('YYYYMM'), credits[].amount (negative)
 * Query runs through the BigQuery REST API (jobs.query, POST /bigquery/v2/projects/{p}/queries)
 * signed as the Firebase Admin service account (FIREBASE_SERVICE_ACCOUNT_KEY, or a dedicated
 * GCP_BILLING_SA_KEY). It needs BigQuery Job User (project) + BigQuery Data Viewer (dataset).
 * google-auth-library is imported dynamically (repo rule).
 */
import type { ConnectorRun, ParsedCost } from './types';
import { ConnectorHttpError, ensureOk, FETCH_TIMEOUT_MS, groupLines, num, okSnapshot } from './types';
import type { Currency } from '../cost-types';
import { parseServiceAccountKey } from '@/lib/routing/graphhopper/id-token';

const TABLE_RE = /^([a-z][a-z0-9-]{4,28}[a-z0-9])\.([A-Za-z0-9_]{1,1024})\.([A-Za-z0-9_]{1,1024})$/;

export function parseTableRef(raw: string | undefined): { project: string; fqtn: string } | null {
  const m = TABLE_RE.exec((raw ?? '').trim());
  return m ? { project: m[1], fqtn: `${m[1]}.${m[2]}.${m[3]}` } : null;
}

export function buildBillingQuery(fqtn: string): string {
  return [
    'SELECT service.description AS service, currency,',
    '  SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net_cost',
    `FROM \`${fqtn}\``,
    'WHERE invoice.month = @invoice_month',
    'GROUP BY service, currency',
  ].join('\n');
}

interface BqResponse {
  jobComplete?: boolean;
  schema?: { fields?: Array<{ name?: string }> };
  rows?: Array<{ f?: Array<{ v?: unknown }> }>;
}

export function parseBigQueryBilling(body: BqResponse): ParsedCost {
  if (body.jobComplete === false) throw new ConnectorHttpError('bq_job_incomplete');
  const names = (body.schema?.fields ?? []).map((f) => f.name);
  const iS = names.indexOf('service');
  const iC = names.indexOf('currency');
  const iN = names.indexOf('net_cost');
  if (iS < 0 || iC < 0 || iN < 0) throw new ConnectorHttpError('bq_bad_schema');
  const currencies = new Set<string>();
  const pairs: Array<[string, number]> = [];
  for (const row of body.rows ?? []) {
    const f = row.f ?? [];
    const cur = String(f[iC]?.v ?? '');
    if (cur) currencies.add(cur);
    pairs.push([String(f[iS]?.v ?? 'Other'), num(f[iN]?.v)]);
  }
  if (currencies.size > 1) throw new ConnectorHttpError('bq_mixed_currency');
  const only = Array.from(currencies)[0] ?? 'USD';
  if (only !== 'USD' && only !== 'ILS' && only !== 'EUR') throw new ConnectorHttpError(`bq_currency_${only}`);
  return { amount: pairs.reduce((s, [, v]) => s + v, 0), currency: only as Currency, breakdown: groupLines(pairs) };
}

async function accessToken(env: Record<string, string | undefined>): Promise<string> {
  const key =
    parseServiceAccountKey(env.GCP_BILLING_SA_KEY) ??
    parseServiceAccountKey(env.FIREBASE_SERVICE_ACCOUNT_KEY) ??
    parseServiceAccountKey(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  if (!key) throw new ConnectorHttpError('no_service_account');
  const { JWT } = await import('google-auth-library');
  const client = new JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/bigquery.readonly'] });
  const { token } = await client.getAccessToken();
  if (!token) throw new ConnectorHttpError('no_access_token');
  return token;
}

export const runGcpBilling: ConnectorRun = async (month, deps) => {
  const ref = parseTableRef(deps.env.GCP_BILLING_EXPORT_TABLE);
  if (!ref) throw new ConnectorHttpError('bad_table_name');
  const token = await accessToken(deps.env);
  const res = await ensureOk(
    await deps.fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${ref.project}/queries`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: buildBillingQuery(ref.fqtn),
        useLegacySql: false,
        parameterMode: 'NAMED',
        queryParameters: [{ name: 'invoice_month', parameterType: { type: 'STRING' }, parameterValue: { value: month.replace('-', '') } }],
        timeoutMs: 15_000,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
  );
  return okSnapshot(parseBigQueryBilling((await res.json()) as BqResponse), deps.now);
};

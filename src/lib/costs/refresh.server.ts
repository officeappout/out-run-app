/**
 * Runs every connector for one month and stores the result in admin_costs/{month}
 * (Admin SDK — the only writer). Called by POST /api/admin/costs/refresh: daily from the
 * adminCostsScheduler Cloud Function, or the "רענן עכשיו" button.
 */
import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ADMIN_COSTS_COLLECTION, type ConnectorId, type ConnectorSnapshot, type MonthDoc, type MonthFx } from './cost-types';
import { CONNECTORS, isConfigured } from './connector-meta';
import { mergeFetchedFx, parseFrankfurterRate } from './fx';
import { israelMonthKey } from './month';
import { mergeOutcome, safeErrorCode, type RefreshOutcome } from './refresh-logic';
import type { ConnectorDeps, ConnectorRun } from './connectors/types';
import { runAiLedger } from './connectors/ai-ledger';
import { runAnthropicAdmin } from './connectors/anthropic-admin';
import { runGcpBilling } from './connectors/gcp-billing';
import { runVercel } from './connectors/vercel';
import { runBunny } from './connectors/bunny';
import { runGithub } from './connectors/github';

const RUNNERS: Record<ConnectorId, ConnectorRun | null> = {
  ai_ledger: runAiLedger,
  anthropic_admin: runAnthropicAdmin,
  gcp_billing: runGcpBilling,
  vercel: runVercel,
  bunny: runBunny,
  github: runGithub,
  mapbox: null, // no billing API — manual item
};

export interface RefreshReport {
  month: string;
  results: Array<{ id: ConnectorId; status: ConnectorSnapshot['status'] | 'kept'; error?: string }>;
  fx: MonthFx['source'] | 'kept';
}

async function fetchFx(f: typeof fetch): Promise<{ USD: number; EUR: number } | null> {
  try {
    const get = async (base: string) => {
      const r = await f(`https://api.frankfurter.dev/v2/rate/${base}/ILS`, { signal: AbortSignal.timeout(10_000) });
      return r.ok ? parseFrankfurterRate(await r.json()) : null;
    };
    const [USD, EUR] = await Promise.all([get('USD'), get('EUR')]);
    return USD && EUR ? { USD, EUR } : null;
  } catch {
    return null;
  }
}

export async function refreshMonth(db: Firestore, month: string, deps: Omit<ConnectorDeps, 'db'>): Promise<RefreshReport> {
  const ref = db.collection(ADMIN_COSTS_COLLECTION).doc(month);
  const prev = ((await ref.get()).data() ?? {}) as Partial<MonthDoc>;
  const nowMs = deps.now.getTime();

  const outcomes = await Promise.all(
    CONNECTORS.map(async (meta): Promise<[ConnectorId, RefreshOutcome]> => {
      const run = RUNNERS[meta.id];
      if (!run) return [meta.id, { status: 'manual' }];
      if (!isConfigured(meta, deps.env)) return [meta.id, { status: 'not_configured' }];
      try {
        return [meta.id, await run(month, { ...deps, db })];
      } catch (err) {
        const error = safeErrorCode(err);
        console.warn(`[costs] connector ${meta.id} failed for ${month}: ${error}`);
        return [meta.id, { status: 'error', error }];
      }
    }),
  );

  const update: Record<string, unknown> = { month, updatedAt: FieldValue.serverTimestamp() };
  const results: RefreshReport['results'] = [];
  for (const [id, outcome] of outcomes) {
    const next = mergeOutcome(prev.connectors?.[id], outcome, nowMs);
    if (next) update[`connectors.${id}`] = next;
    results.push({
      id,
      status: next ? next.status : 'kept',
      ...(outcome !== 'keep' && outcome.status === 'error' ? { error: outcome.error } : {}),
    });
  }

  let fxSource: RefreshReport['fx'] = 'kept';
  if (month === israelMonthKey(deps.now) && prev.fx?.source !== 'manual') {
    const fetched = await fetchFx(deps.fetch);
    const fx = fetched ? mergeFetchedFx(prev.fx, fetched, nowMs) : null;
    if (fx) {
      update.fx = fx;
      fxSource = fx.source;
    }
  }

  // set(merge) creates the doc; dotted keys in update() replace each connector map whole (a set
  // merge would deep-merge and leave a stale `error` behind after a recovery).
  await ref.set({ month }, { merge: true });
  await ref.update(update);
  return { month, results, fx: fxSource };
}

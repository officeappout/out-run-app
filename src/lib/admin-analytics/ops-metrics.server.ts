/**
 * ops-metrics.server — the operations numbers (wave 3) as MetricResult envelopes, shared by the
 * quick-answer chips and the model's tools so a chip and an answer never disagree. Cached
 * (heavy: 10 min, light: 1 min, per server instance). Failure → value null + error, never 0.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { computeAttentionCounts, type AttentionCounts } from './attention-queue.server';
import { computePendingApprovals, type PendingApprovals } from './pending-approvals.server';
import { computeCrmPipeline, type CrmPipeline } from './crm-pipeline.server';
import { computeAiCosts, type AiCosts } from './ai-costs.server';
import { computeCityMappingSummary, type CityMappingSummary } from './city-mapping-summary.server';
import { computeSignupFailuresSummary, type SignupFailuresSummary } from './signup-failures-summary.server';
import { computeNorthStar, type NorthStar } from './north-star.server';
import { cachedCompute, HEAVY_TOOL_TTL_MS, LIGHT_TOOL_TTL_MS } from './cache.server';
import { dayKeyDaysAgo } from './dates';
import { metaOf, type MetricResult } from './meta';

async function envelope<T>(
  definitionId: string,
  period: { from: string | null; to: string },
  fn: () => Promise<T>,
  extra: (v: T) => Parameters<typeof metaOf>[2] = () => ({}),
): Promise<MetricResult<T>> {
  try {
    const value = await fn();
    return { value, meta: metaOf(definitionId, period, extra(value)) };
  } catch (err) {
    console.error(`[admin-analytics] ${definitionId} failed`, err);
    return { value: null, meta: metaOf(definitionId, period, { caveats: ['could not be computed right now — this is NOT zero'] }), error: 'unavailable' };
  }
}

export function getAttentionQueue(db: Firestore, opts: { isRoot: boolean; now?: Date; fresh?: boolean }): Promise<MetricResult<AttentionCounts>> {
  const now = opts.now ?? new Date();
  const today = getIsraelDateKey(now);
  return envelope('attention_queue', { from: dayKeyDaysAgo(now, 7), to: today }, () =>
    cachedCompute(`attention:${opts.isRoot}`, LIGHT_TOOL_TTL_MS, () => computeAttentionCounts(db, { now, includeSignupFailures: opts.isRoot }), { fresh: opts.fresh }),
  (v) => ({
    caveats: [
      'routes waiting for approval are counted in get_pending_approvals, not here',
      ...(opts.isRoot ? [] : ['signup failures are root-only and not included']),
      ...Object.entries(v).filter(([, c]) => c === null).map(([k]) => `${k}: could not be counted (not zero)`),
    ],
  }));
}

export function getPendingApprovals(db: Firestore, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<PendingApprovals>> {
  const today = getIsraelDateKey(opts.now ?? new Date());
  return envelope('pending_approvals', { from: null, to: today }, () =>
    cachedCompute('pending_approvals', LIGHT_TOOL_TTL_MS, () => computePendingApprovals(db), { fresh: opts.fresh }),
  (v) => ({ n: v.total, caveats: v.failedTypes.map((t) => `${t}: could not be counted (not zero)`) }));
}

export function getCrmPipeline(db: Firestore, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<CrmPipeline>> {
  const today = getIsraelDateKey(opts.now ?? new Date());
  return envelope('crm_pipeline', { from: null, to: today }, () =>
    cachedCompute('crm_pipeline', LIGHT_TOOL_TTL_MS, () => computeCrmPipeline(db), { fresh: opts.fresh }),
  (v) => ({ n: v.totalAuthorities, caveats: v.unknownStatus ? [`${v.unknownStatus} authorities have a status outside the 8 valid values`] : [] }));
}

export function getAiCosts(db: Firestore, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<AiCosts>> {
  const now = opts.now ?? new Date();
  return envelope('ai_cost', { from: `${getIsraelDateKey(now).slice(0, 7)}-01`, to: getIsraelDateKey(now) }, () =>
    cachedCompute('ai_cost', LIGHT_TOOL_TTL_MS, () => computeAiCosts(db, now), { fresh: opts.fresh }),
  () => ({ caveats: ['estimates from the usage ledger (ai-pricing.ts); the Anthropic Console bill is the source of truth'] }));
}

export function getCityMappingSummary(db: Firestore, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<CityMappingSummary>> {
  const today = getIsraelDateKey(opts.now ?? new Date());
  return envelope('city_mapping_readiness', { from: null, to: today }, () =>
    cachedCompute('city_mapping', HEAVY_TOOL_TTL_MS, () => computeCityMappingSummary(db), { fresh: opts.fresh }),
  (v) => ({ n: v.citiesWithInventory, caveats: ['cities without an inventory document are not counted'] }));
}

export function getSignupFailures(db: Firestore, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<SignupFailuresSummary>> {
  const now = opts.now ?? new Date();
  return envelope('signup_failures', { from: dayKeyDaysAgo(now, 7), to: getIsraelDateKey(now) }, () =>
    cachedCompute('signup_failures', LIGHT_TOOL_TTL_MS, () => computeSignupFailuresSummary(db, { now }), { fresh: opts.fresh }),
  (v) => ({ n: v.total }));
}

export function getWae(db: Firestore, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<NorthStar>> {
  const now = opts.now ?? new Date();
  return envelope('wae', { from: dayKeyDaysAgo(now, 7), to: getIsraelDateKey(now) }, () =>
    cachedCompute('north_star:default', HEAVY_TOOL_TTL_MS, () => computeNorthStar(db), { fresh: opts.fresh }),
  (v) => ({ n: v.weeklyActiveExercisers, caveats: ['same computation as /admin/journey (growth metrics)'] }));
}

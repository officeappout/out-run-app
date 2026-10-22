/**
 * product-metrics.server — the product-advisor tools, batch 1 (plan §5.2 א, wave 4). Each one
 * calls the EXISTING computation the /admin/journey + /admin/statistics pages call — the same
 * function, not a copy — so the assistant's number is the page's number at the same moment.
 * This file only (a) passes platform scope, (b) cuts the result down to an aggregate that fits
 * the ~800-token tool budget, (c) drops anything personal, and (d) wraps it in the evidence
 * envelope (definitionId, period, n, minSample, belowThreshold, caveats).
 *
 *   north star     computeGrowthMetrics        (growth-metrics/route.ts)
 *   cohorts / D7   computeRetentionDepth       (retention-depth/route.ts)
 *   drivers        computeRetentionDrivers     (journey-retention-drivers/route.ts)
 *   onboarding     computeJourneyActivation    (journey-activation/route.ts)  — nudge names DROPPED
 *   push perf      computePushPerformanceSummary (push-performance-summary/route.ts)
 *   push funnel    computePushFunnelSummary    (push-funnel-summary/route.ts)
 *
 * The plan says "moved to src/lib/admin-analytics/ without behavior change"; these are thin
 * wrappers over the route-file exports instead of a move — same single implementation, zero
 * behavior change for the pages, and a far smaller diff. A later move is mechanical.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { computeRetentionDepth } from '@/app/api/admin/retention-depth/route';
import { computeRetentionDrivers } from '@/app/api/admin/journey-retention-drivers/route';
import { computeJourneyActivation } from '@/app/api/admin/journey-activation/route';
import { computePushPerformanceSummary } from '@/app/api/admin/push-performance-summary/route';
import { computePushFunnelSummary } from '@/app/api/admin/push-funnel-summary/route';
import { parseRange } from '@/features/admin/services/journey-sources';
import { RETAIN_FROM, RETAIN_TO, MIN_SAMPLE as DRIVERS_MIN_SAMPLE } from '@/features/admin/services/journey-retention-drivers';
import { computeNorthStar, type NorthStar, type NorthStarFilters } from './north-star.server';
import { cachedCompute, HEAVY_TOOL_TTL_MS } from './cache.server';
import { dayKeyDaysAgo, DAY_MS } from './dates';
import { metaOf, type MetricMeta, type MetricResult } from './meta';

const PLATFORM = { kind: 'platform' } as const;
/** retention-depth's MIN_SAMPLE_SIZE (cohort / D7 / resurrected) */
export const COHORT_MIN_SAMPLE = 50;

const ok = <T>(value: T, meta: MetricMeta): MetricResult<T> => ({ value, meta });
function failed<T>(definitionId: string, period: { from: string | null; to: string }, err: unknown): MetricResult<T> {
  console.error(`[admin-analytics] ${definitionId} failed`, err);
  return { value: null, meta: metaOf(definitionId, period, { caveats: ['could not be computed right now — this is NOT zero'] }), error: 'unavailable' };
}
function bodyOrThrow<B>(res: { status: number; body: unknown }): B {
  if (res.status !== 200) throw new Error(`computation returned ${res.status}`);
  return res.body as B;
}
const isoDay = (d: Date) => getIsraelDateKey(d);
const filterKey = (f: object) => JSON.stringify(Object.entries(f).filter(([, v]) => v !== null && v !== undefined).sort());

// ── north star ────────────────────────────────────────────────────────────────

export async function getNorthStar(db: Firestore, filters: NorthStarFilters = {}, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<NorthStar & { filters: NorthStarFilters }>> {
  const now = opts.now ?? new Date();
  const period = { from: dayKeyDaysAgo(now, 7), to: isoDay(now) };
  try {
    const v = await cachedCompute(`north_star:${filterKey(filters)}`, HEAVY_TOOL_TTL_MS, () => computeNorthStar(db, filters), { fresh: opts.fresh });
    const filtered = Object.values(filters).some((x) => x !== null && x !== undefined);
    return ok({ ...v, filters }, metaOf('wae', period, {
      n: v.weeklyActiveExercisers,
      caveats: [
        'WAE / workouts per active user: 7 days; DAU/MAU stickiness: today ÷ 30 days; weeklyAvgDailyActive: the last 30 days in 7-day buckets (oldest first)',
        ...(filtered ? ['segmented by the given filters (same filters as the journey page)'] : []),
      ],
    }));
  } catch (err) {
    return failed('wae', period, err);
  }
}

// ── retention cohorts ─────────────────────────────────────────────────────────

interface RetentionDepthBody {
  cohortRetention: { cohorts: Array<{ cohortLabel: string; cohortWeekStart: string; cohortSize: number; retentionByDay: Record<string, number | null> }> };
  d7Retention: { pct: number | null; sampleSize: number; thresholdMet: boolean };
  resurrectedUsers: { count: number; eligiblePopulation: number; thresholdMet: boolean };
  minSampleSize: number;
}

export interface RetentionCohortsValue {
  d7: { pct: number | null; n: number; enoughData: boolean };
  resurrected: { count: number | null; eligible: number; enoughData: boolean };
  /** newest first, at most 8 weekly cohorts; pct per day offset, null = not measurable yet */
  cohorts: Array<{ weekStart: string; size: number; enoughData: boolean; d1: number | null; d7: number | null; d14: number | null; d30: number | null }>;
}

export async function getRetentionCohorts(db: Firestore, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<RetentionCohortsValue>> {
  const now = opts.now ?? new Date();
  const period = { from: dayKeyDaysAgo(now, 12 * 7), to: isoDay(now) };
  try {
    const b = await cachedCompute('retention_depth', HEAVY_TOOL_TTL_MS, async () => bodyOrThrow<RetentionDepthBody>(await computeRetentionDepth(db, PLATFORM)), { fresh: opts.fresh });
    const min = b.minSampleSize ?? COHORT_MIN_SAMPLE;
    const cohorts = [...b.cohortRetention.cohorts]
      .sort((a, z) => z.cohortWeekStart.localeCompare(a.cohortWeekStart))
      .slice(0, 8)
      .map((c) => {
        const enough = c.cohortSize >= min;
        const at = (d: number) => (enough ? (c.retentionByDay[String(d)] ?? null) : null);
        return { weekStart: c.cohortWeekStart, size: c.cohortSize, enoughData: enough, d1: at(1), d7: at(7), d14: at(14), d30: at(30) };
      });
    const value: RetentionCohortsValue = {
      d7: { pct: b.d7Retention.thresholdMet ? b.d7Retention.pct : null, n: b.d7Retention.sampleSize, enoughData: b.d7Retention.thresholdMet },
      resurrected: { count: b.resurrectedUsers.thresholdMet ? b.resurrectedUsers.count : null, eligible: b.resurrectedUsers.eligiblePopulation, enoughData: b.resurrectedUsers.thresholdMet },
      cohorts,
    };
    return ok(value, metaOf('cohort_dN', period, {
      n: b.d7Retention.sampleSize,
      minSample: min,
      belowThreshold: !b.d7Retention.thresholdMet,
      caveats: [
        'weekly signup cohorts; % of the cohort active on day N (±1 day); day N is null until the cohort is N+1 days old',
        `cohorts under ${min} users show no percentages (not enough data)`,
        'not segmented (by design) — use segments only from tools that support them',
      ],
    }));
  } catch (err) {
    return failed('cohort_dN', period, err);
  }
}

// ── retention drivers ─────────────────────────────────────────────────────────

interface DriversBody {
  cohortSize: number;
  retainedPct: number | null;
  cohortFrom: string;
  cohortTo: string;
  drivers: Array<{ key: string; label: string; withCount: number; withoutCount: number; withPct: number | null; withoutPct: number | null; lift: number | null; enoughData: boolean }>;
}

export async function getRetentionDrivers(db: Firestore, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<{ cohortSize: number; retainedPct: number | null; drivers: DriversBody['drivers']; notEnoughData: string[] }>> {
  const now = opts.now ?? new Date();
  const fallback = { from: isoDay(new Date(now.getTime() - (120 + RETAIN_TO) * DAY_MS)), to: isoDay(new Date(now.getTime() - RETAIN_TO * DAY_MS)) };
  try {
    const b = await cachedCompute('retention_drivers', HEAVY_TOOL_TTL_MS, async () => bodyOrThrow<DriversBody>(await computeRetentionDrivers(db, PLATFORM, now)), { fresh: opts.fresh });
    const enough = b.drivers.filter((d) => d.enoughData).sort((a, z) => (z.lift ?? 0) - (a.lift ?? 0));
    return ok(
      { cohortSize: b.cohortSize, retainedPct: b.retainedPct, drivers: enough.slice(0, 8), notEnoughData: b.drivers.filter((d) => !d.enoughData).map((d) => d.label) },
      metaOf('retained_14_28', { from: b.cohortFrom?.slice(0, 10) ?? fallback.from, to: b.cohortTo?.slice(0, 10) ?? fallback.to }, {
        n: b.cohortSize,
        minSample: DRIVERS_MIN_SAMPLE,
        caveats: [
          `retained = ≥1 real workout between day ${RETAIN_FROM} and day ${RETAIN_TO} after signup`,
          'first-week behaviours vs retention: CORRELATION, not cause',
          'lift = withPct ÷ withoutPct; a row below the minimum sample has no percentages',
        ],
      }),
    );
  } catch (err) {
    return failed('retained_14_28', fallback, err);
  }
}

// ── onboarding stall + the road to the first workout ─────────────────────────

interface ActivationBody {
  signups: number;
  stuck: Array<{ step: string; label: string; count: number }>;
  stuckTotal: number;
  firstWorkout: Array<{ event: string; label: string; users: number }>;
  locationPermission: { granted: number; denied: number };
  nudge: { count: number };
}

export async function getOnboardingStall(db: Firestore, range: { days?: number } = {}, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<Omit<ActivationBody, 'nudge'> & { toNudge: number }>> {
  const now = opts.now ?? new Date();
  const days = Math.min(90, Math.max(7, range.days ?? 30));
  const r = parseRange(new Date(now.getTime() - days * DAY_MS).toISOString(), now.toISOString(), now);
  const period = { from: isoDay(r.from), to: isoDay(r.to) };
  try {
    const b = await cachedCompute(`journey_activation:${days}`, HEAVY_TOOL_TTL_MS, async () => bodyOrThrow<ActivationBody>(await computeJourneyActivation(db, PLATFORM, r)), { fresh: opts.fresh });
    // nudge.sample carries uids + names — never handed to the model (plan §6.6)
    return ok(
      { signups: b.signups, stuck: b.stuck.slice(0, 8), stuckTotal: b.stuckTotal, firstWorkout: b.firstWorkout, locationPermission: b.locationPermission, toNudge: b.nudge?.count ?? 0 },
      metaOf('onboarding_stall', period, {
        n: b.signups,
        caveats: [
          'SNAPSHOT of where signups in the range stand now (users.onboardingStep), not a step-to-step drop-off funnel — only 2 of 15 onboarding steps log a completion event',
          'firstWorkout = how many of the signups reached each event within 7 days of signing up',
        ],
      }),
    );
  } catch (err) {
    return failed('onboarding_stall', period, err);
  }
}

// ── push performance (type × copy variant) ───────────────────────────────────

interface PushPerfRow {
  channel: string | null;
  entryLabel: string;
  sourceLabel: string;
  funnelCategory: string | null;
  measured: boolean;
  variantId: string | null;
  copyTitle: string | null;
  sent: number | null;
  deliveredPct: number | null;
  openedPct: number | null;
  actedPct: number | null;
  avgTimeToActionMinutes: number | null;
}

export async function getPushPerformance(
  db: Firestore,
  params: { channel?: string | null; days?: number | null } = {},
  opts: { now?: Date; fresh?: boolean } = {},
): Promise<MetricResult<{ measured: Array<Omit<PushPerfRow, 'measured' | 'entryLabel'>>; notMeasured: string[] }>> {
  const now = opts.now ?? new Date();
  const days = params.days ? Math.min(180, Math.max(1, params.days)) : null;
  const dateFrom = days ? new Date(now.getTime() - days * DAY_MS) : undefined;
  const period = { from: dateFrom ? isoDay(dateFrom) : null, to: isoDay(now) };
  try {
    const b = await cachedCompute(`push_perf:${params.channel ?? ''}:${days ?? ''}`, HEAVY_TOOL_TTL_MS, async () =>
      bodyOrThrow<{ rows: PushPerfRow[] }>(await computePushPerformanceSummary(db, PLATFORM, { channel: params.channel ?? undefined, dateFrom, dateTo: days ? now : undefined })), { fresh: opts.fresh });
    const measured = b.rows
      .filter((r) => r.measured)
      .sort((a, z) => (z.sent ?? 0) - (a.sent ?? 0))
      .slice(0, 10)
      .map((r) => ({
        channel: r.channel,
        sourceLabel: r.sourceLabel,
        funnelCategory: r.funnelCategory,
        variantId: r.variantId,
        copyTitle: r.copyTitle ? r.copyTitle.slice(0, 40) : null,
        sent: r.sent,
        deliveredPct: r.deliveredPct,
        openedPct: r.openedPct,
        actedPct: r.actedPct,
        avgTimeToActionMinutes: r.avgTimeToActionMinutes,
      }));
    const notMeasured = Array.from(new Set(b.rows.filter((r) => !r.measured).map((r) => r.sourceLabel)));
    return ok({ measured, notMeasured }, metaOf('push_delivered_opened_acted', period, {
      n: measured.reduce((a, r) => a + (r.sent ?? 0), 0),
      measuredSources: Array.from(new Set(measured.map((r) => r.sourceLabel))),
      caveats: [
        'cascading funnel: delivered% = delivered/sent, opened% = opened/delivered, acted% = acted/opened (acted = goal completed in the open-anchored window)',
        `${notMeasured.length} push types are NOT measured — "not measured", never 0`,
        'returning to the app without tapping a push cannot be measured today',
      ],
    }));
  } catch (err) {
    return failed('push_delivered_opened_acted', period, err);
  }
}

// ── push → workout funnel ─────────────────────────────────────────────────────

interface PushFunnelBody {
  overall: { sent: number; delivered: number; opened: number; startedWorkout: number };
  byCategory: Array<{ category: string; sent: number; delivered: number; opened: number; startedWorkout: number }>;
  measuredSenderCount: number;
}

export async function getPushFunnel(db: Firestore, opts: { now?: Date; fresh?: boolean } = {}): Promise<MetricResult<PushFunnelBody>> {
  const now = opts.now ?? new Date();
  const period = { from: null, to: isoDay(now) };
  try {
    const b = await cachedCompute('push_funnel', HEAVY_TOOL_TTL_MS, async () => bodyOrThrow<PushFunnelBody>(await computePushFunnelSummary(db, PLATFORM)), { fresh: opts.fresh });
    return ok({ ...b, byCategory: b.byCategory.slice(0, 10) }, metaOf('push_started_workout', period, {
      n: b.overall.sent,
      measuredSources: b.byCategory.map((c) => c.category),
      caveats: [`only ${b.measuredSenderCount} push categories are measured (the rest: "not measured", never 0)`, 'all time (no date filter on this computation)'],
    }));
  } catch (err) {
    return failed('push_started_workout', period, err);
  }
}

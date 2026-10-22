/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const st = vi.hoisted(() => ({ fail: new Set<string>(), calls: {} as Record<string, unknown[]> }));
const rec = (k: string, args: unknown[]) => {
  (st.calls[k] ??= []).push(args);
  if (st.fail.has(k)) throw new Error('boom');
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
vi.mock('@/app/api/admin/growth-metrics/route', () => ({
  DEFAULT_GROWTH_METRICS_FILTERS: { cityAuthorityId: null, source: null },
  computeGrowthMetrics: async (...a: unknown[]) => {
    rec('growth', a);
    return { status: 200, body: { northStar: { weeklyActiveExercisers: 120, workoutsPerActiveUser: 2.1, dailyActiveUsers: 30, monthlyActiveUsers: 300, stickinessPct: 10 }, activeUsersTrend: [] } };
  },
}));
vi.mock('@/app/api/admin/retention-depth/route', () => ({
  computeRetentionDepth: async (...a: unknown[]) => {
    rec('depth', a);
    return {
      status: 200,
      body: {
        minSampleSize: 50,
        cohortRetention: {
          dayOffsets: [0, 1, 3, 7, 14, 30],
          cohorts: [
            { cohortLabel: 'a', cohortWeekStart: '2026-09-01', cohortSize: 412, retentionByDay: { '1': 40, '7': 18, '14': 12, '30': null } },
            { cohortLabel: 'b', cohortWeekStart: '2026-09-08', cohortSize: 20, retentionByDay: { '1': 55, '7': 30, '14': null, '30': null } },
          ],
        },
        d7Retention: { pct: 21.5, sampleSize: 800, thresholdMet: true },
        resurrectedUsers: { count: 0, eligiblePopulation: 12, thresholdMet: false },
      },
    };
  },
}));
vi.mock('@/app/api/admin/journey-retention-drivers/route', () => ({
  computeRetentionDrivers: async (...a: unknown[]) => {
    rec('drivers', a);
    return {
      status: 200,
      body: {
        cohortSize: 500,
        retainedPct: 22,
        cohortFrom: '2026-05-01T00:00:00.000Z',
        cohortTo: '2026-09-24T00:00:00.000Z',
        drivers: [
          { key: 'a', label: 'A', withCount: 100, withoutCount: 400, withPct: 30, withoutPct: 20, lift: 1.5, enoughData: true },
          { key: 'b', label: 'B', withCount: 200, withoutCount: 300, withPct: 50, withoutPct: 20, lift: 2.5, enoughData: true },
          { key: 'c', label: 'C', withCount: 3, withoutCount: 497, withPct: null, withoutPct: null, lift: null, enoughData: false },
        ],
      },
    };
  },
}));
vi.mock('@/app/api/admin/journey-activation/route', () => ({
  computeJourneyActivation: async (...a: unknown[]) => {
    rec('activation', a);
    return {
      status: 200,
      body: {
        signups: 90,
        stuck: [{ step: 'LOCATION', label: 'מיקום', count: 12 }],
        stuckTotal: 12,
        firstWorkout: [{ event: 'workout_complete', label: 'סיימו אימון', users: 30 }],
        locationPermission: { granted: 50, denied: 10 },
        nudge: { count: 7, sample: [{ uid: 'REAL_UID_123', name: 'ישראל ישראלי', daysSince: 4 }] },
      },
    };
  },
}));
vi.mock('@/app/api/admin/push-performance-summary/route', () => ({
  computePushPerformanceSummary: async (...a: unknown[]) => {
    rec('pushPerf', a);
    return {
      status: 200,
      body: {
        rows: [
          { channel: 'retention', entryLabel: 'e', sourceLabel: 'חזרה', funnelCategory: 'retention', measured: true, variantId: 'v1', copyTitle: 'כותרת ארוכה מאוד מאוד מאוד מאוד מאוד מאוד מאוד', copyBody: 'גוף', sent: 100, delivered: 90, deliveredPct: 90, opened: 9, openedPct: 10, acted: 3, actedPct: 33.3, avgTimeToActionMinutes: 12 },
          { channel: 'social', entryLabel: 'e', sourceLabel: 'חברתי', funnelCategory: null, measured: false, variantId: null, copyTitle: null, copyBody: null, sent: null, delivered: null, deliveredPct: null, opened: null, openedPct: null, acted: null, actedPct: null, avgTimeToActionMinutes: null },
        ],
      },
    };
  },
}));
vi.mock('@/app/api/admin/push-funnel-summary/route', () => ({
  computePushFunnelSummary: async (...a: unknown[]) => {
    rec('pushFunnel', a);
    return { status: 200, body: { overall: { sent: 10, delivered: 9, opened: 3, startedWorkout: 1 }, byCategory: [{ category: 'retention', sent: 10, delivered: 9, opened: 3, startedWorkout: 1 }], measuredSenderCount: 5 } };
  },
}));

import { getNorthStar, getOnboardingStall, getPushFunnel, getPushPerformance, getRetentionCohorts, getRetentionDrivers } from '../product-metrics.server';
import { clearAnalyticsCache } from '../cache.server';
import { metricDef } from '../metric-defs';

const db = {} as any;
const NOW = new Date('2026-10-22T10:00:00Z');

beforeEach(() => {
  clearAnalyticsCache();
  st.fail.clear();
  st.calls = {};
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('product tools = the journey page computations, cut down, no PII', () => {
  it('every tool calls the existing computation with PLATFORM scope', async () => {
    await Promise.all([getNorthStar(db, {}, { now: NOW }), getRetentionCohorts(db, { now: NOW }), getRetentionDrivers(db, { now: NOW }), getOnboardingStall(db, {}, { now: NOW }), getPushPerformance(db, {}, { now: NOW }), getPushFunnel(db, { now: NOW })]);
    for (const k of ['growth', 'depth', 'drivers', 'activation', 'pushPerf', 'pushFunnel']) {
      expect((st.calls[k][0] as unknown[])[1]).toEqual({ kind: 'platform' });
    }
  });
  it('north star passes the page numbers through unchanged + filters', async () => {
    const r = await getNorthStar(db, { cityAuthorityId: 'tlv', source: null }, { now: NOW });
    expect(r.value?.weeklyActiveExercisers).toBe(120);
    expect((st.calls.growth[0] as any[])[2]).toMatchObject({ cityAuthorityId: 'tlv' });
    expect(r.meta.caveats.join(' ')).toContain('segmented');
  });
  it('cohorts: D7 as on the page; a cohort under 50 shows no percentages', async () => {
    const r = await getRetentionCohorts(db, { now: NOW });
    expect(r.value?.d7).toEqual({ pct: 21.5, n: 800, enoughData: true });
    expect(r.value?.cohorts[0]).toMatchObject({ weekStart: '2026-09-08', size: 20, enoughData: false, d7: null });
    expect(r.value?.cohorts[1]).toMatchObject({ weekStart: '2026-09-01', d7: 18, d30: null });
    expect(r.value?.resurrected.count).toBeNull(); // below threshold → null, not 0
    expect(r.meta).toMatchObject({ definitionId: 'cohort_dN', minSample: 50, n: 800, belowThreshold: false });
  });
  it('drivers: best lift first, not-enough-data listed apart, correlation caveat', async () => {
    const r = await getRetentionDrivers(db, { now: NOW });
    expect(r.value?.drivers.map((d) => d.key)).toEqual(['b', 'a']);
    expect(r.value?.notEnoughData).toEqual(['C']);
    expect(r.meta.caveats.join(' ')).toContain('CORRELATION');
    expect(r.meta.period).toMatchObject({ from: '2026-05-01', to: '2026-09-24' });
  });
  it('onboarding: the nudge list (uids + names) never reaches the model — only the count', async () => {
    const r = await getOnboardingStall(db, { days: 30 }, { now: NOW });
    const json = JSON.stringify(r);
    expect(json).not.toContain('REAL_UID_123');
    expect(json).not.toContain('ישראל ישראלי');
    expect(r.value?.toNudge).toBe(7);
    expect(r.meta.caveats[0]).toContain('SNAPSHOT');
  });
  it('push performance: measured rows trimmed, copy body dropped, unmeasured named (not 0)', async () => {
    const r = await getPushPerformance(db, { channel: null, days: 30 }, { now: NOW });
    expect(r.value?.measured).toHaveLength(1);
    expect(r.value?.measured[0].copyTitle?.length).toBeLessThanOrEqual(40);
    expect(JSON.stringify(r.value)).not.toContain('גוף');
    expect(r.value?.notMeasured).toEqual(['חברתי']);
    expect((st.calls.pushPerf[0] as any[])[2].dateFrom).toBeInstanceOf(Date);
  });
  it('push funnel: measured categories listed as measuredSources', async () => {
    const r = await getPushFunnel(db, { now: NOW });
    expect(r.meta.measuredSources).toEqual(['retention']);
    expect(r.value?.overall.startedWorkout).toBe(1);
  });
  it('a failing computation → value null + "NOT zero" caveat', async () => {
    st.fail.add('depth');
    const r = await getRetentionCohorts(db, { now: NOW, fresh: true });
    expect(r.value).toBeNull();
    expect(r.meta.caveats[0]).toContain('NOT zero');
  });
  it('every definitionId a tool returns exists in the metric dictionary', async () => {
    const ids = (await Promise.all([getNorthStar(db, {}, { now: NOW }), getRetentionCohorts(db, { now: NOW }), getRetentionDrivers(db, { now: NOW }), getOnboardingStall(db, {}, { now: NOW }), getPushPerformance(db, {}, { now: NOW }), getPushFunnel(db, { now: NOW })])).map((r) => r.meta.definitionId);
    for (const id of ids) expect(metricDef(id), id).not.toBeNull();
  });
});

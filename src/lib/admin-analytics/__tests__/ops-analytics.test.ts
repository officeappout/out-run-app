/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
vi.mock('@/app/api/admin/growth-metrics/route', () => ({
  DEFAULT_GROWTH_METRICS_FILTERS: {},
  computeGrowthMetrics: async () => ({
    status: 200,
    body: {
      northStar: { weeklyActiveExercisers: 42, workoutsPerActiveUser: 2.5, dailyActiveUsers: 10, monthlyActiveUsers: 80, stickinessPct: 12.5 },
      activeUsersTrend: Array.from({ length: 30 }, () => ({ activeUsers: 7 })),
    },
  }),
}));

import { createFakeDb } from './fake-db';
import { computePendingApprovals } from '../pending-approvals.server';
import { summarizePipeline, computeCrmPipeline } from '../crm-pipeline.server';
import { computeAttentionCounts } from '../attention-queue.server';
import { computeCityMappingSummary } from '../city-mapping-summary.server';
import { computeSignupFailuresSummary, maskPii } from '../signup-failures-summary.server';
import { computeAiCosts } from '../ai-costs.server';
import { getPendingApprovals, getWae } from '../ops-metrics.server';
import { clearAnalyticsCache } from '../cache.server';
import { aiDayKey } from '@/lib/ai/anthropic.server';

const NOW = new Date('2026-10-22T10:00:00Z');
const DAY = 24 * 3600 * 1000;

beforeEach(() => {
  clearAnalyticsCache();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('computePendingApprovals (same filters as the approval center)', () => {
  const db = createFakeDb({
    parks: {
      p1: { published: false, authorityId: 'tlv' },
      p2: { published: false, contentStatus: 'draft', authorityId: 'tlv' },
      p3: { published: false, contentStatus: 'rejected' },
      p4: { published: true, authorityId: 'tlv' },
      p5: { published: false, authorityId: 'haifa' },
    },
    official_routes: {
      r1: { published: false, authorityId: 'tlv' },
      r2: { published: false, status: 'archived', authorityId: 'tlv' },
      r3: { published: false, status: 'rejected' },
    },
    climb_segments: { c1: { status: 'pending' }, c2: { status: 'approved' } },
    user_contributions: { u1: { status: 'pending' } },
    pending_units: { x1: { status: 'pending' }, x2: { status: 'approved' } },
    osm_amenities: { a1: { status: 'pending' }, a2: { status: 'pending' } },
    authorities: { tlv: { name: 'תל אביב' }, haifa: { name: { he: 'חיפה', en: 'Haifa' } } },
  });
  it('counts each queue with the page filters and ranks authorities by parks+routes', async () => {
    const r = await computePendingApprovals(db);
    expect(r.byType).toEqual({ parks: 2, routes: 1, climbs: 1, contributions: 1, units: 1, amenities: 2 });
    expect(r.total).toBe(8);
    expect(r.topAuthorities).toEqual([
      { authorityId: 'tlv', name: 'תל אביב', count: 2 },
      { authorityId: 'haifa', name: 'חיפה', count: 1 },
    ]);
    expect(r.failedTypes).toEqual([]);
  });
  it('a queue that fails reads as null (not 0) and is listed', async () => {
    const bad = createFakeDb({ parks: {}, official_routes: {} }, { failCollections: new Set(['official_routes']) });
    const r = await computePendingApprovals(bad);
    expect(r.byType.routes).toBeNull();
    expect(r.failedTypes).toEqual(['routes']);
  });
  it('the envelope carries definitionId + n, and a caveat for a failed queue', async () => {
    const bad = createFakeDb({ parks: { p: { published: false } } }, { failCollections: new Set(['osm_amenities']) });
    const res = await getPendingApprovals(bad, { now: NOW, fresh: true });
    expect(res.meta.definitionId).toBe('pending_approvals');
    expect(res.meta.n).toBe(1);
    expect(res.meta.caveats.join(' ')).toContain('amenities');
  });
});

describe('CRM pipeline (read only)', () => {
  it('missing status = lead, draft apart, urgent = follow_up + closing, unknown reported', () => {
    const r = summarizePipeline([undefined, 'lead', 'draft', 'follow_up', 'closing', 'active', 'weird']);
    expect(r.byStatus.find((s) => s.status === 'lead')?.count).toBe(2);
    expect(r.draft).toBe(1);
    expect(r.urgent).toBe(2);
    expect(r.inPipeline).toBe(5);
    expect(r.unknownStatus).toBe(1);
    expect(r.totalAuthorities).toBe(7);
  });
  it('reads authorities.pipelineStatus', async () => {
    const db = createFakeDb({ authorities: { a: { pipelineStatus: 'meeting' }, b: {} } });
    const r = await computeCrmPipeline(db);
    expect(r.byStatus.find((s) => s.status === 'meeting')?.count).toBe(1);
    expect(r.byStatus.find((s) => s.status === 'lead')?.count).toBe(1);
  });
});

describe('attention counts (extracted from home-today, same behavior)', () => {
  const db = createFakeDb({
    parks: { p1: { published: false }, p2: { published: false, contentStatus: 'draft' } },
    maintenance_reports: {
      m1: { status: 'reported', reportedAt: new Date(NOW.getTime() - 10 * DAY) },
      m2: { status: 'in_review', reportedAt: new Date(NOW.getTime() - 2 * DAY) },
      m3: { status: 'resolved', reportedAt: new Date(NOW.getTime() - 20 * DAY) },
    },
    transactions: { t1: { approval: 'pending' }, t2: { approval: 'approved' } },
    signup_failures: { s1: { timestamp: new Date(NOW.getTime() - DAY) }, s2: { timestamp: new Date(NOW.getTime() - 9 * DAY) } },
  });
  it('root gets signup failures; others do not (undefined, not 0)', async () => {
    expect(await computeAttentionCounts(db, { now: NOW, includeSignupFailures: true })).toEqual({ pendingParks: 1, staleReports: 1, pendingInvoices: 1, signupFailures7d: 1 });
    const r = await computeAttentionCounts(db, { now: NOW, includeSignupFailures: false });
    expect('signupFailures7d' in r).toBe(false);
  });
});

describe('city mapping summary', () => {
  it('counts stored readiness levels, lowest first', async () => {
    const db = createFakeDb({
      city_inventory: {
        a: { city: 'א', readiness: { level: 'green', score: 90 } },
        b: { city: 'ב', readiness: { level: 'red', score: 20 } },
        c: { city: 'ג', readiness: { level: 'yellow', score: 55 } },
      },
    });
    const r = await computeCityMappingSummary(db);
    expect(r.byLevel).toEqual({ red: 1, yellow: 1, green: 1 });
    expect(r.lowest[0].city).toBe('ב');
    expect(r.highest[0].city).toBe('א');
  });
});

describe('signup failures summary — counts only, PII masked', () => {
  it('groups by stage / reason, last 7 days', async () => {
    const db = createFakeDb({
      signup_failures: {
        a: { timestamp: new Date(NOW.getTime() - DAY), stage: 'profile', reason: 'auth/email-already-in-use for a@b.co' },
        b: { timestamp: new Date(NOW.getTime() - 2 * DAY), stage: 'profile', reason: 'network' },
        c: { timestamp: new Date(NOW.getTime() - 30 * DAY), stage: 'old', reason: 'x' },
      },
    });
    const r = await computeSignupFailuresSummary(db, { now: NOW });
    expect(r.total).toBe(2);
    expect(r.byStage).toEqual([{ key: 'profile', count: 2 }]);
    expect(r.byReason.map((x) => x.key).join(' ')).not.toContain('a@b.co');
  });
  it('maskPii hides emails, phone numbers and long ids', () => {
    expect(maskPii('x a@b.com 054-123-4567 abcdefghijklmnopqrstuv')).toBe('x [email] [number] [id]');
  });
});

describe('AI costs from the ledger', () => {
  it('today / 7 days / month to date / assistant today', async () => {
    const today = aiDayKey(NOW);
    const yesterday = aiDayKey(new Date(NOW.getTime() - DAY));
    const db = createFakeDb({
      ai_usage_global: { [today]: { costUsd: 0.4, calls: 9 }, [yesterday]: { costUsd: 0.1 } },
      admin_ai_stats: { [today]: { costUsd: 0.05 } },
      app_config: { ai: { dailyBudgetUsd: 5, adminAiBudgetUsd: 0.5 } },
    });
    const r = await computeAiCosts(db, NOW);
    expect(r.todayUsd).toBe(0.4);
    expect(r.todayCalls).toBe(9);
    expect(r.last7DaysUsd).toBe(0.5);
    expect(r.monthToDateUsd).toBe(0.5);
    expect(r.adminAssistantTodayUsd).toBe(0.05);
    expect(r.adminAiBudgetUsd).toBe(0.5);
  });
});

describe('WAE = the journey page computation', () => {
  it('wraps computeGrowthMetrics northStar', async () => {
    const r = await getWae(createFakeDb({}), { now: NOW, fresh: true });
    expect(r.value?.weeklyActiveExercisers).toBe(42);
    expect(r.meta).toMatchObject({ definitionId: 'wae', n: 42 });
    expect(r.value?.weeklyAvgDailyActive).toEqual([7, 7, 7, 7, 7]);
  });
});

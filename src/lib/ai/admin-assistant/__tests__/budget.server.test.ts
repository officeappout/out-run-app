/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, fieldValueMock } from '../../__tests__/mock-admin-db';

const state = vi.hoisted(() => ({ db: null as any }));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: fieldValueMock }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: vi.fn() }; } }));

import { aiDayKey } from '../../anthropic.server';
import { countAdminAiFreeRoute, prepareAdminModelCall, recordAdminAiUsage } from '../budget.server';
import { AdminAiUnavailableError, adminAiStatusOf } from '../errors';

// The in-memory db is a structural stand-in, not a full Firestore type.
const mk = (...a: Parameters<typeof createMockDb>): any => createMockDb(...a);
const NOW = new Date('2026-10-22T09:00:00Z');
const DAY = aiDayKey(NOW);

async function reasonOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (err) {
    if (err instanceof AdminAiUnavailableError) return err.reason;
    throw err;
  }
}

beforeEach(() => {
  state.db = createMockDb();
  process.env.ANTHROPIC_API_KEY_ADMIN = 'admin-key-placeholder';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ANTHROPIC_API_KEY_ADMIN;
  delete process.env.AI_MODEL_ADMIN;
});

describe('prepareAdminModelCall (fail closed, cheapest check first)', () => {
  it('passes with the key, a priced model and budget left → Sonnet 5.5', async () => {
    const g = await prepareAdminModelCall('u1', { db: state.db, now: NOW });
    expect(g.model).toBe('claude-sonnet-5-5');
    expect(g.config.adminAiBudgetUsd).toBe(0.5);
  });

  it('unpriced AI_MODEL_ADMIN → unpriced_model (503) before any Firestore read', async () => {
    process.env.AI_MODEL_ADMIN = 'claude-something-unpriced';
    const db = mk({}, { failGets: new Set(['app_config/ai']) });
    expect(await reasonOf(prepareAdminModelCall('u1', { db, now: NOW }))).toBe('unpriced_model');
    expect(adminAiStatusOf('unpriced_model')).toBe(503);
  });

  it('Opus 5.5 via AI_MODEL_ADMIN is allowed — it has its own price row', async () => {
    process.env.AI_MODEL_ADMIN = 'claude-opus-5-5';
    expect((await prepareAdminModelCall('u1', { db: state.db, now: NOW })).model).toBe('claude-opus-5-5');
  });

  it('missing ANTHROPIC_API_KEY_ADMIN → admin_key_missing (503), even with the app key set', async () => {
    delete process.env.ANTHROPIC_API_KEY_ADMIN;
    process.env.ANTHROPIC_API_KEY = 'app-key-placeholder';
    expect(await reasonOf(prepareAdminModelCall('u1', { db: state.db, now: NOW }))).toBe('admin_key_missing');
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('global kill switch → kill_switch', async () => {
    state.db.docs.set('app_config/ai', { killSwitch: true });
    expect(await reasonOf(prepareAdminModelCall('u1', { db: state.db, now: NOW }))).toBe('kill_switch');
  });

  it('global budget spent → over_budget', async () => {
    state.db.docs.set(`ai_usage_global/${DAY}`, { costUsd: 5 });
    expect(await reasonOf(prepareAdminModelCall('u1', { db: state.db, now: NOW }))).toBe('over_budget');
  });

  it('admin daily budget spent → admin_over_budget (503); 0 = off', async () => {
    state.db.docs.set(`admin_ai_stats/${DAY}`, { costUsd: 0.5 });
    expect(await reasonOf(prepareAdminModelCall('u1', { db: state.db, now: NOW }))).toBe('admin_over_budget');
    state.db.docs.set(`admin_ai_stats/${DAY}`, { costUsd: 0 });
    state.db.docs.set('app_config/ai', { adminAiBudgetUsd: 0 });
    expect(await reasonOf(prepareAdminModelCall('u1', { db: state.db, now: NOW }))).toBe('admin_over_budget');
  });

  it('unreadable config or admin ledger → config_unavailable', async () => {
    const db1 = mk({}, { failGets: new Set(['app_config/ai']) });
    expect(await reasonOf(prepareAdminModelCall('u1', { db: db1, now: NOW }))).toBe('config_unavailable');
    const db2 = mk({}, { failGets: new Set([`admin_ai_stats/${DAY}`]) });
    expect(await reasonOf(prepareAdminModelCall('u1', { db: db2, now: NOW }))).toBe('config_unavailable');
  });

  it('rate limiter failure → rate_limited (429, fail closed)', async () => {
    const db = mk({}, { failTransactions: true });
    expect(await reasonOf(prepareAdminModelCall('u1', { db, now: NOW }))).toBe('rate_limited');
    expect(adminAiStatusOf('rate_limited')).toBe(429);
  });
});

describe('recordAdminAiUsage', () => {
  it('books the shared ledger (feature admin_ai) AND the admin day counter', async () => {
    const usage = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const { costUsd } = await recordAdminAiUsage('u1', 'claude-sonnet-5-5', usage, { db: state.db, now: NOW });
    expect(costUsd).toBeCloseTo((1000 * 2 + 500 * 10) / 1e6, 12);
    expect((state.db.docs.get(`ai_usage_global/${DAY}`) as any).costUsd).toBeCloseTo(costUsd, 12);
    expect((state.db.docs.get(`ai_usage/u1_${DAY}`) as any).byFeature).toEqual({ admin_ai: 1 });
    const stats = state.db.docs.get(`admin_ai_stats/${DAY}`) as any;
    expect(stats.costUsd).toBeCloseTo(costUsd, 12);
    expect(stats.modelCalls).toBe(1);
  });

  it('a failed write never throws', async () => {
    const db = mk({}, { failBatch: true });
    await expect(
      recordAdminAiUsage('u1', 'claude-sonnet-5-5', { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, { db, now: NOW }),
    ).resolves.toHaveProperty('costUsd');
  });
});

describe('countAdminAiFreeRoute', () => {
  it('counts local navigation and quick answers as numbers only', async () => {
    await countAdminAiFreeRoute('localNav', { db: state.db, now: NOW });
    await countAdminAiFreeRoute('localNav', { db: state.db, now: NOW });
    await countAdminAiFreeRoute('quick', { db: state.db, now: NOW });
    const stats = state.db.docs.get(`admin_ai_stats/${DAY}`) as any;
    expect(stats.localNav).toBe(2);
    expect(stats.quick).toBe(1);
    expect(Object.keys(stats).sort()).toEqual(['day', 'localNav', 'quick', 'updatedAt']);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, fieldValueMock } from './mock-admin-db';

const state = vi.hoisted(() => ({
  db: null as any,
  create: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: fieldValueMock }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: state.create };
  },
}));

import {
  AiUnavailableError,
  aiDayKey,
  assertAiBudget,
  checkAiRateLimit,
  createAiMessage,
  getAiModel,
  recordAiUsage,
  withPromptCaching,
} from '../anthropic.server';

const NOW = new Date('2026-10-18T09:00:00Z');
const DAY = aiDayKey(NOW);

beforeEach(() => {
  state.db = createMockDb();
  state.create.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_MODEL_FAST;
  delete process.env.AI_MODEL_SMART;
});

describe('getAiModel', () => {
  it('defaults to the exact ids', () => {
    expect(getAiModel('fast')).toBe('claude-haiku-5-5');
    expect(getAiModel('smart')).toBe('claude-sonnet-5-5');
  });
  it('env overrides', () => {
    process.env.AI_MODEL_FAST = 'claude-haiku-x';
    expect(getAiModel('fast')).toBe('claude-haiku-x');
  });
});

describe('withPromptCaching', () => {
  it('marks the last system block and the last tool, without mutating input', () => {
    const tools = [
      { name: 'a', input_schema: { type: 'object' as const } },
      { name: 'b', input_schema: { type: 'object' as const } },
    ];
    const out = withPromptCaching({ system: 'stable prompt', tools });
    expect(out.system).toEqual([{ type: 'text', text: 'stable prompt', cache_control: { type: 'ephemeral' } }]);
    expect(out.tools![0]).not.toHaveProperty('cache_control');
    expect(out.tools![1].cache_control).toEqual({ type: 'ephemeral' });
    expect(tools[1]).not.toHaveProperty('cache_control');
  });
  it('omits tools when none are given', () => {
    expect(withPromptCaching({ system: [{ type: 'text', text: 'x' }] })).not.toHaveProperty('tools');
  });
});

describe('assertAiBudget (kill switch + daily budget)', () => {
  it('passes under budget', async () => {
    state.db = createMockDb({
      'app_config/ai': { dailyBudgetUsd: 5, killSwitch: false },
      [`ai_usage_global/${DAY}`]: { costUsd: 4.99 },
    });
    await expect(assertAiBudget(state.db, { now: NOW })).resolves.toBeUndefined();
  });

  it('kill switch → kill_switch', async () => {
    state.db = createMockDb({ 'app_config/ai': { dailyBudgetUsd: 5, killSwitch: true } });
    await expect(assertAiBudget(state.db, { now: NOW })).rejects.toMatchObject({ reason: 'kill_switch' });
  });

  it('spend at/over budget → over_budget', async () => {
    state.db = createMockDb({
      'app_config/ai': { dailyBudgetUsd: 5 },
      [`ai_usage_global/${DAY}`]: { costUsd: 5 },
    });
    const err = await assertAiBudget(state.db, { now: NOW }).catch((e) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect(err.reason).toBe('over_budget');
  });

  it('budget 0 blocks everything', async () => {
    state.db = createMockDb({ 'app_config/ai': { dailyBudgetUsd: 0 } });
    await expect(assertAiBudget(state.db, { now: NOW })).rejects.toMatchObject({ reason: 'over_budget' });
  });

  it('missing app_config/ai → defaults ($5 budget)', async () => {
    state.db = createMockDb({ [`ai_usage_global/${DAY}`]: { costUsd: 6 } });
    await expect(assertAiBudget(state.db, { now: NOW })).rejects.toMatchObject({ reason: 'over_budget' });
  });

  it('unreadable config or ledger → fails CLOSED (config_unavailable)', async () => {
    state.db = createMockDb({}, { failGets: new Set(['app_config/ai']) });
    await expect(assertAiBudget(state.db, { now: NOW })).rejects.toMatchObject({ reason: 'config_unavailable' });
    state.db = createMockDb({ 'app_config/ai': {} }, { failGets: new Set([`ai_usage_global/${DAY}`]) });
    await expect(assertAiBudget(state.db, { now: NOW })).rejects.toMatchObject({ reason: 'config_unavailable' });
  });
});

describe('checkAiRateLimit (fail-closed)', () => {
  it('allows up to the hourly limit, then blocks with window=hour', async () => {
    const cfg = { rateLimitPerHour: 3, rateLimitPerDay: 40 };
    for (let i = 0; i < 3; i++) expect((await checkAiRateLimit('u1', cfg, state.db)).limited).toBe(false);
    expect(await checkAiRateLimit('u1', cfg, state.db)).toEqual({ limited: true, window: 'hour', retryAfterSec: 3600 });
    // Another user is unaffected.
    expect((await checkAiRateLimit('u2', cfg, state.db)).limited).toBe(false);
  });

  it('blocks on the daily window', async () => {
    const cfg = { rateLimitPerHour: 100, rateLimitPerDay: 2 };
    await checkAiRateLimit('u1', cfg, state.db);
    await checkAiRateLimit('u1', cfg, state.db);
    expect(await checkAiRateLimit('u1', cfg, state.db)).toMatchObject({ limited: true, window: 'day' });
  });

  it('defaults to 20/hour', async () => {
    for (let i = 0; i < 20; i++) expect((await checkAiRateLimit('u1', undefined, state.db)).limited).toBe(false);
    expect((await checkAiRateLimit('u1', undefined, state.db)).limited).toBe(true);
  });

  it('a Firestore failure BLOCKS the call (fail closed)', async () => {
    state.db = createMockDb({}, { failTransactions: true });
    expect((await checkAiRateLimit('u1', undefined, state.db)).limited).toBe(true);
  });
});

describe('recordAiUsage (ledger accumulation)', () => {
  it('accumulates tokens + cost per user/day and globally', async () => {
    const usage = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 0 };
    const { costUsd } = await recordAiUsage('u1', 'claude-haiku-5-5', usage, { now: NOW, db: state.db, feature: 'coach_note' });
    await recordAiUsage('u1', 'claude-haiku-5-5', usage, { now: NOW, db: state.db, feature: 'coach_note' });
    await recordAiUsage('u2', 'claude-sonnet-5-5', usage, { now: NOW, db: state.db });

    expect(costUsd).toBeCloseTo((1000 * 0.1 + 200 * 0.5 + 5000 * 0.01) / 1e6, 12);

    const u1 = state.db.docs.get(`ai_usage/u1_${DAY}`);
    expect(u1).toMatchObject({
      uid: 'u1', day: DAY, calls: 2, inputTokens: 2000, outputTokens: 400, cacheReadTokens: 10_000, cacheWriteTokens: 0,
      byFeature: { coach_note: 2 },
    });
    expect(u1.costUsd).toBeCloseTo(costUsd * 2, 12);

    const global = state.db.docs.get(`ai_usage_global/${DAY}`);
    expect(global.calls).toBe(3);
    expect(global.inputTokens).toBe(3000);
    const sonnetCost = (1000 * 2 + 200 * 10 + 5000 * 0.2) / 1e6;
    expect(global.costUsd).toBeCloseTo(costUsd * 2 + sonnetCost, 12);
  });

  it('feeds the budget check', async () => {
    state.db = createMockDb({ 'app_config/ai': { dailyBudgetUsd: 0.000001 } });
    await expect(assertAiBudget(state.db, { now: NOW })).resolves.toBeUndefined();
    await recordAiUsage('u1', 'claude-sonnet-5-5', { inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, { now: NOW, db: state.db });
    await expect(assertAiBudget(state.db, { now: NOW })).rejects.toMatchObject({ reason: 'over_budget' });
  });

  it('never throws when the ledger write fails', async () => {
    state.db = createMockDb({}, { failBatch: true });
    await expect(
      recordAiUsage('u1', 'claude-haiku-5-5', { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, { db: state.db }),
    ).resolves.toHaveProperty('costUsd');
  });
});

describe('createAiMessage', () => {
  it('calls messages.create and records the usage under the caller uid', async () => {
    state.create.mockResolvedValue({
      content: [{ type: 'text', text: 'hi' }],
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 400, cache_creation_input_tokens: null },
    });
    const msg = await createAiMessage('u9', 'test', {
      model: 'claude-haiku-5-5',
      max_tokens: 256,
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(msg.content[0]).toEqual({ type: 'text', text: 'hi' });
    const day = aiDayKey();
    expect(state.db.docs.get(`ai_usage/u9_${day}`)).toMatchObject({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 400, calls: 1 });
  });
});

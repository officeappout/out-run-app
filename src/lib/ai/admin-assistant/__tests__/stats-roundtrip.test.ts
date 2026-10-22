/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Axiom §31 — the first write path to a new collection needs a write-then-read test against a
 * db that coerces types like Firestore does on read. admin_ai_stats/{day} (+ the shared
 * ai_usage ledger): the REAL writers (recordAdminAiUsage, countAdminAiFreeRoute) and the REAL
 * readers (readAdminAiSpentToday, prepareAdminModelCall's admin-budget check) in one test.
 * The thread + audit round trip lives with their code (wave 3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firestoreModuleMock, createTimestampShapedDb, isTimestampShaped } from '../../__tests__/timestamp-shaped-db';

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => firestoreModuleMock);
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = {}; } }));

import { aiDayKey } from '../../anthropic.server';
import { countAdminAiFreeRoute, prepareAdminModelCall, readAdminAiSpentToday, recordAdminAiUsage } from '../budget.server';
import { AdminAiUnavailableError } from '../errors';

const NOW = new Date('2026-10-22T09:00:00Z');
const DAY = aiDayKey(NOW);

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY_ADMIN = 'admin-key-placeholder';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('admin_ai_stats — write then read through Timestamp-shaped storage', () => {
  it('recorded spend is read back by the budget reader and stops the next call at the cap', async () => {
    const db = createTimestampShapedDb({ nowMs: NOW.getTime() });
    // ~$0.30 of Sonnet output, twice → $0.60 ≥ the $0.50 default cap
    const usage = { inputTokens: 0, outputTokens: 30_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
    await recordAdminAiUsage('u1', 'claude-sonnet-5-5', usage, { db, now: NOW });
    await countAdminAiFreeRoute('localNav', { db, now: NOW });
    expect(await readAdminAiSpentToday(db, NOW)).toBeCloseTo(0.3, 10);
    await expect(prepareAdminModelCall('u1', { db, now: NOW })).resolves.toHaveProperty('model');

    await recordAdminAiUsage('u1', 'claude-sonnet-5-5', usage, { db, now: NOW });
    expect(await readAdminAiSpentToday(db, NOW)).toBeCloseTo(0.6, 10);
    await expect(prepareAdminModelCall('u1', { db, now: NOW })).rejects.toBeInstanceOf(AdminAiUnavailableError);

    const stats = (await db.collection('admin_ai_stats').doc(DAY).get()).data();
    expect(stats).toMatchObject({ day: DAY, modelCalls: 2, localNav: 1 });
    expect(isTimestampShaped(stats.updatedAt)).toBe(true);
    const ledger = (await db.collection('ai_usage').doc(`u1_${DAY}`).get()).data();
    expect(ledger.byFeature).toEqual({ admin_ai: 2 });
    expect(isTimestampShaped(ledger.updatedAt)).toBe(true);
  });
});

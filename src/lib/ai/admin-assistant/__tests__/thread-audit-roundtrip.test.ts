/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Axiom §31 — admin_ai_threads (+messages) and admin_ai_audit: the REAL writers
 * (appendAdminMessage, writeAdminAudit, rateAdminAudit) and the REAL readers (loadAdminThread →
 * historyMessages, the audit row read back, computeAiCosts reading admin_ai_stats) in one test,
 * against storage that returns Timestamp-shaped values on read (no .getTime()).
 */
import { describe, it, expect, vi } from 'vitest';
import { firestoreModuleMock, createTimestampShapedDb, isTimestampShaped } from '../../__tests__/timestamp-shaped-db';

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => firestoreModuleMock);
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = {}; } }));

import { appendAdminMessage, historyMessages, loadAdminThread } from '../thread-store.server';
import { rateAdminAudit, writeAdminAudit } from '../audit.server';
import { recordAdminAiUsage } from '../budget.server';
import { computeAiCosts } from '@/lib/admin-analytics/ai-costs.server';
import { aiDayKey } from '../../anthropic.server';
import { ADMIN_AI_AUDIT_RETENTION_DAYS, ADMIN_AI_THREAD_RETENTION_DAYS } from '../limits';

const DAY_MS = 24 * 3600 * 1000;
const T0 = new Date('2026-10-22T09:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

describe('admin_ai_threads — write then read through Timestamp-shaped storage', () => {
  it('messages come back ordered by time, with createdAtMs from a Timestamp, and feed the prompt history', async () => {
    const db = createTimestampShapedDb({ nowMs: T0.getTime() });
    await appendAdminMessage(db, 'u1', { role: 'user', text: 'כמה ממתינים?', links: [] }, at(0));
    await appendAdminMessage(db, 'u1', { role: 'assistant', text: '7 ממתינים', links: [{ href: '/admin/approval-center', title: 'מרכז אישורים', pageId: 'admin/approval-center' }], auditId: 'a1' }, at(1));
    await appendAdminMessage(db, 'u1', { role: 'user', text: 'ומה עם CRM?', links: [] }, at(2));
    await appendAdminMessage(db, 'u1', { role: 'assistant', text: '9 בצנרת', links: [] }, at(3));

    const raw = (await db.collection('admin_ai_threads').doc('u1').collection('messages').get()).docs.map((d: any) => d.data());
    for (const m of raw) {
      expect(isTimestampShaped(m.createdAt)).toBe(true);
      expect(isTimestampShaped(m.expireAt)).toBe(true);
      expect(m.expireAt.toMillis() - m.createdAt.toMillis()).toBe(ADMIN_AI_THREAD_RETENTION_DAYS * DAY_MS);
    }
    const threadDoc = (await db.collection('admin_ai_threads').doc('u1').get()).data();
    expect(threadDoc.messageCount).toBe(4);
    expect(isTimestampShaped(threadDoc.updatedAt)).toBe(true);

    const thread = await loadAdminThread(db, 'u1');
    expect(thread.recent.map((m) => m.text)).toEqual(['כמה ממתינים?', '7 ממתינים', 'ומה עם CRM?', '9 בצנרת']);
    expect(thread.recent.map((m) => m.createdAtMs)).toEqual([0, 1, 2, 3].map((i) => at(i).getTime()));
    expect(thread.recent[1].links[0].href).toBe('/admin/approval-center');
    expect(historyMessages(thread).map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });
});

describe('admin_ai_audit + admin_ai_stats — write then read', () => {
  it('the audit row round-trips (Timestamp-shaped createdAt / expireAt), rating works only for its owner, stats feed the cost reader', async () => {
    const db = createTimestampShapedDb({ nowMs: T0.getTime() });
    const id = await writeAdminAudit(db, { uid: 'u1', question: 'א'.repeat(600), route: 'model', tools: [], model: 'claude-sonnet-5-5', usage: null, modelCalls: 2, costUsd: 0.012, guardFailed: true }, T0);
    expect(id).toBeTruthy();
    const row = (await db.collection('admin_ai_audit').doc(id!).get()).data();
    expect(row.question).toHaveLength(500);
    expect(row.rating).toBeNull();
    expect(isTimestampShaped(row.createdAt)).toBe(true);
    expect(row.expireAt.toMillis() - row.createdAt.toMillis()).toBe(ADMIN_AI_AUDIT_RETENTION_DAYS * DAY_MS);

    expect(await rateAdminAudit(db, 'someone-else', id!, 'up')).toBe(false);
    expect(await rateAdminAudit(db, 'u1', id!, 'down')).toBe(true);
    const rated = (await db.collection('admin_ai_audit').doc(id!).get()).data();
    expect(rated.rating).toBe('down');
    expect(isTimestampShaped(rated.ratedAt)).toBe(true);

    await recordAdminAiUsage('u1', 'claude-sonnet-5-5', { inputTokens: 0, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 }, { db, now: T0 });
    const stats = (await db.collection('admin_ai_stats').doc(aiDayKey(T0)).get()).data();
    expect(stats).toMatchObject({ questions: 1, guardFailed: 1, modelCalls: 1 });
    expect(isTimestampShaped(stats.updatedAt)).toBe(true);
    const costs = await computeAiCosts(db, T0);
    expect(costs.adminAssistantTodayUsd).toBeCloseTo(0.01, 6);
    expect(costs.todayUsd).toBeCloseTo(0.01, 6);
  });
});

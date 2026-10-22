/**
 * audit.server — one admin_ai_audit row per question (plan §6.5): uid, the question (≤500
 * chars), route, tools + inputs + result sizes, model, usage, cost, guard outcome, 👍/👎,
 * expireAt (180 days). Admin SDK only. Local navigation is NOT audited per question — only
 * counted per day (admin_ai_stats.localNav), without the text. Never throws.
 */
import 'server-only';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ADMIN_AI_AUDIT, ADMIN_AI_STATS } from './collections';
import { ADMIN_AI_AUDIT_QUESTION_MAX_CHARS, ADMIN_AI_AUDIT_RETENTION_DAYS } from './limits';
import { aiDayKey } from '@/lib/ai/anthropic.server';
import type { TurnToolLog } from './turn';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AdminAuditRow {
  uid: string;
  question: string;
  route: 'quick' | 'router_nav' | 'router_quick' | 'out_of_scope' | 'model' | 'error';
  tools: TurnToolLog[];
  model: string | null;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | null;
  modelCalls: number;
  costUsd: number;
  /** null = no data tool ran (nothing to check) */
  guardFailed: boolean | null;
  stoppedBy?: string;
  errorCode?: string;
}

export async function writeAdminAudit(db: Firestore, row: AdminAuditRow, now: Date = new Date()): Promise<string | null> {
  try {
    const ref = db.collection(ADMIN_AI_AUDIT).doc();
    const batch = db.batch();
    batch.set(ref, {
      ...row,
      question: row.question.slice(0, ADMIN_AI_AUDIT_QUESTION_MAX_CHARS),
      tools: row.tools.slice(0, 10),
      rating: null,
      createdAt: Timestamp.fromMillis(now.getTime()),
      expireAt: Timestamp.fromMillis(now.getTime() + ADMIN_AI_AUDIT_RETENTION_DAYS * DAY_MS),
    });
    batch.set(
      db.collection(ADMIN_AI_STATS).doc(aiDayKey(now)),
      { questions: FieldValue.increment(1), ...(row.guardFailed ? { guardFailed: FieldValue.increment(1) } : {}), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await batch.commit();
    return ref.id;
  } catch (err) {
    console.error('[admin-ai] audit write failed', err);
    return null;
  }
}

/** 👍/👎 on one's OWN audit row. Returns false when the row is missing or not the caller's. */
export async function rateAdminAudit(db: Firestore, uid: string, auditId: string, rating: 'up' | 'down'): Promise<boolean> {
  const ref = db.collection(ADMIN_AI_AUDIT).doc(auditId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.uid !== uid) return false;
    tx.update(ref, { rating, ratedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

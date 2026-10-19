/**
 * generation_log/{id} writes (Admin SDK only). The id is generated on the device (so a report or
 * outcome can find its session without a round trip) and is bound to the uid of the FIRST write:
 * later writes for an id owned by another uid are refused.
 */
import 'server-only';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { GENERATION_LOG, GENERATION_LOG_RETENTION_DAYS, type GenerationLogDraft, type GenerationReport, type OutcomeStatus } from '../types';

const DAY_MS = 86_400_000;

/** The stored document for a draft (pure; exported for tests). */
export function logDocFor(uid: string, draft: GenerationLogDraft, now: Date) {
  // Never trust the device clock for TTL / day bucketing; keep its shownAt for ordering only.
  return {
    ...JSON.parse(JSON.stringify(draft)),
    uid,
    day: getIsraelDateKey(now),
    createdAt: Timestamp.fromMillis(now.getTime()),
    expireAt: Timestamp.fromMillis(now.getTime() + GENERATION_LOG_RETENTION_DAYS * DAY_MS),
    reviewed: false,
  };
}

export type WriteResult = { ok: true; created: boolean } | { ok: false; reason: 'not_owner' | 'not_found' };

/** Create once; a repeat of the same id by the same user is a no-op. */
export async function writeLog(db: Firestore, uid: string, draft: GenerationLogDraft, now = new Date()): Promise<WriteResult> {
  const ref = db.collection(GENERATION_LOG).doc(draft.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data()?.uid === uid ? { ok: true, created: false } : { ok: false, reason: 'not_owner' };
    tx.set(ref, logDocFor(uid, draft, now));
    return { ok: true, created: true };
  });
}

export async function writeOutcome(
  db: Firestore,
  uid: string,
  body: { id: string; status: OutcomeStatus; swappedExercises?: number; completedPct?: number | null },
  now = new Date(),
): Promise<WriteResult> {
  const ref = db.collection(GENERATION_LOG).doc(body.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: 'not_found' };
    if (snap.data()?.uid !== uid) return { ok: false, reason: 'not_owner' };
    tx.update(ref, {
      [`outcome.${body.status}AtMs`]: now.getTime(),
      'outcome.last': body.status,
      ...(typeof body.swappedExercises === 'number' ? { 'outcome.swappedExercises': body.swappedExercises } : {}),
      ...(typeof body.completedPct === 'number' ? { 'outcome.completedPct': body.completedPct } : {}),
    });
    return { ok: true, created: false };
  });
}

export async function writeReport(
  db: Firestore,
  uid: string,
  body: { id: string; reasons: GenerationReport['reasons']; note?: string | null; draft?: GenerationLogDraft },
  now = new Date(),
): Promise<WriteResult> {
  const ref = db.collection(GENERATION_LOG).doc(body.id);
  const report: GenerationReport = { reasons: body.reasons, note: body.note?.trim() || null, atMs: now.getTime() };
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      if (snap.data()?.uid !== uid) return { ok: false, reason: 'not_owner' };
      // Timestamp.now(): serverTimestamp() is invalid inside array elements.
      tx.update(ref, { reports: FieldValue.arrayUnion(report), reported: true, reviewed: false });
      return { ok: true, created: false };
    }
    if (!body.draft || body.draft.id !== body.id) return { ok: false, reason: 'not_found' };
    tx.set(ref, { ...logDocFor(uid, body.draft, now), reports: [report], reported: true });
    return { ok: true, created: true };
  });
}

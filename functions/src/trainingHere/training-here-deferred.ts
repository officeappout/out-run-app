/**
 * runTrainingHereDeferredPass — re-tries "I'm training here" pushes that sendPush held back for quiet
 * hours / Shabbat (marker has `deferredUntil`), on the sessionReminderScheduler tick.
 *
 * Bounded: one single-field range query (automatic index), at most TH_DEFER_BATCH markers per tick;
 * every deferred push is dropped once its session starts (≤ 24h). Idempotent: each marker is leased
 * with an update guarded by its last update time, so two overlapping ticks can't both send it; the
 * lease moves `deferredUntil` forward, so a push that is still held back is simply tried again later.
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { isDemoUid } from '../lib/demo';
import { loadPushSubjectGender } from '../services/push-copy.service';
import { TRAINING_HERE_MARKERS, mutualPartners, type PlannedSessionLike } from './training-here-time';
import {
  TH_DEFER_BATCH,
  deferredVerdict,
  nextRetryMs,
  parseMarkerMeta,
  suppressedByWindow,
  type TrainingHereMarkerMeta,
} from './training-here-defer';
import { deferMarker } from './training-here-markers';
import { deliverOwnerReminder, deliverPartnerNotice, trainingHereEnabled } from './send-training-here-push';

type MarkerDoc = admin.firestore.QueryDocumentSnapshot;

/** Lease: push deferredUntil forward, only if nobody touched the marker since we read it. */
async function lease(doc: MarkerDoc, m: TrainingHereMarkerMeta, nowMs: number): Promise<boolean> {
  try {
    await doc.ref.update(
      { deferredUntil: admin.firestore.Timestamp.fromMillis(nextRetryMs(m.kind, nowMs)) },
      { lastUpdateTime: doc.updateTime },
    );
    return true;
  } catch {
    return false; // another tick has it
  }
}

/** Done (sending now, or dropped): the marker stays (still the once-only guard), just no longer deferred. */
async function settle(doc: MarkerDoc, outcome: Record<string, unknown>): Promise<void> {
  await doc.ref.update({ deferredUntil: admin.firestore.FieldValue.delete(), ...outcome });
}

async function stillMutualPartner(db: admin.firestore.Firestore, owner: string, uid: string): Promise<boolean> {
  const conn = await db.doc(`connections/${owner}`).get();
  return mutualPartners(conn.exists ? (conn.data() as Record<string, unknown>) : undefined, owner).includes(uid);
}

async function retryOne(db: admin.firestore.Firestore, doc: MarkerDoc, m: TrainingHereMarkerMeta, nowMs: number): Promise<boolean> {
  const snap = await db.collection('planned_sessions').doc(m.sessionId).get();
  const s = snap.exists ? (snap.data() as PlannedSessionLike) : undefined;
  const owner = String(s?.userId ?? '');
  const partnerOk = m.kind === 'partner' && !!s && !isDemoUid(m.uid) && (await stillMutualPartner(db, owner, m.uid));
  const verdict = deferredVerdict(m, s, nowMs, partnerOk);
  if (verdict.action === 'drop') {
    await settle(doc, { droppedReason: verdict.reason });
    return false;
  }
  // Settle BEFORE sending: if anything fails after this point the push is lost, never sent twice.
  await settle(doc, { retriedAt: admin.firestore.FieldValue.serverTimestamp() });
  const session = s as PlannedSessionLike;
  const result = m.kind === 'reminder'
    ? await deliverOwnerReminder(m.sessionId, session)
    : await deliverPartnerNotice(m.sessionId, session, m.uid, await loadPushSubjectGender(owner));
  if (!result) {
    await doc.ref.update({ droppedReason: 'no_copy' }).catch(() => undefined);
    return false;
  }
  const held = suppressedByWindow(result);
  if (held) {
    await deferMarker(db, doc.id, m.kind, held, nowMs); // still quiet / Shabbat: try again later
    return false;
  }
  return true;
}

/** One tick. Exported for tests (nowMs injected). Returns how many deferred pushes went to sendPush unheld. */
export async function runTrainingHereDeferredPass(db: admin.firestore.Firestore, nowMs: number): Promise<number> {
  if (!(await trainingHereEnabled(db))) return 0;
  const snap = await db
    .collection(TRAINING_HERE_MARKERS)
    .where('deferredUntil', '<=', admin.firestore.Timestamp.fromMillis(nowMs))
    .limit(TH_DEFER_BATCH)
    .get();
  let sent = 0;
  for (const doc of snap.docs) {
    const m = parseMarkerMeta(doc.data());
    try {
      if (!m) {
        await settle(doc, { droppedReason: 'bad_marker' });
        continue;
      }
      if (!(await lease(doc, m, nowMs))) continue;
      if (await retryOne(db, doc, m, nowMs)) sent += 1;
    } catch (err) {
      logger.error(`[training-here] deferred ${doc.id} failed (lease keeps it for a later tick)`, err);
    }
  }
  if (snap.size > 0) logger.info(`[training-here] deferred scanned=${snap.size} sent=${sent}`);
  return sent;
}

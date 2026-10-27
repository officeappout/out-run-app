/**
 * training_here_push_fired markers: create() before each send = at most once; a push that sendPush
 * held back for quiet hours / Shabbat is marked deferred (`deferredUntil`) and re-tried by
 * runTrainingHereDeferredPass. See training-here-defer.ts.
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { TRAINING_HERE_MARKERS } from './training-here-time';
import { nextRetryMs, type DeferReason, type TrainingHereMarkerKind, type TrainingHereMarkerMeta } from './training-here-defer';

const markers = (db: admin.firestore.Firestore) => db.collection(TRAINING_HERE_MARKERS);

/** Claims the marker (with what a deferred retry needs). False when it exists already or the write failed. */
export async function claimMarker(db: admin.firestore.Firestore, id: string, meta: TrainingHereMarkerMeta): Promise<boolean> {
  try {
    await markers(db).doc(id).create({ at: admin.firestore.FieldValue.serverTimestamp(), ...meta });
    return true;
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code === 6 || code === 'already-exists') return false; // already sent (or deferred)
    logger.error(`[training-here] claim ${id} failed, skipping`, err);
    return false;
  }
}

/** Cheap pre-check (one read) so a later tick skips the session re-read when the push is already handled. */
export async function markerExists(db: admin.firestore.Firestore, id: string): Promise<boolean> {
  try {
    return (await markers(db).doc(id).get()).exists;
  } catch {
    return false; // claimMarker still guards the send
  }
}

/** sendPush held it back: keep the marker (no duplicate) and let the deferred pass retry it. */
export async function deferMarker(
  db: admin.firestore.Firestore,
  id: string,
  kind: TrainingHereMarkerKind,
  reason: DeferReason,
  nowMs: number,
): Promise<void> {
  try {
    await markers(db).doc(id).update({
      deferredUntil: admin.firestore.Timestamp.fromMillis(nextRetryMs(kind, nowMs)),
      deferredReason: reason,
    });
  } catch (err) {
    logger.error(`[training-here] defer ${id} failed (push stays dropped)`, err);
  }
}

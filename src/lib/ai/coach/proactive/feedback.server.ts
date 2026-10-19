/**
 * Kelly phase 3 — store an "איך היה?" answer (Admin SDK, one transaction). See feedback.ts.
 */
import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { WorkoutRating } from '../action-chips';
import { AI_COACH_THREADS } from '../thread-store.server';
import { WORKOUT_FEEDBACK, feedbackRefusal } from './feedback';

export type FeedbackResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_a_question' | 'already_answered' | 'not_your_workout' };

export async function saveWorkoutFeedback(db: Firestore, uid: string, messageId: string, rating: WorkoutRating): Promise<FeedbackResult> {
  const msgRef = db.collection(AI_COACH_THREADS).doc(uid).collection('messages').doc(messageId);
  return db.runTransaction(async (tx): Promise<FeedbackResult> => {
    const msgSnap = await tx.get(msgRef);
    const msg = msgSnap.exists ? (msgSnap.data() as Record<string, unknown>) : undefined;
    const refusal = feedbackRefusal(msg);
    if (refusal) return { ok: false, reason: refusal };
    const workoutId = (msg!.proactive as { workoutId: string }).workoutId;
    const workoutSnap = await tx.get(db.collection('workouts').doc(workoutId));
    if (!workoutSnap.exists || workoutSnap.get('userId') !== uid) return { ok: false, reason: 'not_your_workout' };
    tx.set(db.collection(WORKOUT_FEEDBACK).doc(workoutId), {
      uid,
      workoutId,
      rating,
      messageId,
      source: 'kelly_proactive',
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(msgRef, { 'proactive.feedback': rating, actions: FieldValue.delete() });
    return { ok: true };
  });
}

/**
 * Kelly phase 3 — writing ONE proactive message (Admin SDK).
 *
 * One transaction: the day's message doc ai_coach_threads/{uid}/messages/proactive_{date}
 * (created only if absent: the doc id is the one-a-day lock, two overlapping runs can't both
 * write), the thread doc (unread badge, preview), and the ledger ai_coach_proactive/{uid}
 * (weekly / level-check / asked-workout bookkeeping). The day's stats counter
 * (ai_coach_proactive_stats/{date}) is incremented after the commit.
 *
 * The PUSH is not sent here: onKellyThreadMessage (functions) sees `proactive` on the new
 * message and sends it on channel 'coach' with the daily engagement cap counted, quiet hours
 * and the Shabbat guard (push.service). A `noPush` message (silent: morning after the
 * training reminder) is never pushed.
 */
import 'server-only';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { AI_COACH_THREADS } from '../thread-store.server';
import { previewOf } from '../unified-thread';
import { ASKED_WORKOUTS_MAX, PROACTIVE_LEDGER, PROACTIVE_STATS, parseLedger, proactiveMessageId } from './loaders.server';
import type { RenderedMessage } from './templates';
import type { IsraelClock, ProactiveTrigger, TemplateKey, TemplateVars } from './types';

export interface ProactiveWrite {
  uid: string;
  clock: IsraelClock;
  trigger: ProactiveTrigger;
  templateKey: TemplateKey;
  vars: TemplateVars;
  rendered: RenderedMessage;
  /** The flex sentence came from the model. */
  llm: boolean;
  /** Admin test send: its own id, no daily lock, no ledger, counted as a test. */
  test?: boolean;
}

/** The stored `proactive` field (read by onKellyThreadMessage and the feedback route). */
export interface StoredProactive {
  trigger: ProactiveTrigger;
  templateKey: TemplateKey;
  llm: boolean;
  workoutId?: string;
  test?: true;
  feedback?: 'easy' | 'right' | 'hard';
}

export async function writeProactiveMessage(db: Firestore, w: ProactiveWrite): Promise<{ written: boolean; messageId: string }> {
  const messageId = w.test ? `proactive_test_${w.clock.ms}` : proactiveMessageId(w.clock.dateKey);
  const threadRef = db.collection(AI_COACH_THREADS).doc(w.uid);
  const msgRef = threadRef.collection('messages').doc(messageId);
  const ledgerRef = db.collection(PROACTIVE_LEDGER).doc(w.uid);
  const at = Timestamp.fromMillis(w.clock.ms);
  const workoutId = typeof w.vars.workoutId === 'string' ? w.vars.workoutId : undefined;
  const proactive: StoredProactive = {
    trigger: w.trigger,
    templateKey: w.templateKey,
    llm: w.llm,
    ...(workoutId ? { workoutId } : {}),
    ...(w.test ? { test: true as const } : {}),
  };

  const written = await db.runTransaction(async (tx) => {
    const [msgSnap, ledgerSnap] = await Promise.all([tx.get(msgRef), tx.get(ledgerRef)]);
    if (msgSnap.exists) return false;
    tx.set(msgRef, {
      role: 'assistant',
      source: 'system',
      text: w.rendered.text.slice(0, 1000),
      cards: [],
      ...(w.rendered.actions.length ? { actions: [...w.rendered.actions] } : {}),
      proactive,
      ...(w.rendered.silent ? { noPush: true } : {}),
      createdAt: at,
    });
    tx.set(
      threadRef,
      {
        updatedAt: FieldValue.serverTimestamp(),
        messageCount: FieldValue.increment(1),
        unreadForUser: FieldValue.increment(1),
        lastMessageAt: at,
        lastMessagePreview: previewOf(w.rendered.text),
      },
      { merge: true },
    );
    if (!w.test) {
      const ledger = parseLedger(ledgerSnap.exists ? (ledgerSnap.data() as Record<string, unknown>) : undefined);
      const update: Record<string, unknown> = { lastSentDate: w.clock.dateKey, lastTrigger: w.trigger, updatedAt: FieldValue.serverTimestamp() };
      if (w.trigger === 'weekly') update.weeklySentFor = w.clock.dateKey;
      if (w.trigger === 'assessment' && typeof w.vars.slug === 'string') {
        update.assessmentNudges = { ...ledger.assessmentNudges, [w.vars.slug]: w.clock.ms };
        update.lastAssessmentAt = w.clock.ms;
      }
      if (w.trigger === 'post_workout' && workoutId) {
        update.askedWorkoutIds = [...ledger.askedWorkoutIds.filter((x) => x !== workoutId), workoutId].slice(-ASKED_WORKOUTS_MAX);
      }
      tx.set(ledgerRef, update, { merge: true });
    }
    return true;
  });

  if (written) {
    await db
      .collection(PROACTIVE_STATS)
      .doc(w.clock.dateKey)
      .set(
        {
          day: w.clock.dateKey,
          ...(w.test
            ? { tests: FieldValue.increment(1) }
            : {
                total: FieldValue.increment(1),
                sent: { [w.trigger]: FieldValue.increment(1) },
                ...(w.rendered.silent ? { silent: FieldValue.increment(1) } : {}),
                ...(w.llm ? { llm: FieldValue.increment(1) } : {}),
              }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      .catch((err) => console.warn('[kelly-proactive] stats write failed', err));
  }
  return { written, messageId };
}

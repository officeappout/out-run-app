/**
 * onPushOpened — Firestore trigger, activates the post-push outcome window.
 *
 * Trigger: onCreate push_events/{eventId}
 *
 * PURPOSE
 * ───────
 * Fixes a real attribution bug (04.10.2026): `pushOutcomeSweeper.ts` used to
 * check outcomes in a window anchored on SEND time, so an action that
 * happened before the user ever opened the push (or a push nobody opened at
 * all) could still get credited. Attribution must start at OPEN, not SEND —
 * see `services/push-events.service.ts`'s module header for the full
 * reasoning.
 *
 * This trigger is the bridge: the client writes `push_opened` directly to
 * Firestore (src/lib/native/push.ts, on notification tap) — it has no
 * Admin-SDK access to also update the sibling `push_sent` doc itself (nor
 * should it; `checkAfter`/`outcomeChecked` are server-only fields, see the
 * firestore.rules field-allowlist on this collection). So the activation
 * step — computing and writing a real `checkAfter` from the open instant —
 * happens here, server-side, the moment `push_opened` lands.
 *
 * Every OTHER document written to `push_events` (push_sent, post_push_outcome,
 * landing_screen) is ignored by this trigger — the early-exit on eventType
 * below is not an optimization, it's the only thing this function does.
 *
 * Idempotent: re-delivery of the same trigger event recomputes the exact
 * same checkAfter from the same openedAt, so a retry is harmless (plain
 * `update()`, not an increment).
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { activateOutcomeWindowDetailed } from './services/push-events.service';
import { isPushMeasureAllEnabled } from './services/push-measure-all';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const onPushOpened = onDocumentCreated(
  {
    document: 'push_events/{eventId}',
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const data = event.data?.data() as
      | { eventType?: string; pushId?: string; uid?: string; openedAt?: admin.firestore.Timestamp }
      | undefined;

    if (data?.eventType === 'landing_screen') {
      // enable_push_measure_all: the landing record gets its push type id too (flag first, so
      // flag off = no read, no write — exactly as before).
      if (!data.pushId || !data.uid || !(await isPushMeasureAllEnabled())) return;
      try {
        const sent = await admin
          .firestore()
          .collection('push_events')
          .doc(`${data.pushId}_${data.uid}_push_sent`)
          .get();
        const typeId = sent.exists ? (sent.data() as Record<string, unknown>)?.typeId : undefined;
        if (typeof typeId === 'string' && event.data) await event.data.ref.update({ typeId });
      } catch (err: unknown) {
        logger.warn(`[onPushOpened] landing_screen typeId stamp failed eventId=${event.params.eventId}`, err);
      }
      return;
    }

    if (!data || data.eventType !== 'push_opened') {
      return; // not our event — push_sent/post_push_outcome land here too
    }

    const { pushId, uid, openedAt } = data;
    if (!pushId || !uid || !openedAt) {
      logger.warn(`[onPushOpened] malformed push_opened doc, eventId=${event.params.eventId}`);
      return;
    }

    const { activated, typeId } = await activateOutcomeWindowDetailed({ pushId, uid, openedAtMillis: openedAt.toMillis() });
    if (activated) {
      logger.info(`[onPushOpened] activated outcome window pushId=${pushId} uid=${uid}`);
    }
    // enable_push_measure_all: only sends measured while the flag was on carry typeId — the
    // open record gets the same id (no typeId on push_sent = no extra write, as before).
    if (typeId && event.data) {
      try {
        await event.data.ref.update({ typeId });
      } catch (err: unknown) {
        logger.warn(`[onPushOpened] typeId stamp failed pushId=${pushId} uid=${uid}`, err);
      }
    }
  },
);

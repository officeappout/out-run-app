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
import { activateOutcomeWindow } from './services/push-events.service';

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

    if (!data || data.eventType !== 'push_opened') {
      return; // not our event — push_sent/post_push_outcome/landing_screen all land here too
    }

    const { pushId, uid, openedAt } = data;
    if (!pushId || !uid || !openedAt) {
      logger.warn(`[onPushOpened] malformed push_opened doc, eventId=${event.params.eventId}`);
      return;
    }

    const activated = await activateOutcomeWindow({ pushId, uid, openedAtMillis: openedAt.toMillis() });
    if (activated) {
      logger.info(`[onPushOpened] activated outcome window pushId=${pushId} uid=${uid}`);
    }
  },
);

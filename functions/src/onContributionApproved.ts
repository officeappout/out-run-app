/**
 * onContributionApproved — Firestore trigger (onUpdate on user_contributions/{id}).
 *
 * Sderot pilot audit (23-24.09.2026), gap #1: a resident who submits a new
 * location and gets it approved hears nothing — no push, no email, nothing
 * happens from their side. A contributor with no feedback loop doesn't
 * contribute again. Fires whenever a contribution transitions to
 * status: 'approved', notifying the contributor their location is live.
 *
 * Scoped to type: 'new_location' only (David, 24.09.2026) — the only
 * contribution type that carries a real `approvedParkId` (set by
 * approveNewLocation()) to deep-link to. suggest_edit/report/review could
 * be added later using linkedParkId, but that's a separate decision.
 *
 * channel: 'contribution_status' — deliberately NOT 'system' (force-on,
 * no rate cap): this notification isn't operational/critical, so it must
 * stay mutable by the user's master push toggle like everything else
 * non-critical. NOT in ENGAGEMENT_CHANNELS — same reasoning as onLevelUp.ts's
 * 'progression': this validates something the user already did, it's never
 * an app-initiated nudge to do something.
 *
 * rateCapHours: 0 (David, 24.09.2026, same reasoning as onLevelUp.ts's
 * 'progression') — if three contributions get approved in one day, the
 * contributor should hear about all three, not just the first.
 *
 * Deep-link: /map?openPark=<approvedParkId> — reuses the exact convention
 * onPlannedActivityCreated.ts already established for "open this specific
 * park on the map", not a new pattern.
 *
 * Copy: the push library (push-copy.service.ts, pushType
 * 'contribution_approved'); the variant without the park name is used only
 * when the contribution has no name.
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import { resolvePushCopy, pushCopyData, loadPushRecipient } from './services/push-copy.service';
import { PUSH_TYPE_IDS } from './services/push-measure-all';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const onContributionApproved = onDocumentUpdated(
  {
    document: 'user_contributions/{id}',
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const contributionId = event.params.id as string;
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;

    if (!before || !after) return;
    if (before.status === 'approved' || after.status !== 'approved') return;
    if (after.type !== 'new_location') return;

    const userId = after.userId as string | undefined;
    const approvedParkId = after.approvedParkId as string | undefined;
    if (!userId || !approvedParkId) {
      logger.warn(
        `[onContributionApproved] contribution=${contributionId} approved but missing userId/approvedParkId — skipping push`,
      );
      return;
    }

    const parkName = typeof after.parkName === 'string' ? after.parkName.trim() : '';

    logger.info(`[onContributionApproved] contribution=${contributionId} userId=${userId} park=${approvedParkId}`);

    try {
      const contributor = await loadPushRecipient(userId);
      const copy = await resolvePushCopy('contribution_approved', {
        uid: userId,
        audience: contributor.audience,
        vars: { '@שם': contributor.firstName, '@מקום': parkName },
        params: { parkId: approvedParkId },
      });
      if (!copy) return;
      const result = await sendPush({
        toUids: [userId],
        channel: 'contribution_status',
        measurementTypeId: PUSH_TYPE_IDS.contributionApproved, // enable_push_measure_all (off = ignored)
        title: copy.title,
        body: copy.body,
        deepLink: copy.deepLink,
        data: { contributionId, approvedParkId, ...pushCopyData(copy) },
        rateCapHours: 0,
      });
      logger.info(`[onContributionApproved] contribution=${contributionId} result=${JSON.stringify(result)}`);
    } catch (err: unknown) {
      logger.error(`[onContributionApproved] sendPush failed for contribution=${contributionId}`, err);
    }
  },
);

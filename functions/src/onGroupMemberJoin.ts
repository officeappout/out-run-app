/**
 * onGroupMemberJoin — Push notifications on new community group member.
 *
 * Trigger: onCreate community_groups/{groupId}/members/{uid}
 *
 * TWO TARGETED PUSHES — no broadcast to all members (too noisy):
 *
 *  1. WELCOME → the new joiner        (push library 'group_join_welcome')
 *  2. NEW-MEMBER ALERT → group leader/admin, only when different from the
 *     joiner                          (push library 'group_join_admin')
 *
 * COPY: push-copy.service.ts — the admin-editable library, falling back to
 * the code defaults in shared/push-library.core.ts. Deep link default: the
 * group page (/community/<groupId>).
 *
 * ADMIN RESOLUTION (priority order):
 *   1. group.leaderUserId — explicit coach / leader set in admin panel
 *   2. group.createdBy    — group creator fallback
 *   If both are absent or equal to the joiner, no admin push is sent.
 *
 * CHANNEL: 'social' — respects users' `notificationPrefs.social` setting.
 *
 * RATE CAP:
 *   - Joiner welcome: rateCapHours=0 (intentional action, always notify)
 *   - Admin alert:    rateCapHours=1 (batches concurrent joins into max 1/h)
 *
 * Both sends pass isPersonalInteraction: true (Stage 2, 08.09.2026) — exempt
 * from push.service.ts's daily engagement cap, same treatment as chat.
 *
 * The trigger intentionally co-exists with onGroupMemberWrite (v1) which
 * handles memberCount sync — no overlap in responsibility.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import { resolvePushCopy, pushCopyData, loadPushRecipient } from './services/push-copy.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── Main export ──────────────────────────────────────────────────────────────

export const onGroupMemberJoin = onDocumentCreated(
  {
    document: 'community_groups/{groupId}/members/{uid}',
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const { groupId, uid: joinerUid } = event.params;
    const memberData = event.data?.data() as {
      name?: string;
      role?: string;
    } | undefined;

    if (!memberData) return;

    const joinerName = String(memberData.name ?? '');
    const joinerRole = memberData.role ?? 'member';

    // Skip if this write is the group creator bootstrapping their own admin role.
    // In that case role === 'admin' AND they are the only member — not a "new join".
    if (joinerRole === 'admin') {
      logger.info(`[onGroupMemberJoin] uid=${joinerUid} is admin — skip push`);
      return;
    }

    // ── Fetch group document ────────────────────────────────────────────────
    let groupName = '';
    let adminUid: string | null = null;

    try {
      const groupSnap = await db.doc(`community_groups/${groupId}`).get();
      if (!groupSnap.exists) {
        logger.warn(`[onGroupMemberJoin] group ${groupId} not found`);
        return;
      }
      const group = groupSnap.data() as Record<string, unknown>;
      groupName = String(group.name ?? '');
      // Resolve admin: leaderUserId > createdBy
      const leader = group.leaderUserId as string | undefined;
      const creator = group.createdBy as string | undefined;
      adminUid = leader ?? creator ?? null;
    } catch (err) {
      logger.error('[onGroupMemberJoin] group fetch failed', err);
      return;
    }

    // ── 1. Welcome push → joiner ────────────────────────────────────────────
    try {
      const joiner = await loadPushRecipient(joinerUid);
      const copy = await resolvePushCopy('group_join_welcome', {
        uid: joinerUid,
        audience: joiner.audience,
        vars: { '@שם': joiner.firstName, '@קבוצה': groupName },
        params: { groupId },
      });
      if (!copy) throw new Error('no push copy fits group_join_welcome');
      const welcomeResult = await sendPush({
        toUids: [joinerUid],
        channel: 'social',
        title: copy.title,
        body: copy.body,
        deepLink: copy.deepLink,
        data: { triggerType: 'GroupJoin_Welcome', groupId, ...pushCopyData(copy) },
        rateCapHours: 0, // intentional action — always deliver
        // Stage 2 — a direct confirmation of the user's OWN intentional
        // action, already designed to "always deliver" (rateCapHours: 0
        // above). Exempt from the daily engagement cap for the same reason.
        isPersonalInteraction: true,
      });
      logger.info(
        `[onGroupMemberJoin] welcome uid=${joinerUid} group=${groupId} ` +
          `result=${JSON.stringify(welcomeResult)}`,
      );
    } catch (err) {
      logger.error('[onGroupMemberJoin] welcome push failed', err);
    }

    // ── 2. New-member alert → admin (only when different from joiner) ───────
    if (!adminUid || adminUid === joinerUid) return;

    try {
      const leader = await loadPushRecipient(adminUid);
      const copy = await resolvePushCopy('group_join_admin', {
        uid: adminUid,
        audience: leader.audience,
        vars: { '@שם': leader.firstName, '@מצטרף': joinerName.trim().split(/\s+/)[0] ?? '', '@קבוצה': groupName },
        params: { groupId },
      });
      if (!copy) throw new Error('no push copy fits group_join_admin');
      const adminResult = await sendPush({
        toUids: [adminUid],
        channel: 'social',
        title: copy.title,
        body: copy.body,
        deepLink: copy.deepLink,
        data: { triggerType: 'GroupJoin_AdminAlert', groupId, joinerUid, ...pushCopyData(copy) },
        rateCapHours: 1, // deduplicate concurrent joins: max 1 alert / hour
        // Stage 2 — a specific person (the joiner) just joined a group this
        // recipient leads, the canonical PERSONAL-interaction event. Exempt
        // from the daily engagement cap.
        isPersonalInteraction: true,
      });
      logger.info(
        `[onGroupMemberJoin] admin-alert adminUid=${adminUid} group=${groupId} ` +
          `result=${JSON.stringify(adminResult)}`,
      );
    } catch (err) {
      logger.error('[onGroupMemberJoin] admin-alert push failed', err);
    }
  },
);

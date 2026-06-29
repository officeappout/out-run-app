/**
 * onGroupMemberJoin — Push notifications on new community group member.
 *
 * Trigger: onCreate community_groups/{groupId}/members/{uid}
 *
 * TWO TARGETED PUSHES — no broadcast to all members (too noisy):
 *
 *  1. WELCOME → the new joiner
 *     Copy templates (Hebrew to be filled in later):
 *       title: "ברוך הבא ל{group_name}!"
 *       body:  "הקבוצה מחכה לך. פתח את האפליקציה ותראה את לוח הזמנים."
 *
 *  2. NEW-MEMBER ALERT → group leader/admin (only when different from joiner)
 *     Copy templates (Hebrew to be filled in later):
 *       title: "{user_name} הצטרף/ה!"
 *       body:  "חבר/ה חדש/ה הצטרף/ה ל{group_name}."
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
 * The trigger intentionally co-exists with onGroupMemberWrite (v1) which
 * handles memberCount sync — no overlap in responsibility.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── Copy templates (placeholder — Hebrew copy to be finalised separately) ────

const JOINER_TITLE = 'ברוך הבא ל{group_name}!';
const JOINER_BODY  = 'הקבוצה מחכה לך.';

const ADMIN_TITLE  = '{user_name} הצטרף/ה!';
const ADMIN_BODY   = 'חבר/ה חדש/ה הצטרף/ה ל{group_name}.';

// ─── Helper ───────────────────────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

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

    const vars = { group_name: groupName, user_name: joinerName };

    // ── 1. Welcome push → joiner ────────────────────────────────────────────
    try {
      const welcomeResult = await sendPush({
        toUids: [joinerUid],
        channel: 'social',
        title: interpolate(JOINER_TITLE, vars),
        body: interpolate(JOINER_BODY, vars),
        deepLink: `/community/groups/${groupId}`,
        data: { triggerType: 'GroupJoin_Welcome', groupId },
        rateCapHours: 0, // intentional action — always deliver
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
      const adminResult = await sendPush({
        toUids: [adminUid],
        channel: 'social',
        title: interpolate(ADMIN_TITLE, vars),
        body: interpolate(ADMIN_BODY, vars),
        deepLink: `/community/groups/${groupId}`,
        data: { triggerType: 'GroupJoin_AdminAlert', groupId, joinerUid },
        rateCapHours: 1, // deduplicate concurrent joins: max 1 alert / hour
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

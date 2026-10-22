/**
 * onLevelUp — Firestore trigger (onUpdate on users/{uid}).
 *
 * Fires whenever a user document is updated. Early-exits immediately when
 * progression.globalLevel has not increased, so the cost per user-doc write is
 * a single field comparison with no further I/O.
 *
 * When a level-up is detected it sends a personalised Hebrew push notification
 * via push.service.ts, which enforces:
 *   • user preference filter (settings.notificationPrefs.progression)
 *   • quiet hours 22:00–07:00 IST
 *   • rate cap 24 h per uid on channel 'progression'
 *
 * NOT subject to push.service.ts's Stage 2 daily engagement cap — 'progression'
 * is deliberately excluded from ENGAGEMENT_CHANNELS (channel-level, no
 * isPersonalInteraction flag needed here) as pure achievement VALIDATION —
 * every message on this channel celebrates the user's own completed
 * progress, never an app-initiated ask to do something.
 *
 * Copy + deep link: the push library (push-copy.service.ts, pushType
 * 'level_up'), with the level as a condition (per-level copy beats the
 * generic "@רמה" copy). Default deep link: the active program's progression
 * map (/progression-map/<templateId>), or /progression when there is no
 * active program.
 *
 * Axiom compliance:
 *   • progression.globalLevel is the server-canonical value written only by
 *     awardWorkoutXP / progression.service.ts (axiom §2 / §LAW 0).
 *   • This trigger is READ-ONLY on the user doc — it sends a push and touches
 *     only push_rate/{uid} for the rate-cap stamp.
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import {
  resolvePushCopy,
  pushCopyData,
  audienceFromUserData,
  firstNameFromUserData,
} from './services/push-copy.service';
import type { PushCopyContext } from './shared/push-library.core';
import { PUSH_TYPE_IDS } from './services/push-measure-all';

if (!admin.apps.length) {
  admin.initializeApp();
}

/** The user's first active program (raw users/{uid}.progression.activePrograms[0]). */
function firstActiveProgram(user: Record<string, unknown>): { id: string; name: string } | null {
  const list = (user.progression as Record<string, unknown> | undefined)?.activePrograms;
  if (!Array.isArray(list) || list.length === 0) return null;
  const p = list[0] as Record<string, unknown>;
  const id = typeof p.templateId === 'string' && p.templateId ? p.templateId : typeof p.id === 'string' ? p.id : '';
  return id ? { id, name: typeof p.name === 'string' ? p.name : '' } : null;
}

/** Push-library context for a level-up. Exported for tests. */
export function levelUpCopyContext(uid: string, newLevel: number, user: Record<string, unknown>): PushCopyContext {
  const program = firstActiveProgram(user);
  return {
    uid,
    audience: audienceFromUserData(user),
    vars: { '@שם': firstNameFromUserData(user), '@רמה': String(newLevel), '@תוכנית': program?.name },
    conditions: { level: String(newLevel) },
    params: { programId: program?.id },
  };
}

export const onLevelUp = onDocumentUpdated(
  {
    document: 'users/{uid}',
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const uid = event.params.uid as string;
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;

    if (!before || !after) return;

    const prevLevel = (before?.progression as Record<string, unknown> | undefined)?.globalLevel;
    const newLevel = (after?.progression as Record<string, unknown> | undefined)?.globalLevel;

    // Fast exit: no change or not a numeric level increase
    if (
      typeof newLevel !== 'number' ||
      typeof prevLevel !== 'number' ||
      newLevel <= prevLevel
    ) {
      return;
    }

    // Never push for level 1 (initial state on account creation)
    if (newLevel <= 1) return;

    logger.info(`[onLevelUp] uid=${uid} level ${prevLevel} → ${newLevel}`);

    try {
      const copy = await resolvePushCopy('level_up', levelUpCopyContext(uid, newLevel, after));
      if (!copy) return;
      const result = await sendPush({
        toUids: [uid],
        channel: 'progression',
        measurementTypeId: PUSH_TYPE_IDS.levelUp, // enable_push_measure_all (off = ignored)
        title: copy.title,
        body: copy.body,
        deepLink: copy.deepLink,
        data: { newLevel: String(newLevel), prevLevel: String(prevLevel), ...pushCopyData(copy) },
        rateCapHours: 24,
      });
      logger.info(`[onLevelUp] uid=${uid} result=${JSON.stringify(result)}`);
    } catch (err: unknown) {
      logger.error(`[onLevelUp] sendPush failed for uid=${uid}`, err);
    }
  },
);

/**
 * previewNotificationContent — admin-only, READ-ONLY dry-run preview of the
 * real push-content selection path.
 *
 * Calls the actual, unmodified `selectNotificationContent`/
 * `personaliseNotificationText` (notification-content.service.ts) — the same
 * functions `stepGoalNudgeScheduler.ts` and `onPlannedActivityCreated.ts` use
 * to build a real notification. This function does ZERO writes and ZERO
 * sends: no Firestore write, no `admin.messaging()` call. It exists so the
 * admin simulator can show real selection (filtered candidates + which one
 * the hash-bucket picked, fully interpolated) instead of a fabricated
 * mockup — see `.claude/knowledge/` push-engine audits for why a hand-ported
 * client-side re-implementation was rejected (the existing
 * `personaliseNotificationText` mirror is already missing a real tag,
 * `@זמן_אימון` — a duplicated-logic bug this tool must not repeat).
 *
 * Security: mirrors runDataMigration.ts's requireAdmin (3-path admin check:
 * custom claim / hardcoded root admin email / Firestore role flags) — this
 * repo has no shared cross-callable admin-check utility yet (runDataMigration.ts
 * and auditLogger.ts each carry their own copy too), so this follows the
 * same established, if duplicated, convention rather than introducing a
 * fourth one.
 *
 * NOT DEPLOYED as of this commit — exported here so it's ready to ship, but
 * actually invoking it (from the admin panel or anywhere else) requires
 * `firebase deploy --only functions:previewNotificationContent` first. Until
 * then it can only be exercised via the local Functions emulator
 * (`firebase emulators:start --only functions,firestore`).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  selectNotificationContent,
  personaliseNotificationText,
  resolveCanonicalPersona,
  type NotificationCandidate,
  type PersonaliseVars,
} from './services/notification-content.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const ROOT_ADMIN_EMAIL_REGEX = /^(david|office)@appout\.co\.il$/i;

/** Duplicated from runDataMigration.ts by established (if imperfect) convention — see file header. */
async function requireAdmin(auth: { uid: string; token?: Record<string, any> } | undefined): Promise<string> {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required to preview notification content.');
  }
  const { uid, token } = auth;

  if (token?.admin === true) return uid;

  const email: string | undefined = token?.email;
  if (email && ROOT_ADMIN_EMAIL_REGEX.test(email)) return uid;

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    const data = userSnap.data();
    const core = data?.core ?? {};
    const isAdmin =
      data?.role === 'admin' ||
      core.role === 'admin' ||
      core.role === 'system_admin' ||
      core.isSuperAdmin === true ||
      core.isSystemAdmin === true ||
      core.isVerticalAdmin === true ||
      core.isTenantOwner === true;
    if (isAdmin) return uid;
  } catch (err) {
    logger.warn('[previewNotificationContent] Failed to read user doc for admin check:', err);
  }

  throw new HttpsError('permission-denied', 'Admin role required to preview notification content.');
}

interface PreviewNotificationPayload {
  triggerType: string;
  bundleIdPrefix?: string;
  /** Raw persona string from the admin dropdown — resolved via resolveCanonicalPersona, same as a real request. */
  persona?: string | null;
  dailyGoalBucket?: string;
  activityType?: string;
  /** Synthetic uid for the deterministic hash-bucket pick — a real uid is never required for a preview. */
  previewUid?: string;
  vars?: PersonaliseVars & Record<string, string | number | undefined>;
}

interface PreviewNotificationResult {
  ok: true;
  resolvedPersona: string;
  matched: boolean;
  interpolatedText?: string;
  selectedDocId?: string;
  candidates: NotificationCandidate[];
}

export const previewNotificationContent = onCall<PreviewNotificationPayload, Promise<PreviewNotificationResult>>(
  {
    cors: true,
    region: 'us-central1',
    enforceAppCheck: true,
  },
  async (request) => {
    await requireAdmin(request.auth);

    const { triggerType, bundleIdPrefix, persona, dailyGoalBucket, activityType, previewUid, vars } =
      request.data ?? ({} as PreviewNotificationPayload);

    if (!triggerType) {
      throw new HttpsError('invalid-argument', 'triggerType is required.');
    }

    const resolvedPersona = resolveCanonicalPersona(null, persona ?? undefined);

    const selected = await selectNotificationContent({
      triggerType,
      bundleIdPrefix,
      persona: resolvedPersona,
      dailyGoalBucket,
      activityType,
      uid: previewUid || 'admin-simulator-preview',
    });

    if (!selected) {
      return { ok: true, resolvedPersona, matched: false, candidates: [] };
    }

    return {
      ok: true,
      resolvedPersona,
      matched: true,
      interpolatedText: personaliseNotificationText(selected.text, vars ?? {}),
      selectedDocId: selected.docId,
      candidates: selected.candidates,
    };
  },
);

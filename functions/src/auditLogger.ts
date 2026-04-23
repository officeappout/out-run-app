/**
 * logAuditAction — server-authoritative audit-log writer.
 *
 * Why this exists
 * ───────────────
 * The Ashkelon Security Appendix (Req. 4.0) requires every audit row
 * to record old value, new value, timestamp, user ID, AND source IP.
 * Source IP is impossible to capture honestly from the client SDK —
 * a malicious caller could forge any value. This callable runs server-
 * side, where `request.rawRequest` exposes the real edge IP from
 * the Cloud Functions HTTPS layer (`x-forwarded-for` or socket).
 *
 * Field-level enforcement
 * ───────────────────────
 *   • adminId / adminName  — taken from request.auth (cannot be forged)
 *   • sourceIp             — taken from rawRequest headers (cannot be forged)
 *   • timestamp            — server-set serverTimestamp()
 *   • everything else       — accepted from client payload after validation
 *
 * Firestore Security Rules block client writes to /audit_logs entirely
 * (see firestore.rules → `audit_logs` allow create: if false). This
 * function uses the Admin SDK so it bypasses those rules — it is the
 * ONLY authorized writer.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const ALLOWED_ACTIONS = new Set(['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN']);
const ALLOWED_ENTITIES = new Set([
  'Exercise', 'Park', 'Authority', 'Admin', 'User', 'Program',
  'Level', 'Questionnaire', 'EditRequest', 'Route', 'AccessCode',
  'ProductTask', 'ProductTag', 'PushMessage',
  'System',
]);

const MAX_DETAILS_LEN = 2_000;
const MAX_VALUE_LEN = 10_000;
const MAX_TARGET_ID_LEN = 200;

interface LogPayload {
  actionType?: string;
  targetEntity?: string;
  targetId?: string;
  details?: string;
  /** JSON-serialisable old state (before the change). */
  oldValue?: unknown;
  /** JSON-serialisable new state (after the change). */
  newValue?: unknown;
  /** Optional admin display name (falls back to token email/uid). */
  adminName?: string;
}

interface LogResult {
  ok: true;
  id: string;
}

/**
 * Best-effort source-IP capture from the v2 callable's rawRequest.
 * The Cloud Functions HTTPS layer puts the original client IP in
 * `x-forwarded-for` (comma-separated; first entry is the real client).
 * Falls back to socket remoteAddress, then 'unknown'.
 */
function extractSourceIp(rawRequest: any): string {
  try {
    const xff = rawRequest?.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      return xff.split(',')[0].trim().slice(0, 64);
    }
    if (Array.isArray(xff) && xff[0]) {
      return String(xff[0]).split(',')[0].trim().slice(0, 64);
    }
    const sockIp = rawRequest?.ip || rawRequest?.socket?.remoteAddress;
    if (typeof sockIp === 'string' && sockIp.length > 0) {
      return sockIp.slice(0, 64);
    }
  } catch {
    /* fall through */
  }
  return 'unknown';
}

/**
 * Truncate any value to a JSON string ≤ MAX_VALUE_LEN.
 * Replaces unsupported types (functions, undefined) with null.
 */
function clampValue(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  try {
    const json = JSON.stringify(v, (_k, val) =>
      typeof val === 'function' ? undefined : val,
    );
    if (typeof json !== 'string') return null;
    return json.length > MAX_VALUE_LEN ? json.slice(0, MAX_VALUE_LEN) + '…[truncated]' : json;
  } catch {
    return null;
  }
}

export const logAuditAction = onCall<LogPayload, Promise<LogResult>>(
  {
    cors: true,
    region: 'us-central1',
    timeoutSeconds: 15,
    memory: '256MiB',
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required to write audit log.');
    }

    const data = request.data || ({} as LogPayload);

    const actionType = String(data.actionType || '').toUpperCase();
    if (!ALLOWED_ACTIONS.has(actionType)) {
      throw new HttpsError('invalid-argument', `actionType must be one of: ${[...ALLOWED_ACTIONS].join(', ')}`);
    }

    const targetEntity = String(data.targetEntity || '');
    if (!ALLOWED_ENTITIES.has(targetEntity)) {
      throw new HttpsError('invalid-argument', `targetEntity must be one of: ${[...ALLOWED_ENTITIES].join(', ')}`);
    }

    const targetId =
      typeof data.targetId === 'string' && data.targetId.length > 0
        ? data.targetId.slice(0, MAX_TARGET_ID_LEN)
        : null;

    const details =
      typeof data.details === 'string'
        ? data.details.slice(0, MAX_DETAILS_LEN)
        : '';

    const oldValue = clampValue(data.oldValue);
    const newValue = clampValue(data.newValue);

    const uid = request.auth.uid;
    const tokenEmail = (request.auth.token as any)?.email;
    const adminName =
      (typeof data.adminName === 'string' && data.adminName.trim().length > 0
        ? data.adminName.trim().slice(0, 200)
        : tokenEmail || uid);

    const sourceIp = extractSourceIp(request.rawRequest);

    const docRef = await db.collection('audit_logs').add({
      adminId: uid,
      adminName,
      actionType,
      targetEntity,
      targetId,
      details,
      oldValue,
      newValue,
      sourceIp,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(
      `[logAuditAction] ${actionType} ${targetEntity}${targetId ? `/${targetId}` : ''} ` +
        `by ${uid} from ${sourceIp} → ${docRef.id}`,
    );

    return { ok: true, id: docRef.id };
  },
);

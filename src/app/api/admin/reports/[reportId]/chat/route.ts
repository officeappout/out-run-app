/**
 * GET /api/admin/reports/[reportId]/chat
 *
 * Read-only view of the last 50 messages of a REPORTED group chat, for the
 * moderator handling that report. This returns content written by (often)
 * minors, so every rule below is deliberate:
 *
 *   - The ONLY input is the reportId in the path. A group/chat id is never
 *     accepted from the client — the group is whatever `reports/{reportId}`
 *     says it is.
 *   - The report must exist and have targetType == 'group'. Anything else
 *     (missing report, DM/user/event report) gets the generic 403.
 *   - Scope: root may read any reported group chat. Otherwise the caller must
 *     be a manager (authorities.managerIds) of the authority that owns the
 *     group (group.authorityId or group.tenantId == caller's authority).
 *     Another authority's group, a missing group, a non-manager (incl.
 *     unit_admin): the SAME generic 403 as every other denial.
 *   - Response is { messages: [{ id, senderName, text, sentAt, type }] } and
 *     NOTHING else — no senderUid, readBy, participants, or chat metadata.
 *   - Every successful read writes an audit_logs row (READ / ReportedChat /
 *     <reportId>: adminId, IP, message count) BEFORE content is returned; if
 *     the audit write fails the request fails closed and returns no content.
 *   - Nothing about the content, names, uids or ids is ever logged.
 *   - Rate limit: 30/min per caller.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MESSAGE_LIMIT = 50;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const GENERIC_FORBIDDEN = 'אין לך הרשאה לצפות בצ\'אט זה.';

interface Caller {
  uid: string;
  email: string | null;
}

export interface ReportedChatMessage {
  id: string;
  senderName: string;
  text: string;
  sentAt: string | null;
  type: string | null;
}

export type ReportedChatResult =
  | { status: 200; body: { messages: ReportedChatMessage[] } }
  | { status: 403; body: { error: string } };

function toIso(v: unknown): string | null {
  if (!v) return null;
  const d =
    v instanceof Date
      ? v
      : typeof (v as { toDate?: unknown }).toDate === 'function'
        ? (v as { toDate: () => Date }).toDate()
        : new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function computeReportedChat(
  db: Firestore,
  caller: Caller,
  reportId: string,
  sourceIp: string,
): Promise<ReportedChatResult> {
  const forbidden: ReportedChatResult = { status: 403, body: { error: GENERIC_FORBIDDEN } };
  if (!ID_PATTERN.test(reportId)) return forbidden;

  const root = isRootAdmin(caller.email);
  let authorityId: string | null = null;
  if (!root) {
    const scope = await resolveAuthorityManagerScope(db, caller.uid);
    if (!scope) return forbidden;
    authorityId = scope.authorityId;
  }

  const reportSnap = await db.collection('reports').doc(reportId).get();
  if (!reportSnap.exists) return forbidden;
  const report = reportSnap.data() as { targetType?: unknown; targetId?: unknown } | undefined;
  if (report?.targetType !== 'group') return forbidden;
  const groupId = report.targetId;
  if (typeof groupId !== 'string' || !ID_PATTERN.test(groupId)) return forbidden;

  if (!root) {
    const groupSnap = await db.collection('community_groups').doc(groupId).get();
    if (!groupSnap.exists) return forbidden;
    const g = groupSnap.data() as { authorityId?: unknown; tenantId?: unknown } | undefined;
    if (g?.authorityId !== authorityId && g?.tenantId !== authorityId) return forbidden;
  }

  const msgSnap = await db
    .collection('chats')
    .doc(`group_${groupId}`)
    .collection('messages')
    .orderBy('sentAt', 'desc')
    .limit(MESSAGE_LIMIT)
    .get();

  const messages: ReportedChatMessage[] = msgSnap.docs
    .map((d) => {
      const m = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        senderName: typeof m.senderName === 'string' ? m.senderName : 'משתמש',
        text: typeof m.text === 'string' ? m.text : '',
        sentAt: toIso(m.sentAt),
        type: typeof m.type === 'string' ? m.type : null,
      };
    })
    .reverse();

  // Audit BEFORE returning content; a failed audit write throws → 500, no data.
  await db.collection('audit_logs').add({
    adminId: caller.uid,
    adminName: caller.email || 'Admin',
    actionType: 'READ',
    targetEntity: 'ReportedChat',
    targetId: reportId,
    details: `Viewed reported group chat via /api/admin/reports/[reportId]/chat (messages=${messages.length})`,
    oldValue: null,
    newValue: null,
    sourceIp,
    timestamp: new Date(),
  });

  return { status: 200, body: { messages } };
}

export async function GET(request: NextRequest, { params }: { params: { reportId: string } }) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    let uid: string;
    let email: string | null;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
      email = (decoded.email as string | undefined) ?? null;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminDb();
    const ip = getRequestIp(request);
    const rl = await isBlockedByAny(db, [
      { key: `reported-chat:uid:${uid}`, window: RATE_LIMITS.reportedChat.uid() },
    ]);
    if (rl.blocked) {
      logRateLimitBlock({ route: 'reported-chat', dimension: 'uid', ip, identifier: uid });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.window?.windowMs ?? 60_000) / 1000)) } },
      );
    }

    const result = await computeReportedChat(db, { uid, email }, params.reportId, ip);
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    // No uid / email / reportId / groupId / message data in the log line.
    console.error('[api/admin/reports/chat] failed', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

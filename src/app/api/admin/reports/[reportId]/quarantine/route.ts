/**
 * POST /api/admin/reports/[reportId]/quarantine
 *
 * "Delete reported content", as a QUARANTINE — nothing is physically deleted.
 * The reported group/event gets { moderationState: 'removed', isActive: false,
 * removedBy, removedAt }; every user-facing query already filters
 * `isActive == true` and the paths that don't (arena listener, join preview,
 * join engine) check src/lib/moderation.ts, so it disappears immediately and
 * stays recoverable by an admin. Replaces the browser-side deleteGroup /
 * deleteEvent + deleteDoc(reports) (root-only at the rules layer).
 *
 * Authorization: authorizeReportAccess (src/lib/reportScope.ts) — root, or the
 * manager of the authority that owns the report's TARGET; re-derived from the
 * target doc every time. Non-manager / out-of-scope / not-found / malformed /
 * non-group-event report: the same generic 403 (zero report reads for a
 * non-manager, no writes, no audit row).
 *
 * The target's chat doc (chats/group_<id>) is closed in the SAME batch
 * (moderationState 'removed' + lastMessage tombstone); firestore.rules then
 * denies members reading/sending/updating there.
 *
 * Atomicity: the target quarantine (+ chat close) + its audit_logs row
 * (UPDATE / ContentQuarantine / <targetId>) are ONE Admin batch, fail-closed —
 * no removal without an audit row. The audit row carries adminId, IP,
 * authority, the target type and the NUMBER of matching reports — never names,
 * text or reporterId.
 * Afterwards the matching reports (same target) are set to status 'actioned' in
 * chunks of <= 500, best-effort: a failed chunk is logged (error name only) and
 * reported in the response, never undoes the quarantine (the scoped list hides
 * reports whose target is gone/inactive-by-removal anyway).
 *
 * Idempotent: a target already removed -> 200 {alreadyRemoved:true}, no write,
 * no second audit row.
 * 30/min per caller (shared RL_REPORT_ACTIONS_UID); logs: error name only.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { authorizeReportAccess, REPORT_TARGET_COLLECTION, type ReportCaller } from '@/lib/reportScope';
import { isContentRemoved, MODERATION_REMOVED } from '@/lib/moderation';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC_FORBIDDEN = 'אין לך הרשאה לטפל בדיווח זה.';
const REPORT_UPDATE_CHUNK = 500;
const CHAT_TOMBSTONE = 'התוכן הוסר';

export type QuarantineResult =
  | {
      status: 200;
      body: { ok: true; alreadyRemoved: boolean; reportsUpdated: number; reportsFailed: number };
    }
  | { status: 403; body: { error: string } };

export async function computeQuarantineTarget(
  db: Firestore,
  caller: ReportCaller,
  reportId: string,
  sourceIp: string,
): Promise<QuarantineResult> {
  const forbidden: QuarantineResult = { status: 403, body: { error: GENERIC_FORBIDDEN } };

  const access = await authorizeReportAccess(db, caller, reportId);
  if (!access.ok) return forbidden;

  const targetType = typeof access.report.targetType === 'string' ? access.report.targetType : '';
  const targetId = access.report.targetId;
  const collection = REPORT_TARGET_COLLECTION[targetType];
  if (!collection || typeof targetId !== 'string') return forbidden; // e.g. a root caller on a DM/user report

  const targetRef = db.collection(collection).doc(targetId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) return forbidden;
  if (isContentRemoved(targetSnap.data())) {
    return { status: 200, body: { ok: true, alreadyRemoved: true, reportsUpdated: 0, reportsFailed: 0 } };
  }

  // Matching reports (single-field query, filtered in memory — no composite index).
  const relatedSnap = await db.collection('reports').where('targetId', '==', targetId).get();
  const relatedRefs = relatedSnap.docs
    .filter((d) => (d.data() as { targetType?: unknown }).targetType === targetType)
    .map((d) => d.ref);

  // The target's group/event chat (chats/group_<id>; same id pattern for both).
  // It is closed to members by firestore.rules via this same flag, and its
  // inbox preview is replaced with a neutral tombstone so no offending snippet
  // (possibly written by/for minors) stays visible in participants' inboxes.
  // A restore recomputes lastMessage from the latest message.
  const chatRef = db.collection('chats').doc(`group_${targetId}`);
  const chatSnap = await chatRef.get();

  // Quarantine (+ chat close) + audit: ONE batch, fail-closed.
  const batch = db.batch();
  batch.update(targetRef, {
    moderationState: MODERATION_REMOVED,
    isActive: false,
    removedBy: caller.uid,
    removedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (chatSnap.exists) {
    batch.update(chatRef, { moderationState: MODERATION_REMOVED, lastMessage: CHAT_TOMBSTONE });
  }
  batch.set(db.collection('audit_logs').doc(), {
    adminId: caller.uid,
    adminName: caller.email || 'Admin',
    actionType: 'UPDATE',
    targetEntity: 'ContentQuarantine',
    targetId,
    details: `Quarantined reported ${targetType} via /api/admin/reports/[reportId]/quarantine (authority=${access.root ? 'root' : access.authorityId}, matchingReports=${relatedRefs.length})`,
    oldValue: null,
    newValue: null,
    sourceIp,
    timestamp: new Date(),
  });
  await batch.commit();

  // Reports -> 'actioned', chunked, best-effort. The quarantine is already durable.
  let reportsUpdated = 0;
  let reportsFailed = 0;
  for (let i = 0; i < relatedRefs.length; i += REPORT_UPDATE_CHUNK) {
    const chunk = relatedRefs.slice(i, i + REPORT_UPDATE_CHUNK);
    try {
      const b = db.batch();
      for (const ref of chunk) b.update(ref, { status: 'actioned', reviewedAt: FieldValue.serverTimestamp() });
      await b.commit();
      reportsUpdated += chunk.length;
    } catch (err) {
      reportsFailed += chunk.length;
      console.error('[api/admin/reports/quarantine] report status update failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  return { status: 200, body: { ok: true, alreadyRemoved: false, reportsUpdated, reportsFailed } };
}

export async function POST(request: NextRequest, { params }: { params: { reportId: string } }) {
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
      { key: `report-quarantine:uid:${uid}`, window: RATE_LIMITS.reportActions.uid() },
    ]);
    if (rl.blocked) {
      logRateLimitBlock({ route: 'report-quarantine', dimension: 'uid', ip, identifier: uid });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.window?.windowMs ?? 60_000) / 1000)) } },
      );
    }

    const result = await computeQuarantineTarget(db, { uid, email }, params.reportId, ip);
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    // No uid / email / reportId / target data in the log line.
    console.error('[api/admin/reports/quarantine] failed', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

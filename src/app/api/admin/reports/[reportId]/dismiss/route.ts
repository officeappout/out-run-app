/**
 * POST /api/admin/reports/[reportId]/dismiss
 *
 * Marks a community report as dismissed. Replaces the browser-side
 * `updateDoc(reports/{id}, …)`, which is now root-only at the rules layer.
 *
 *   - Only input: the reportId in the path (ID_PATTERN-checked).
 *   - Authorization is re-derived server-side by authorizeReportAccess
 *     (src/lib/reportScope.ts): the report is loaded and its TARGET's authority
 *     compared with the caller's; the id having come from the scoped list is
 *     not trusted. Non-manager / out-of-scope / not-found / non-group-event /
 *     malformed: the same generic 403, with zero report reads for a
 *     non-manager and no audit row for any denial.
 *   - Idempotent: dismissing an already-dismissed report returns 200
 *     {alreadyDismissed:true} with no write and no audit row (nothing happened).
 *   - All-or-nothing: the status update and its audit_logs row
 *     (UPDATE / ReportDismiss / <reportId>: adminId, IP, authority) are ONE
 *     Admin batch — no dismiss without its audit row, fail-closed (500).
 *   - 30/min per caller; logs carry the error name only.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { authorizeReportAccess, type ReportCaller } from '@/lib/reportScope';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC_FORBIDDEN = 'אין לך הרשאה לטפל בדיווח זה.';

export type DismissResult =
  | { status: 200; body: { ok: true; alreadyDismissed: boolean } }
  | { status: 403; body: { error: string } };

export async function computeDismissReport(
  db: Firestore,
  caller: ReportCaller,
  reportId: string,
  sourceIp: string,
): Promise<DismissResult> {
  const access = await authorizeReportAccess(db, caller, reportId);
  if (!access.ok) return { status: 403, body: { error: GENERIC_FORBIDDEN } };

  if (access.report.status === 'dismissed') {
    return { status: 200, body: { ok: true, alreadyDismissed: true } };
  }

  const batch = db.batch();
  batch.update(access.reportRef, { status: 'dismissed', reviewedAt: FieldValue.serverTimestamp() });
  batch.set(db.collection('audit_logs').doc(), {
    adminId: caller.uid,
    adminName: caller.email || 'Admin',
    actionType: 'UPDATE',
    targetEntity: 'ReportDismiss',
    targetId: reportId,
    details: `Dismissed report via /api/admin/reports/[reportId]/dismiss (authority=${access.root ? 'root' : access.authorityId})`,
    oldValue: null,
    newValue: null,
    sourceIp,
    timestamp: new Date(),
  });
  await batch.commit();

  return { status: 200, body: { ok: true, alreadyDismissed: false } };
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
      { key: `report-dismiss:uid:${uid}`, window: RATE_LIMITS.reportActions.uid() },
    ]);
    if (rl.blocked) {
      logRateLimitBlock({ route: 'report-dismiss', dimension: 'uid', ip, identifier: uid });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.window?.windowMs ?? 60_000) / 1000)) } },
      );
    }

    const result = await computeDismissReport(db, { uid, email }, params.reportId, ip);
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    // No uid / email / reportId / target data in the log line.
    console.error('[api/admin/reports/dismiss] failed', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

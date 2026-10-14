/**
 * GET /api/admin/reports
 *
 * Scoped list of user-submitted community reports (groups / events) for the
 * moderator page. Replaces the browser-side `getDocs(collection('reports'))`,
 * which read EVERY authority's reports (and is now root-only at the rules
 * layer — see firestore.rules `match /reports`).
 *
 * A report carries no authorityId, so scope is resolved per TARGET:
 *   - the caller's authority is derived server-side (authorities.managerIds);
 *     the client sends nothing;
 *   - reports are scanned newest-first in pages; each page's target groups /
 *     events are fetched with ONE batched getAll (deduped), and a report is
 *     kept only if its target's authorityId or tenantId equals the caller's;
 *   - the scan is bounded (MAX_SCANNED), `truncated: true` tells the UI the
 *     window was hit instead of silently pretending it is complete.
 * Root sees every report (all target types). Reports whose target is not a
 * group/event (e.g. DM/user reports), or whose target doc is missing, are never
 * shown to a non-root caller.
 *
 * Response per report: id, targetType, targetId, targetName, status, category,
 * createdAt, reviewedAt. NEVER reporterId, NEVER the free-form reason —
 * `category` is the `reason` value only if it is one of the fixed UI keys,
 * otherwise 'other' (the rules let any signed-in user write any string there).
 *
 * Every call writes an audit_logs row (READ / ReportsList; counts only,
 * fail-closed). Non-manager / unit_admin: the same generic 403 as every other
 * denial. 30/min per caller. Nothing about reports, names or ids is logged.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 200;
const MAX_SCANNED = 1000;
const MAX_RESULTS = 200;
const GET_ALL_CHUNK = 300;
const GENERIC_FORBIDDEN = 'אין לך הרשאה לצפות בדיווחים.';
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const KNOWN_CATEGORIES = new Set(['spam', 'inappropriate', 'harassment', 'misinformation', 'impersonation', 'other']);
const TARGET_COLLECTION: Record<string, string> = { group: 'community_groups', event: 'community_events' };

interface Caller {
  uid: string;
  email: string | null;
}

export interface ListedReport {
  id: string;
  targetType: string;
  targetId: string;
  targetName: string;
  status: string;
  category: string;
  createdAt: string | null;
  reviewedAt: string | null;
}

export type ListReportsResult =
  | { status: 200; body: { reports: ListedReport[]; truncated: boolean } }
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

export async function computeListReports(
  db: Firestore,
  caller: Caller,
  sourceIp: string,
): Promise<ListReportsResult> {
  const root = isRootAdmin(caller.email);
  let authorityId: string | null = null;
  if (!root) {
    const scope = await resolveAuthorityManagerScope(db, caller.uid);
    if (!scope) return { status: 403, body: { error: GENERIC_FORBIDDEN } };
    authorityId = scope.authorityId;
  }

  const results: ListedReport[] = [];
  let scanned = 0;
  let truncated = false;
  let cursor: QueryDocumentSnapshot | null = null;

  while (scanned < MAX_SCANNED && results.length < MAX_RESULTS) {
    let q = db.collection('reports').orderBy('createdAt', 'desc').limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    if (page.docs.length === 0) break;
    scanned += page.docs.length;
    cursor = page.docs[page.docs.length - 1];

    // One batched lookup of this page's group/event targets (deduped).
    const inScopeTargets = new Set<string>();
    if (!root) {
      const wanted = new Map<string, { type: string; id: string }>();
      for (const d of page.docs) {
        const r = d.data() as { targetType?: unknown; targetId?: unknown };
        if (typeof r.targetType !== 'string' || !(r.targetType in TARGET_COLLECTION)) continue;
        if (typeof r.targetId !== 'string' || !ID_PATTERN.test(r.targetId)) continue;
        wanted.set(`${r.targetType}:${r.targetId}`, { type: r.targetType, id: r.targetId });
      }
      const entries = Array.from(wanted.entries());
      for (let i = 0; i < entries.length; i += GET_ALL_CHUNK) {
        const chunk = entries.slice(i, i + GET_ALL_CHUNK);
        const snaps = await db.getAll(
          ...chunk.map(([, t]) => db.collection(TARGET_COLLECTION[t.type]).doc(t.id)),
        );
        snaps.forEach((snap, idx) => {
          if (!snap.exists) return;
          const t = snap.data() as { authorityId?: unknown; tenantId?: unknown } | undefined;
          if (t?.authorityId === authorityId || t?.tenantId === authorityId) inScopeTargets.add(chunk[idx][0]);
        });
      }
    }

    for (const d of page.docs) {
      const r = d.data() as Record<string, unknown>;
      if (!root && !inScopeTargets.has(`${r.targetType}:${r.targetId}`)) continue;
      results.push({
        id: d.id,
        targetType: typeof r.targetType === 'string' ? r.targetType : 'unknown',
        targetId: typeof r.targetId === 'string' ? r.targetId : '',
        targetName: typeof r.targetName === 'string' ? r.targetName.slice(0, 200) : '',
        status: typeof r.status === 'string' ? r.status : 'pending',
        category: typeof r.reason === 'string' && KNOWN_CATEGORIES.has(r.reason) ? r.reason : 'other',
        createdAt: toIso(r.createdAt),
        reviewedAt: toIso(r.reviewedAt),
      });
      if (results.length >= MAX_RESULTS) break;
    }

    if (page.docs.length < PAGE_SIZE) break;
    if (scanned >= MAX_SCANNED || results.length >= MAX_RESULTS) {
      truncated = true;
      break;
    }
  }

  // Audit every call BEFORE returning; failure → throw → 500, no data.
  await db.collection('audit_logs').add({
    adminId: caller.uid,
    adminName: caller.email || 'Admin',
    actionType: 'READ',
    targetEntity: 'ReportsList',
    targetId: root ? 'root' : authorityId,
    details: `Listed community reports via /api/admin/reports (returned=${results.length}, scanned=${scanned}, truncated=${truncated})`,
    oldValue: null,
    newValue: null,
    sourceIp,
    timestamp: new Date(),
  });

  return { status: 200, body: { reports: results, truncated } };
}

export async function GET(request: NextRequest) {
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
      { key: `reports-list:uid:${uid}`, window: RATE_LIMITS.reportsList.uid() },
    ]);
    if (rl.blocked) {
      logRateLimitBlock({ route: 'reports-list', dimension: 'uid', ip, identifier: uid });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.window?.windowMs ?? 60_000) / 1000)) } },
      );
    }

    const result = await computeListReports(db, { uid, email }, ip);
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    // No uid / email / report / target data in the log line.
    console.error('[api/admin/reports GET] failed', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

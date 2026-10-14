/**
 * Server-side authorization for acting on a single `reports/{reportId}` doc
 * (dismiss / delete-content). Used by the Admin-SDK report routes; the client
 * never says which authority a report belongs to — it is re-derived HERE, from
 * the report's TARGET (a group or event doc), every time. A report id that came
 * from the scoped list is not trusted: it is loaded and re-checked.
 *
 *   - root (david@/office@): any existing report.
 *   - otherwise the caller must manage an authority (authorities.managerIds) and
 *     the report's target group/event must carry that authority as authorityId
 *     or tenantId.
 *   - EVERYTHING else — malformed id, non-manager (incl. unit_admin), missing
 *     report, non-group/event report (DM/user), missing target, other
 *     authority's target — is the same `forbidden` result, so a caller can
 *     never tell "not yours" from "not real".
 *
 * Order matters: a non-manager is rejected BEFORE any report read.
 */
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import { isRootAdmin } from '@/config/feature-flags';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';

export const REPORT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const REPORT_TARGET_COLLECTION: Record<string, string> = {
  group: 'community_groups',
  event: 'community_events',
};

export interface ReportCaller {
  uid: string;
  email: string | null;
}

export type ReportAccess =
  | {
      ok: true;
      reportRef: DocumentReference;
      report: Record<string, unknown>;
      /** The caller's authority id, or null for root. */
      authorityId: string | null;
      root: boolean;
    }
  | { ok: false };

export async function authorizeReportAccess(
  db: Firestore,
  caller: ReportCaller,
  reportId: string,
): Promise<ReportAccess> {
  if (typeof reportId !== 'string' || !REPORT_ID_PATTERN.test(reportId)) return { ok: false };

  const root = isRootAdmin(caller.email);
  let authorityId: string | null = null;
  if (!root) {
    const scope = await resolveAuthorityManagerScope(db, caller.uid);
    if (!scope) return { ok: false };
    authorityId = scope.authorityId;
  }

  const reportRef = db.collection('reports').doc(reportId);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) return { ok: false };
  const report = (reportSnap.data() ?? {}) as Record<string, unknown>;

  if (!root) {
    const collection = typeof report.targetType === 'string' ? REPORT_TARGET_COLLECTION[report.targetType] : undefined;
    const targetId = report.targetId;
    if (!collection || typeof targetId !== 'string' || !REPORT_ID_PATTERN.test(targetId)) return { ok: false };
    const targetSnap = await db.collection(collection).doc(targetId).get();
    if (!targetSnap.exists) return { ok: false };
    const t = targetSnap.data() as { authorityId?: unknown; tenantId?: unknown } | undefined;
    if (t?.authorityId !== authorityId && t?.tenantId !== authorityId) return { ok: false };
  }

  return { ok: true, reportRef, report, authorityId, root };
}

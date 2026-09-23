/**
 * adminAnalyticsScope.ts — server-side-only role → data-scope resolution
 * for the statistics/insights dashboards (00-MASTER-PLAN.md §13.11 P1).
 *
 * Before this file: getExecutiveSummary/getAuthorityPerformance/
 * getPremiumMetrics (cpo-analytics.service.ts) and getHealthWakeUpMetric/
 * getEquipmentGapAnalysis/getSleepyNeighborhoods (strategic-insights.
 * service.ts) ran entirely client-side, reading the full `users` (and for
 * the cpo-analytics trio, ALWAYS unscoped — no authorityId parameter
 * existed at all) collection directly from the browser and filtering
 * client-side. The only thing preventing a non-privileged caller from
 * pulling every resident's data was firestore.rules — exactly the
 * single-point-of-failure this route closes (see SEC-14 precedent,
 * 00-MASTER-PLAN.md §13.5, for why "rules are the only gate" has broken
 * before). The caller's role and scope are now resolved HERE, from the
 * verified ID token's uid, server-side, via the Admin SDK — never from a
 * client-supplied authorityId or role claim.
 *
 * Role → scope decisions (documented per David's explicit request):
 *   - super_admin / system_admin: 'platform' — full cross-authority view.
 *   - platform_member with 'product' or 'system' in core.allowedSections
 *     (the two sections /admin/statistics and /admin/insights are gated
 *     behind client-side — see admin/layout.tsx's sectionPathsMap):
 *     'platform' — internal team access, not tied to any one municipality.
 *   - vertical_admin (core.isVerticalAdmin, core.managedVertical): 'vertical'
 *     — scoped to every authority whose tenantTypeOf() matches their
 *     managedVertical. Mirrors the exact scoping already shipped in
 *     src/app/api/admin/authorities/route.ts (tenantTypeOf, extracted to
 *     src/lib/tenantType.ts 23.09.2026 so this file — imported by plain
 *     Node test scripts, not just Next.js routes — doesn't pull in that
 *     route's full dependency graph) — not a new invention, extending an
 *     existing precedent.
 *   - authority_manager (uid in some authorities/{id}.managerIds):
 *     'authority' — scoped to that ONE authority id. Deliberately NOT
 *     rolled up to child neighborhoods, matching city-summary/route.ts's
 *     and dashboard-summary/route.ts's own documented scope limitation
 *     ("a level-1 manager's own authority is what's resolved and used,
 *     full stop").
 *   - anyone else (no role match at all): 'denied'.
 */
import { getAdminDb } from '@/lib/firebase-admin';
import { tenantTypeOf } from '@/lib/tenantType';

export type AdminAnalyticsScope =
  | { kind: 'platform' }
  | { kind: 'vertical'; vertical: string; authorityIds: string[] }
  | { kind: 'authority'; authorityId: string }
  | { kind: 'denied' };

export async function resolveAdminAnalyticsScope(uid: string): Promise<AdminAnalyticsScope> {
  const db = getAdminDb();
  const userSnap = await db.collection('users').doc(uid).get();
  const core = (userSnap.data()?.core ?? {}) as Record<string, unknown>;

  const isSuperAdmin = core.isSuperAdmin === true;
  const isSystemAdmin = core.isSystemAdmin === true || core.role === 'system_admin';
  const isVerticalAdmin = core.isVerticalAdmin === true && !isSuperAdmin;
  const allowedSections = Array.isArray(core.allowedSections) ? (core.allowedSections as unknown[]) : [];
  const isPlatformMemberWithAccess = allowedSections.includes('product') || allowedSections.includes('system');

  if (isSuperAdmin || isSystemAdmin || isPlatformMemberWithAccess) {
    return { kind: 'platform' };
  }

  if (isVerticalAdmin && typeof core.managedVertical === 'string' && core.managedVertical) {
    const vertical = core.managedVertical;
    const authoritiesSnap = await db.collection('authorities').select('type').get();
    const authorityIds = authoritiesSnap.docs
      .filter((d) => tenantTypeOf((d.data().type as string) ?? '') === vertical)
      .map((d) => d.id);
    return { kind: 'vertical', vertical, authorityIds };
  }

  const managedSnap = await db.collection('authorities').where('managerIds', 'array-contains', uid).limit(1).get();
  if (!managedSnap.empty) {
    return { kind: 'authority', authorityId: managedSnap.docs[0].id };
  }

  return { kind: 'denied' };
}

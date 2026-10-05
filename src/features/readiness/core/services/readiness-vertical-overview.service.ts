/**
 * "Chief fitness officer" overview — read-only, 06.10.2026. David's
 * explicit model: a brigade officer's existing scope (root/tenantOwner/
 * unitAdmin) is completely unaffected by this file — zero diff, zero
 * shared code path. This is a SEPARATE screen for a SEPARATE scope kind
 * (`UnitPermissionScope`'s new `'vertical'` variant, unitPermissionScope.ts)
 * that sees across every military tenant instead of one.
 *
 * === Read-only, no exception ===
 * This file has no write function and never will — a vertical-scoped
 * officer's writes are already rejected everywhere they'd matter, by
 * CONSTRUCTION, with zero code added to readiness-write.service.ts (left
 * untouched, per instruction): every write function in that file checks
 * `scope.kind !== 'root' && scope.kind !== 'tenantOwner' && scope.kind
 * !== 'unitAdmin'` → 403, an ALLOWLIST that already excludes any kind it
 * doesn't explicitly name — 'vertical' included, automatically, the
 * moment it was added to the union. Same is true of
 * isMemberWithinScope (unitPermissionScope.ts), the gate behind unit
 * creation (/api/units/create) and member approve/remove — it only
 * returns true for 'root'/'tenantOwner'/'unitAdmin', false otherwise.
 * Confirmed by reading both, not assumed.
 *
 * === One row per military tenant — reusing the REAL dashboard numbers ===
 * Each row's totalCount/passCount/passPercent is NOT recomputed here —
 * it's the exact same `computeBrigadeDashboard` (readiness-dashboard.
 * service.ts) every brigade officer's own dashboard card already calls,
 * invoked once per in-scope tenantId with a SYNTHETIC `{kind:'tenantOwner',
 * tenantId}` scope. This is safe specifically because authorization for
 * that tenantId already happened above (it's only ever called for a
 * tenantId drawn from `authorityIds`, which was already filtered to this
 * caller's own vertical in resolveUnitPermissionScope) — the synthetic
 * scope never leaves this function, is never derived from client input,
 * and is used for nothing but this one read. No aggregation logic is
 * duplicated; if computeBrigadeDashboard's own math ever changes, this
 * screen's numbers change with it, automatically, same as every other
 * consumer of that function.
 *
 * === Never a blank screen, never a fabricated number ===
 * A military tenant with zero readiness_soldiers still gets its own row
 * (`hasData: false`, rendered "טרם הוזנו נתונים" by the UI) — never
 * hidden, never a silently-skipped row. `hasData` is `totalCount > 0`,
 * a real fact, not inferred from passPercent (which is ALSO null for a
 * tenant that has soldiers but zero of them tested yet — a materially
 * different state the UI must be able to tell apart).
 */
import type { Firestore } from 'firebase-admin/firestore';
import { UNIT_SCOPE_UNKNOWN_MESSAGE, type UnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeBrigadeDashboard } from './readiness-dashboard.service';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות בתצוגה זו.';

/** The one vertical this screen ever serves — readiness/fitness has no municipal or educational equivalent today. Any OTHER vertical (educational/municipal) is a real, granted role, just not one with access to THIS screen — denied, not an empty list (David's own distinction: "סירוב אומר 'אין לך גישה'"). */
const READINESS_VERTICAL = 'military';

export interface VerticalBrigadeRow {
  tenantId: string;
  tenantName: string;
  totalCount: number;
  passCount: number;
  /** null exactly when testedCount is 0 — "not yet tested," never a fabricated 0%. Same meaning as DashboardOverallBreakdown.passPercent. */
  passPercent: number | null;
  /** totalCount > 0 — false means this brigade has never entered a single soldier. Distinct from passPercent===null (which can also happen WITH soldiers, zero of them tested). */
  hasData: boolean;
}

export type VerticalOverviewResult =
  | { status: 200; body: { rows: VerticalBrigadeRow[] } }
  | { status: 400 | 403 | 503; body: { error: string } };

export async function computeReadinessVerticalOverview(
  db: Firestore,
  scope: UnitPermissionScope,
): Promise<VerticalOverviewResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: UNIT_SCOPE_UNKNOWN_MESSAGE } };
  }
  // Allowlist, not a denylist — every kind other than a real military
  // 'vertical' grant is refused, including root/tenantOwner/unitAdmin/
  // denied. This screen has exactly one door.
  if (scope.kind !== 'vertical' || scope.vertical !== READINESS_VERTICAL) {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const inScopeIds = new Set(scope.authorityIds);

  // Defensive re-filter to military_unit specifically — never trust
  // scope.authorityIds' own upstream filtering alone as the ONLY thing
  // keeping a municipal/educational authority out of this list. Also
  // what makes a tenant NOT in scope.authorityIds (a vertical admin for
  // a DIFFERENT military sub-population, if that ever exists) correctly
  // absent, since the intersection below requires both.
  const authoritiesSnap = await db.collection('authorities').where('type', '==', 'military_unit').get();
  const militaryAuthorities = authoritiesSnap.docs
    .filter((d) => inScopeIds.has(d.id))
    .map((d) => ({ id: d.id, name: typeof d.data().name === 'string' ? (d.data().name as string) : d.id }));

  const rows = await Promise.all(
    militaryAuthorities.map(async ({ id, name }): Promise<VerticalBrigadeRow> => {
      const result = await computeBrigadeDashboard(db, { kind: 'tenantOwner', tenantId: id }, {});
      if (result.status !== 200) {
        // computeBrigadeDashboard only returns non-200 for 'unknown'/'denied'
        // scope kinds or a missing tenantId — none of which apply to the
        // synthetic tenantOwner scope constructed above. Treated as "no
        // data yet" rather than silently dropping the row.
        return { tenantId: id, tenantName: name, totalCount: 0, passCount: 0, passPercent: null, hasData: false };
      }
      const { overall } = result.body;
      return {
        tenantId: id,
        tenantName: name,
        totalCount: overall.totalCount,
        passCount: overall.passCount,
        passPercent: overall.passPercent,
        hasData: overall.totalCount > 0,
      };
    }),
  );

  return { status: 200, body: { rows } };
}

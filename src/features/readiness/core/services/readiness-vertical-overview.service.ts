/**
 * "Chief fitness officer" overview — read-only, 06.10.2026. David's
 * explicit model: a real brigade officer's existing scope (tenantOwner/
 * unitAdmin) is completely unaffected by this file — zero diff, zero
 * shared code path. This is a SEPARATE screen for callers with no OWN
 * single brigade who must pick one — originally just the new 'vertical'
 * scope kind, extended same-day to ALSO admit root (David's review:
 * root already sees at least as much as a chief officer everywhere
 * else in the system; see the `isRoot` branch below for the one new
 * door). Still never tenantOwner/unitAdmin — they keep their own single
 * brigade, resolved server-side, with no reason to ever see this list.
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
import { computeBrigadeDashboard, type DashboardComponentBreakdown, type DashboardUnitStatusBreakdown } from './readiness-dashboard.service';
import { computeReadinessAppActivity } from './readiness-app-activity.service';
import { computeInternalGap } from './readiness-command.util';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות בתצוגה זו.';

/** The one vertical this screen ever serves — readiness/fitness has no municipal or educational equivalent today. Any OTHER vertical (educational/municipal) is a real, granted role, just not one with access to THIS screen — denied, not an empty list (David's own distinction: "סירוב אומר 'אין לך גישה'"). */
const READINESS_VERTICAL = 'military';

export interface VerticalBrigadeRow {
  tenantId: string;
  tenantName: string;
  totalCount: number;
  passCount: number;
  /** 06.10.2026 (command-screen round) — added alongside passCount so a brigade card can render the full 3-segment bar (כשיר/לא כשיר/טרם נבדק), the same breakdown DashboardOverallBreakdown/DashboardUnitStatusBreakdown already carry at the brigade/unit level. */
  failCount: number;
  notPerformedCount: number;
  notYetTestedCount: number;
  testedCount: number;
  /** null exactly when testedCount is 0 — "not yet tested," never a fabricated 0%. Same meaning as DashboardOverallBreakdown.passPercent. */
  passPercent: number | null;
  /** totalCount > 0 — false means this brigade has never entered a single soldier. Distinct from passPercent===null (which can also happen WITH soldiers, zero of them tested). */
  hasData: boolean;
  /** 06.10.2026 — same field every other brigade-icon consumer in this codebase already reads (units/page.tsx's own org cards); null for the ~58% of brigades with no real icon, same as everywhere else — UnitIconBadge's hash-derived fallback handles that, not a gap introduced here. */
  logoUrl: string | null;
  /**
   * 06.10.2026 (command-screen round) — this brigade's training-derived
   * overall (readiness-training-status.service.ts via
   * computeBrigadeDashboard, never recomputed here), and its per-component
   * breakdown (ריצה/מתח/מקבילים), reused verbatim from computeBrigadeDashboard
   * — not duplicated, not recalculated.
   */
  trainingOverall: DashboardUnitStatusBreakdown;
  components: DashboardComponentBreakdown[];
  nearThresholdCount: number;
  /** 07.10.2026 (command-screen round) — reused verbatim from computeBrigadeDashboard's own field of the same name, not recomputed. */
  notYetTestedButTrainingPassingCount: number;
  /** From computeReadinessAppActivity, same synthetic-tenantOwner-scope reuse as the dashboard numbers above — not a second calculation of anything dashboard-related, a genuinely separate metric (app-engagement, not readiness status). */
  appActivity: { totalCount: number; linkedCount: number; activeCount: number; activePercent: number | null };
  /**
   * 06.10.2026 (command-screen round, insight card 2 — "הפער הגדול
   * ביותר בין גדודים") — the spread among this brigade's OWN direct-
   * child units (battalions), computed via computeInternalGap from the
   * SAME `units` array computeBrigadeDashboard already returned for
   * this tenant — zero extra reads. Null when fewer than 2 battalions
   * meet the sample floor with a determinable passPercent.
   */
  unitPassPercentGap: number | null;
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

  // 06.10.2026 (David's explicit review) — root sees at least as much as
  // a chief fitness officer everywhere else in this codebase (every
  // other admin/* screen); blocking it from this one read-only list
  // screen only forces root to hold a second account. Not a bypass of
  // anything below — root simply gets the SAME final row set a real
  // vertical grant already gets (every military_unit tenant), computed
  // the SAME way (inScopeIds === null means "don't filter," never "skip
  // the military_unit type check" — that re-filter stays unconditional
  // for every caller, root included).
  const isRoot = scope.kind === 'root';

  // Allowlist, not a denylist — every kind other than root or a real
  // military 'vertical' grant is refused, including tenantOwner/
  // unitAdmin/denied. This screen has exactly two doors now, not one.
  if (!isRoot && (scope.kind !== 'vertical' || scope.vertical !== READINESS_VERTICAL)) {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  // null (root) = no filtering: every military_unit tenant qualifies.
  // Otherwise (a real vertical grant) intersect with scope.authorityIds,
  // same as before this change — defensive even though that set is
  // already every military_unit tenant as of today's single vertical.
  const inScopeIds = scope.kind === 'vertical' ? new Set(scope.authorityIds) : null;

  // Defensive re-filter to military_unit specifically — never trust
  // scope.authorityIds' own upstream filtering alone as the ONLY thing
  // keeping a municipal/educational authority out of this list. Also
  // what makes a tenant NOT in scope.authorityIds (a vertical admin for
  // a DIFFERENT military sub-population, if that ever exists) correctly
  // absent, since the intersection below requires both. Unconditional
  // for root too — root gets "every MILITARY tenant," never "every
  // tenant of any type."
  const authoritiesSnap = await db.collection('authorities').where('type', '==', 'military_unit').get();
  const militaryAuthorities = authoritiesSnap.docs
    .filter((d) => inScopeIds === null || inScopeIds.has(d.id))
    .map((d) => ({
      id: d.id,
      name: typeof d.data().name === 'string' ? (d.data().name as string) : d.id,
      logoUrl: typeof d.data().logoUrl === 'string' ? (d.data().logoUrl as string) : null,
    }));

  // 06.10.2026 (David's explicit review) — this literal is a scope
  // object the function manufactures FOR ITSELF, not one any caller
  // provided — worth stating plainly why that's safe, not just doing it.
  // (a) It is constructed INLINE, as an argument expression, passed
  //     directly into this one `await computeBrigadeDashboard(...)`
  //     call — never assigned to a variable with any lifetime beyond
  //     this expression, never returned (VerticalOverviewResult's body
  //     only ever contains the plain tenantId STRING + numbers below,
  //     confirmed by that type), never stored (this file has no
  //     module-level `let`/cache of any kind — confirmed, there is
  //     nothing here for it to leak INTO).
  // (b) It cannot elevate a LATER, real request either: every readiness
  //     route (including this one and computeBrigadeDashboard's own
  //     real route) calls resolveUnitPermissionScope(uid) fresh, from
  //     Firestore, on every single HTTP request — there is no
  //     scope-caching layer anywhere in this codebase (confirmed by
  //     grep). A vertical officer who clicks a row here and lands on
  //     the real dashboard page triggers a BRAND NEW request that
  //     re-resolves their REAL 'vertical' scope from scratch; nothing
  //     carries this function's synthetic tenantOwner forward into it.
  // Safe specifically BECAUSE authorization for `id` already happened
  // above (the military_unit ∩ scope.authorityIds intersection) — this
  // is "I already proved I may read this one tenant's numbers, now let
  // me read them" using the exact function every real tenantOwner's own
  // dashboard uses, not a bypass of anything.
  // 06.10.2026 (command-screen round) — 49 brigades is not 49 serial
  // round-trips: every brigade's two reads (dashboard + app-activity) are
  // fired together, and all 49 brigades run concurrently via the outer
  // Promise.all — one wide fan-out, not a chain. Each individual call is
  // already scoped to a single tenantId (a handful of `where('tenantId',
  // '==', id)` reads), so total load is ~49× that handful, all in flight
  // at once, never 49 sequential round-trips.
  const EMPTY_BREAKDOWN: DashboardUnitStatusBreakdown = { passCount: 0, failCount: 0, notPerformedCount: 0, notYetTestedCount: 0, testedCount: 0, passPercent: null };
  const rows = await Promise.all(
    militaryAuthorities.map(async ({ id, name, logoUrl }): Promise<VerticalBrigadeRow> => {
      const [dashboardResult, appActivityResult] = await Promise.all([
        computeBrigadeDashboard(db, { kind: 'tenantOwner', tenantId: id }, {}),
        computeReadinessAppActivity(db, { kind: 'tenantOwner', tenantId: id }, {}),
      ]);
      const appActivity = appActivityResult.status === 200
        ? { totalCount: appActivityResult.body.totalCount, linkedCount: appActivityResult.body.linkedCount, activeCount: appActivityResult.body.activeCount, activePercent: appActivityResult.body.activePercent }
        : { totalCount: 0, linkedCount: 0, activeCount: 0, activePercent: null };
      if (dashboardResult.status !== 200) {
        // computeBrigadeDashboard only returns non-200 for 'unknown'/'denied'
        // scope kinds or a missing tenantId — none of which apply to the
        // synthetic tenantOwner scope constructed above. Treated as "no
        // data yet" rather than silently dropping the row.
        return {
          tenantId: id, tenantName: name, totalCount: 0, passCount: 0, failCount: 0, notPerformedCount: 0,
          notYetTestedCount: 0, testedCount: 0, passPercent: null, hasData: false, logoUrl,
          trainingOverall: EMPTY_BREAKDOWN, components: [], nearThresholdCount: 0, appActivity, unitPassPercentGap: null,
          notYetTestedButTrainingPassingCount: 0,
        };
      }
      const { overall, trainingOverall, components, units, nearThresholdCount, notYetTestedButTrainingPassingCount } = dashboardResult.body;
      // Direct children (top-level units = battalions) ONLY — deliberately
      // not every unit anywhere under this brigade. See computeInternalGap's
      // own docstring before changing this to a full-depth filter.
      const topLevelUnits = units.filter((u) => u.parentUnitId === null);
      const unitPassPercentGap = computeInternalGap(topLevelUnits.map((u) => ({ testedCount: u.views.all.testedCount, passPercent: u.views.all.passPercent })));
      return {
        tenantId: id,
        tenantName: name,
        totalCount: overall.totalCount,
        passCount: overall.passCount,
        failCount: overall.failCount,
        notPerformedCount: overall.notPerformedCount,
        notYetTestedCount: overall.notYetTestedCount,
        testedCount: overall.testedCount,
        passPercent: overall.passPercent,
        hasData: overall.totalCount > 0,
        logoUrl,
        trainingOverall,
        notYetTestedButTrainingPassingCount,
        unitPassPercentGap,
        components,
        nearThresholdCount,
        appActivity,
      };
    }),
  );

  return { status: 200, body: { rows } };
}

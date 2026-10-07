'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import { Loader2 } from 'lucide-react';
import { useUserRole } from '@/features/admin/services/auth.service';
import { getTenantLabels } from '@/features/admin/config/tenantLabels';
import CommandHeaderStrip from '@/features/admin/components/readiness-command/CommandHeaderStrip';
import type { VerticalBrigadeRow } from '@/features/readiness/core/services/readiness-vertical-overview.service';
import type { DashboardUnitRow, DashboardComponentBreakdown, DashboardUnitStatusBreakdown } from '@/features/readiness/core/services/readiness-dashboard.service';
import type { AppActivityUnitBreakdown } from '@/features/readiness/core/services/readiness-app-activity.service';
import {
  sortCommandRows,
  pickMostFit,
  pickBiggestGap,
  pickMostNearThreshold,
  computeInternalGap,
  singleComponentBreakdown,
  DEFAULT_SORT_KEY,
  DEFAULT_DIRECTION_BY_SORT_KEY,
  SAMPLE_FLOOR_DEFAULT,
  type CommandSortKey,
  type CommandSortDirection,
  type CommandRankableRow,
} from '@/features/readiness/core/services/readiness-command.util';
import CommandSummaryStrip from '@/features/admin/components/readiness-command/CommandSummaryStrip';
import CommandFilterBar from '@/features/admin/components/readiness-command/CommandFilterBar';
import CommandInsightCards from '@/features/admin/components/readiness-command/CommandInsightCards';
import CommandEntityCard from '@/features/admin/components/readiness-command/CommandEntityCard';

const LEVEL_LABEL_BY_UNIT_LEVEL: Record<string, string> = { battalion: 'גדודים', company: 'פלוגות', platoon: 'מחלקות' };

/**
 * 07.10.2026 (David) — role label for the header strip's "ברוך שובך"
 * line. tenant_owner/unit_admin labels are the EXISTING military-vertical
 * terms (tenantLabels.ts, already used by InviteMemberModal) — reused,
 * not reinvented. root/readiness_chief_officer have no established label
 * anywhere in this codebase (confirmed by search) — these two strings
 * are new wording for this round, flagged in the build report.
 */
function resolveViewerRoleLabel(roleInfo: { isRootAdmin: boolean; isReadinessChiefOfficer: boolean; isTenantOwner: boolean; isUnitAdmin: boolean } | null): string {
  if (!roleInfo) return '';
  const militaryLabels = getTenantLabels('military');
  if (roleInfo.isRootAdmin) return 'מנהל מערכת';
  if (roleInfo.isReadinessChiefOfficer) return 'קצין כושר ראשי';
  if (roleInfo.isTenantOwner) return militaryLabels.tenantOwnerRoleLabel ?? 'קצין כושר קרבי חטיבתי';
  if (roleInfo.isUnitAdmin) return militaryLabels.unitAdminRoleLabel ?? 'מדא״ג גדודי';
  return '';
}

interface DisplayRow extends CommandRankableRow {
  name: string;
  bigBreakdown: DashboardUnitStatusBreakdown;
  trainingBreakdown: DashboardUnitStatusBreakdown;
  componentPercents: { testId: string; label: string; passPercent: number | null }[];
  /** Present only for level-1+ rows (real units) — the raw unit, used to resolve children on drill. Null for level-0 (brigade) rows, which drill via tenantId instead. */
  rawUnit: DashboardUnitRow | null;
  /**
   * 07.10.2026 (David) — brigade's own authorities.logoUrl, same field
   * the old selector already read. Null for level-1+ (battalion/
   * company) rows — those live on a DIFFERENT field (tenants/{t}/units/{u}.iconUrl),
   * not fetched this round; UnitIconBadge's own fallback (hash-colored
   * badge) renders for them exactly as it would for any null iconUrl.
   */
  logoUrl: string | null;
}

const EMPTY_BREAKDOWN: DashboardUnitStatusBreakdown = { passCount: 0, failCount: 0, notPerformedCount: 0, notYetTestedCount: 0, testedCount: 0, passPercent: null };

function resolveComponentBreakdown(
  component: string,
  totalCount: number,
  official: DashboardUnitStatusBreakdown,
  training: DashboardUnitStatusBreakdown,
  componentsList: DashboardComponentBreakdown[],
): { big: DashboardUnitStatusBreakdown; training: DashboardUnitStatusBreakdown } {
  if (component === 'all') return { big: official, training };
  const c = componentsList.find((x) => x.testId === component);
  if (!c) return { big: EMPTY_BREAKDOWN, training: EMPTY_BREAKDOWN };
  return {
    big: singleComponentBreakdown(totalCount, c),
    training: singleComponentBreakdown(totalCount, { passCount: c.trainingPassCount, failCount: c.trainingFailCount, testedCount: c.trainingTestedCount, passPercent: c.trainingPassPercent }),
  };
}

function brigadeRowToDisplay(row: VerticalBrigadeRow, component: string): DisplayRow {
  const official: DashboardUnitStatusBreakdown = {
    passCount: row.passCount, failCount: row.failCount, notPerformedCount: row.notPerformedCount,
    notYetTestedCount: row.notYetTestedCount, testedCount: row.testedCount, passPercent: row.passPercent,
  };
  const resolved = resolveComponentBreakdown(component, row.totalCount, official, row.trainingOverall, row.components);
  return {
    id: row.tenantId, name: row.tenantName, hasData: row.hasData, totalCount: row.totalCount,
    testedCount: row.testedCount, passPercent: resolved.big.passPercent, nearThresholdCount: row.nearThresholdCount,
    appActiveCount: row.appActivity.activeCount, gap: row.unitPassPercentGap,
    bigBreakdown: resolved.big, trainingBreakdown: resolved.training,
    componentPercents: row.components.map((c) => ({ testId: c.testId, label: c.label, passPercent: c.passPercent })),
    rawUnit: null,
    logoUrl: row.logoUrl,
  };
}

function unitRowToDisplay(row: DashboardUnitRow, tenantComponents: DashboardComponentBreakdown[], appActiveCount: number, gap: number | null, component: string): DisplayRow {
  // Labels/unit/thresholds come from the tenant-wide components list (the
  // real test definitions) — row.perComponent only carries this unit's
  // OWN numbers, keyed by testId, with no label of its own.
  const componentsList: DashboardComponentBreakdown[] = tenantComponents.map((tc) => {
    const unitComp = row.perComponent[tc.testId] ?? { passCount: 0, failCount: 0, testedCount: 0, passPercent: null, trainingPassCount: 0, trainingFailCount: 0, trainingTestedCount: 0, trainingPassPercent: null };
    return { testId: tc.testId, label: tc.label, unit: tc.unit, thresholdMale: tc.thresholdMale, thresholdFemale: tc.thresholdFemale, ...unitComp };
  });
  const resolved = resolveComponentBreakdown(component, row.totalCount, row.views.all, row.trainingOverall, componentsList);
  const hasData = row.totalCount > 0;
  return {
    id: row.unitId, name: row.unitName, hasData, totalCount: row.totalCount,
    testedCount: row.views.all.testedCount, passPercent: resolved.big.passPercent, nearThresholdCount: row.nearThresholdCount,
    appActiveCount, gap,
    bigBreakdown: resolved.big, trainingBreakdown: resolved.training,
    componentPercents: componentsList.map((c) => ({ testId: c.testId, label: c.label, passPercent: c.passPercent })),
    rawUnit: row,
    logoUrl: null,
  };
}

async function authedFetch(path: string): Promise<{ status: number; body: any }> {
  const user = auth.currentUser;
  if (!user) return { status: 401, body: { error: 'לא מחובר' } };
  const token = await user.getIdToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/**
 * "מסך הפיקוד" — 06.10.2026. ONE screen for all 3 drill levels
 * (brigades / battalions / companies), per David's explicit "אותם
 * רכיבים, אותם כללים, אותה שפה. לא מסך חדש לכל רמה." State (level,
 * sort, direction, component, search, onlyWithData) lives entirely in
 * the URL — never localStorage — so a link is shareable and opens in
 * the exact same state.
 *
 * Level detection: no tenantId in the URL → try the brigade-scoped
 * dashboard route with no tenantId. A 400 ("tenantId is required")
 * means this caller has no own brigade (vertical/root) → render level
 * 0 (vertical-overview, one row per brigade). A 200 means the caller
 * IS a brigade officer (tenantOwner/unitAdmin), auto-resolved server-
 * side to their own tenant — render level 1 directly, no brigade-
 * picker ever shown to them, matching "קצין חטיבה: רואה את שלו בלבד,
 * אותו מסך."
 */
export default function ReadinessVerticalOverviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { roleInfo: viewerRoleInfo } = useUserRole();

  // David, verbatim: "לעולם לא 'ברוך שובך david.shachar'" — core.name is
  // ONLY treated as a real name when it's present AND distinguishable
  // from the same crude email-prefix fallback accept-invitation/route.ts
  // writes when nothing better is known. Indistinguishable from that
  // fallback → show the role alone, never a fabricated-looking greeting.
  const viewerEmailPrefix = viewerRoleInfo?.email?.split('@')[0] ?? null;
  const viewerRealName = viewerRoleInfo?.name && viewerRoleInfo.name !== viewerEmailPrefix ? viewerRoleInfo.name : null;
  const viewerRoleLabel = resolveViewerRoleLabel(viewerRoleInfo);

  const urlTenantId = searchParams.get('tenantId');
  const urlUnitId = searchParams.get('unitId');
  const sortKey = (searchParams.get('sort') as CommandSortKey) || DEFAULT_SORT_KEY;
  const direction = (searchParams.get('dir') as CommandSortDirection) || DEFAULT_DIRECTION_BY_SORT_KEY[sortKey];
  const component = searchParams.get('component') || 'all';
  const onlyWithData = searchParams.get('onlyWithData') === 'true';
  const search = searchParams.get('q') || '';

  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Whether THIS caller has a level 0 at all — true for root/vertical,
  // false for a real brigade officer (tenantOwner/unitAdmin). Tracked
  // separately from brigadeRows (which resets to null on every drill)
  // so the breadcrumb stays correct no matter how deep the current drill is.
  const [hasLevelZero, setHasLevelZero] = useState<boolean | null>(null);
  // 07.10.2026 (David — direct-link fix) — the brigade's own display
  // name, from computeBrigadeDashboard's own tenantName field (added
  // specifically for this). Loaded on EVERY fetch into a tenant, not
  // just on a level-0 click-through — a shared link with ?tenantId=X
  // must show the real name, never the raw id, or it reads as broken.
  const [brigadeName, setBrigadeName] = useState<string | null>(null);
  // Level 0 data
  const [brigadeRows, setBrigadeRows] = useState<VerticalBrigadeRow[] | null>(null);
  // Level 1+ data — the FULL tree for the resolved tenant, fetched once per tenant, filtered client-side by parentUnitId for the current drill depth.
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(null);
  const [tenantOverall, setTenantOverall] = useState<{ overall: DashboardUnitStatusBreakdown; trainingOverall: DashboardUnitStatusBreakdown; components: DashboardComponentBreakdown[]; nearThresholdCount: number } | null>(null);
  const [unitRows, setUnitRows] = useState<DashboardUnitRow[] | null>(null);
  const [appActivityByUnit, setAppActivityByUnit] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => setAuthReady(true));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        // Always probe the no-tenantId dashboard call FIRST, even when
        // urlTenantId is already explicit (e.g. a bookmarked/shared
        // link) — this is the ONLY way to learn whether THIS caller has
        // a level 0 at all (400 = vertical/root, no own tenant; 200 =
        // a real brigade officer, auto-resolved to their own tenant),
        // independent of which tenant is currently being viewed. Needed
        // for the breadcrumb: a tenant_owner must never see "כל החטיבות"
        // as a clickable link back to a screen they're 403'd from.
        const probe = await authedFetch('/api/units/readiness/dashboard');
        if (cancelled) return;
        const callerHasLevelZero = probe.status === 400;
        setHasLevelZero(callerHasLevelZero);
        const ownTenantId: string | null = probe.status === 200 ? (probe.body.tenantId as string) : null;
        const effectiveTenantId = urlTenantId ?? ownTenantId;

        if (!effectiveTenantId) {
          if (!callerHasLevelZero) throw new Error(probe.body?.error ?? `שגיאה בטעינה (${probe.status})`);
          const overview = await authedFetch('/api/units/readiness/vertical-overview');
          if (cancelled) return;
          if (overview.status !== 200) throw new Error(overview.body?.error ?? `שגיאה בטעינה (${overview.status})`);
          setBrigadeRows(overview.body.rows ?? []);
          setResolvedTenantId(null);
          setBrigadeName(null);
          setUnitRows(null);
          return;
        }

        // A concrete tenant to show — either explicit from the URL, or
        // this caller's own. Reuse the probe's own body when it already
        // IS that tenant (own-tenant, no explicit override) instead of
        // a redundant second call for the same data.
        const [dashboard, activity] = await Promise.all([
          (!urlTenantId && ownTenantId) ? Promise.resolve(probe) : authedFetch(`/api/units/readiness/dashboard?tenantId=${effectiveTenantId}`),
          authedFetch(`/api/units/readiness/app-activity?tenantId=${effectiveTenantId}`),
        ]);
        if (cancelled) return;
        if (dashboard.status !== 200) throw new Error(dashboard.body?.error ?? `שגיאה בטעינה (${dashboard.status})`);
        setBrigadeRows(null);
        setResolvedTenantId(dashboard.body.tenantId);
        setBrigadeName(dashboard.body.tenantName ?? null);
        setTenantOverall({ overall: dashboard.body.overall, trainingOverall: dashboard.body.trainingOverall, components: dashboard.body.components, nearThresholdCount: dashboard.body.nearThresholdCount });
        setUnitRows(dashboard.body.units ?? []);
        setAppActivityByUnit(new Map((activity.status === 200 ? activity.body.units ?? [] : []).map((u: AppActivityUnitBreakdown) => [u.unitId, u.activeCount])));
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message ?? 'שגיאה בטעינת המסך.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authReady, urlTenantId]);

  const pushState = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.push(`/admin/authority/readiness/vertical-overview?${next.toString()}`);
  }, [router, searchParams]);

  const isLevel0 = !resolvedTenantId;
  const currentUnit = useMemo(() => (unitRows && urlUnitId ? unitRows.find((u) => u.unitId === urlUnitId) ?? null : null), [unitRows, urlUnitId]);

  // The rows to display at the current depth, mapped to the shared DisplayRow shape.
  const displayRows: DisplayRow[] = useMemo(() => {
    if (isLevel0) {
      return (brigadeRows ?? []).map((r) => brigadeRowToDisplay(r, component));
    }
    if (!unitRows || !tenantOverall) return [];
    const parentId = urlUnitId ?? null;
    const children = unitRows.filter((u) => u.parentUnitId === parentId);
    return children.map((u) => {
      // u's DIRECT children only (one level down) — deliberately not a
      // full-depth walk. See computeInternalGap's own docstring.
      const own = unitRows.filter((x) => x.parentUnitId === u.unitId);
      const gap = computeInternalGap(own.map((c) => ({ testedCount: c.views.all.testedCount, passPercent: c.views.all.passPercent })));
      return unitRowToDisplay(u, tenantOverall.components, appActivityByUnit.get(u.unitId) ?? 0, gap, component);
    });
  }, [isLevel0, brigadeRows, unitRows, tenantOverall, urlUnitId, appActivityByUnit, component]);

  const searchFiltered = useMemo(() => {
    if (!search.trim()) return displayRows;
    const q = search.trim().toLowerCase();
    return displayRows.filter((r) => r.name.toLowerCase().includes(q));
  }, [displayRows, search]);

  const dataFiltered = onlyWithData ? searchFiltered.filter((r) => r.hasData) : searchFiltered;
  const sortedRows = useMemo(() => sortCommandRows(dataFiltered, sortKey, direction), [dataFiltered, sortKey, direction]);

  const entityLabel = isLevel0
    ? 'חטיבות'
    : (() => {
        const levels = unitRows ? Array.from(new Set((unitRows.filter((u) => u.parentUnitId === (urlUnitId ?? null))).map((u) => u.level).filter(Boolean))) : [];
        return levels.length === 1 && levels[0] ? (LEVEL_LABEL_BY_UNIT_LEVEL[levels[0] as string] ?? 'יחידות') : 'יחידות';
      })();

  // Summary strip + insight cards are always computed over the FULL
  // unfiltered set at this level, never dataFiltered — David: the "X
  // מתוך 49" line is "תמיד גלוי," a fixed fact about the level, not a
  // response to the search box or the "only with data" toggle. Only
  // the grid below (sortedRows) respects those two filters.
  const mostFit = pickMostFit(displayRows.filter((r) => r.hasData), SAMPLE_FLOOR_DEFAULT);
  const biggestGap = pickBiggestGap(displayRows.filter((r) => r.hasData));
  const mostNearThreshold = pickMostNearThreshold(displayRows.filter((r) => r.hasData), SAMPLE_FLOOR_DEFAULT);

  const totalSoldiers = displayRows.reduce((sum, r) => sum + r.totalCount, 0);
  const totalAppActive = displayRows.reduce((sum, r) => sum + r.appActiveCount, 0);
  const testedSum = displayRows.reduce((sum, r) => sum + r.testedCount, 0);
  const notYetTestedSum = displayRows.reduce((sum, r) => sum + Math.max(0, r.totalCount - r.testedCount), 0);
  const passSum = displayRows.reduce((sum, r) => sum + (r.passPercent !== null ? r.passPercent * r.testedCount / 100 : 0), 0);
  const averagePassPercent = testedSum > 0 ? Math.round((passSum / testedSum) * 1000) / 10 : null;
  const withDataCount = displayRows.filter((r) => r.hasData).length;

  const drillInto = (row: DisplayRow) => {
    if (isLevel0) { pushState({ tenantId: row.id, unitId: null }); return; }
    pushState({ unitId: row.id });
  };

  const breadcrumbItems = useMemo(() => {
    const items: { label: string; href?: string }[] = [{ label: 'כשירות', href: '/admin/dashboard' }];
    if (isLevel0) { items.push({ label: 'כל החטיבות' }); return items; }
    // Only a caller that actually HAS a level 0 (root/vertical) sees
    // this crumb at all — a real brigade officer (tenantOwner/unitAdmin)
    // would just get 403 from that screen, so it's omitted entirely for
    // them rather than shown as a dead, unclickable label.
    if (hasLevelZero === true) items.push({ label: 'כל החטיבות', href: '/admin/authority/readiness/vertical-overview' });
    const brigadeLabel = brigadeName ?? resolvedTenantId;
    items.push({ label: brigadeLabel ?? '', href: urlUnitId ? `/admin/authority/readiness/vertical-overview?tenantId=${resolvedTenantId}` : undefined });
    // Walk the REAL ancestor chain (parentUnitId, from the already-loaded
    // full tree) rather than showing only the immediate unit — correct
    // at any drill depth, not just 2 levels (brigade→battalion), with
    // every intermediate crumb clickable since we have its real unitId.
    if (currentUnit && unitRows) {
      const ancestors: DashboardUnitRow[] = [];
      let cur: DashboardUnitRow | undefined = currentUnit;
      while (cur?.parentUnitId) {
        const parent = unitRows.find((u) => u.unitId === cur!.parentUnitId);
        if (!parent) break;
        ancestors.unshift(parent);
        cur = parent;
      }
      for (const a of ancestors) items.push({ label: a.unitName, href: `/admin/authority/readiness/vertical-overview?tenantId=${resolvedTenantId}&unitId=${a.unitId}` });
      items.push({ label: currentUnit.unitName });
    }
    return items;
  }, [isLevel0, hasLevelZero, brigadeName, resolvedTenantId, urlUnitId, currentUnit, unitRows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div dir="rtl" className="max-w-3xl mx-auto px-4 pt-6">
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-sm text-red-700 font-semibold">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    // 07.10.2026 (David) — sand background for the military panel, scoped
    // to this screen only (not a layout-level change — this round touches
    // this ONE screen, not the admin shell); READINESS_COLORS (pass/fail/
    // not-tested/not-performed) are untouched everywhere — "הם נושאים משמעות."
    // A plain contained block, not an edge-to-edge bleed — this screen's
    // parent padding/margin isn't something this round can verify
    // without a live browser (no npm run dev), so no negative-margin
    // trick against an unknown shell; the conservative choice.
    <div dir="rtl" className="rounded-2xl p-4" style={{ backgroundColor: '#FAF6EF' }}>
      <div className="space-y-4 pb-8 max-w-7xl mx-auto">
        {/* 07.10.2026 (David) — dark header strip at the very top of the screen. */}
        <CommandHeaderStrip
          userName={viewerRealName}
          userRoleLabel={viewerRoleLabel}
          screenName={`מסך הפיקוד — ${entityLabel}`}
          screenDescription="תמונת מצב משווה. לחיצה על כרטיס נכנסת לרמה הבאה."
        />
        <AdminBreadcrumb items={breadcrumbItems} />

        {/* 07.10.2026 (David) — filter row ABOVE the summary strip; was reversed. */}
      <CommandFilterBar
        sortKey={sortKey}
        direction={direction}
        onSortChange={(key) => pushState({ sort: key, dir: DEFAULT_DIRECTION_BY_SORT_KEY[key] })}
        onDirectionToggle={() => pushState({ dir: direction === 'asc' ? 'desc' : 'asc' })}
        component={component}
        onComponentChange={(c) => pushState({ component: c === 'all' ? null : c })}
        onlyWithData={onlyWithData}
        onOnlyWithDataChange={(v) => pushState({ onlyWithData: v ? 'true' : null })}
        search={search}
        onSearchChange={(v) => pushState({ q: v || null })}
      />

      <CommandSummaryStrip
        entityLabel={entityLabel}
        entityCount={dataFiltered.length}
        totalSoldiers={totalSoldiers}
        testedSoldiers={testedSum}
        averagePassPercent={averagePassPercent}
        appActiveCount={totalAppActive}
        notYetTestedCount={notYetTestedSum}
        entityWithDataCount={withDataCount}
        entityTotalAtThisLevel={displayRows.length}
      />

      <CommandInsightCards entityLabel={entityLabel} mostFit={mostFit && { name: mostFit.row.name, value: mostFit.value, unit: '%' }} biggestGap={biggestGap && { name: biggestGap.row.name, value: biggestGap.value, unit: '%' }} mostNearThreshold={mostNearThreshold && { name: mostNearThreshold.row.name, value: mostNearThreshold.value, unit: '' }} />

      {sortedRows.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-sm text-gray-400">{displayRows.length === 0 ? 'אין תת-יחידות מתחת לרמה הזו.' : 'אין תוצאות לסינון הנוכחי.'}</p>
        </div>
      ) : (
        // 07.10.2026 (David) — three cards per row, never four.
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedRows.map((row) => (
            <CommandEntityCard
              key={row.id}
              id={row.id}
              name={row.name}
              logoUrl={row.logoUrl}
              hasData={row.hasData}
              totalCount={row.totalCount}
              testedCount={row.testedCount}
              bigBreakdown={row.bigBreakdown}
              trainingBreakdown={row.trainingBreakdown}
              componentPercents={row.componentPercents}
              appActiveCount={row.appActiveCount}
              onClick={() => drillInto(row)}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

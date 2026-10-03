'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import type {
  DashboardUnitRow,
  DashboardComponentBreakdown,
  DashboardUnitViewKey,
  DashboardUnitStatusBreakdown,
} from '@/features/readiness/core/services/readiness-dashboard.service';
import { READINESS_COLORS } from './colors';

/**
 * Point 3: a unit with zero tested soldiers shows "טרם נבדקה" — never
 * "0%", which would read as total failure instead of absent data.
 * Point 4: every row's own last-update date is always visible — two
 * units reading the same percentage from different months are not
 * equivalent, even with the same number.
 *
 * 03.10.2026 (table visual-continuation round) — a filter above the
 * table (הכל/ריצה/כוח) re-slices the SAME per-unit data David already
 * has (`views`, computed server-side in readiness-dashboard.service.ts
 * — "כוח" = pullups AND dips both pass, same all-must-pass rule, no
 * averaging). The filter drives the "כשירות כוללת" column, the new
 * "תמונת מצב" status bar, the "נבדקו" coverage column, and the sort —
 * all four always read the SAME `views[filter]` object for a row, so
 * the bar and the percent beside it can never show two different
 * states. Per-component columns (one per test) are NOT filter-reactive
 * — they're inherently single-test breakdowns already, untouched by
 * which combined view is selected.
 *
 * 03.10.2026 (Stage 6, unit-hierarchy round) — grouped by the real tree
 * (`parentUnitId`, resolved server-side via unitDirectory, §13.76-78).
 *
 * 03.10.2026 (Stage 7 correction, David, verbatim) — "הקינון בטבלה הוא
 * העץ שהקצין רואה במבט אחד, והוא נבנה בכוונה... אל תחליף אחד בשני":
 * TWO independent click targets on the SAME row, never one replacing
 * the other — the chevron expands/collapses in place (nested rows,
 * exactly like the original Stage 6 build), and the unit NAME
 * specifically navigates to that unit's own detail page
 * (/admin/authority/readiness/unit/{unitId}). No other part of the row
 * is clickable.
 */
const FILTER_OPTIONS: { key: DashboardUnitViewKey; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'run', label: 'ריצה' },
  { key: 'strength', label: 'כוח' },
];

function UnitStatusBar({ breakdown, totalCount }: { breakdown: DashboardUnitStatusBreakdown; totalCount: number }) {
  // Rule 3, unchanged from the previous round: nobody evaluated under
  // this view at all — solid grey, no split between the categories,
  // no percentage anywhere near it.
  if (breakdown.testedCount === 0 && breakdown.notPerformedCount === 0) {
    return <div className="h-2 rounded-full w-full" style={{ backgroundColor: READINESS_COLORS.notYetTested }} />;
  }
  const denom = totalCount || 1;
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 w-full">
      <div style={{ width: `${(breakdown.passCount / denom) * 100}%`, backgroundColor: READINESS_COLORS.pass }} />
      <div style={{ width: `${(breakdown.failCount / denom) * 100}%`, backgroundColor: READINESS_COLORS.fail }} />
      <div style={{ width: `${(breakdown.notYetTestedCount / denom) * 100}%`, backgroundColor: READINESS_COLORS.notYetTested }} />
      <div style={{ width: `${(breakdown.notPerformedCount / denom) * 100}%`, backgroundColor: READINESS_COLORS.notPerformed }} />
    </div>
  );
}

function PassPercentCell({ breakdown }: { breakdown: DashboardUnitStatusBreakdown }) {
  if (breakdown.passPercent === null) {
    return <span className="text-[11px] text-slate-400 font-bold">טרם נבדקה</span>;
  }
  return (
    <div>
      <span className="text-sm font-bold text-slate-800">{breakdown.passPercent}%</span>
      <span className="text-[10px] text-slate-400 block">{breakdown.passCount} מתוך {breakdown.testedCount}</span>
    </div>
  );
}

function ComponentPercentCell({ percent, tested }: { percent: number | null; tested: number }) {
  if (percent === null) return <span className="text-[11px] text-slate-400 font-bold">טרם נבדקה</span>;
  return (
    <div>
      <span className="text-sm font-bold text-slate-800">{percent}%</span>
      <span className="text-[10px] text-slate-400 block">מתוך {tested} שנבדקו</span>
    </div>
  );
}

/** Worst-first by pass rate under the active view — units with no data (null) sort after every unit with a real number, since they aren't comparable to one. Shared by the top level and every nested group so ordering is consistent throughout the tree. */
function compareByFilteredPassPercent(a: DashboardUnitRow, b: DashboardUnitRow, filter: DashboardUnitViewKey): number {
  const pa = a.views[filter].passPercent;
  const pb = b.views[filter].passPercent;
  if (pa === null && pb === null) return a.unitName.localeCompare(b.unitName, 'he');
  if (pa === null) return 1;
  if (pb === null) return -1;
  if (pa !== pb) return pa - pb;
  return a.unitName.localeCompare(b.unitName, 'he');
}

interface UnitReadinessTableProps {
  units: DashboardUnitRow[];
  components: DashboardComponentBreakdown[];
}

export default function UnitReadinessTable({ units, components }: UnitReadinessTableProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<DashboardUnitViewKey>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { topLevel, childrenByParent } = useMemo(() => {
    const childMap = new Map<string, DashboardUnitRow[]>();
    const top: DashboardUnitRow[] = [];
    for (const u of units) {
      if (u.parentUnitId) {
        const list = childMap.get(u.parentUnitId) ?? [];
        list.push(u);
        childMap.set(u.parentUnitId, list);
      } else {
        top.push(u);
      }
    }
    top.sort((a, b) => compareByFilteredPassPercent(a, b, filter));
    for (const list of Array.from(childMap.values())) list.sort((a, b) => compareByFilteredPassPercent(a, b, filter));
    return { topLevel: top, childrenByParent: childMap };
  }, [units, filter]);

  const toggleExpanded = (unitId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const renderRow = (u: DashboardUnitRow, depth: number) => {
    const view = u.views[filter];
    const children = childrenByParent.get(u.unitId) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(u.unitId);
    return (
      <Fragment key={u.unitId}>
        <tr className="border-b border-slate-100 last:border-b-0">
          <td className="py-2.5 px-3 font-bold text-slate-800">
            <div className="flex items-center gap-1.5" style={{ paddingRight: depth * 16 }}>
              {hasChildren ? (
                <button
                  onClick={() => toggleExpanded(u.unitId)}
                  className="flex-shrink-0 text-slate-400 hover:text-slate-600"
                  aria-label={isExpanded ? 'כווץ' : 'הרחב'}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                </button>
              ) : (
                <span className="w-[14px] flex-shrink-0" />
              )}
              <button
                onClick={() => router.push(`/admin/authority/readiness/unit/${u.unitId}`)}
                className="text-right hover:text-lime-700 hover:underline transition-colors"
              >
                {u.unitName}
              </button>
            </div>
          </td>
          <td className="py-2.5 px-3 text-[11px] text-slate-500">{u.breadcrumb ?? '—'}</td>
          <td className="py-2.5 px-3 w-28">
            <UnitStatusBar breakdown={view} totalCount={u.totalCount} />
          </td>
          <td className="py-2.5 px-3"><PassPercentCell breakdown={view} /></td>
          <td className="py-2.5 px-3 text-slate-600">{view.testedCount} מתוך {u.totalCount}</td>
          {components.map((c) => {
            const cell = u.perComponent[c.testId];
            return (
              <td key={c.testId} className="py-2.5 px-3">
                <ComponentPercentCell percent={cell?.passPercent ?? null} tested={cell?.testedCount ?? 0} />
              </td>
            );
          })}
          <td className="py-2.5 px-3 text-[11px] text-slate-500">
            {u.lastTestDate ? new Date(u.lastTestDate).toLocaleDateString('he-IL') : '—'}
          </td>
        </tr>
        {hasChildren && isExpanded && children.map((child) => renderRow(child, depth + 1))}
      </Fragment>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-black text-gray-900">כשירות לפי יחידה</h3>
        <div className="flex items-center gap-1.5">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                filter === opt.key ? 'bg-lime-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
            <th className="text-right py-2 px-3">יחידה</th>
            <th className="text-right py-2 px-3">שייכות</th>
            <th className="text-right py-2 px-3">תמונת מצב</th>
            <th className="text-right py-2 px-3">כשירות כוללת</th>
            <th className="text-right py-2 px-3">נבדקו</th>
            {components.map((c) => <th key={c.testId} className="text-right py-2 px-3">{c.label}</th>)}
            <th className="text-right py-2 px-3">עודכן לאחרונה</th>
          </tr>
        </thead>
        <tbody>
          {topLevel.map((u) => renderRow(u, 0))}
        </tbody>
      </table>
      {units.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-8">אין יחידות להצגה.</p>
      )}
    </div>
  );
}

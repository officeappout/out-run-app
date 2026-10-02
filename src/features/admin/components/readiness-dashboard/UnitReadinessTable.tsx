'use client';

import type { DashboardUnitRow, DashboardComponentBreakdown } from '@/features/readiness/core/services/readiness-dashboard.service';

/**
 * Point 3: a unit with zero tested soldiers shows "טרם נבדקה" — never
 * "0%", which would read as total failure instead of absent data.
 * Point 4: every row's own last-update date is always visible — two
 * units reading the same percentage from different months are not
 * equivalent, even with the same number.
 *
 * Four distinct pieces of information per row, per the locked spec —
 * never conflated into one number: overall %, per-component %, how many
 * were tested out of how many (coverage — a SEPARATE column from the
 * percentages, since "72% pass" and "72% of the unit was even tested"
 * are different facts), and the update date.
 */
function PassPercentCell({ percent, tested }: { percent: number | null; tested: number }) {
  if (percent === null) {
    return <span className="text-[11px] text-slate-400 font-bold">טרם נבדקה</span>;
  }
  return (
    <div>
      <span className="text-sm font-bold text-slate-800">{percent}%</span>
      <span className="text-[10px] text-slate-400 block">מתוך {tested} שנבדקו</span>
    </div>
  );
}

interface UnitReadinessTableProps {
  units: DashboardUnitRow[];
  components: DashboardComponentBreakdown[];
}

export default function UnitReadinessTable({ units, components }: UnitReadinessTableProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 overflow-x-auto">
      <h3 className="text-base font-black text-gray-900 mb-4">כשירות לפי יחידה</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
            <th className="text-right py-2 px-3">יחידה</th>
            <th className="text-right py-2 px-3">נבדקו</th>
            <th className="text-right py-2 px-3">כשירות כוללת</th>
            {components.map((c) => <th key={c.testId} className="text-right py-2 px-3">{c.label}</th>)}
            <th className="text-right py-2 px-3">עודכן לאחרונה</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.unitId} className="border-b border-slate-100 last:border-b-0">
              <td className="py-2.5 px-3 font-bold text-slate-800">{u.unitName}</td>
              <td className="py-2.5 px-3 text-slate-600">{u.testedCount} מתוך {u.totalCount}</td>
              <td className="py-2.5 px-3"><PassPercentCell percent={u.overallPassPercent} tested={u.testedCount} /></td>
              {components.map((c) => {
                const cell = u.perComponent[c.testId];
                return (
                  <td key={c.testId} className="py-2.5 px-3">
                    <PassPercentCell percent={cell?.passPercent ?? null} tested={cell?.testedCount ?? 0} />
                  </td>
                );
              })}
              <td className="py-2.5 px-3 text-[11px] text-slate-500">
                {u.lastTestDate ? new Date(u.lastTestDate).toLocaleDateString('he-IL') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {units.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-8">אין יחידות להצגה.</p>
      )}
    </div>
  );
}

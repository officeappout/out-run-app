'use client';

import { useMemo } from 'react';
import type { UnitDetailSoldierRow } from '@/features/readiness/core/services/readiness-unit-detail.service';
import type { DashboardComponentBreakdown } from '@/features/readiness/core/services/readiness-dashboard.service';
import type { ReadinessCurrentStatus } from '@/features/readiness/core/services/readiness-write.service';
import { READINESS_COLORS } from '../readiness-dashboard/colors';

/**
 * This unit's OWN soldiers only (never descendants' — matches the
 * locked "each level counts only its own" rule). Sort order and the
 * status label/highlight logic are ALREADY computed server-side
 * (readiness-unit-detail.service.ts) — this component only renders and
 * client-side filters, never re-derives any of it.
 */
const FILTER_CHIPS: { key: 'all' | ReadinessCurrentStatus | 'near_threshold'; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'fail', label: 'לא כשיר' },
  { key: 'near_threshold', label: 'קרובים לסף' },
  { key: 'not_yet_tested', label: 'טרם נבדק' },
  { key: 'pass', label: 'כשיר' },
  { key: 'not_performed', label: 'פטור' },
];

function formatTestValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  if (unit === 'seconds') return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
  return String(value);
}

function statusTagColor(filterStatus: ReadinessCurrentStatus): string {
  if (filterStatus === 'pass') return READINESS_COLORS.pass;
  if (filterStatus === 'fail') return READINESS_COLORS.fail;
  if (filterStatus === 'not_performed') return READINESS_COLORS.notPerformed;
  return READINESS_COLORS.notYetTested;
}

type UnitDetailSoldiersFilter = 'all' | ReadinessCurrentStatus | 'near_threshold';

interface UnitDetailSoldiersTableProps {
  soldiers: UnitDetailSoldierRow[];
  components: DashboardComponentBreakdown[];
  /**
   * 04.10.2026 (§13.85) — lifted to the parent page so the new
   * "קרובים לסף" card (rendered above this table, outside it) can drive
   * the SAME filter state as these chips, not a second, disconnected
   * toggle.
   */
  filter: UnitDetailSoldiersFilter;
  onFilterChange: (filter: UnitDetailSoldiersFilter) => void;
}

export default function UnitDetailSoldiersTable({ soldiers, components, filter, onFilterChange }: UnitDetailSoldiersTableProps) {
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: soldiers.length };
    for (const s of soldiers) map[s.filterStatus] = (map[s.filterStatus] ?? 0) + 1;
    map.near_threshold = soldiers.filter((s) => s.nearThreshold.isNear).length;
    return map;
  }, [soldiers]);

  const visible = filter === 'all'
    ? soldiers
    : filter === 'near_threshold'
    ? soldiers.filter((s) => s.nearThreshold.isNear)
    : soldiers.filter((s) => s.filterStatus === filter);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => onFilterChange(chip.key)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                filter === chip.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {chip.label} · {counts[chip.key] ?? 0}
            </button>
          ))}
        </div>
        <h3 className="text-base font-black text-gray-900">חיילי היחידה · {soldiers.length}</h3>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-slate-400 font-bold border-b border-slate-200">
            <th className="text-right py-2 px-3 w-10">#</th>
            <th className="text-right py-2 px-3">שם</th>
            {components.map((c) => <th key={c.testId} className="text-right py-2 px-3">{c.label}</th>)}
            <th className="text-right py-2 px-3">תאריך בוחן</th>
            <th className="text-right py-2 px-3">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((s, i) => (
            <tr key={s.soldierId} className="border-b border-slate-100 last:border-b-0">
              <td className="py-2.5 px-3 text-[11px] text-slate-400">{i + 1}</td>
              <td className="py-2.5 px-3 font-bold text-slate-800">{s.name}</td>
              {components.map((c) => {
                const t = s.tests.find((x) => x.testId === c.testId);
                const bg = t?.isFailCause ? 'bg-red-50' : '';
                return (
                  <td key={c.testId} className={`py-2.5 px-3 ${bg}`}>
                    <span className={`text-base font-black ${t?.value === null || t === undefined ? 'text-slate-300' : 'text-slate-800'}`}>
                      {formatTestValue(t?.value ?? null, c.unit)}
                    </span>
                    {t && !t.isDefaultThreshold && t.thresholdValue !== null && (
                      <span className="text-[10px] text-slate-400 block">
                        סף: {formatTestValue(t.thresholdValue, c.unit)}
                      </span>
                    )}
                    {/* 06.10.2026 (David) — training-derived (app workout
                        data), ALWAYS below the official-test value+threshold
                        above, never in their place. A dash (never a false
                        "0") when there's no training evidence; the gap from
                        threshold shown only when the training value itself
                        would currently fail. */}
                    {t && (
                      <span className="text-[10px] block" style={{ color: t.trainingValue !== null ? '#2563EB' : '#9CA3AF' }}>
                        באימון: {t.trainingValue !== null ? formatTestValue(t.trainingValue, c.unit) : '—'}
                        {t.trainingStatus === 'fail' && t.trainingGapFromThreshold !== null && ` (חסר ${formatTestValue(t.trainingGapFromThreshold, c.unit)})`}
                      </span>
                    )}
                  </td>
                );
              })}
              <td className="py-2.5 px-3 text-[11px] text-slate-500">
                {s.latestTestDate ? new Date(s.latestTestDate).toLocaleDateString('he-IL') : '—'}
              </td>
              <td className="py-2.5 px-3">
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${statusTagColor(s.filterStatus)}1A`, color: statusTagColor(s.filterStatus) }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusTagColor(s.filterStatus) }} />
                  {s.statusLabel}
                </span>
                {s.nearThreshold.isNear && (
                  <div className="text-[10px] text-slate-500 mt-1">{s.nearThreshold.note}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {visible.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-8">אין חיילים להצגה.</p>
      )}
    </div>
  );
}

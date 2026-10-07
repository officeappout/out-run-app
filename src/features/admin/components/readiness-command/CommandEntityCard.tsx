'use client';

import UnitIconBadge from '@/components/ui/UnitIconBadge';
import { UnitStatusBar } from '../readiness-dashboard/StatusBar';
import { READINESS_COLORS } from '../readiness-dashboard/colors';
import type { DashboardUnitStatusBreakdown } from '@/features/readiness/core/services/readiness-dashboard.service';
import { isSmallSample, SAMPLE_FLOOR_DEFAULT } from '@/features/readiness/core/services/readiness-command.util';

export interface CommandComponentPercent {
  testId: string;
  label: string;
  passPercent: number | null;
}

export interface CommandEntityCardProps {
  id: string;
  name: string;
  /** 07.10.2026 (David) — authorities.logoUrl, same field/component (UnitIconBadge) the old selector already used. Null for every row this round doesn't have one for (battalion/company levels) — UnitIconBadge's own hash-colored fallback renders exactly as it already does everywhere else in this codebase for a null iconUrl, zero new component. */
  logoUrl?: string | null;
  hasData: boolean;
  totalCount: number;
  testedCount: number;
  /** The "big percent" + 3-segment bar — already resolved to whichever component chip is active (combined 'all', or a single component via singleComponentBreakdown). */
  bigBreakdown: DashboardUnitStatusBreakdown;
  trainingBreakdown: DashboardUnitStatusBreakdown;
  /** Always all 3 real components, regardless of the active chip — David: "שלושה אחוזים לפי מרכיב" is a fixed feature of the card, independent of which one is "big." */
  componentPercents: CommandComponentPercent[];
  appActiveCount: number;
  onClick?: () => void;
  sampleFloor?: number;
}

/**
 * 06.10.2026 — the reusable card for every drill level (brigade /
 * battalion / company). David: "אותם רכיבים, אותם כללים, אותה שפה" —
 * one card component, fed different rows at different levels, never a
 * per-level reimplementation.
 */
export default function CommandEntityCard({
  id, name, logoUrl = null, hasData, totalCount, testedCount, bigBreakdown, trainingBreakdown, componentPercents, appActiveCount, onClick, sampleFloor = SAMPLE_FLOOR_DEFAULT,
}: CommandEntityCardProps) {
  const smallSample = hasData && isSmallSample(testedCount, sampleFloor);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-right bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col transition-shadow ${onClick ? 'hover:shadow-md cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <UnitIconBadge unitId={id} iconUrl={logoUrl} name={name} size={32} />
        <h3 className="text-sm font-black text-gray-900 truncate flex-1">{name}</h3>
        {smallSample && (
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md whitespace-nowrap flex-shrink-0">מדגם קטן</span>
        )}
      </div>

      {!hasData ? (
        <p className="text-sm text-gray-400 py-3">טרם הוזנו נתונים</p>
      ) : (
        <>
          <p className="text-3xl font-black" style={{ color: bigBreakdown.passPercent !== null ? READINESS_COLORS.pass : '#9CA3AF' }}>
            {bigBreakdown.passPercent !== null ? `${bigBreakdown.passPercent}%` : 'טרם נבדקה'}
          </p>
          {bigBreakdown.passPercent !== null && (
            <p className="text-xs text-gray-500 mt-1">{bigBreakdown.passCount} מתוך {bigBreakdown.testedCount} עוברים</p>
          )}

          <div className="mt-3">
            <UnitStatusBar breakdown={bigBreakdown} totalCount={totalCount} />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1">
              <UnitStatusBar breakdown={trainingBreakdown} totalCount={totalCount} variant="training" />
            </div>
            {/* 07.10.2026 (David) — the number the dashed bar was missing next to it. Same rules as everywhere else training is shown: dash (never 0%) with no data, blue to match the dashed-bar language. */}
            <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: trainingBreakdown.passPercent !== null ? '#2563EB' : '#9CA3AF' }}>
              {trainingBreakdown.passPercent !== null ? `${trainingBreakdown.passPercent}% באימון` : '— באימון'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-100">
            {componentPercents.map((c) => (
              <div key={c.testId} className="text-center">
                <p className="text-sm font-bold text-gray-800">{c.passPercent !== null ? `${c.passPercent}%` : '—'}</p>
                <p className="text-[10px] text-gray-400 truncate">{c.label}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-gray-500 mt-3">
            <span className="font-bold text-slate-700">{appActiveCount}</span> מחוברים לאפליקציה
          </p>
        </>
      )}
    </button>
  );
}

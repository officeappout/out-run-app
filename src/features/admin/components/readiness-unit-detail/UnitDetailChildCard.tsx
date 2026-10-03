'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { UnitDetailChildSummary } from '@/features/readiness/core/services/readiness-unit-detail.service';
import { READINESS_COLORS } from '../readiness-dashboard/colors';

/**
 * One sub-unit card under "יחידות תחתיו" — clickable, navigates to that
 * unit's own detail page (same screen, one level down). A unit with
 * zero tested soldiers shows "טרם נבדקה" in red, never "0%" (point 3,
 * carried over from the dashboard's own locked rule).
 */
export default function UnitDetailChildCard({ child }: { child: UnitDetailChildSummary }) {
  return (
    <Link
      href={`/admin/authority/readiness/unit/${child.unitId}`}
      className="bg-white rounded-2xl border border-gray-100 p-4 hover:border-lime-300 hover:shadow-sm transition-all flex flex-col"
    >
      <div className="flex items-center justify-between mb-2">
        <ChevronLeft size={16} className="text-slate-300" />
        <span className="text-sm font-black text-gray-900">{child.unitName}</span>
      </div>

      {child.passPercent === null ? (
        <p className="text-sm font-bold" style={{ color: READINESS_COLORS.fail }}>טרם נבדקה</p>
      ) : (
        <>
          <p className="text-2xl font-black" style={{ color: READINESS_COLORS.pass }}>{child.passPercent}%</p>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mt-2 mb-1">
            <div style={{ width: `${child.passPercent}%`, backgroundColor: READINESS_COLORS.pass }} />
          </div>
        </>
      )}

      <p className="text-[11px] text-slate-400 mt-1">{child.testedCount} נבדקו · {child.totalCount} חיילים</p>
    </Link>
  );
}

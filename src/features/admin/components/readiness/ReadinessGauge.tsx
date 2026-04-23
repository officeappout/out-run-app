'use client';

import type { UnitReadinessSummary } from '@/features/admin/services/readiness.service';

interface ReadinessGaugeProps {
  summary: UnitReadinessSummary;
}

export default function ReadinessGauge({ summary }: ReadinessGaugeProps) {
  const { green, yellow, red, total } = summary;
  if (total === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm font-bold">
        אין חיילים ביחידה זו
      </div>
    );
  }

  const pctGreen = Math.round((green / total) * 100);
  const pctYellow = Math.round((yellow / total) * 100);
  const pctRed = 100 - pctGreen - pctYellow;

  const overallStatus = pctGreen >= 70 ? 'green' : pctGreen + pctYellow >= 60 ? 'yellow' : 'red';
  const statusLabel = overallStatus === 'green' ? 'כשיר' : overallStatus === 'yellow' ? 'חלקי' : 'לא כשיר';
  const statusColor = overallStatus === 'green'
    ? 'text-green-700 bg-green-100 ring-green-300'
    : overallStatus === 'yellow'
    ? 'text-amber-700 bg-amber-100 ring-amber-300'
    : 'text-red-700 bg-red-100 ring-red-300';

  return (
    <div dir="rtl" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-black text-gray-900">מד כשירות</h3>
        <div className={`px-4 py-2 rounded-2xl ring-1 font-black text-lg ${statusColor}`}>
          {statusLabel}
        </div>
      </div>

      {/* Bar */}
      <div className="flex h-5 rounded-full overflow-hidden mb-4">
        {pctGreen > 0 && (
          <div className="bg-green-500 transition-all" style={{ width: `${pctGreen}%` }} />
        )}
        {pctYellow > 0 && (
          <div className="bg-amber-400 transition-all" style={{ width: `${pctYellow}%` }} />
        )}
        {pctRed > 0 && (
          <div className="bg-red-500 transition-all" style={{ width: `${pctRed}%` }} />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span className="font-bold text-slate-700">{green} ירוק ({pctGreen}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-400" />
          <span className="font-bold text-slate-700">{yellow} צהוב ({pctYellow}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="font-bold text-slate-700">{red} אדום ({pctRed}%)</span>
        </div>
      </div>
    </div>
  );
}

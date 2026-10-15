'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import InfoHint from '@/features/admin/components/cpo-dashboard/InfoHint';
import type { RetentionDriversResponse } from '@/features/admin/services/journey-retention-drivers';

/**
 * Journey → "מה גורם להישאר": for each first-week behaviour, the share of
 * users still training 2–4 weeks later with vs. without it.
 * Data: GET /api/admin/journey-retention-drivers.
 */

const fmt = (n: number) => n.toLocaleString('he-IL');
const date = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });

export default function RetentionDrivers({
  data,
  loading,
  error,
  onRetry,
}: {
  data: RetentionDriversResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error && !loading) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3" role="alert">
        <span className="flex items-start gap-2 text-sm text-amber-800">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          {error}
        </span>
        <button onClick={onRetry} className="shrink-0 flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-bold text-amber-800 hover:bg-amber-100">
          <RefreshCw size={14} /> נסה שוב
        </button>
      </div>
    );
  }
  if (loading || !data) return <div className="h-80 bg-gray-100 rounded-2xl animate-pulse" />;

  const { window: w } = data;
  const max = Math.max(1, ...data.drivers.map((d) => Math.max(d.withPct ?? 0, d.withoutPct ?? 0)));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-bold text-gray-900 flex items-center gap-1">
            מה גורם להישאר
            <InfoHint text={`מי ש״נשאר״ = עשה לפחות אימון אמיתי אחד בין היום ה־${w.retainFrom} ליום ה־${w.retainTo} אחרי ההרשמה. לכל התנהגות משווים את אחוז הנשארים בין מי שעשה אותה לבין מי שלא. זה מתאם ולא הוכחה — ייתכן שמי שהיה נשאר בכל מקרה הוא גם מי שמצטרף לקבוצות.`} />
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {fmt(data.cohortSize)} נרשמים בין {date(data.cohortFrom)} ל־{date(data.cohortTo)} ·{' '}
            {data.retainedPct != null ? `${data.retainedPct}% נשארו` : '—'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-sky-600" /> עשו</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-gray-300" /> לא עשו</span>
        </div>
      </div>

      <ul className="divide-y divide-gray-100">
        {data.drivers.map((d) => (
          <li key={d.key} className="py-3 grid grid-cols-1 md:grid-cols-[minmax(0,15rem)_1fr_auto] gap-2 md:gap-4 md:items-center">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">{d.label}</p>
              <p className="text-[11px] text-gray-400 tabular-nums">{fmt(d.withCount)} עשו · {fmt(d.withoutCount)} לא</p>
            </div>
            {d.enoughData ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 rounded-full bg-sky-600" style={{ width: `${((d.withPct ?? 0) / max) * 100}%`, minWidth: 4 }} />
                  <span className="text-xs font-bold text-gray-900 tabular-nums">{d.withPct}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 rounded-full bg-gray-300" style={{ width: `${((d.withoutPct ?? 0) / max) * 100}%`, minWidth: 4 }} />
                  <span className="text-xs text-gray-500 tabular-nums">{d.withoutPct}%</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">אין עדיין מספיק משתמשים להשוואה (לפחות {w.minSample} בכל צד)</p>
            )}
            <span
              className={`justify-self-start md:justify-self-end rounded-full px-2.5 py-1 text-xs font-black tabular-nums ${
                d.lift == null ? 'text-gray-300' : d.lift >= 1.5 ? 'bg-emerald-50 text-emerald-700' : d.lift <= 0.8 ? 'bg-rose-50 text-rose-700' : 'bg-gray-50 text-gray-600'
              }`}
            >
              {d.lift == null ? '—' : `×${d.lift}`}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-gray-400 mt-4 leading-relaxed">
        ״×2״ = פי שניים יותר נשארים בקרב מי שעשה את זה. קבוצה, התראות, הזמנה, תוכנית וריצה נמדדים לפי המצב היום (אין להם היסטוריה), השאר לפי השבוע הראשון.
      </p>
    </div>
  );
}

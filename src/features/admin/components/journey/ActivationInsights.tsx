'use client';

import Link from 'next/link';
import { AlertCircle, RefreshCw } from 'lucide-react';
import InfoHint from '@/features/admin/components/cpo-dashboard/InfoHint';
import type { JourneyActivationResponse } from '@/features/admin/services/journey-activation';

/**
 * Journey → "הצטרפות והפעלה": where onboarding stalls, the first-week road
 * to the first workout, location permission, and who to nudge.
 * Data: GET /api/admin/journey-activation.
 */

const fmt = (n: number) => n.toLocaleString('he-IL');

function Bars({ rows, total }: { rows: { label: string; value: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-gray-700">{r.label}</span>
          <span className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <span className="block h-full rounded-full bg-gradient-to-l from-cyan-400 to-sky-600" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="tabular-nums font-bold text-gray-900 w-20 text-left">
            {fmt(r.value)}
            {total > 0 && <span className="font-normal text-gray-400"> · {Math.round((r.value / total) * 100)}%</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ActivationInsights({
  data,
  loading,
  error,
  onRetry,
}: {
  data: JourneyActivationResponse | null;
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
  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-56 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  const permissionTotal = data.locationPermission.granted + data.locationPermission.denied;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 min-w-0">
        <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-1">
          הדרך לאימון הראשון
          <InfoHint text="מתוך הנרשמים בתקופה — כמה הגיעו לכל שלב בשבוע הראשון שלהם באפליקציה. כל משתמש נספר פעם אחת בכל שלב." />
        </p>
        <p className="text-xs text-gray-400 mb-4">מתוך {fmt(data.signups)} נרשמים, בשבוע הראשון</p>
        <Bars rows={data.firstWorkout.map((s) => ({ label: s.label, value: s.users }))} total={data.signups} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 min-w-0">
        <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-1">
          איפה נתקעים באונבורדינג
          <InfoHint text="נרשמים מהתקופה שעדיין לא סיימו את האונבורדינג, לפי השלב שבו הם נמצאים עכשיו." />
        </p>
        <p className="text-xs text-gray-400 mb-4">{fmt(data.stuckTotal)} עוד לא סיימו</p>
        {data.stuck.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">כל הנרשמים בתקופה סיימו את האונבורדינג.</p>
        ) : (
          <Bars rows={data.stuck.map((s) => ({ label: s.label, value: s.count }))} total={data.stuckTotal} />
        )}
        {permissionTotal > 0 && (
          <p className="text-xs text-gray-500 mt-4 pt-3 border-t border-gray-100">
            הרשאת מיקום: {fmt(data.locationPermission.granted)} אישרו · {fmt(data.locationPermission.denied)} סירבו
            ({Math.round((data.locationPermission.denied / permissionTotal) * 100)}% סירוב)
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 min-w-0 lg:col-span-2">
        <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-1">
          כדאי לעודד אותם
          <InfoHint text="סיימו את האונבורדינג לפני 3 ימים או יותר, ועוד לא עשו אף אימון. הטריים ביותר למעלה — הכי קל להחזיר אותם." />
        </p>
        <p className="text-xs text-gray-400 mb-3">{fmt(data.nudge.count)} משתמשים סיימו אונבורדינג ולא התאמנו</p>
        {data.nudge.sample.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">אין כרגע משתמשים כאלה.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.nudge.sample.map((u) => (
              <li key={u.uid} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/admin/users/${u.uid}`} className="font-bold text-gray-900 hover:text-cyan-700 truncate">{u.name}</Link>
                <span className="text-gray-500 tabular-nums shrink-0">לפני {fmt(u.daysSince)} ימים</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

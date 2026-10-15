'use client';

import Link from 'next/link';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import InfoHint from '@/features/admin/components/cpo-dashboard/InfoHint';
import {
  CHANNEL_LABELS,
  CHANNEL_ORDER,
  type ChannelKey,
  type JourneySourcesResponse,
} from '@/features/admin/services/journey-sources';

/**
 * Journey → "מקורות הגעה". Where users came from: site visits, link/QR
 * clicks, signups and 7-day activation per channel and per link, and
 * signups per day by channel. Data: GET /api/admin/journey-sources.
 */

const CHANNEL_COLORS: Record<ChannelKey, string> = {
  website: '#0284c7',
  instagram: '#d6336c',
  qr: '#0f9d6b',
  links: '#7c5cff',
  invites: '#f59f00',
  organic: '#94a3b8',
};

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('he-IL'));
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

function Kpi({ label, value, hint, sub }: { label: string; value: string; hint: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5 min-w-0">
      <p className="text-xs md:text-sm text-gray-500 mb-1 flex items-center gap-1">
        {label}
        <InfoHint text={hint} />
      </p>
      <p className="text-2xl md:text-3xl font-black text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function SourcesSection({
  data,
  loading,
  error,
  onRetry,
}: {
  data: JourneySourcesResponse | null;
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const { kpis, channels, links, daily } = data;
  const days = daily.length;
  const chartData = daily.map((d) => ({ ...d, label: d.date.slice(5).split('-').reverse().join('.') }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="ביקורים באתר" value={fmt(kpis.webSessions)} hint="כניסות לאתר outrun.co.il/web בתקופה (ביקור = כניסה אחת, בלי עוגיות)." />
        <Kpi label="לחיצות על קישורים ו־QR" value={fmt(kpis.linkClicks)} hint="כל הלחיצות על הקישורים החכמים (/r/…) — אתר, אינסטגרם, QR בשטח ושותפים." />
        <Kpi label="לחיצות הורדה באתר" value={fmt(kpis.downloadClicks)} hint="לחיצות על כפתורי App Store / Google Play באתר." />
        <Kpi
          label="נרשמים חדשים"
          value={fmt(kpis.signups)}
          hint="משתמשים אמיתיים שנרשמו בתקופה (בלי חשבונות בדיקה ודמו)."
          sub={`${pct(kpis.activated, kpis.signups)} הפעילו תוך 7 ימים`}
        />
        <Kpi
          label="נרשמים עם מקור ידוע"
          value={kpis.knownSourcePct != null ? `${kpis.knownSourcePct}%` : '—'}
          hint="כמה מהנרשמים אנחנו יודעים מאיפה הגיעו. השאר נספרים כ״אורגני / לא ידוע״."
        />
      </div>

      {/* channels */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
        <p className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1">
          לפי ערוץ
          <InfoHint text="כל נרשם משויך לערוץ אחד: הזמנה מחבר ← קישור/QR שדרכו הגיע ← מקור הקמפיין ← אחרת אורגני. ״הפעילו״ = אימון אמיתי ראשון תוך 7 ימים מההרשמה." />
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-right">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-bold text-gray-600">
                <th className="py-2 px-3">ערוץ</th>
                <th className="py-2 px-3">ביקורים</th>
                <th className="py-2 px-3">לחיצות</th>
                <th className="py-2 px-3">נרשמו</th>
                <th className="py-2 px-3">הפעילו</th>
                <th className="py-2 px-3">% הפעלה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 tabular-nums">
              {channels.map((c) => (
                <tr key={c.key}>
                  <td className="py-2.5 px-3 text-sm font-bold text-gray-900">
                    <span className="inline-block w-2.5 h-2.5 rounded-full ml-2 align-middle" style={{ background: CHANNEL_COLORS[c.key] }} />
                    {c.label}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-gray-700">{fmt(c.visits)}</td>
                  <td className="py-2.5 px-3 text-sm text-gray-700">{fmt(c.clicks)}</td>
                  <td className="py-2.5 px-3 text-sm font-bold text-gray-900">{fmt(c.signups)}</td>
                  <td className="py-2.5 px-3 text-sm text-gray-700">{fmt(c.activated)}</td>
                  <td className="py-2.5 px-3 text-sm font-bold text-cyan-700">{pct(c.activated, c.signups)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* signups per day by channel */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
        <p className="text-sm font-bold text-gray-900 mb-3">נרשמים ביום לפי ערוץ · {days} ימים</p>
        <div className="h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis yAxisId="signups" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis yAxisId="visits" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
              {CHANNEL_ORDER.map((k) => (
                <Bar key={k} yAxisId="signups" dataKey={k} name={CHANNEL_LABELS[k]} stackId="s" fill={CHANNEL_COLORS[k]} />
              ))}
              <Line yAxisId="visits" type="monotone" dataKey="webSessions" name="ביקורים באתר" stroke="#0e1419" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* per link */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
        <p className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1">
          לפי קישור ו־QR
          <InfoHint text="כל קישור חכם שהיו בו לחיצות או נרשמים בתקופה. לחיצה על שם הקישור פותחת את הפירוט שלו." />
        </p>
        {links.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">לא היו לחיצות על קישורים בתקופה הזו.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-right">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-bold text-gray-600">
                  <th className="py-2 px-3">קישור</th>
                  <th className="py-2 px-3">ערוץ</th>
                  <th className="py-2 px-3">לחיצות</th>
                  <th className="py-2 px-3">נרשמו</th>
                  <th className="py-2 px-3">הפעילו</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 tabular-nums">
                {links.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-3 text-sm font-bold">
                      <Link href={`/admin/links/${l.id}`} className="text-gray-900 hover:text-cyan-700">{l.name}</Link>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-gray-600">{CHANNEL_LABELS[l.channel]}</td>
                    <td className="py-2.5 px-3 text-sm text-gray-700">{fmt(l.clicks)}</td>
                    <td className="py-2.5 px-3 text-sm font-bold text-gray-900">{fmt(l.signups)}</td>
                    <td className="py-2.5 px-3 text-sm text-gray-700">{fmt(l.activated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">
        פער מדידה ידוע: מי שהתקין את האפליקציה ישר מהחנות (בעיקר אייפון) עוד לא משויך לקישור שממנו הגיע, ולכן נספר כ״אורגני / לא ידוע״.
        לחיצות באתר וקליקים על קישורים נמדדים במלואם.
      </p>
    </div>
  );
}

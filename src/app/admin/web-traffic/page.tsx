'use client';

// Force dynamic rendering (auth + live data)
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Globe2, MousePointerClick, ScrollText, Smartphone, Users } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { adminAuthedFetch } from '@/lib/adminAuthedFetch';
import { APP_DOMAIN } from '@/lib/config/domain';

/**
 * /admin/web-traffic — "תנועה באתר": the marketing site's (outrun.co.il/web)
 * anonymous traffic, from /api/admin/web-traffic (daily rollups written by
 * /api/telemetry/web). Sessions, page views, CTA clicks (downloads,
 * WhatsApp to authorities…), where visitors come from, where they land, how
 * far they scroll. No cookies, no personal data.
 *
 * Styled in the marketing site's language (appout-website/docs/
 * design-language.md): white + tinted surfaces, hairlines, soft negative-
 * spread shadows, one cyan accent (the #00baf7 → #0cf2e3 gradient), heavy
 * short headings, big tabular numbers, a dark accent card.
 */

type Row = { key: string; label: string; value: number };
type Totals = { sessions: number; pageviews: number; cta: number; downloads: number };
type WebTraffic = {
  range: { from: string; to: string; prevFrom: string; prevTo: string };
  totals: Totals;
  previous: Totals;
  series: { date: string; sessions: number; pageviews: number; cta: number }[];
  top: Record<'sources' | 'mediums' | 'campaigns' | 'landing' | 'pages' | 'ctaTargets' | 'ctaPages' | 'devices' | 'countries' | 'locales', Row[]>;
  scroll: Record<string, number>;
  hours: Record<string, number>;
};

const PRESETS = [
  { days: 7, label: '7 ימים' },
  { days: 30, label: '30 ימים' },
  { days: 90, label: '90 ימים' },
];

const CTA_LABELS: Record<string, string> = {
  appstore: 'App Store',
  play: 'Google Play',
  onelink: 'הורדה (קישור חכם)',
  whatsapp: 'וואטסאפ לרשויות',
  email: 'מייל',
  phone: 'טלפון',
  instagram: 'אינסטגרם',
  press: 'כתבות',
  community: 'קהילה',
  demo: 'פגישת הדגמה',
};
const PAGE_LABELS: Record<string, string> = {
  home: 'דף הבית',
  strength: 'כוח',
  running: 'ריצה',
  learn: 'ללמוד',
  ':exercise': 'עמוד תרגיל',
  articles: 'מאמרים',
  community: 'קהילה',
  authorities: 'רשויות',
  about: 'עלינו',
  faq: 'שאלות',
  privacy: 'פרטיות',
  terms: 'תנאי שימוש',
  accessibility: 'נגישות',
};
const DEVICE_LABELS: Record<string, string> = { ios: 'iPhone', android: 'Android', desktop: 'מחשב' };
const SOURCE_LABELS: Record<string, string> = { direct: 'ישיר / ללא מקור' };

/** "he/learn/:exercise" → "ללמוד · עמוד תרגיל" (+ "EN" for English pages). */
function pageLabel(label: string): string {
  if (label === 'home') return PAGE_LABELS.home;
  const [locale, ...rest] = label.split('/');
  const name = rest.length ? rest.map((p) => PAGE_LABELS[p] ?? p).join(' · ') : PAGE_LABELS.home;
  return locale === 'en' ? `${name} (EN)` : name;
}

const fmt = (n: number) => n.toLocaleString('he-IL');
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function delta(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

export default function WebTrafficPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<WebTraffic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, () => setAuthLoading(false)), []);

  useEffect(() => {
    if (authLoading) return;
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    setLoading(true);
    setError(null);
    adminAuthedFetch<WebTraffic>(`/api/admin/web-traffic?from=${dayKey(from)}&to=${dayKey(to)}`).then((r) => {
      if (r.ok) setData(r.data);
      else setError(r.message);
      setLoading(false);
    });
  }, [authLoading, days]);

  const conversion = data && data.totals.sessions ? (data.totals.downloads / data.totals.sessions) * 100 : 0;
  const prevConversion = data && data.previous.sessions ? (data.previous.downloads / data.previous.sessions) * 100 : 0;
  const empty = data && data.totals.sessions === 0 && data.totals.pageviews === 0;

  const scrollRows = useMemo(() => {
    const s = data?.scroll ?? {};
    const base = Math.max(1, data?.totals.pageviews ?? 1);
    return ['25', '50', '75', '100'].map((d) => ({ depth: d, value: s[d] ?? 0, pct: Math.round(((s[d] ?? 0) / base) * 100) }));
  }, [data]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#f6fbfd] px-6 py-8 text-[#0e1419] md:px-10">
      {/* header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[13px] font-extrabold text-[#0284c7]">שיווק · {APP_DOMAIN}/web</span>
          <h1 className="mt-1 text-[34px] font-black leading-[1.05] tracking-[-0.025em]">תנועה באתר</h1>
          <p className="mt-2 text-[15px] text-[#4b5a66]">מי מגיע, מאיפה, ועל מה לוחצים. בלי עוגיות ובלי מידע אישי.</p>
        </div>
        {/* range: a segmented pill; the current one is the solid brand gradient */}
        <div className="flex gap-1 rounded-full bg-white p-1 shadow-[0_0_0_1px_rgba(14,27,42,0.08),0_12px_32px_-18px_rgba(9,30,50,0.35)]">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              className={`h-9 rounded-full px-4 text-[14px] font-extrabold transition-transform duration-150 active:scale-[0.97] ${
                days === p.days
                  ? 'bg-[linear-gradient(135deg,#00baf7,#0cf2e3)] text-[#04222b] shadow-[0_6px_16px_-8px_rgba(0,140,190,0.7)]'
                  : 'text-[#3a4955] hover:bg-[#eef8fc]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-[24px] border border-[#fde2e2] bg-white p-6 text-[15px] text-[#b42318]">{error}</div>
      ) : loading && !data ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[132px] animate-pulse rounded-[24px] bg-white" />
          ))}
        </div>
      ) : data ? (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {empty ? (
            <div className="rounded-[24px] border border-dashed border-[#b8c7d3] bg-white p-6 text-[15px] text-[#4b5a66]">
              עוד אין נתונים בטווח הזה. המדידה מתחילה ברגע שהאתר שולח אירועים (אחרי שהעדכון של האתר עולה לאוויר).
            </div>
          ) : null}

          {/* KPIs: the first one is the dark accent card */}
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi dark icon={<Users size={18} />} label="ביקורים" value={fmt(data.totals.sessions)} d={delta(data.totals.sessions, data.previous.sessions)} />
            <Kpi icon={<ScrollText size={18} />} label="צפיות בעמודים" value={fmt(data.totals.pageviews)} d={delta(data.totals.pageviews, data.previous.pageviews)} />
            <Kpi icon={<MousePointerClick size={18} />} label="לחיצות הורדה" value={fmt(data.totals.downloads)} d={delta(data.totals.downloads, data.previous.downloads)} />
            <Kpi
              icon={<ArrowUpRight size={18} />}
              label="המרה להורדה"
              value={`${conversion.toFixed(1)}%`}
              d={prevConversion ? Math.round(conversion - prevConversion) : null}
              unit="נק׳"
            />
          </div>

          {/* trend */}
          <Card title="לאורך זמן" sub="ביקורים וצפיות לכל יום">
            <div className="h-[260px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="wtSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00baf7" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0cf2e3" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e6edf2" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5).split('-').reverse().join('/')} tick={{ fontSize: 11, fill: '#6b7a8d' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7a8d' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 14, border: '1px solid #e6edf2', boxShadow: '0 16px 36px -14px rgba(9,20,50,.32)', direction: 'rtl', fontFamily: 'inherit' }}
                    labelFormatter={(d) => String(d).split('-').reverse().join('/')}
                    formatter={(v, name) => [fmt(Number(v)), name === 'sessions' ? 'ביקורים' : 'צפיות']}
                  />
                  <Area type="monotone" dataKey="pageviews" stroke="#94a3b8" strokeWidth={1.5} fill="transparent" />
                  <Area type="monotone" dataKey="sessions" stroke="#00baf7" strokeWidth={2.5} fill="url(#wtSessions)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="מאיפה מגיעים" sub="מקור הביקור (UTM או האתר המפנה)" icon={<Globe2 size={16} />}>
              <BarList rows={data.top.sources} labelOf={(r) => SOURCE_LABELS[r.label] ?? r.label} />
            </Card>
            <Card title="איפה נוחתים" sub="העמוד הראשון בביקור">
              <BarList rows={data.top.landing} labelOf={(r) => pageLabel(r.label)} />
            </Card>
            <Card title="על מה לוחצים" sub="כפתורי הורדה, וואטסאפ ועוד" icon={<MousePointerClick size={16} />}>
              <BarList rows={data.top.ctaTargets} labelOf={(r) => CTA_LABELS[r.label] ?? r.label} />
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="העמודים הנצפים" sub="צפיות לפי עמוד">
              <BarList rows={data.top.pages} labelOf={(r) => pageLabel(r.label)} />
            </Card>
            <Card title="עד איפה גוללים" sub="מתוך כל הצפיות בעמודים">
              <div className="space-y-3">
                {scrollRows.map((s) => (
                  <div key={s.depth}>
                    <div className="mb-1 flex justify-between text-[13px] font-bold text-[#3a4955]">
                      <span>{s.depth}% מהעמוד</span>
                      <span className="tabular-nums">{s.pct}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[#eef3f6]">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#00baf7,#0cf2e3)]" style={{ width: `${Math.min(100, s.pct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="מכשיר, שפה ומדינה" sub="לכל ביקור" icon={<Smartphone size={16} />}>
              <BarList rows={data.top.devices} labelOf={(r) => DEVICE_LABELS[r.label] ?? r.label} compact />
              <div className="my-4 h-px bg-[#eef3f6]" />
              <BarList rows={data.top.locales} labelOf={(r) => (r.label === 'en' ? 'אנגלית' : 'עברית')} compact />
              <div className="my-4 h-px bg-[#eef3f6]" />
              <BarList rows={data.top.countries.slice(0, 5)} labelOf={(r) => r.label.toUpperCase()} compact />
            </Card>
          </div>

          {data.top.campaigns.length ? (
            <Card title="קמפיינים" sub="utm_campaign">
              <BarList rows={data.top.campaigns} labelOf={(r) => r.label} />
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, d, icon, dark, unit = '%' }: { label: string; value: string; d: number | null; icon: React.ReactNode; dark?: boolean; unit?: string }) {
  const up = (d ?? 0) >= 0;
  return (
    <div
      className={`rounded-[24px] p-5 ${
        dark
          ? 'bg-[radial-gradient(70%_90%_at_85%_0%,rgba(12,242,227,0.3),transparent_70%),linear-gradient(135deg,#0e1419,#12303a)] text-white'
          : 'border border-[#e6edf2] bg-white shadow-[0_24px_50px_-36px_rgba(9,30,50,0.45)]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`grid h-9 w-9 place-items-center rounded-[12px] ${dark ? 'bg-white/10 text-[#7cf3ea]' : 'bg-[#eef8fc] text-[#0284c7]'}`}>{icon}</span>
        {d !== null ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-extrabold ${
              up ? (dark ? 'bg-white/10 text-[#7cf3ea]' : 'bg-[#e8f8ee] text-[#15803d]') : dark ? 'bg-white/10 text-[#ffb4a8]' : 'bg-[#fdecea] text-[#b42318]'
            }`}
            dir="ltr"
          >
            {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(d)}
            {unit === '%' ? '%' : ''}
          </span>
        ) : null}
      </div>
      <div
        className={`mt-4 text-[38px] font-black leading-none tracking-[-0.03em] tabular-nums ${
          dark ? 'bg-[linear-gradient(120deg,#00baf7,#0cf2e3)] bg-clip-text text-transparent' : ''
        }`}
      >
        {value}
      </div>
      <div className={`mt-1.5 text-[14px] font-extrabold ${dark ? 'text-white/85' : 'text-[#3a4955]'}`}>{label}</div>
    </div>
  );
}

function Card({ title, sub, icon, children }: { title: string; sub?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[#e6edf2] bg-white p-5 shadow-[0_24px_50px_-36px_rgba(9,30,50,0.45)]">
      <div className="mb-4 flex items-start gap-2">
        {icon ? <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-[10px] bg-[#eef8fc] text-[#0284c7]">{icon}</span> : null}
        <div>
          <h2 className="text-[17px] font-black tracking-[-0.01em]">{title}</h2>
          {sub ? <p className="text-[12.5px] text-[#6b7a8d]">{sub}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function BarList({ rows, labelOf, compact }: { rows: Row[]; labelOf: (r: Row) => string; compact?: boolean }) {
  if (!rows.length) return <p className="text-[13px] text-[#6b7a8d]">אין עדיין נתונים.</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {rows.map((r) => (
        <li key={r.key} className="relative overflow-hidden rounded-[10px]">
          <span className="absolute inset-y-0 right-0 rounded-[10px] bg-[#eef8fc]" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
          <span className={`relative flex items-center justify-between px-3 ${compact ? 'py-1.5' : 'py-2'} text-[13.5px]`}>
            <span className="truncate font-bold text-[#0e1419]">{labelOf(r)}</span>
            <span className="tabular-nums font-extrabold text-[#0277a8]">{fmt(r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

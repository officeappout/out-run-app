'use client';

export const dynamic = 'force-dynamic';

/**
 * The panel home — "מה קורה היום ומה מחכה לי" (audit 15.10.2026). Was a wall
 * of quick-link tiles plus dashboards that duplicated statistics/insights
 * (since folded into the Journey hub). Now: the week's pulse (signups,
 * 7-day activation, weekly active, at-risk, top source), a "needs attention"
 * list where every row links to the screen that resolves it, and a few
 * shortcuts. Built from the admin UI kit. Data: GET /api/admin/home-today.
 *
 * Authority-manager-only users are still sent to /admin/dashboard.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { ArrowLeft, CheckCircle2, Compass, Dumbbell, Link2, Map, Users } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { adminAuthedFetch } from '@/features/admin/lib/adminAuthedFetch';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import {
  EmptyState,
  ErrorState,
  KpiCard,
  KpiGrid,
  PageHeader,
  Panel,
  Skeleton,
  StatusPill,
} from '@/features/admin/components/ui';
import type { HomeTodayResponse } from '@/features/admin/services/home-today';

const fmt = (n: number) => n.toLocaleString('he-IL');

function delta(now: number, before: number): string | undefined {
  if (before === 0) return now > 0 ? 'שבוע שעבר: 0' : undefined;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% משבוע שעבר (${fmt(before)})`;
}

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}

const SHORTCUTS = [
  { href: '/admin/journey', label: 'מסע משתמש', icon: Compass },
  { href: '/admin/users/all', label: 'כל המשתמשים', icon: Users },
  { href: '/admin/locations', label: 'מיקומים ומסלולים', icon: Map },
  { href: '/admin/exercises', label: 'בנק תרגילים', icon: Dumbbell },
  { href: '/admin/links', label: 'קישורים שיווקיים', icon: Link2 },
];

export default function AdminHomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [data, setData] = useState<HomeTodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          if (await isOnlyAuthorityManager(user.uid)) {
            router.replace('/admin/dashboard');
            return;
          }
          const role = await checkUserRole(user.uid, user.email);
          setName(role.name?.split(' ')[0] ?? '');
        } catch (err) {
          console.error('[admin home] role check failed:', err);
        }
      }
      setReady(true);
    });
    return () => unsubscribe();
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await adminAuthedFetch<HomeTodayResponse>('/api/admin/home-today');
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else {
      setData(null);
      setError(r.message || 'לא הצלחנו לטעון את הנתונים של היום.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const today = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const p = data?.pulse;
  const attention = (data?.attention ?? []).filter((a) => a.count === null || a.count > 0);

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader eyebrow={today} title={`${greeting()}${name ? ',' : ''}`} strong={name || undefined} subtitle="מה קרה השבוע, ומה מחכה לטיפול שלך." />

      {loading ? (
        <Skeleton height={120} count={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : p ? (
        <>
          <KpiGrid>
            <KpiCard label="נרשמים השבוע" value={fmt(p.signupsThisWeek)} sub={delta(p.signupsThisWeek, p.signupsLastWeek)} />
            <KpiCard
              label="התחילו להתאמן תוך 7 ימים"
              value={p.activationPct != null ? `${p.activationPct}%` : '—'}
              sub={p.activationSample > 0 ? `מתוך ${fmt(p.activationSample)} שנרשמו לפני 8–14 ימים` : 'אין עדיין מספיק נרשמים'}
            />
            <KpiCard label="התאמנו השבוע" value={fmt(p.activeThisWeek)} sub={delta(p.activeThisWeek, p.activeLastWeek)} />
            <KpiCard label="בסיכון לעזוב" value={fmt(p.atRisk)} sub="התאמנו לפני 2–4 שבועות, ומאז לא" />
            <KpiCard
              label="המקור המוביל השבוע"
              value={p.topChannel ? p.topChannel.label : '—'}
              sub={p.topChannel ? `${fmt(p.topChannel.signups)} נרשמים` : 'אין נרשמים עם מקור ידוע'}
            />
          </KpiGrid>

          <Panel title="דורש תשומת לב">
            {attention.length === 0 ? (
              <EmptyState title="הכל מטופל">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={16} className="text-emerald-600" /> אין כרגע אישורים, תקלות או חשבוניות שמחכים לך.</span>
              </EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {attention.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center justify-between gap-3 py-3 group">
                      <span className="text-[15px] font-semibold text-gray-900">{a.label}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {a.count === null ? (
                          <StatusPill tone="neutral">לא נטען</StatusPill>
                        ) : (
                          <StatusPill tone={a.tone}>{fmt(a.count)}</StatusPill>
                        )}
                        <ArrowLeft size={16} className="text-gray-400 group-hover:text-cyan-700 transition-colors" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      <Panel title="קיצורי דרך">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {SHORTCUTS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-2xl px-3 py-3 text-sm font-bold text-gray-800 bg-gray-50 hover:bg-cyan-50 hover:text-cyan-800 transition-colors"
            >
              <Icon size={18} className="text-cyan-700 shrink-0" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}

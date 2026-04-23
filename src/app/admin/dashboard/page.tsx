'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import { getGroupsByAuthority, getEventsByAuthority } from '@/features/admin/services/community.service';
import { getReportsByAuthority } from '@/features/admin/services/maintenance.service';
import {
  Loader2,
  LayoutDashboard,
  MapPin,
  Users as UsersIcon,
  CalendarHeart,
  Wrench,
  ArrowLeft,
  Route,
  Flag,
  ShieldCheck,
  Dumbbell,
} from 'lucide-react';

const AUTHORITY_STORAGE_KEY = 'admin_selected_authority_id';

interface DashboardStats {
  totalParks: number;
  publishedParks: number;
  pendingParks: number;
  totalGroups: number;
  activeGroups: number;
  upcomingEvents: number;
  openReports: number;
}

export default function AdminDashboardPage() {
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const resolveAuthority = useCallback(async (uid: string) => {
    try {
      const role = await checkUserRole(uid);
      let aId: string | null = role.authorityIds?.[0] || null;
      let aName = '';

      if (role.isSuperAdmin) {
        const allAuths = await getAllAuthorities(undefined, true);
        const savedId = typeof window !== 'undefined' ? localStorage.getItem(AUTHORITY_STORAGE_KEY) : null;
        const target = (savedId && allAuths.find(a => a.id === savedId)) ?? allAuths[0];
        if (target) {
          aId = target.id;
          aName = typeof target.name === 'string' ? target.name : (target.name?.he || '');
        }
      } else {
        const auths = await getAuthoritiesByManager(uid);
        if (auths.length > 0) {
          aId = aId ?? auths[0].id;
          const a = auths[0];
          aName = typeof a.name === 'string' ? a.name : (a.name?.he || a.name?.en || '');
        }
      }

      if (!aId) { setLoading(false); return; }
      setAuthorityId(aId);
      setAuthorityName(aName);

      // Fetch all stats in parallel
      const [parks, groups, events, reports] = await Promise.all([
        getParksByAuthority(aId),
        getGroupsByAuthority(aId),
        getEventsByAuthority(aId),
        getReportsByAuthority(aId).catch(() => []),
      ]);

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      setStats({
        totalParks: parks.length,
        publishedParks: parks.filter(p => p.published === true || p.contentStatus === 'published').length,
        pendingParks: parks.filter(p => p.contentStatus === 'pending_review').length,
        totalGroups: groups.length,
        activeGroups: groups.filter(g => g.isActive).length,
        upcomingEvents: events.filter(e => {
          const d = e.date instanceof Date ? e.date : new Date(e.date);
          return d >= now;
        }).length,
        openReports: reports.filter(r => r.status === 'reported' || r.status === 'in_review' || r.status === 'in_progress').length,
      });
    } catch (err) {
      console.error('[DashboardPage] authority resolution failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      await resolveAuthority(user.uid);
    });
    return () => unsubscribe();
  }, [resolveAuthority]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!authorityId || !stats) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400" dir="rtl">
        <p className="text-sm">לא נמצאה רשות משויכת</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center">
          <LayoutDashboard size={24} className="text-cyan-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">דשבורד</h1>
          {authorityName && (
            <p className="text-sm text-gray-500 mt-0.5">
              מבט על · <span className="font-bold text-cyan-600">{authorityName}</span>
            </p>
          )}
        </div>
      </div>

      {/* ═══ Quick Stats Grid ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="מיקומים" value={stats.totalParks} sub={`${stats.publishedParks} פורסמו`} icon={MapPin} color="cyan" />
        <StatCard label="קבוצות פעילות" value={stats.activeGroups} sub={`${stats.totalGroups} סה"כ`} icon={Dumbbell} color="violet" />
        <StatCard label="אירועים קרובים" value={stats.upcomingEvents} icon={CalendarHeart} color="blue" />
        <StatCard label="דיווחים פתוחים" value={stats.openReports} icon={Wrench} color={stats.openReports > 0 ? 'amber' : 'emerald'} />
      </div>

      {/* ═══ Pending Alert ═══ */}
      {stats.pendingParks > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <ShieldCheck size={18} className="text-amber-600 flex-shrink-0" />
          <p className="text-amber-800 text-sm font-medium">
            {stats.pendingParks} מיקום{stats.pendingParks > 1 ? 'ים' : ''} ממתינ{stats.pendingParks > 1 ? 'ים' : ''} לאישור מנהל העל.
          </p>
        </div>
      )}

      {/* ═══ Quick Links ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickLink
          href="/admin/authority/community"
          icon={CalendarHeart}
          title="מרכז קהילה ואירועים"
          description="לו״ז מפגשים, ניהול קבוצות ואירועים, רשימות נרשמים"
          color="violet"
        />
        <QuickLink
          href="/admin/authority/locations"
          icon={MapPin}
          title="מיקומים ופארקים"
          description="ניהול מיקומים על המפה, סטטוסים וסיווגים"
          color="cyan"
        />
        <QuickLink
          href="/admin/authority/reports"
          icon={Flag}
          title="דיווחי תחזוקה"
          description="דיווחי תשתית וקהילה, מעקב סטטוסים"
          color="amber"
        />
      </div>

      {/* ═══ Today's Sessions — Compact Summary ═══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <CalendarHeart size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">מפגשים וקבוצות</h2>
              <p className="text-xs text-gray-400">
                {stats.activeGroups} קבוצות פעילות · {stats.upcomingEvents} אירועים קרובים
              </p>
            </div>
          </div>
          <Link
            href="/admin/authority/community"
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm"
          >
            צפה במרכז הקהילה
            <ArrowLeft size={14} />
          </Link>
        </div>
        <p className="text-sm text-gray-500">
          לצפייה בלוח הזמנים המלא, ניהול קבוצות ואירועים, ורשימות נרשמים — עברו למרכז הקהילה.
        </p>
      </div>
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
    cyan:    { bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-700',    iconBg: 'bg-cyan-100' },
    violet:  { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  iconBg: 'bg-violet-100' },
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    iconBg: 'bg-blue-100' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   iconBg: 'bg-amber-100' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', iconBg: 'bg-emerald-100' },
  };
  const c = colorMap[color] ?? colorMap.cyan;

  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <div className={`w-8 h-8 ${c.iconBg} rounded-lg flex items-center justify-center`}>
          <Icon size={16} className={c.text} />
        </div>
      </div>
      <p className={`text-3xl font-black ${c.text}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function QuickLink({
  href, icon: Icon, title, description, color,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
}) {
  const colorMap: Record<string, { iconBg: string; iconText: string; hoverBorder: string }> = {
    violet: { iconBg: 'bg-violet-50', iconText: 'text-violet-600', hoverBorder: 'hover:border-violet-300' },
    cyan:   { iconBg: 'bg-cyan-50',   iconText: 'text-cyan-600',   hoverBorder: 'hover:border-cyan-300' },
    amber:  { iconBg: 'bg-amber-50',  iconText: 'text-amber-600',  hoverBorder: 'hover:border-amber-300' },
  };
  const c = colorMap[color] ?? colorMap.cyan;

  return (
    <Link
      href={href}
      className={`bg-white border border-gray-200 ${c.hoverBorder} rounded-2xl p-5 shadow-sm transition-all hover:shadow-md group block`}
    >
      <div className={`w-10 h-10 ${c.iconBg} rounded-xl flex items-center justify-center mb-3`}>
        <Icon size={20} className={c.iconText} />
      </div>
      <h3 className="text-sm font-black text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
      <span className="text-[11px] font-bold text-blue-500 mt-2 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
        פתח
        <ArrowLeft size={10} />
      </span>
    </Link>
  );
}

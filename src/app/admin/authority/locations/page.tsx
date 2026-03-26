'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getParksByAuthority, approvePark } from '@/features/admin/services/parks.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import type { Park } from '@/features/parks/core/types/park.types';
import {
  Plus,
  MapPin,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  Dumbbell,
  Circle,
  Trees,
  Building2,
  Waves,
  Pencil,
  ShieldCheck,
  Building,
} from 'lucide-react';

// ── helpers ─────────────────────────────────────────────────────────
const FACILITY_LABELS: Record<string, string> = {
  gym_park:         'פארק כושר',
  court:            'מגרש ספורט',
  nature_community: 'טבע וקהילה',
  urban_spot:       'תשתית עירונית',
  route:            'מסלול טיול',
  zen_spot:         'אזור מנוחה',
};

const FACILITY_ICONS: Record<string, React.ReactNode> = {
  gym_park:         <Dumbbell size={13} />,
  court:            <Circle size={13} />,
  nature_community: <Trees size={13} />,
  urban_spot:       <Building2 size={13} />,
  route:            <Waves size={13} />,
  zen_spot:         <MapPin size={13} />,
};

const TAG_LABELS: Record<string, string> = {
  night_lighting:      'תאורת לילה',
  safe_zone:           'אזור בטוח',
  shaded:              'מוצל',
  wheelchair_accessible: 'נגיש לנכים',
  water_fountain:      'ברז שתייה',
  has_toilets:         'שירותים',
  dog_friendly:        'ידידותי לכלבים',
  parkour_friendly:    'פארקור',
  rubber_floor:        'רצפת גומי',
  near_water:          'קרוב למים',
  stairs_training:     'מדרגות',
};

function statusBadge(park: Park, isSuperView = false) {
  const isPublished = park.published === true || park.contentStatus === 'published';
  const isPending   = park.contentStatus === 'pending_review' || park.published === false;
  if (isPublished) return { label: 'פורסם', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' };
  if (isPending)   return { label: isSuperView ? 'ממתין לאישורך' : 'ממתין לאישור מנהל העל', cls: 'bg-amber-100 text-amber-700 border border-amber-200' };
  return               { label: 'טיוטה', cls: 'bg-gray-100 text-gray-600 border border-gray-200' };
}

// ── page ─────────────────────────────────────────────────────────────
export default function AuthorityLocationsPage() {
  const [authorityId, setAuthorityId]   = useState<string | null>(null);
  const [authorityName, setAuthorityName] = useState<string>('');
  const [parks, setParks]               = useState<Park[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [approvingId, setApprovingId]   = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Load authority + parks
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setError('יש להתחבר תחילה'); setLoading(false); return; }

      try {
        const role = await checkUserRole(user.uid);
        let aId: string | null = null;
        let aName = '';

        setIsSuperAdmin(!!role.isSuperAdmin);

        if (role.isSuperAdmin) {
          const allAuths = await getAllAuthorities(undefined, true);
          if (allAuths.length > 0) {
            const stored = typeof window !== 'undefined'
              ? localStorage.getItem('admin_selected_authority_id') : null;
            const target = (stored && allAuths.find(a => a.id === stored)) ?? allAuths[0];
            aId   = target.id;
            aName = typeof target.name === 'string' ? target.name : (target.name?.he || '');
          }
        } else if (role.isAuthorityManager && role.authorityIds?.length) {
          aId = role.authorityIds[0];
          const auths = await getAuthoritiesByManager(user.uid);
          if (auths.length > 0) {
            const a = auths[0];
            aName = typeof a.name === 'string' ? a.name : (a.name?.he || a.name?.en || '');
          }
        }

        if (!aId) { setError('לא נמצאה רשות משויכת לחשבון זה'); setLoading(false); return; }

        setAuthorityId(aId);
        setAuthorityName(aName);
        const data = await getParksByAuthority(aId);
        setParks(data);
      } catch (err: any) {
        setError(err?.message || 'שגיאה בטעינת הנתונים');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const reload = async () => {
    if (!authorityId) return;
    setLoading(true);
    try {
      setParks(await getParksByAuthority(authorityId));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (parkId: string) => {
    setApprovingId(parkId);
    try {
      await approvePark(parkId);
      setParks(prev => prev.map(p =>
        p.id === parkId ? { ...p, published: true, contentStatus: 'published' as const } : p
      ));
    } catch {
      alert('שגיאה באישור המיקום');
    } finally {
      setApprovingId(null);
    }
  };

  // ── KPI counts ───────────────────────────────────────────────────
  const totalCount     = parks.length;
  const publishedCount = parks.filter(p => p.published === true || p.contentStatus === 'published').length;
  const pendingCount   = parks.filter(p => p.contentStatus === 'pending_review' || (p.published === false && p.contentStatus !== 'published')).length;
  const categoryCount  = new Set(parks.map(p => p.facilityType).filter(Boolean)).size;

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <Loader2 className="animate-spin text-emerald-500 ml-2" size={28} />
        <span className="text-slate-600">טוען מיקומים...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-red-600 font-semibold">{error}</p>
      </div>
    );
  }

  // Sort: pending first, then by name
  const sorted = [...parks].sort((a, b) => {
    const aPending = a.contentStatus === 'pending_review';
    const bPending = b.contentStatus === 'pending_review';
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/authority-manager"
            className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium mb-2"
          >
            <ArrowLeft size={14} />
            חזור לדשבורד
          </Link>
          <h1 className="text-2xl font-black text-slate-900">ניהול מיקומים</h1>
          {authorityName && (
            <p className="text-slate-500 text-sm mt-0.5">
              {authorityName} · {totalCount} מיקומים
            </p>
          )}
        </div>
        <Link
          href="/admin/authority/locations/new"
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-2xl shadow-md transition-all text-sm"
        >
          <Plus size={16} />
          הוסף מיקום חדש
        </Link>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'סה"כ מיקומים', value: totalCount,     color: 'border-slate-200',   text: 'text-slate-700' },
          { label: 'פורסמו',       value: publishedCount, color: 'border-emerald-200', text: 'text-emerald-700' },
          { label: 'ממתינים',      value: pendingCount,   color: 'border-amber-200',   text: 'text-amber-700' },
          { label: 'קטגוריות',     value: categoryCount,  color: 'border-blue-200',    text: 'text-blue-700' },
        ].map(kpi => (
          <div key={kpi.label} className={`bg-white rounded-2xl border ${kpi.color} p-5 shadow-sm`}>
            <p className="text-xs font-semibold text-slate-500 mb-1">{kpi.label}</p>
            <p className={`text-3xl font-black ${kpi.text}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Pending notice ── */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <Clock size={18} className="text-amber-600 flex-shrink-0" />
          <p className="text-amber-800 text-sm font-medium">
            {pendingCount} מיקום{pendingCount > 1 ? 'ים' : ''} ממתינ{pendingCount > 1 ? 'ים' : ''} לאישור מנהל המערכת לפני פרסום לאפליקציה.
          </p>
        </div>
      )}

      {/* ── Empty state ── */}
      {parks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center gap-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <MapPin size={28} className="text-emerald-500" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 mb-1">אין מיקומים עדיין</h3>
            <p className="text-slate-500 text-sm max-w-sm">
              הוסיפו פארקי כושר, מגרשי ספורט, תשתיות ועוד — הם יופיעו על המפה של האפליקציה לאחר אישור.
            </p>
          </div>
          <Link
            href="/admin/authority/locations/new"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-2xl shadow-md transition-all"
          >
            <Plus size={16} />
            הוסף מיקום ראשון
          </Link>
        </div>
      ) : (
        /* ── Locations table ── */
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 text-sm">
              רשימת מיקומים ({totalCount})
            </h2>
            <button
              onClick={reload}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <RefreshCw size={13} />
              רענן
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {sorted.map(park => {
              const badge   = statusBadge(park, isSuperAdmin);
              const facType = park.facilityType || 'gym_park';
              const tags    = (park.featureTags || []).slice(0, 3);

              return (
                <div key={park.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors">
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5 text-emerald-600">
                    {FACILITY_ICONS[facType] || <MapPin size={13} />}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm truncate">{park.name}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        {FACILITY_ICONS[facType]}
                        {FACILITY_LABELS[facType] || facType}
                      </span>
                      {park.city && (
                        <span className="text-xs text-slate-400">{park.city}</span>
                      )}
                    </div>

                    {tags.length > 0 && (
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {tags.map(tag => (
                          <span
                            key={tag}
                            className="text-[10px] font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5"
                          >
                            {TAG_LABELS[tag] || tag}
                          </span>
                        ))}
                        {(park.featureTags?.length || 0) > 3 && (
                          <span className="text-[10px] text-slate-400">
                            +{(park.featureTags?.length || 0) - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right column: origin badge + status + approve + edit */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0 mt-0.5">
                    {/* Approve button for pending items (super admin only) */}
                    {isSuperAdmin && (park.contentStatus === 'pending_review' || park.published === false) && park.contentStatus !== 'published' ? (
                      <button
                        onClick={() => handleApprove(park.id)}
                        disabled={approvingId === park.id}
                        className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all disabled:opacity-60 shadow-sm"
                      >
                        {approvingId === park.id
                          ? <Loader2 className="animate-spin" size={10} />
                          : <ShieldCheck size={10} />}
                        {approvingId === park.id ? 'מאשר...' : 'אשר ופרסם'}
                      </button>
                    ) : (
                      park.published === true || park.contentStatus === 'published'
                        ? <CheckCircle2 size={16} className="text-emerald-500" />
                        : <Clock size={16} className="text-amber-500" />
                    )}
                    {/* Origin badge */}
                    {(park as any).origin === 'super_admin' ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
                        <ShieldCheck size={10} />
                        מנהל ראשי
                      </span>
                    ) : (park as any).origin === 'authority_admin' ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-2 py-0.5">
                        <Building size={10} />
                        מקור: רשות
                      </span>
                    ) : null}
                    {/* Edit link */}
                    <Link
                      href={`/admin/authority/locations/${park.id}/edit`}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <Pencil size={11} />
                      עריכה
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

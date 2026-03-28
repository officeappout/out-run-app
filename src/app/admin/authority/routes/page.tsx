'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import { InventoryService } from '@/features/parks';
import type { Route } from '@/features/parks';
import {
    Plus,
    Route as RouteIcon,
    CheckCircle2,
    Clock,
    ShieldCheck,
    Loader2,
    MapPin,
    Zap,
    Bike,
    AlertCircle,
    RefreshCw,
    ArrowLeft,
    Pencil,
    ImageOff,
} from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────
function activityEmoji(type?: string) {
    if (type === 'running')  return '🏃';
    if (type === 'cycling')  return '🚴';
    if (type === 'walking')  return '🚶';
    return '🛤️';
}

function activityLabel(type?: string) {
    if (type === 'running')  return 'ריצה';
    if (type === 'cycling')  return 'רכיבה';
    if (type === 'walking')  return 'הליכה';
    return type || '—';
}

function difficultyBadge(d?: string) {
    if (d === 'easy')   return { label: 'קל',    cls: 'bg-green-100 text-green-700' };
    if (d === 'hard')   return { label: 'קשה',   cls: 'bg-red-100   text-red-700'   };
    return                       { label: 'בינוני', cls: 'bg-amber-100 text-amber-700' };
}

// ── page ────────────────────────────────────────────────────────────
export default function AuthorityRoutesPage() {
    const router = useRouter();

    const [authorityId,   setAuthorityId]   = useState<string | null>(null);
    const [routes,        setRoutes]        = useState<Route[]>([]);
    const [loading,       setLoading]       = useState(true);
    const [approvingId,   setApprovingId]   = useState<string | null>(null);
    const [error,         setError]         = useState<string | null>(null);
    const [isSuperAdmin,  setIsSuperAdmin]  = useState(false);

    // ── load user authority + routes ──────────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { router.push('/admin'); return; }

            try {
                const role = await checkUserRole(user.uid);
                let aid: string | null = null;

                setIsSuperAdmin(!!role.isSuperAdmin);

                if (role.isSuperAdmin) {
                    const allAuths = await getAllAuthorities(undefined, true);
                    const stored = typeof window !== 'undefined'
                        ? localStorage.getItem('admin_selected_authority_id') : null;
                    const target = (stored && allAuths.find(a => a.id === stored)) ?? allAuths[0];
                    if (target) aid = target.id;
                } else if (role.authorityIds?.length) {
                    aid = role.authorityIds[0];
                }

                if (!aid) {
                    setError('לא נמצאה רשות משויכת לחשבון שלך.');
                    setLoading(false);
                    return;
                }
                setAuthorityId(aid);
                await loadRoutes(aid);
            } catch (err) {
                console.error(err);
                setError('שגיאה בטעינת הנתונים. נסה לרענן.');
            } finally {
                setLoading(false);
            }
        });
        return () => unsub();
    }, [router]);

    const loadRoutes = async (aid: string) => {
        const data = await InventoryService.fetchRoutesByAuthorityId(aid);
        // Sort: pending first, then by name
        data.sort((a, b) => {
            const aPending = a.status === 'pending' || a.published === false ? 0 : 1;
            const bPending = b.status === 'pending' || b.published === false ? 0 : 1;
            if (aPending !== bPending) return aPending - bPending;
            return (a.name || '').localeCompare(b.name || '', 'he');
        });
        setRoutes(data);
    };

    const handleRefresh = async () => {
        if (!authorityId) return;
        setLoading(true);
        await loadRoutes(authorityId);
        setLoading(false);
    };

    const handleApprove = async (routeId: string) => {
        setApprovingId(routeId);
        try {
            await InventoryService.approveRoute(routeId);
            setRoutes(prev => prev.map(r =>
                r.id === routeId ? { ...r, status: 'published', published: true } : r
            ));
        } catch {
            alert('שגיאה באישור המסלול');
        } finally {
            setApprovingId(null);
        }
    };

    // ── derived stats ─────────────────────────────────────────────
    const pendingCount   = routes.filter(r => r.status === 'pending' || r.published === false).length;
    const publishedCount = routes.filter(r => r.published === true).length;
    const totalKm        = routes.reduce((s, r) => s + (r.distance || 0), 0);

    // ── loading / error states ─────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64" dir="rtl">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin text-cyan-500" size={36} />
                    <p className="text-gray-400 font-bold text-sm">טוען מסלולים...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64" dir="rtl">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
                    <AlertCircle size={44} className="mx-auto text-red-400 mb-3" />
                    <p className="font-black text-gray-800 mb-1">שגיאה בטעינה</p>
                    <p className="text-sm text-gray-500 mb-5">{error}</p>
                    <button onClick={handleRefresh}
                        className="inline-flex items-center gap-2 bg-cyan-500 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-cyan-600 transition-all">
                        <RefreshCw size={15} />
                        נסה שוב
                    </button>
                </div>
            </div>
        );
    }

    // ── main render ────────────────────────────────────────────────
    return (
        <div className="space-y-6 pb-12" dir="rtl">

            {/* Page header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900 flex items-center gap-3">
                        <RouteIcon className="text-cyan-500" size={30} />
                        ניהול מסלולים
                    </h1>
                    <p className="text-gray-400 mt-1 text-sm">
                        הוסף וניהל מסלולי הליכה וריצה עבור הרשות שלך
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={handleRefresh} disabled={loading}
                        className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all text-sm disabled:opacity-50">
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        <span>רענן</span>
                    </button>

                    <Link href="/admin/authority/routes/new"
                        className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-cyan-200 transition-all text-sm">
                        <Plus size={18} />
                        הוסף מסלול חדש
                    </Link>
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'סה״כ מסלולים', value: routes.length,              icon: RouteIcon,     color: 'text-cyan-600',  bg: 'bg-cyan-50'  },
                    { label: 'פורסמו',         value: publishedCount,             icon: CheckCircle2,  color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'ממתינים לאישור', value: pendingCount,               icon: Clock,         color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'סה״כ ק״מ',       value: `${totalKm.toFixed(1)} ק״מ`, icon: MapPin,        color: 'text-indigo-600',bg: 'bg-indigo-50'},
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className={`${bg} rounded-2xl p-4 flex items-center gap-3 border border-white shadow-sm`}>
                        <div className={`w-10 h-10 rounded-full bg-white flex items-center justify-center ${color} shadow-sm flex-shrink-0`}>
                            <Icon size={20} />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-gray-900">{value}</p>
                            <p className="text-xs font-bold text-gray-500">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pending approval notice */}
            {pendingCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                    <Clock size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-black text-amber-800">
                            {pendingCount} {pendingCount === 1 ? 'מסלול ממתין' : 'מסלולים ממתינים'} {isSuperAdmin ? 'לאישורך' : 'לאישור מנהל העל'}
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                            מסלולים אלה גלויים לך בלבד ולא יופיעו באפליקציה עד לאישור.
                        </p>
                    </div>
                </div>
            )}

            {/* Routes table */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                {routes.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
                        <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center">
                            <RouteIcon size={36} className="text-gray-200" />
                        </div>
                        <div>
                            <p className="text-lg font-black text-gray-700">אין מסלולים עדיין</p>
                            <p className="text-sm text-gray-400 mt-1">לחץ על &ldquo;הוסף מסלול חדש&rdquo; כדי לצייר את המסלול הראשון שלך</p>
                        </div>
                        <Link href="/admin/authority/routes/new"
                            className="flex items-center gap-2 bg-cyan-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-cyan-600 transition-all shadow-lg shadow-cyan-100 mt-2">
                            <Plus size={18} />
                            צור מסלול ראשון
                        </Link>
                    </div>
                ) : (
                    <>
                        {/* Table header */}
                        <div className="grid grid-cols-[48px_1fr_120px_90px_100px_140px_60px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-[11px] font-black text-gray-400 uppercase tracking-wider">
                            <span>תמונה</span>
                            <span>שם המסלול</span>
                            <span className="text-center">פעילות</span>
                            <span className="text-center">מרחק</span>
                            <span className="text-center">קושי</span>
                            <span className="text-center">סטטוס</span>
                            <span className="text-center">פעולות</span>
                        </div>

                        {/* Route rows */}
                        <div className="divide-y divide-gray-50">
                            {routes.map(route => {
                                const isPending    = route.status === 'pending' || route.published === false;
                                const isApproving  = approvingId === route.id;
                                const diff         = difficultyBadge(route.difficulty);
                                const actType      = route.activityType || route.type;

                                return (
                                    <div key={route.id}
                                        className={`grid grid-cols-[48px_1fr_120px_90px_100px_140px_60px] gap-4 px-6 py-4 items-center transition-colors ${
                                            isPending ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-gray-50'
                                        }`}>

                                        {/* Thumbnail */}
                                        <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                                            {(route as any).images?.[0] ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={(route as any).images[0]} alt={route.name || ''} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <ImageOff size={14} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Name + description */}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-black text-gray-900 text-sm truncate">{route.name || '(ללא שם)'}</p>
                                                {isPending && (
                                                    <span className="flex items-center gap-0.5 text-[9px] font-bold bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                                                        <Clock size={8} /> {isSuperAdmin ? 'ממתין לאישורך' : 'ממתין'}
                                                    </span>
                                                )}
                                                {!isPending && route.published === true && (
                                                    <span className="flex items-center gap-0.5 text-[9px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                                                        <CheckCircle2 size={8} /> פורסם
                                                    </span>
                                                )}
                                            </div>
                                            {route.description && (
                                                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{route.description}</p>
                                            )}
                                            {route.importSourceName && (
                                                <p className="text-[10px] text-gray-300 mt-0.5 truncate">📦 {route.importSourceName}</p>
                                            )}
                                        </div>

                                        {/* Activity */}
                                        <div className="text-center">
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                                                <span>{activityEmoji(actType)}</span>
                                                <span>{activityLabel(actType)}</span>
                                            </span>
                                        </div>

                                        {/* Distance */}
                                        <div className="text-center">
                                            <p className="text-sm font-black text-gray-800">
                                                {route.distance > 0
                                                    ? route.distance < 1
                                                        ? `${Math.round(route.distance * 1000)}מ`
                                                        : `${(Math.round(route.distance * 10) / 10)} ק״מ`
                                                    : '—'}
                                            </p>
                                        </div>

                                        {/* Difficulty */}
                                        <div className="text-center">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${diff.cls}`}>
                                                {diff.label}
                                            </span>
                                        </div>

                                        {/* Status + action */}
                                        <div className="flex justify-center">
                                            {isPending ? (
                                                isSuperAdmin ? (
                                                    <button onClick={() => handleApprove(route.id)} disabled={isApproving}
                                                        className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60 shadow-sm shadow-green-200 whitespace-nowrap">
                                                        {isApproving
                                                            ? <Loader2 className="animate-spin" size={12} />
                                                            : <ShieldCheck size={12} />}
                                                        {isApproving ? 'מאשר...' : 'אשר ופרסם'}
                                                    </button>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200 whitespace-nowrap">
                                                        <Clock size={10} />
                                                        ממתין לאישור מנהל העל
                                                    </span>
                                                )
                                            ) : (
                                                <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                                                    <CheckCircle2 size={14} />
                                                    פעיל באפליקציה
                                                </span>
                                            )}
                                        </div>

                                        {/* Edit action */}
                                        <div className="flex justify-center">
                                            <Link
                                                href={`/admin/authority/routes/${route.id}/edit`}
                                                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-600 transition-colors"
                                            >
                                                <Pencil size={12} />
                                                עריכה
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Footer info */}
            {routes.length > 0 && (
                <p className="text-xs text-gray-400 text-center">
                    {routes.length} מסלולים • {publishedCount} פורסמו • {pendingCount} {isSuperAdmin ? 'ממתינים לאישורך' : 'ממתינים לאישור'}
                </p>
            )}
        </div>
    );
}

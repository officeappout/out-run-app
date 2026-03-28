'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { approvePark } from '@/features/admin/services/parks.service';
import { getAuthoritiesByManager, getAllAuthorities } from '@/features/admin/services/authority.service';
import { InventoryService } from '@/features/parks/core/services/inventory.service';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { Park } from '@/features/parks/core/types/park.types';
import type { Route } from '@/features/parks/core/types/route.types';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ShieldCheck,
  MapPin,
  Route as RouteIcon,
  Dumbbell,
  Building2,
  RefreshCw,
  User,
} from 'lucide-react';

type ApprovalTab = 'locations' | 'routes';

interface PendingPark extends Park {
  _type: 'park';
}

interface PendingRoute extends Route {
  _type: 'route';
}

export default function ApprovalCenterPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ApprovalTab>('locations');

  const [pendingParks, setPendingParks] = useState<PendingPark[]>([]);
  const [pendingRoutes, setPendingRoutes] = useState<PendingRoute[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authorityIds, setAuthorityIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/admin/login'); return; }

      try {
        const roleInfo = await checkUserRole(user.uid);
        const isSA = !!roleInfo.isSuperAdmin || !!roleInfo.isSystemAdmin;
        setIsSuperAdmin(isSA);
        setCurrentUserId(user.uid);

        if (!isSA && !roleInfo.isAuthorityManager) {
          router.push('/admin');
          return;
        }

        const userProfile = await getUserFromFirestore(user.uid);
        setAdminName(userProfile?.core?.name || user.email || '');

        let authIds: string[] = [];
        if (!isSA && roleInfo.authorityIds?.length) {
          authIds = roleInfo.authorityIds;
        }
        setAuthorityIds(authIds);

        await loadPendingItems(isSA, authIds, user.uid);
      } catch (error) {
        console.error('Error checking authorization:', error);
        router.push('/admin');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const loadPendingItems = async (
    superAdmin?: boolean,
    authIds?: string[],
    userId?: string,
  ) => {
    const sa = superAdmin ?? isSuperAdmin;
    const aids = authIds ?? authorityIds;
    const uid = userId ?? currentUserId;

    setLoading(true);
    try {
      const [parks, routes] = await Promise.all([
        loadPendingParks(sa, aids, uid),
        loadPendingRoutes(sa, aids, uid),
      ]);
      setPendingParks(parks);
      setPendingRoutes(routes);
    } catch (err) {
      console.error('Error loading pending items:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingParks = async (
    sa: boolean,
    aids: string[],
    uid: string | null,
  ): Promise<PendingPark[]> => {
    try {
      const q = query(
        collection(db, 'parks'),
        where('published', '==', false),
      );
      const snap = await getDocs(q);
      let docs = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        _type: 'park' as const,
      })) as PendingPark[];

      if (!sa) {
        docs = docs.filter(p =>
          (aids.length > 0 && aids.includes((p as any).authorityId)) ||
          (p as any).createdByUser === uid
        );
      }
      return docs;
    } catch {
      return [];
    }
  };

  const loadPendingRoutes = async (
    sa: boolean,
    aids: string[],
    uid: string | null,
  ): Promise<PendingRoute[]> => {
    try {
      const q = query(
        collection(db, 'official_routes'),
        where('published', '==', false),
      );
      const snap = await getDocs(q);
      let docs = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        _type: 'route' as const,
      })) as PendingRoute[];

      if (!sa) {
        docs = docs.filter(r =>
          (aids.length > 0 && aids.includes((r as any).authorityId)) ||
          (r as any).createdByUser === uid
        );
      }
      return docs;
    } catch {
      return [];
    }
  };

  const handleApprovePark = async (parkId: string) => {
    setProcessingId(parkId);
    try {
      await approvePark(parkId);
      setPendingParks(prev => prev.filter(p => p.id !== parkId));
    } catch {
      alert('שגיאה באישור המיקום');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveRoute = async (routeId: string) => {
    setProcessingId(routeId);
    try {
      await InventoryService.approveRoute(routeId);
      setPendingRoutes(prev => prev.filter(r => r.id !== routeId));
    } catch {
      alert('שגיאה באישור המסלול');
    } finally {
      setProcessingId(null);
    }
  };

  const totalPending = pendingParks.length + pendingRoutes.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <Loader2 className="w-8 h-8 text-cyan-600 animate-spin" />
        <span className="mr-3 text-gray-600">טוען פריטים ממתינים...</span>
      </div>
    );
  }

  const FACILITY_LABELS: Record<string, string> = {
    gym_park: 'פארק כושר',
    court: 'מגרש ספורט',
    nature_community: 'טבע וקהילה',
    urban_spot: 'תשתית עירונית',
    route: 'מסלול טיול',
    zen_spot: 'אזור מנוחה',
  };

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 flex items-center gap-3">
            <ShieldCheck className="text-cyan-500" size={30} />
            מרכז אישורים
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {isSuperAdmin
              ? totalPending > 0
                ? `${totalPending} פריטים ממתינים לאישורך`
                : 'אין פריטים ממתינים — הכל מאושר!'
              : totalPending > 0
                ? `${totalPending} פריטים שהגשת ממתינים לאישור`
                : 'אין בקשות ממתינות — הכל אושר!'}
          </p>
        </div>
        <button
          onClick={() => loadPendingItems()}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all text-sm"
        >
          <RefreshCw size={15} />
          רענן
        </button>
      </div>

      {/* Role indicator */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ${
        isSuperAdmin
          ? 'bg-blue-50 text-blue-700 border border-blue-200'
          : 'bg-purple-50 text-purple-700 border border-purple-200'
      }`}>
        {isSuperAdmin ? <ShieldCheck size={14} /> : <User size={14} />}
        {isSuperAdmin
          ? 'מנהל ראשי — מוצגים כל הפריטים הממתינים לאישור'
          : 'מנהל רשות — מוצגים הפריטים שהגשת לאישור'}
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'סה״כ ממתינים', value: totalPending,         icon: Clock,     color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
          { label: 'מיקומים',       value: pendingParks.length,  icon: MapPin,    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'מסלולים',       value: pendingRoutes.length, icon: RouteIcon, color: 'text-cyan-600',    bg: 'bg-cyan-50',    border: 'border-cyan-200' },
        ].map(kpi => (
          <div key={kpi.label} className={`${kpi.bg} rounded-2xl p-4 flex items-center gap-3 border ${kpi.border}`}>
            <div className={`w-10 h-10 rounded-full bg-white flex items-center justify-center ${kpi.color} shadow-sm flex-shrink-0`}>
              <kpi.icon size={20} />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900">{kpi.value}</p>
              <p className="text-xs font-bold text-gray-500">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
        {([
          { id: 'locations' as const, label: 'מיקומים', icon: MapPin,    count: pendingParks.length },
          { id: 'routes' as const,    label: 'מסלולים', icon: RouteIcon, count: pendingRoutes.length },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            {tab.count > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Locations Tab */}
      {activeTab === 'locations' && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {pendingParks.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-4 text-center">
              <CheckCircle2 size={40} className="text-green-400" />
              <p className="text-lg font-black text-gray-700">אין מיקומים ממתינים</p>
              <p className="text-sm text-gray-400">
                {isSuperAdmin ? 'כל המיקומים אושרו ופורסמו' : 'לא הגשת מיקומים לאישור'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {pendingParks.map(park => (
                <div key={park.id} className="px-6 py-4 flex items-center gap-4 hover:bg-amber-50/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
                    {park.facilityType === 'gym_park' ? <Dumbbell size={18} /> : <MapPin size={18} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{park.name || '(ללא שם)'}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                      {(park as any).origin === 'authority_admin' && (
                        <span className="flex items-center gap-1 text-purple-600">
                          <Building2 size={10} /> מקור: רשות
                        </span>
                      )}
                      {(park as any).origin === 'super_admin' && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <ShieldCheck size={10} /> מנהל ראשי
                        </span>
                      )}
                      {park.facilityType && (
                        <span>{FACILITY_LABELS[park.facilityType] || park.facilityType}</span>
                      )}
                      {(park as any).createdByUser && (
                        <span className="text-gray-400">מגיש: {(park as any).createdByUser?.slice(0, 8)}…</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                      <Clock size={9} /> {isSuperAdmin ? 'ממתין לאישורך' : 'ממתין לאישור'}
                    </span>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleApprovePark(park.id)}
                        disabled={processingId === park.id}
                        className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60 shadow-sm"
                      >
                        {processingId === park.id
                          ? <Loader2 className="animate-spin" size={12} />
                          : <ShieldCheck size={12} />}
                        {processingId === park.id ? 'מאשר...' : 'אשר ופרסם'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Routes Tab */}
      {activeTab === 'routes' && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {pendingRoutes.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-4 text-center">
              <CheckCircle2 size={40} className="text-green-400" />
              <p className="text-lg font-black text-gray-700">אין מסלולים ממתינים</p>
              <p className="text-sm text-gray-400">
                {isSuperAdmin ? 'כל המסלולים אושרו ופורסמו' : 'לא הגשת מסלולים לאישור'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {pendingRoutes.map(route => (
                <div key={route.id} className="px-6 py-4 flex items-center gap-4 hover:bg-amber-50/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600 flex-shrink-0">
                    <RouteIcon size={18} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{route.name || '(ללא שם)'}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                      {(route as any).origin === 'authority_admin' && (
                        <span className="flex items-center gap-1 text-purple-600">
                          <Building2 size={10} /> מקור: רשות
                        </span>
                      )}
                      {(route as any).origin === 'super_admin' && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <ShieldCheck size={10} /> מנהל ראשי
                        </span>
                      )}
                      {route.distance > 0 && (
                        <span>{route.distance < 1 ? `${Math.round(route.distance * 1000)}מ` : `${route.distance.toFixed(1)} ק״מ`}</span>
                      )}
                      {route.activityType && (
                        <span>{route.activityType === 'running' ? 'ריצה' : route.activityType === 'walking' ? 'הליכה' : route.activityType}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                      <Clock size={9} /> {isSuperAdmin ? 'ממתין לאישורך' : 'ממתין לאישור'}
                    </span>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleApproveRoute(route.id)}
                        disabled={processingId === route.id}
                        className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60 shadow-sm"
                      >
                        {processingId === route.id
                          ? <Loader2 className="animate-spin" size={12} />
                          : <ShieldCheck size={12} />}
                        {processingId === route.id ? 'מאשר...' : 'אשר ופרסם'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {totalPending > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {pendingParks.length} מיקומים + {pendingRoutes.length} מסלולים = {totalPending} פריטים {isSuperAdmin ? 'ממתינים לאישורך' : 'ממתינים לאישור'}
        </p>
      )}
    </div>
  );
}

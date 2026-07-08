'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getUserFromFirestore } from '@/lib/firestore.service';
import {
  approveEntity,
  rejectEntity,
  type ModerationEntityType,
} from '@/features/admin/services/moderation.service';
import {
  getAllContributions,
  getContributionsByAuthority,
} from '@/features/parks/core/services/contribution.service';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  MapPin,
  Route as RouteIcon,
  Dumbbell,
  Building2,
  RefreshCw,
  User,
  Mountain,
  Users,
  X,
} from 'lucide-react';

type ApprovalTab = 'locations' | 'routes' | 'climbs' | 'ugc';

// A row in the queue, normalised across entity types.
interface QueueItem {
  entityType: ModerationEntityType;
  id: string;
  title: string;
  subtitle: string;
  origin?: string;
  authorityId?: string;
  createdByUser?: string;
}

const CLIMB_TYPE_LABELS: Record<string, string> = {
  'short-sharp': 'קצר-חד',
  repeats: 'חזרות',
  'long-gentle': 'ארוך-מתון',
  'structure-ramp': 'רמפה בנויה',
  stairs: 'מדרגות',
};
const CONTRIB_TYPE_LABELS: Record<string, string> = {
  new_location: 'מיקום חדש',
  suggest_edit: 'הצעת עריכה',
  report: 'דיווח',
  review: 'ביקורת',
};
const FACILITY_LABELS: Record<string, string> = {
  gym_park: 'פארק כושר',
  court: 'מגרש ספורט',
  nature_community: 'טבע וקהילה',
  urban_spot: 'תשתית עירונית',
  route: 'מסלול טיול',
  zen_spot: 'אזור מנוחה',
};

export default function ApprovalCenterPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ApprovalTab>('locations');

  const [parks, setParks] = useState<QueueItem[]>([]);
  const [routes, setRoutes] = useState<QueueItem[]>([]);
  const [climbs, setClimbs] = useState<QueueItem[]>([]);
  const [ugc, setUgc] = useState<QueueItem[]>([]);
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
        if (!isSA && !roleInfo.isAuthorityManager) { router.push('/admin'); return; }
        const userProfile = await getUserFromFirestore(user.uid);
        setAdminName(userProfile?.core?.name || user.email || '');
        const authIds = (!isSA && roleInfo.authorityIds?.length) ? roleInfo.authorityIds : [];
        setAuthorityIds(authIds);
        await loadPendingItems(isSA, authIds, user.uid);
      } catch (error) {
        console.error('Error checking authorization:', error);
        router.push('/admin');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const loadPendingItems = async (superAdmin?: boolean, authIds?: string[], userId?: string) => {
    const sa = superAdmin ?? isSuperAdmin;
    const aids = authIds ?? authorityIds;
    const uid = userId ?? currentUserId;
    setLoading(true);
    try {
      const [p, r, c, u] = await Promise.all([
        loadPendingParks(sa, aids, uid),
        loadPendingRoutes(sa, aids, uid),
        loadPendingClimbs(sa),
        loadPendingContributions(sa, aids),
      ]);
      setParks(p); setRoutes(r); setClimbs(c); setUgc(u);
    } catch (err) {
      console.error('Error loading pending items:', err);
    } finally {
      setLoading(false);
    }
  };

  const scoped = (docs: QueueItem[], sa: boolean, aids: string[], uid: string | null) =>
    sa ? docs : docs.filter(d =>
      (aids.length > 0 && d.authorityId != null && aids.includes(d.authorityId)) ||
      (d.createdByUser != null && d.createdByUser === uid));

  const loadPendingParks = async (sa: boolean, aids: string[], uid: string | null): Promise<QueueItem[]> => {
    try {
      const snap = await getDocs(query(collection(db, 'parks'), where('published', '==', false)));
      const items = snap.docs.map(d => {
        const x: any = d.data();
        return {
          entityType: 'park' as const, id: d.id,
          title: x.name || '(ללא שם)',
          subtitle: FACILITY_LABELS[x.facilityType] || x.facilityType || 'מיקום',
          origin: x.origin, authorityId: x.authorityId, createdByUser: x.createdByUser,
        };
      });
      return scoped(items, sa, aids, uid);
    } catch { return []; }
  };

  const loadPendingRoutes = async (sa: boolean, aids: string[], uid: string | null): Promise<QueueItem[]> => {
    try {
      const snap = await getDocs(query(collection(db, 'official_routes'), where('published', '==', false)));
      const items = snap.docs.map(d => {
        const x: any = d.data();
        const dist = typeof x.distance === 'number'
          ? (x.distance >= 1000 ? `${(x.distance / 1000).toFixed(1)} ק״מ` : `${Math.round(x.distance)}מ׳`)
          : '';
        const act = x.activityType === 'running' ? 'ריצה' : x.activityType === 'walking' ? 'הליכה' : (x.activityType || '');
        return {
          entityType: 'route' as const, id: d.id,
          title: x.name || '(ללא שם)',
          subtitle: [dist, act].filter(Boolean).join(' · '),
          origin: x.origin, authorityId: x.authorityId, createdByUser: x.createdByUser,
        };
      });
      return scoped(items, sa, aids, uid);
    } catch { return []; }
  };

  // Climbs carry no authorityId — only super admins moderate them.
  const loadPendingClimbs = async (sa: boolean): Promise<QueueItem[]> => {
    if (!sa) return [];
    try {
      const snap = await getDocs(query(collection(db, 'climb_segments'), where('status', '==', 'pending')));
      return snap.docs.map(d => {
        const x: any = d.data();
        const grade = x.avgGrade != null ? ` @ ${x.avgGrade}%` : '';
        return {
          entityType: 'climb' as const, id: d.id,
          title: x.wayName || CLIMB_TYPE_LABELS[x.climbType] || 'עלייה',
          subtitle: [CLIMB_TYPE_LABELS[x.climbType] || x.climbType, x.lengthM ? `${x.lengthM}מ׳${grade}` : '', x.dir].filter(Boolean).join(' · '),
          origin: x.origin,
        };
      });
    } catch { return []; }
  };

  const loadPendingContributions = async (sa: boolean, aids: string[]): Promise<QueueItem[]> => {
    try {
      const list = sa
        ? await getAllContributions('pending')
        : (await Promise.all(aids.map(a => getContributionsByAuthority(a, undefined, 'pending')))).flat();
      return list.map(c => ({
        entityType: 'contribution' as const, id: c.id!,
        title: c.parkName || CONTRIB_TYPE_LABELS[c.type] || 'תרומה',
        subtitle: [CONTRIB_TYPE_LABELS[c.type] || c.type, c.facilityType ? FACILITY_LABELS[c.facilityType] || c.facilityType : ''].filter(Boolean).join(' · '),
        authorityId: c.authorityId, createdByUser: c.userId,
      }));
    } catch { return []; }
  };

  const removeFromState = (entityType: ModerationEntityType, id: string) => {
    const setter = { park: setParks, route: setRoutes, climb: setClimbs, contribution: setUgc }[entityType];
    setter(prev => prev.filter(i => i.id !== id));
  };

  const handleApprove = async (entityType: ModerationEntityType, id: string) => {
    setProcessingId(id);
    try {
      await approveEntity(entityType, id, { adminId: currentUserId || '', adminName });
      removeFromState(entityType, id);
    } catch (e) {
      console.error(e);
      alert('שגיאה באישור הפריט');
    } finally { setProcessingId(null); }
  };

  const handleReject = async (entityType: ModerationEntityType, id: string) => {
    const reason = window.prompt('סיבת הדחייה (אופציונלי, יירשם ב-audit):');
    if (reason === null) return; // cancelled
    setProcessingId(id);
    try {
      await rejectEntity(entityType, id, reason, { adminId: currentUserId || '', adminName });
      removeFromState(entityType, id);
    } catch (e) {
      console.error(e);
      alert('שגיאה בדחיית הפריט');
    } finally { setProcessingId(null); }
  };

  const totalPending = parks.length + routes.length + climbs.length + ugc.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <Loader2 className="w-8 h-8 text-cyan-600 animate-spin" />
        <span className="mr-3 text-gray-600">טוען פריטים ממתינים...</span>
      </div>
    );
  }

  const TABS = [
    { id: 'locations' as const, label: 'מיקומים', icon: MapPin, items: parks, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', rowIcon: Dumbbell },
    { id: 'routes' as const, label: 'מסלולים', icon: RouteIcon, items: routes, iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600', rowIcon: RouteIcon },
    { id: 'climbs' as const, label: 'עליות', icon: Mountain, items: climbs, iconBg: 'bg-orange-50', iconColor: 'text-orange-600', rowIcon: Mountain },
    { id: 'ugc' as const, label: 'תרומות משתמשים', icon: Users, items: ugc, iconBg: 'bg-purple-50', iconColor: 'text-purple-600', rowIcon: Users },
  ];
  const active = TABS.find(t => t.id === activeTab)!;

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
              ? totalPending > 0 ? `${totalPending} פריטים ממתינים לאישורך` : 'אין פריטים ממתינים — הכל מאושר!'
              : totalPending > 0 ? `${totalPending} פריטים שהגשת ממתינים לאישור` : 'אין בקשות ממתינות — הכל אושר!'}
          </p>
        </div>
        <button
          onClick={() => loadPendingItems()}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all text-sm"
        >
          <RefreshCw size={15} /> רענן
        </button>
      </div>

      {/* Role indicator */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold ${
        isSuperAdmin ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-purple-50 text-purple-700 border border-purple-200'
      }`}>
        {isSuperAdmin ? <ShieldCheck size={14} /> : <User size={14} />}
        {isSuperAdmin ? 'מנהל ראשי — מוצגים כל הפריטים הממתינים לאישור' : 'מנהל רשות — מוצגים הפריטים שהגשת לאישור'}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 rounded-2xl p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            {tab.items.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                {tab.items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active tab list */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {active.items.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 size={40} className="text-green-400" />
            <p className="text-lg font-black text-gray-700">אין {active.label} ממתינים</p>
            <p className="text-sm text-gray-400">
              {activeTab === 'climbs' && !isSuperAdmin ? 'עליות מנוהלות ע״י מנהל ראשי בלבד' : isSuperAdmin ? 'הכל אושר' : 'לא הגשת פריטים לאישור'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {active.items.map(item => (
              <div key={item.id} className="px-6 py-4 flex items-center gap-4 hover:bg-amber-50/30 transition-colors">
                <div className={`w-10 h-10 rounded-xl ${active.iconBg} flex items-center justify-center ${active.iconColor} flex-shrink-0`}>
                  <active.rowIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{item.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                    {item.origin === 'authority_admin' && (
                      <span className="flex items-center gap-1 text-purple-600"><Building2 size={10} /> מקור: רשות</span>
                    )}
                    {item.origin === 'super_admin' && (
                      <span className="flex items-center gap-1 text-blue-600"><ShieldCheck size={10} /> מנהל ראשי</span>
                    )}
                    {item.origin === 'osm_import' && (
                      <span className="flex items-center gap-1 text-orange-600"><Mountain size={10} /> ייבוא OSM</span>
                    )}
                    {item.subtitle && <span>{item.subtitle}</span>}
                    {item.createdByUser && (
                      <span className="text-gray-400">מגיש: {item.createdByUser.slice(0, 8)}…</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                    <Clock size={9} /> {isSuperAdmin ? 'ממתין לאישורך' : 'ממתין לאישור'}
                  </span>
                  {isSuperAdmin && (
                    <>
                      <button
                        onClick={() => handleApprove(item.entityType, item.id)}
                        disabled={processingId === item.id}
                        className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60 shadow-sm"
                      >
                        {processingId === item.id ? <Loader2 className="animate-spin" size={12} /> : <ShieldCheck size={12} />}
                        {processingId === item.id ? 'מעבד...' : 'אשר'}
                      </button>
                      <button
                        onClick={() => handleReject(item.entityType, item.id)}
                        disabled={processingId === item.id}
                        className="flex items-center gap-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60"
                      >
                        <X size={12} /> דחה
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPending > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {parks.length} מיקומים · {routes.length} מסלולים · {climbs.length} עליות · {ugc.length} תרומות = {totalPending} פריטים {isSuperAdmin ? 'ממתינים לאישורך' : 'ממתינים לאישור'}
        </p>
      )}
    </div>
  );
}

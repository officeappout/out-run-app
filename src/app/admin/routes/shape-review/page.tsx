'use client';

/**
 * /admin/routes/shape-review — the geometric shape-review screen, stage 1
 * of the plan. READ-FOCUSED display + a training-decision capture action;
 * does not publish, reject, or delete any route, does not touch
 * route-generator/route-stitching/decide-accuracy.ts. SuperAdmin-only, same
 * gate as the Accuracy Queue tab this screen complements.
 *
 * List and map are the SAME filtered set, just two views of it (toggle, not
 * separate pages) — per spec. The map is forced to one city at a time (no
 * "all cities" option on the map) because 97 routes on a national map is
 * spaghetti; the list has no such restriction. Reuses ApprovalDetailModal
 * (not a new panel) and RouteShapeReviewMap (not a third independent map
 * implementation — see that file's own header for why one extraction was
 * still necessary).
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import dynamicImport from 'next/dynamic';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { List, Map as MapIcon, Loader2, Search, Building2 } from 'lucide-react';
import ApprovalDetailModal, { type ApprovalDetailItem } from '@/features/admin/components/approval/ApprovalDetailModal';
import { SHAPE_TYPE_LABEL, SHAPE_TYPE_ICON, SHAPE_TYPE_MISSING_LABEL, SHAPE_TYPE_MISSING_ICON } from '@/features/admin/components/routes/shape-review-chips';
import { normalizeStoredRoutePath } from '@/features/parks/core/utils/routePath';
import type { ReviewMapRoute, ReviewDecision } from '@/features/admin/components/routes/RouteShapeReviewMap';

const RouteShapeReviewMap = dynamicImport(() => import('@/features/admin/components/routes/RouteShapeReviewMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" />,
});

interface RouteRow {
  id: string;
  name: string;
  city: string;
  shapeType: string | undefined;
  geometryMetrics: { closureGapM: number; selfOverlapPct: number; compactness: { polsbyPopper: number; reock: number; convexHullRatio: number } | null } | undefined;
  isReviewPriority: boolean;
  suggestedReasonChips: string[] | undefined;
  shapeTrainingReview: { decision: ReviewDecision; reasonChips: string[]; reasonFreeText: string | null } | null;
  path: [number, number][];
}

const DECISION_BADGE: Record<string, { label: string; className: string }> = {
  approved: { label: '✅ כן', className: 'bg-green-50 text-green-600' },
  maybe: { label: '❓ אולי', className: 'bg-yellow-50 text-yellow-600' },
  rejected: { label: '❌ לא', className: 'bg-red-50 text-red-600' },
};

export default function RouteShapeReviewPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [adminName, setAdminName] = useState('');

  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [citySearch, setCitySearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ApprovalDetailItem | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/admin/login'); return; }
      try {
        const roleInfo = await checkUserRole(user.uid);
        const isSA = !!roleInfo.isSuperAdmin || !!roleInfo.isSystemAdmin;
        if (!isSA) { router.push('/admin'); return; }
        const profile = await getUserFromFirestore(user.uid, { allowSelfHeal: false });
        setAdminId(user.uid);
        setAdminName(profile?.core?.name || user.email || '');
        setAuthChecked(true);
      } catch (e) {
        console.error('[shape-review] auth check failed:', e);
        router.push('/admin');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const loadRoutes = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'official_routes'), where('published', '==', false)));
      const rows: RouteRow[] = [];
      for (const doc of snap.docs) {
        const d = doc.data();
        if (d.status === 'archived') continue;
        rows.push({
          id: doc.id,
          name: d.name || '(ללא שם)',
          city: d.city || '(ללא עיר)',
          shapeType: d.shapeType,
          geometryMetrics: d.geometryMetrics,
          isReviewPriority: !!d.isReviewPriority,
          suggestedReasonChips: d.suggestedReasonChips,
          shapeTrainingReview: d.shapeTrainingReview ?? null,
          path: normalizeStoredRoutePath(d.path),
        });
      }
      // Priority (the 7) first, then everyone else — same list order feeds both views.
      rows.sort((a, b) => Number(b.isReviewPriority) - Number(a.isReviewPriority));
      setRoutes(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (authChecked) loadRoutes(); }, [authChecked]);

  const cities = useMemo(() => Array.from(new Set(routes.map((r) => r.city))).sort(), [routes]);
  const filteredCities = useMemo(
    () => (citySearch ? cities.filter((c) => c.includes(citySearch)) : cities),
    [cities, citySearch],
  );

  const filteredRoutes = useMemo(
    () => (cityFilter ? routes.filter((r) => r.city === cityFilter) : routes),
    [routes, cityFilter],
  );

  if (!authChecked) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-cyan-500" size={32} /></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">סיווג צורה — סקירת מסלולים ממתינים</h1>
          <p className="text-sm text-gray-400 mt-1">{routes.length} מסלולים · {routes.filter((r) => r.isReviewPriority).length} בעדיפות (ביטחון 90% + רבעון תחתון בשלושת המודדים)</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 rounded-2xl p-1">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${view === 'list' ? 'bg-white shadow-sm text-cyan-600' : 'text-gray-500'}`}
          >
            <List size={16} /> רשימה
          </button>
          <button
            onClick={() => setView('map')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${view === 'map' ? 'bg-white shadow-sm text-cyan-600' : 'text-gray-500'}`}
          >
            <MapIcon size={16} /> מפה
          </button>
        </div>
      </div>

      {/* City filter — same filter feeds both views; the map enforces a
          selection, the list does not (spec: map=per-city forced, list=not). */}
      <div className="mb-4 relative max-w-xs">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={cityFilter || citySearch}
          onChange={(e) => { setCitySearch(e.target.value); setCityFilter(null); }}
          placeholder="כל הערים — חפש כדי לסנן"
          className="w-full pr-9 pl-3 py-2.5 bg-gray-50 rounded-xl border-2 border-transparent focus:border-cyan-400 focus:bg-white transition-all outline-none text-sm"
        />
        {citySearch && !cityFilter && (
          <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
            {filteredCities.map((c) => (
              <button
                key={c}
                onClick={() => { setCityFilter(c); setCitySearch(''); }}
                className="w-full px-4 py-2 text-right text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Building2 size={14} className="text-gray-300" /> {c} <span className="text-gray-400 text-xs">({routes.filter((r) => r.city === c).length})</span>
              </button>
            ))}
          </div>
        )}
        {cityFilter && (
          <button onClick={() => setCityFilter(null)} className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">נקה</button>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center"><Loader2 className="animate-spin text-cyan-500" size={28} /></div>
      ) : view === 'list' ? (
        <div className="bg-white rounded-3xl shadow-premium border border-gray-50 divide-y divide-gray-50">
          {filteredRoutes.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedItem({ entityType: 'route', id: r.id, title: r.name })}
              className="w-full flex items-center gap-3 px-5 py-3 text-right hover:bg-gray-50 transition-colors"
            >
              {r.isReviewPriority && <span className="text-[10px] font-bold bg-red-50 text-red-500 px-2 py-0.5 rounded-full flex-shrink-0">עדיפות</span>}
              <span className="text-lg flex-shrink-0">{r.shapeType ? SHAPE_TYPE_ICON[r.shapeType] : SHAPE_TYPE_MISSING_ICON}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{r.name}</p>
                {/* r.shapeType absent = never backfilled (no geometry computed yet) — distinct
                    from shapeType==='unclassified' (measured, genuinely fits no category).
                    Collapsing these into one ⚪ "לא מסווג" was the exact ambiguity flagged
                    06.10.2026: a reviewer can't tell "no info" from "info says it's neither". */}
                <p className="text-xs text-gray-400">{r.city} · {r.shapeType ? SHAPE_TYPE_LABEL[r.shapeType] : SHAPE_TYPE_MISSING_LABEL}</p>
              </div>
              {r.geometryMetrics?.compactness && (
                <span className="text-[10px] font-mono text-gray-400 flex-shrink-0 hidden sm:inline">
                  PP={r.geometryMetrics.compactness.polsbyPopper} R={r.geometryMetrics.compactness.reock} CH={r.geometryMetrics.compactness.convexHullRatio}
                </span>
              )}
              {r.shapeTrainingReview?.decision && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${DECISION_BADGE[r.shapeTrainingReview.decision]?.className}`}>
                  {DECISION_BADGE[r.shapeTrainingReview.decision]?.label}
                </span>
              )}
            </button>
          ))}
          {filteredRoutes.length === 0 && <p className="text-center text-gray-400 text-sm py-10">אין מסלולים בסינון הנוכחי</p>}
        </div>
      ) : !cityFilter ? (
        <div className="h-[600px] bg-white rounded-3xl shadow-premium border border-gray-50 flex flex-col items-center justify-center gap-3 text-gray-400">
          <MapIcon size={40} />
          <p className="text-sm font-bold">בחר עיר כדי להציג מפה</p>
          <p className="text-xs">97 מסלולים על מפה ארצית = ספגטי — המפה דורשת עיר אחת</p>
        </div>
      ) : (
        <div className="h-[600px] rounded-3xl overflow-hidden shadow-premium border border-gray-50">
          <RouteShapeReviewMap
            routes={filteredRoutes
              .filter((r) => r.path.length >= 2)
              .map((r): ReviewMapRoute => ({ id: r.id, name: r.name, path: r.path, decision: r.shapeTrainingReview?.decision ?? null }))}
            selectedId={selectedItem?.id ?? null}
            onSelect={(id) => {
              const r = filteredRoutes.find((x) => x.id === id);
              if (r) setSelectedItem({ entityType: 'route', id: r.id, title: r.name });
            }}
          />
        </div>
      )}

      <ApprovalDetailModal
        item={selectedItem}
        isSuperAdmin={true}
        processingId={null}
        onApprove={() => {}}
        onReject={() => {}}
        onClose={() => setSelectedItem(null)}
        shapeReviewAdmin={{ adminId, adminName }}
        hideNativeActions
        onShapeReviewSubmitted={loadRoutes}
      />
    </div>
  );
}

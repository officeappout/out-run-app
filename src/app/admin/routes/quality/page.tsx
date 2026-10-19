'use client';

/**
 * /admin/routes/quality — route-quality audit + A/B (phase 0 of the route
 * quality plan). Runs the live loop generator N times from a start point
 * with route quality v1 OFF and/or ON (an explicit per-call override — the
 * panel flag enable_route_quality_v1 is NOT changed), and scores every route
 * with src/lib/route-quality: U-turns/spurs, retrace, self-crossings,
 * compactness, distance error, major-road share and crossings (OSM layer via
 * Overpass, cached 7 days). READ-ONLY: no Firestore writes anywhere on this
 * screen. SuperAdmin-only, same gate as /admin/routes/shape-review.
 */
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { QUALITY_START_PRESETS } from '@/features/admin/components/routes/route-quality/presets';
import { RouteQualityControls, type QualityControlsValue } from '@/features/admin/components/routes/route-quality/RouteQualityControls';
import { RouteQualityAggregate, RouteQualityRows } from '@/features/admin/components/routes/route-quality/RouteQualityTable';
import { useRouteQualityRunner } from '@/features/admin/components/routes/route-quality/useRouteQualityRunner';
import type { QualityVariant } from '@/features/admin/components/routes/route-quality/types';

const RouteQualityMap = dynamicImport(() => import('@/features/admin/components/routes/route-quality/RouteQualityMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" />,
});

const first = QUALITY_START_PRESETS[0];
const OSM_HE = { idle: '', loading: 'טוען שכבת OSM…', ready: 'שכבת OSM: מוכנה', unavailable: 'שכבת OSM לא זמינה (Overpass עמוס) — מדדי חציות חסרים' } as const;

export default function RouteQualityPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [controls, setControls] = useState<QualityControlsValue>({
    presetId: first.id, start: { lat: first.lat, lng: first.lng }, cityName: first.cityName, targetKm: 3, activity: 'running', runs: 3, mode: 'ab',
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { state, run, cancel } = useRouteQualityRunner();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/admin/login'); return; }
      try {
        const roleInfo = await checkUserRole(user.uid);
        if (!roleInfo.isSuperAdmin && !roleInfo.isSystemAdmin) { router.push('/admin'); return; }
        setAuthChecked(true);
      } catch {
        router.push('/admin');
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (!authChecked) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-cyan-500" size={32} /></div>;
  }

  const variants: QualityVariant[] = controls.mode === 'ab' ? ['off', 'on'] : controls.mode === 'ghab' ? ['on', 'gh'] : [controls.mode];
  const onRun = () => {
    setSelectedKey(null);
    run({ start: controls.start, cityName: controls.cityName, targetKm: controls.targetKm, activity: controls.activity, runs: controls.runs, variants });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-gray-900">איכות מסלולים מעגליים</h1>
        <p className="text-sm text-gray-400 mt-1">
          מריץ את מחולל המסלולים מנקודה ומודד כל מסלול: פרסות וענפים מתים, חזרה על אותו רחוב, הצטלבות עצמית, קומפקטיות, סטייה מהמרחק, כבישים ראשיים וחציות. <span className="text-blue-500 font-bold">כחול</span> = המחולל הנוכחי, <span className="text-emerald-500 font-bold">ירוק</span> = v1, <span className="text-violet-500 font-bold">סגול</span> = GraphHopper. קריאה בלבד.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        <div className="bg-white rounded-3xl shadow-premium border border-gray-50 p-5 space-y-5 h-fit">
          <RouteQualityControls
            value={controls}
            onChange={v => { setControls(v); }}
            running={state.running}
            onRun={onRun}
            onCancel={cancel}
            flagNote="ההשוואה מריצה את הגרסאות ישירות — לא משנה את הדגלים enable_route_quality_v1 / enable_graphhopper_routes בהגדרות המערכת. GH = שרת הניווט שלנו (GraphHopper), בלי חזרה ל-Mapbox."
          />
          {(state.progress || state.osmStatus !== 'idle' || state.error) && (
            <div className="text-xs space-y-1">
              {state.progress && <p className="text-cyan-600 font-bold">{state.progress}</p>}
              {state.osmStatus !== 'idle' && <p className={state.osmStatus === 'unavailable' ? 'text-amber-600' : 'text-gray-400'}>{OSM_HE[state.osmStatus]}</p>}
              {state.error && <p className="text-red-500">{state.error}</p>}
            </div>
          )}
          {state.routes.length > 0 && (
            <RouteQualityAggregate routes={state.routes} variants={variants} generations={state.generations} empty={state.emptyGenerations} />
          )}
        </div>
        <div className="space-y-5 min-w-0">
          <div className="h-[520px] rounded-3xl overflow-hidden border border-gray-100">
            <RouteQualityMap
              start={controls.start}
              routes={state.routes}
              selectedKey={selectedKey}
              onPickStart={p => setControls(c => ({ ...c, presetId: null, start: p }))}
            />
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> פרסה / ענף מת</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rotate-45 bg-orange-500 inline-block" /> חציה לא מסומנת של כביש ראשי</span>
            <span>קו דהוי = לא עובר את ספי v1 · לחיצה על שורה מבודדת מסלול</span>
          </div>
          {state.routes.length > 0 && (
            <div className="bg-white rounded-3xl shadow-premium border border-gray-50 p-4 overflow-x-auto">
              <RouteQualityRows routes={state.routes} selectedKey={selectedKey} onSelect={setSelectedKey} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

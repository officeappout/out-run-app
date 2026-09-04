'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  MapPinned,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Plus,
} from 'lucide-react';
import {
  runCityMapping,
  type CityMappingProgressUpdate,
  type CityMappingStepName,
  type CityMappingResult,
} from '@/features/admin/services/city-mapping-orchestrator';
import {
  loadDistinctRouteCities,
  loadCityMappingSummary,
  type CityMappingSummary,
} from '@/features/admin/services/city-mapping-summary';
import type { AmenityCategory } from '@/features/parks/core/types/osm-amenity.types';

// ── Step definitions ─────────────────────────────────────────────────────────

interface StepRow {
  id: CityMappingStepName;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  message: string;
  count: number | null;
}

const STEP_DEFINITIONS: ReadonlyArray<{ id: CityMappingStepName; label: string }> = [
  { id: 'authorityPreflight', label: '1. זיהוי רשות מקומית' },
  { id: 'routesGate', label: '2. שער מסלולים (Routes Gate)' },
  { id: 'streetSegments', label: '3. ייבוא קטעי רחוב' },
  { id: 'lighting', label: '4. תאורת מסלולים' },
  { id: 'amenitiesIngest', label: '5. ייבוא מתקנים ונקודות עניין' },
  { id: 'amenitiesTagging', label: '6. תיוג מסלולים במתקנים' },
  { id: 'adjacencyVerify', label: '7. אימות סמיכות מסלולים (קריאה בלבד)' },
];

const STEP_LABELS: Record<CityMappingStepName, string> = Object.fromEntries(
  STEP_DEFINITIONS.map((d) => [d.id, d.label]),
) as Record<CityMappingStepName, string>;

function buildInitialSteps(): StepRow[] {
  return STEP_DEFINITIONS.map((d) => ({ id: d.id, label: d.label, status: 'pending' as const, message: '', count: null }));
}

const AMENITY_CATEGORY_LABELS: Record<AmenityCategory, string> = {
  court: 'מגרשים',
  bench: 'ספסלים',
  drinking_water: 'ברזיות',
  fitness_station: 'מתקני כושר',
  crossing: 'מעברי חצייה',
  dog_park: 'גני כלבים',
};

/** Pulls the actual `npx tsx ...` command out of routesGate's 0-routes
 *  message (see city-mapping-orchestrator.ts's exact string) — stops at the
 *  first comma, which is exactly where the command ends in that message. */
function extractCliCommand(message: string): string | null {
  const match = message.match(/npx tsx [^,]+/);
  return match ? match[0] : null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CityMappingPage() {
  const router = useRouter();

  // ── Auth guard — explicit superAdmin-only, independent of street_segments'
  // own (broader, isAdmin()-based) Firestore rule. See the Stage C1 plan's
  // auth finding: this page must not rely on page-reachability alone. ──
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/admin/login'); return; }
      try {
        const roleInfo = await checkUserRole(user.uid);
        const isSA = !!roleInfo.isSuperAdmin || !!roleInfo.isSystemAdmin;
        if (!isSA) { router.push('/admin'); return; }
        setAuthorized(true);
      } catch (error) {
        console.error('Error checking authorization:', error);
        router.push('/admin');
      } finally {
        setAuthChecked(true);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // ── City picker ──
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [cityOptionsLoading, setCityOptionsLoading] = useState(true);
  const [cityOptionsError, setCityOptionsError] = useState<string | null>(null);
  const [city, setCity] = useState('');

  useEffect(() => {
    if (!authorized) return;
    (async () => {
      setCityOptionsLoading(true);
      try {
        setCityOptions(await loadDistinctRouteCities());
      } catch (err) {
        setCityOptionsError((err as Error).message ?? 'שגיאה בטעינת רשימת הערים');
      } finally {
        setCityOptionsLoading(false);
      }
    })();
  }, [authorized]);

  // ── Summary panel ──
  const [summary, setSummary] = useState<CityMappingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // ── Parameters ──
  const [latMin, setLatMin] = useState(0);
  const [lonMin, setLonMin] = useState(0);
  const [latMax, setLatMax] = useState(0);
  const [lonMax, setLonMax] = useState(0);
  const [bboxTouched, setBboxTouched] = useState(false);
  const [adminRelationId, setAdminRelationId] = useState('');
  const [adminRelationIdTouched, setAdminRelationIdTouched] = useState(false);
  const [dryRun, setDryRun] = useState(true);

  const bboxValid = latMin < latMax && lonMin < lonMax;
  const adminRelationIdValid = /^\d+$/.test(adminRelationId.trim());

  /** Stage C2: a real registered boundary is more accurate than a
   *  margin-padded estimate from whatever route geometry happens to exist —
   *  prefer it when present. */
  function bestBboxFor(s: CityMappingSummary): CityMappingSummary['suggestedBbox'] {
    return s.registeredCity?.bbox ?? s.suggestedBbox;
  }

  const refreshSummary = useCallback(async (): Promise<CityMappingSummary | null> => {
    const trimmed = city.trim();
    if (!trimmed) return null;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const s = await loadCityMappingSummary(trimmed);
      setSummary(s);
      const bbox = bestBboxFor(s);
      if (!bboxTouched && bbox) {
        setLatMin(bbox.latMin);
        setLonMin(bbox.lonMin);
        setLatMax(bbox.latMax);
        setLonMax(bbox.lonMax);
      }
      if (!adminRelationIdTouched && s.registeredCity?.adminRelationId != null) {
        setAdminRelationId(String(s.registeredCity.adminRelationId));
      }
      return s;
    } catch (err) {
      setSummaryError((err as Error).message ?? 'שגיאה בטעינת מצב העיר');
      return null;
    } finally {
      setSummaryLoading(false);
    }
  }, [city, bboxTouched, adminRelationIdTouched]);

  const handleDeriveBbox = useCallback(async () => {
    const s = summary?.city === city.trim() ? summary : await refreshSummary();
    if (!s) return;
    const bbox = bestBboxFor(s);
    if (bbox) {
      setLatMin(bbox.latMin);
      setLonMin(bbox.lonMin);
      setLatMax(bbox.latMax);
      setLonMax(bbox.lonMax);
      setBboxTouched(false);
    }
    if (s.registeredCity?.adminRelationId != null) {
      setAdminRelationId(String(s.registeredCity.adminRelationId));
      setAdminRelationIdTouched(false);
    }
  }, [summary, city, refreshSummary]);

  function markBboxTouched<T>(setter: (v: T) => void) {
    return (v: T) => { setBboxTouched(true); setter(v); };
  }

  // ── Run state ──
  const [steps, setSteps] = useState<StepRow[]>(buildInitialSteps);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<CityMappingResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onProgress = useCallback((update: CityMappingProgressUpdate) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === update.step ? { ...s, status: update.status, message: update.message, count: update.count ?? s.count } : s)),
    );
  }, []);

  const canRun = !running && !!city.trim() && bboxValid && adminRelationIdValid;

  async function handleRun() {
    if (!canRun) return;
    setRunning(true);
    setSteps(buildInitialSteps());
    setRunResult(null);
    setRunError(null);
    try {
      const res = await runCityMapping(onProgress, {
        city: city.trim(),
        bbox: { latMin, lonMin, latMax, lonMax },
        adminRelationId: Number(adminRelationId.trim()),
        apply: !dryRun,
      });
      setRunResult(res);
    } catch (err) {
      setRunError((err as Error).message ?? 'שגיאה בלתי צפויה');
    } finally {
      setRunning(false);
      await refreshSummary();
    }
  }

  async function handleCopyCommand(cmd: string) {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the command text is still visible/selectable
    }
  }

  const routesGateStep = steps.find((s) => s.id === 'routesGate');
  const routesGateBlocked = routesGateStep?.status === 'error';
  const routesGateCliCommand = routesGateStep?.message ? extractCliCommand(routesGateStep.message) : null;

  if (!authChecked || !authorized) {
    return (
      <div className="max-w-3xl mx-auto py-24 flex justify-center" dir="rtl">
        <Loader2 className="animate-spin text-teal-500" size={28} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8" dir="rtl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <MapPinned className="text-teal-600" size={28} />
          <h1 className="text-2xl font-black text-gray-900">מיפוי עיר</h1>
        </div>
        <p className="text-gray-500 text-sm">
          מריץ את צינור המיפוי המלא לעיר שכבר קיימת בה נתונים: קטעי רחוב, תאורה, מתקנים, ותיוג מסלולים. הכל נחת כ-
          <span className="font-bold">pending</span> — האישור הסופי תמיד דרך מרכז האישורים.
        </p>
      </div>

      {/* City picker */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-start gap-3">
          <label className="block flex-1">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">עיר</span>
            <input
              type="text"
              list="city-options"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onBlur={() => { if (city.trim()) refreshSummary(); }}
              disabled={running}
              placeholder="הקלד או בחר עיר..."
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-gray-50"
            />
            <datalist id="city-options">
              {cityOptions.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <Link
            href="/admin/city-mapping/add"
            className="mt-5 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-black whitespace-nowrap transition-colors"
          >
            <Plus size={14} />
            הוסף עיר חדשה
          </Link>
        </div>
        {cityOptionsLoading && <p className="text-xs text-gray-400">טוען רשימת ערים...</p>}
        {cityOptionsError && <p className="text-xs text-red-600">{cityOptionsError}</p>}
        {!cityOptionsLoading && cityOptions.length > 0 && (
          <p className="text-xs text-gray-400">{cityOptions.length} ערים ברשימה (עם מסלולים קיימים ו/או רשומות). אפשר גם להקליד עיר חדשה, או ללחוץ &quot;הוסף עיר חדשה&quot; אם היא לא קיימת ב-OSM עדיין ברשימה שלכם.</p>
        )}
        {summary?.authorityId && (
          <span className="inline-block text-[11px] font-mono bg-teal-50 text-teal-800 px-2 py-1 rounded me-2" dir="ltr">
            authorityId: {summary.authorityId}
          </span>
        )}
        {summary && summary.city === city.trim() && summary.registeredCity && (
          <span className="inline-block text-[11px] font-bold bg-teal-50 text-teal-800 px-2 py-1 rounded">
            נמצאה רשומת עיר (city_registrations/{summary.registeredCity.key}) — bbox {summary.registeredCity.adminRelationId != null ? 'ו-adminRelationId ' : ''}מולאו אוטומטית למטה
          </span>
        )}
      </div>

      {/* Summary panel */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-black text-gray-700 uppercase tracking-widest">מצב נוכחי בעיר</h2>
          <button
            onClick={() => refreshSummary()}
            disabled={!city.trim() || summaryLoading}
            className="ms-auto inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-900 disabled:opacity-40"
          >
            <RefreshCw size={13} className={summaryLoading ? 'animate-spin' : ''} />
            רענן
          </button>
        </div>

        {!city.trim() && <p className="text-xs text-gray-400">בחר או הקלד עיר כדי לראות את מצבה הנוכחי.</p>}
        {summaryError && <p className="text-xs text-red-600">{summaryError}</p>}

        {summary && summary.city === city.trim() && (
          <>
            {summary.routes.total === 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 font-bold">
                נראה שזו ריצה ראשונה עבור עיר זו — אין עדיין מסלולים.
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="מסלולים (סה״כ)" value={summary.routes.total} />
              <Stat label="מאושרים" value={summary.routes.approved} accent="teal" />
              <Stat label="ממתינים" value={summary.routes.pending} muted />
              <Stat label="אחר (ארכיון/נדחה)" value={summary.routes.other} muted />
            </div>

            <div>
              <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">מתקנים ונקודות עניין ({summary.amenities.total})</h3>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {(Object.keys(AMENITY_CATEGORY_LABELS) as AmenityCategory[]).map((cat) => (
                  <Stat key={cat} label={AMENITY_CATEGORY_LABELS[cat]} value={summary.amenities.byCategory[cat]} small />
                ))}
              </div>
              {summary.amenities.rejectedCount > 0 && (
                <p className="text-[11px] text-gray-400 mt-1">{summary.amenities.rejectedCount} נדחו, לא נספרו למעלה.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="פארקים"
                value={summary.parks.count ?? 0}
                caption={summary.parks.count === null ? 'authorityId לא נפתר' : undefined}
              />
              <Stat label="קשתות סמיכות (route_adjacency)" value={summary.adjacency.edgeCount} />
            </div>

            <div>
              <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">
                כיסוי תאורה{summary.lighting.coveragePct !== null ? ` — ${summary.lighting.coveragePct.toFixed(0)}%` : ''}
              </h3>
              {summary.lighting.coveragePct !== null && (
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-teal-500" style={{ width: `${summary.lighting.coveragePct}%` }} />
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="מוארים" value={summary.lighting.litCount} small />
                <Stat label="לא מוארים" value={summary.lighting.unlitCount} small muted />
                <Stat label="לא ידוע" value={summary.lighting.unknownCount} small muted />
                <Stat label="לא חושב מעולם" value={summary.lighting.notRunCount} small muted />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Parameters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Bounding Box (degrees)</h3>
            <button
              onClick={handleDeriveBbox}
              disabled={!city.trim() || running}
              className="ms-auto text-xs font-bold text-teal-700 hover:text-teal-900 disabled:opacity-40"
            >
              טען קואורדינטות ממסלולים קיימים
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'latMin', value: latMin, setter: markBboxTouched(setLatMin) },
              { label: 'lonMin', value: lonMin, setter: markBboxTouched(setLonMin) },
              { label: 'latMax', value: latMax, setter: markBboxTouched(setLatMax) },
              { label: 'lonMax', value: lonMax, setter: markBboxTouched(setLonMax) },
            ].map(({ label, value, setter }) => (
              <label key={label} className="block">
                <span className="text-[11px] font-bold text-gray-500">{label}</span>
                <input
                  type="number"
                  step="0.0001"
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                  disabled={running}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-gray-50"
                  dir="ltr"
                />
              </label>
            ))}
          </div>
          {summary?.bboxSourceRouteCount !== undefined && summary.city === city.trim() && (
            <p className="mt-2 text-xs text-gray-500">מבוסס על {summary.bboxSourceRouteCount} מסלולים עם גיאומטריה.</p>
          )}
          {!bboxValid && (
            <p className="mt-1 text-xs text-red-600 font-bold">BBox לא תקין — latMin &lt; latMax, lonMin &lt; lonMax</p>
          )}
          {summary && summary.city === city.trim() && !summary.suggestedBbox && (
            <p className="mt-1 text-xs text-amber-700">
              אין עדיין גיאומטריית מסלולים לעיר זו — יש להריץ קודם את סקריפט הגילוי (ראו את חסימת &quot;שער מסלולים&quot; למטה לאחר ריצה ראשונה), ואז ללחוץ שוב.
            </p>
          )}
        </div>

        <div>
          <label className="block">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">adminRelationId (OSM admin_level=8)</span>
            <input
              type="text"
              inputMode="numeric"
              value={adminRelationId}
              onChange={(e) => { setAdminRelationIdTouched(true); setAdminRelationId(e.target.value); }}
              disabled={running}
              placeholder="לדוגמה: 1387888"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-gray-50"
              dir="ltr"
            />
          </label>
          <p className="mt-1 text-xs text-gray-500 flex items-center gap-1 flex-wrap">
            מספר ה-relation המספרי של גבול העיר ב-OSM (admin_level=8) — אין חיפוש אוטומטי בכוונה (אין לנחש התאמת שם↔relation). חפשו ב-
            {city.trim() && (
              <a
                href={`https://nominatim.openstreetmap.org/ui/search.html?q=${encodeURIComponent(city.trim())}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-teal-700 hover:text-teal-900 font-bold"
              >
                Nominatim <ExternalLink size={11} />
              </a>
            )}
            {!city.trim() && <span className="font-bold">Nominatim</span>}
            {' '}והעתיקו את המספר מתוך ה-URL בסגנון relation/NNNNNNN.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            disabled={running}
            className="w-5 h-5 rounded border-gray-300 text-teal-500 focus:ring-teal-400"
          />
          <div>
            <p className="text-sm font-black text-gray-900 flex items-center gap-1.5">
              <Eye size={14} />
              Dry Run
            </p>
            <p className="text-xs text-gray-500">ללא כתיבה ל-Firestore בכל השלבים (מומלץ לבדיקה ראשונית)</p>
          </div>
        </label>

        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={handleRun}
            disabled={!canRun}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-black transition-colors"
          >
            {running ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                מריץ...
              </>
            ) : (
              <>
                <Play size={18} fill="currentColor" />
                הרץ
              </>
            )}
          </button>
          {!dryRun && (
            <p className="mt-2 text-xs text-amber-700 font-bold flex items-center gap-1.5">
              <AlertCircle size={14} />
              מצב Commit — ייכתבו מסמכים אמיתיים ל-Firestore בשלבים הרלוונטיים.
            </p>
          )}
        </div>
      </div>

      {/* Live step progress */}
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
        {steps.map((s) => <StepIndicator key={s.id} row={s} />)}
      </div>

      {/* routesGate blocked panel */}
      {routesGateBlocked && routesGateStep && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-black">
            <AlertCircle size={18} />
            שער המסלולים חסם את הריצה
          </div>
          <p className="text-sm text-amber-900">{routesGateStep.message}</p>
          {routesGateCliCommand && (
            <div className="space-y-2">
              <div className="bg-gray-950 rounded-xl p-3 font-mono text-xs text-green-400 overflow-x-auto" dir="ltr">
                {routesGateCliCommand}
              </div>
              <button
                onClick={() => handleCopyCommand(routesGateCliCommand)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:text-amber-950"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'הועתק' : 'העתק פקודה'}
              </button>
            </div>
          )}
          <p className="text-xs text-amber-800">
            יש להריץ פקודה זו בטרמינל של הפרויקט, ולאחר סיומה ללחוץ שוב על &quot;הרץ&quot; למעלה עם אותו שם עיר בדיוק.
          </p>
        </div>
      )}

      {/* Post-run result */}
      {runResult && (
        <div className={`rounded-2xl border p-5 space-y-3 ${runResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2">
            {runResult.success ? <CheckCircle2 className="text-green-600" size={20} /> : <AlertCircle className="text-red-600" size={20} />}
            <p className={`font-black ${runResult.success ? 'text-green-900' : 'text-red-900'}`}>
              {runResult.success ? 'הריצה הושלמה בהצלחה' : 'הריצה נכשלה'}
            </p>
          </div>
          <ResultTable counts={runResult.counts} />
          {runResult.errors.length > 0 && (
            <pre className="text-xs font-mono text-red-800 whitespace-pre-wrap">{runResult.errors.join('\n')}</pre>
          )}
        </div>
      )}

      {/* Unexpected exception — distinct from a step's own reported error */}
      {runError && (
        <div className="bg-red-50 border border-red-300 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="text-red-700 mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-black text-red-900">שגיאה בלתי צפויה — לא קשורה לשלב ספציפי:</p>
            <p className="text-sm font-mono text-red-800 mt-1 break-all">{runError}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ row }: { row: StepRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusIcon status={row.status} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm">{row.label}</p>
        {row.message && <p className="text-xs text-slate-500 mt-0.5">{row.message}</p>}
      </div>
      {row.count !== null && row.status === 'done' && (
        <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-1 rounded">{row.count.toLocaleString('he-IL')}</span>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: StepRow['status'] }) {
  if (status === 'running') return <Loader2 size={18} className="text-teal-500 animate-spin" />;
  if (status === 'done') return <CheckCircle2 size={18} className="text-green-500" />;
  if (status === 'error') return <AlertCircle size={18} className="text-red-500" />;
  return <div className="w-[18px] h-[18px] rounded-full border-2 border-slate-300" />;
}

function Stat({
  label,
  value,
  accent,
  muted,
  small,
  caption,
}: {
  label: string;
  value: number;
  accent?: 'teal';
  muted?: boolean;
  small?: boolean;
  caption?: string;
}) {
  return (
    <div
      className={`rounded-xl text-center ${small ? 'p-2' : 'p-3'} ${
        accent === 'teal' ? 'bg-teal-50 border border-teal-200' : muted ? 'bg-gray-50 border border-gray-200' : 'bg-white border border-gray-200'
      }`}
    >
      <p className={`${small ? 'text-lg' : 'text-2xl'} font-black ${accent === 'teal' ? 'text-teal-700' : muted ? 'text-gray-500' : 'text-gray-900'}`}>
        {value.toLocaleString('he-IL')}
      </p>
      <p className="text-[11px] font-bold text-gray-500 mt-1">{label}</p>
      {caption && <p className="text-[10px] text-gray-400 mt-0.5">{caption}</p>}
    </div>
  );
}

function ResultTable({ counts }: { counts: Partial<Record<CityMappingStepName, number>> }) {
  const entries = Object.entries(counts) as Array<[CityMappingStepName, number]>;
  if (entries.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-start">שלב</th>
            <th className="px-3 py-2 text-end">מספר</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map(([key, count]) => (
            <tr key={key}>
              <td className="px-3 py-2 text-slate-900">{STEP_LABELS[key] ?? key}</td>
              <td className="px-3 py-2 text-end font-mono text-slate-700">{count.toLocaleString('he-IL')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

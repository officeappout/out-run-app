'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  MapPinned,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Check,
} from 'lucide-react';
import type { BoundaryCandidate } from '@/app/api/admin/city-mapping/resolve-boundary/route';

const BoundaryConfirmMap = dynamicImport(
  () => import('@/features/admin/components/city-mapping/BoundaryConfirmMap'),
  { ssr: false, loading: () => <div className="h-72 bg-gray-100 animate-pulse rounded-xl" /> },
);

/** Slugifies an OSM name:en tag into a `city_registrations` doc-id-safe
 *  key — the same style of identifier geo-discovery-routes.ts's own
 *  `--region=<key>` CLI argument expects. Genuinely a best-effort default,
 *  always editable — if the boundary has no name:en tag, this starts
 *  empty and the operator must type one (the one field this screen can't
 *  always auto-derive). */
function slugifyKey(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

interface BoundaryGeometryResult {
  geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number };
}

export default function AddCityPage() {
  const router = useRouter();

  // ── Auth guard — same explicit superAdmin-only pattern as /admin/city-mapping ──
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

  // ── Search ──
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<BoundaryCandidate[] | null>(null);

  async function handleSearch() {
    const term = searchTerm.trim();
    if (!term) return;
    setSearching(true);
    setSearchError(null);
    setCandidates(null);
    setSelectedCandidate(null);
    setBoundaryResult(null);
    try {
      const res = await fetch('/api/admin/city-mapping/resolve-boundary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: term }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `החיפוש נכשל (HTTP ${res.status})`);
      setCandidates(json.candidates ?? []);
    } catch (err) {
      setSearchError((err as Error).message ?? 'שגיאה בחיפוש');
    } finally {
      setSearching(false);
    }
  }

  // ── Candidate pick + boundary geometry ──
  const [selectedCandidate, setSelectedCandidate] = useState<BoundaryCandidate | null>(null);
  const [geometryLoading, setGeometryLoading] = useState(false);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [boundaryResult, setBoundaryResult] = useState<BoundaryGeometryResult | null>(null);

  // ── Form fields (auto-derived, editable) ──
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [labelTouched, setLabelTouched] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);

  async function handlePickCandidate(candidate: BoundaryCandidate) {
    setSelectedCandidate(candidate);
    setBoundaryResult(null);
    setGeometryError(null);
    if (!labelTouched) setLabel(candidate.nameHe ?? candidate.name ?? '');
    if (!keyTouched) setKey(candidate.nameEn ? slugifyKey(candidate.nameEn) : '');

    setGeometryLoading(true);
    try {
      const res = await fetch('/api/admin/city-mapping/boundary-geometry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationId: candidate.relationId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `שליפת הגבול נכשלה (HTTP ${res.status})`);
      setBoundaryResult(json as BoundaryGeometryResult);
    } catch (err) {
      setGeometryError((err as Error).message ?? 'שגיאה בשליפת גבול העיר');
    } finally {
      setGeometryLoading(false);
    }
  }

  // ── Save ──
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<{ key: string } | null>(null);

  const canSave = !!selectedCandidate && !!boundaryResult && !!label.trim() && !!key.trim() && !saving;

  async function handleSave() {
    if (!canSave || !selectedCandidate || !boundaryResult) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/city-mapping/register-city', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key.trim(),
          label: label.trim(),
          adminRelationId: selectedCandidate.relationId,
          bbox: boundaryResult.bbox,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `השמירה נכשלה (HTTP ${res.status})`);
      setSaveSuccess({ key: json.key ?? key.trim() });
    } catch (err) {
      setSaveError((err as Error).message ?? 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  }

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
        <Link href="/admin/city-mapping" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 mb-3">
          <ArrowRight size={14} />
          חזרה למיפוי עיר
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <MapPinned className="text-teal-600" size={28} />
          <h1 className="text-2xl font-black text-gray-900">הוספת עיר חדשה</h1>
        </div>
        <p className="text-gray-500 text-sm">
          חפשו עיר, בחרו את גבול הרשות המנהלית הנכון ב-OSM, אשרו על המפה, ושמרו. אין צורך להקליד מספר relation ידנית — הוא נגזר מהבחירה שלכם.
        </p>
      </div>

      {saveSuccess ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-green-600" size={22} />
            <p className="font-black text-green-900">העיר נשמרה בהצלחה</p>
          </div>
          <p className="text-sm text-green-800">
            נוצרה רשומה ב-city_registrations תחת המפתח <span className="font-mono" dir="ltr">{saveSuccess.key}</span>.
          </p>
          <div className="flex gap-3">
            <Link
              href="/admin/city-mapping"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-sm font-black transition-colors"
            >
              עבור למיפוי עיר
            </Link>
            <button
              onClick={() => {
                setSaveSuccess(null);
                setCandidates(null);
                setSelectedCandidate(null);
                setBoundaryResult(null);
                setSearchTerm('');
                setLabel('');
                setKey('');
                setLabelTouched(false);
                setKeyTouched(false);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-bold transition-colors"
            >
              הוסף עיר נוספת
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <label className="block">
              <span className="text-xs font-black text-gray-500 uppercase tracking-widest">חיפוש עיר</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="לדוגמה: רעננה"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchTerm.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-black transition-colors"
                >
                  {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  חפש
                </button>
              </div>
            </label>
            <p className="text-xs text-gray-400">
              החיפוש מתבצע מול OSM (Overpass), על גבולות מנהליים ברמת admin_level=8 בתוך ישראל, ומתאים גם ל-name וגם ל-name:he/name:en בהתאמה גמישה (לא מדויקת) — כדי לא לפספס איות עברי שונה.
            </p>
            {searchError && (
              <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={13} />{searchError}</p>
            )}
          </div>

          {/* Candidate list */}
          {candidates && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-black text-gray-700 uppercase tracking-widest">
                תוצאות ({candidates.length})
              </h2>
              {candidates.length === 0 && (
                <p className="text-xs text-gray-400">לא נמצאו גבולות מנהליים מתאימים. נסו איות אחר.</p>
              )}
              <div className="space-y-2">
                {candidates.map((c) => {
                  const isSelected = selectedCandidate?.relationId === c.relationId;
                  return (
                    <button
                      key={c.relationId}
                      onClick={() => handlePickCandidate(c)}
                      className={`w-full text-start p-3 rounded-xl border transition-colors ${
                        isSelected ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-200 hover:bg-teal-50/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isSelected && <Check size={16} className="text-teal-600 shrink-0" />}
                        <span className="font-bold text-gray-900">{c.nameHe ?? c.name ?? '(ללא שם)'}</span>
                        {c.name && c.name !== c.nameHe && <span className="text-gray-400 text-xs">{c.name}</span>}
                        {c.nameEn && <span className="text-gray-400 text-xs" dir="ltr">{c.nameEn}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono text-gray-500" dir="ltr">
                        <span>relation/{c.relationId}</span>
                        {c.adminLevel && <span>admin_level={c.adminLevel}</span>}
                        {c.wikidata && <span>{c.wikidata}</span>}
                        {c.refIlCbs && <span>ref:IL:cbs={c.refIlCbs}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Map confirm */}
          {selectedCandidate && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-black text-gray-700 uppercase tracking-widest">אישור על המפה</h2>
              {geometryLoading && (
                <div className="h-72 bg-gray-100 animate-pulse rounded-xl flex items-center justify-center">
                  <Loader2 className="animate-spin text-teal-500" size={24} />
                </div>
              )}
              {geometryError && (
                <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={13} />{geometryError}</p>
              )}
              {boundaryResult && selectedCandidate.center && (
                <BoundaryConfirmMap geojson={boundaryResult.geojson} center={selectedCandidate.center} />
              )}
              <p className="text-xs text-gray-500">
                וודאו שהצורה המסומנת היא אכן גבול הרשות המבוקש לפני השמירה — אין אימות אוטומטי נוסף מעבר לבחירה שלכם.
              </p>
            </div>
          )}

          {/* Fields + save */}
          {boundaryResult && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-black text-gray-500 uppercase tracking-widest">שם עיר (label)</span>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => { setLabelTouched(true); setLabel(e.target.value); }}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black text-gray-500 uppercase tracking-widest">key (מזהה פנימי / CLI)</span>
                  <input
                    type="text"
                    value={key}
                    onChange={(e) => { setKeyTouched(true); setKey(e.target.value); }}
                    placeholder={selectedCandidate?.nameEn ? undefined : 'לא נמצא name:en — יש להקליד ידנית'}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    dir="ltr"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                bbox ו-adminRelationId נגזרים אוטומטית מהגבול שאושר למעלה — לא ניתנים לעריכה ידנית כאן.
              </p>

              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-black transition-colors"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  {saving ? 'שומר...' : 'שמור עיר'}
                </button>
                {saveError && (
                  <p className="mt-2 text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={13} />{saveError}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

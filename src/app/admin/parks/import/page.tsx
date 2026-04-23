'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  MapPin,
  Dumbbell,
  Link2,
  FileSpreadsheet,
  ChevronDown,
  PackageOpen,
  ArrowLeft,
  ImageIcon,
  HardDriveDownload,
  Video,
  FolderUp,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import type { Authority } from '@/types/admin-types';
import {
  buildImportPreview,
  executeImport,
  overrideAuthority,
  bulkUploadLocalMedia,
  type ImportPreview,
  type ImportResult,
  type ImportProgress,
  type ParkPreview,
  type BulkUploadProgress,
  type BulkUploadResult,
} from '@/features/admin/services/park-import.service';

// ============================================================================
// Types
// ============================================================================

type Step = 'upload' | 'preview' | 'importing' | 'done';

// ============================================================================
// Component
// ============================================================================

export default function ParkBulkImportPage() {
  // Auth
  const [authed, setAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Files (4 total — files.csv is optional)
  const [parksFile, setParksFile] = useState<File | null>(null);
  const [equipmentFile, setEquipmentFile] = useState<File | null>(null);
  const [junctionFile, setJunctionFile] = useState<File | null>(null);
  const [filesFile, setFilesFile] = useState<File | null>(null);

  // Workflow
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState('');

  // Authority dropdown data (for manual override)
  const [authorities, setAuthorities] = useState<Authority[]>([]);

  // Bulk upload
  const [bulkProgress, setBulkProgress] = useState<BulkUploadProgress | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);

  // Filter & pagination
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'warning' | 'error'>('all');
  const [visibleCount, setVisibleCount] = useState(50);

  // Refs for file inputs
  const parksRef = useRef<HTMLInputElement>(null);
  const equipRef = useRef<HTMLInputElement>(null);
  const juncRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const folderRefDone = useRef<HTMLInputElement>(null);

  // ── Auth check ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const role = await checkUserRole(user.uid);
          setAuthed(role.isSuperAdmin || role.isSystemAdmin);
        } catch {
          setAuthed(false);
        }
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Load authorities for override dropdown ──────────────────────────────
  useEffect(() => {
    if (authed) {
      getAllAuthorities().then(setAuthorities).catch(console.error);
    }
  }, [authed]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleParse = useCallback(async () => {
    if (!parksFile || !equipmentFile || !junctionFile) return;
    setLoading(true);
    setError('');
    try {
      const data = await buildImportPreview(parksFile, equipmentFile, junctionFile, filesFile);
      setPreview(data);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בקריאת הקבצים');
    } finally {
      setLoading(false);
    }
  }, [parksFile, equipmentFile, junctionFile, filesFile]);

  const handleImport = useCallback(async () => {
    if (!preview) return;
    setStep('importing');
    setError('');
    setProgress(null);
    try {
      const res = await executeImport(preview, setProgress);
      setResult(res);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בייבוא');
      setStep('preview');
    }
  }, [preview]);

  const handleAuthorityOverride = useCallback(
    (parkCsvId: string, authorityId: string) => {
      if (!preview) return;
      const a = authorities.find((x) => x.id === authorityId);
      if (!a) return;
      setPreview(overrideAuthority(preview, parkCsvId, authorityId, a.name));
    },
    [preview, authorities],
  );

  const handleBulkUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setBulkUploading(true);
    setBulkResult(null);
    setBulkProgress(null);
    try {
      const res = await bulkUploadLocalMedia(fileList, setBulkProgress);
      setBulkResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהעלאת מדיה מקומית');
    } finally {
      setBulkUploading(false);
    }
  }, []);

  const resetAll = () => {
    setParksFile(null);
    setEquipmentFile(null);
    setJunctionFile(null);
    setFilesFile(null);
    setPreview(null);
    setResult(null);
    setStep('upload');
    setError('');
    setProgress(null);
    setStatusFilter('all');
    setVisibleCount(50);
    setBulkProgress(null);
    setBulkResult(null);
    setBulkUploading(false);
  };

  // ── Derived data ────────────────────────────────────────────────────────

  const filteredParks: ParkPreview[] = preview
    ? statusFilter === 'all'
      ? preview.parks
      : preview.parks.filter((p) => p.status === statusFilter)
    : [];

  const visibleParks = filteredParks.slice(0, visibleCount);

  // ── Auth gate ───────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
          <p className="text-gray-600">אין לך הרשאות לעמוד זה</p>
          <Link href="/admin" className="text-blue-600 underline text-sm">חזרה לדשבורד</Link>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-20" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/parks" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">ייבוא פארקים ומתקנים</h1>
              <p className="text-sm text-gray-500">
                העלאת parks.csv, equipment.csv, park_equipment.csv ו-files.csv
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <StepBadge label="העלאה" active={step === 'upload'} done={step !== 'upload'} />
            <ChevronDown className="h-4 w-4 text-gray-300 -rotate-90" />
            <StepBadge label="תצוגה מקדימה" active={step === 'preview'} done={step === 'importing' || step === 'done'} />
            <ChevronDown className="h-4 w-4 text-gray-300 -rotate-90" />
            <StepBadge label="ייבוא והעברת מדיה" active={step === 'importing'} done={step === 'done'} />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* ── STEP: UPLOAD ────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FileDropZone
                label="parks.csv"
                description="קובץ הפארקים — id, title, latitude, longitude, muniid"
                icon={<MapPin className="h-6 w-6" />}
                file={parksFile}
                inputRef={parksRef}
                onFileChange={setParksFile}
                accept=".csv,.xlsx"
              />
              <FileDropZone
                label="equipment.csv"
                description="קובץ המתקנים — id, title, image, functional, summaryremarks, companyid"
                icon={<Dumbbell className="h-6 w-6" />}
                file={equipmentFile}
                inputRef={equipRef}
                onFileChange={setEquipmentFile}
                accept=".csv,.xlsx"
              />
              <FileDropZone
                label="park_equipment.csv"
                description="טבלת קישור — parkid, equipmentid"
                icon={<Link2 className="h-6 w-6" />}
                file={junctionFile}
                inputRef={juncRef}
                onFileChange={setJunctionFile}
                accept=".csv,.xlsx"
              />
              <FileDropZone
                label="files.csv"
                description="מדיה — entityid/parkid, url, type (אופציונלי)"
                icon={<ImageIcon className="h-6 w-6" />}
                file={filesFile}
                inputRef={filesRef}
                onFileChange={setFilesFile}
                accept=".csv,.xlsx"
                optional
              />
            </div>

            {/* Migration info banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <HardDriveDownload className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold">העברת מדיה אוטומטית</p>
                <p className="mt-1 text-blue-700">
                  כל תמונה וסרטון יורדו מהשרת הישן ויועלו ל-Firebase Storage.
                  תהליך זה יכול לקחת זמן עבור כמויות גדולות.
                </p>
              </div>
            </div>

            {/* ── Bulk Upload Local Media ──────────────────────────────── */}
            <div className="bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-cyan-100 rounded-xl">
                  <FolderUp className="h-6 w-6 text-cyan-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-base">העלאת מדיה מקומית (Bulk Upload)</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    בחר את תיקיית <code className="bg-white px-1.5 py-0.5 rounded text-xs font-mono">out-files</code> מהמחשב.
                    הקבצים יתואמו אוטומטית לפארקים ומתקנים לפי שם הקובץ ויועלו ישירות ל-Firebase Storage.
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ניתן להשתמש גם ללא קבצי CSV — ההעלאה עובדת ישירות מול Firestore.
                  </p>

                  <div className="mt-3 flex items-center gap-3">
                    <input
                      ref={folderRef}
                      type="file"
                      className="hidden"
                      // @ts-expect-error webkitdirectory is non-standard
                      webkitdirectory=""
                      multiple
                      onChange={(e) => handleBulkUpload(e.target.files)}
                    />
                    <button
                      disabled={bulkUploading}
                      onClick={() => folderRef.current?.click()}
                      className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-medium
                                 hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderUp className="h-4 w-4" />}
                      {bulkUploading ? 'מעלה...' : 'בחר תיקייה והעלה'}
                    </button>

                    {bulkProgress && bulkProgress.phase !== 'done' && (
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>{bulkProgress.detail}</span>
                          <span className="font-mono">{bulkProgress.current}/{bulkProgress.total}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                            style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {bulkResult && (
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {bulkResult.uploaded} הועלו
                      </span>
                      {bulkResult.notMatched > 0 && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-600 rounded-full">
                          {bulkResult.notMatched} ללא התאמה
                        </span>
                      )}
                      {bulkResult.errors.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-600 rounded-full">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {bulkResult.errors.length} שגיאות
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              <button
                disabled={!parksFile || !equipmentFile || !junctionFile || loading}
                onClick={handleParse}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-medium
                           hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSpreadsheet className="h-5 w-5" />}
                ניתוח ותצוגה מקדימה
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: PREVIEW ───────────────────────────────────────────── */}
        {step === 'preview' && preview && (
          <div className="space-y-6">
            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard label="סה״כ פארקים" value={preview.stats.totalParks} color="blue" />
              <StatCard label="מוכנים" value={preview.stats.readyParks} color="green" />
              <StatCard label="אזהרות" value={preview.stats.warningParks} color="yellow" />
              <StatCard label="שגיאות" value={preview.stats.errorParks} color="red" />
              <StatCard label="מתקנים חדשים" value={preview.stats.newEquipment} color="purple" />
              <StatCard label="סרטונים" value={preview.stats.totalVideos} color="indigo" />
            </div>

            {/* Equipment summary */}
            {preview.stats.newEquipment > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <h3 className="font-semibold text-purple-800 mb-2 flex items-center gap-2">
                  <PackageOpen className="h-5 w-5" />
                  מתקנים חדשים שייווצרו ({preview.stats.newEquipment})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {preview.equipment
                    .filter((e) => e.status === 'new')
                    .map((e) => (
                      <span
                        key={e.csvId}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white rounded-full text-sm text-purple-700 border border-purple-200"
                      >
                        <Dumbbell className="h-3.5 w-3.5" />
                        {e.name}
                        {e.brandName !== 'Imported' && (
                          <span className="text-xs text-purple-400">({e.brandName})</span>
                        )}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex items-center gap-2">
              {(['all', 'ready', 'warning', 'error'] as const).map((f) => {
                const labels = { all: 'הכל', ready: 'מוכנים', warning: 'אזהרות', error: 'שגיאות' };
                const counts = {
                  all: preview.stats.totalParks,
                  ready: preview.stats.readyParks,
                  warning: preview.stats.warningParks,
                  error: preview.stats.errorParks,
                };
                return (
                  <button
                    key={f}
                    onClick={() => { setStatusFilter(f); setVisibleCount(50); }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      statusFilter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {labels[f]} ({counts[f]})
                  </button>
                );
              })}
            </div>

            {/* Parks table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-right font-medium text-gray-600">סטטוס</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">CSV ID</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">שם</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">קואורדינטות</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">רשות</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">מתקנים</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">תמונות</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">סרטונים</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">אזהרות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleParks.map((park) => (
                      <tr key={park.csvId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3"><StatusIcon status={park.status} /></td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{park.csvId}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{park.name || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                          {park.location.lat.toFixed(4)}, {park.location.lng.toFixed(4)}
                        </td>
                        <td className="px-4 py-3">
                          {park.matchedAuthorityId ? (
                            <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full text-xs">
                              <CheckCircle2 className="h-3 w-3" />
                              {park.matchedAuthorityName}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-red-500 whitespace-nowrap">{park.csvMuniId || '—'}</span>
                              <select
                                className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white text-gray-700 max-w-[140px]"
                                defaultValue=""
                                onChange={(e) => handleAuthorityOverride(park.csvId, e.target.value)}
                              >
                                <option value="" disabled>בחר רשות...</option>
                                {authorities.map((a) => (
                                  <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {park.equipment.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-xs">
                              <Dumbbell className="h-3 w-3" />
                              {park.equipment.length}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {park.images.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full text-xs">
                              <ImageIcon className="h-3 w-3" />
                              {park.images.length}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const eqVideos = park.equipment.filter((eq) => eq.video).length;
                            const totalVids = park.videos.length + eqVideos;
                            return totalVids > 0 ? (
                              <span className="inline-flex items-center gap-1 text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full text-xs">
                                <Video className="h-3 w-3" />
                                {totalVids}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-xs text-amber-600 max-w-[200px]">
                          {park.warnings.length > 0 ? park.warnings.join(' · ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {visibleCount < filteredParks.length && (
                <div className="px-4 py-3 text-center border-t border-gray-100">
                  <button
                    onClick={() => setVisibleCount((c) => c + 50)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    הצג עוד ({filteredParks.length - visibleCount} נותרו)
                  </button>
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={resetAll}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                ← התחל מחדש
              </button>

              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-500">
                  {preview.stats.readyParks + preview.stats.warningParks} פארקים ייובאו
                  ({preview.stats.errorParks} ידולגו)
                </p>
                <button
                  disabled={preview.stats.readyParks + preview.stats.warningParks === 0}
                  onClick={handleImport}
                  className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-xl font-medium
                             hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Upload className="h-5 w-5" />
                  ייבוא והעברת מדיה ל-Firebase
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: IMPORTING (with progress bar) ──────────────────────── */}
        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-8 max-w-lg mx-auto">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />

            {progress ? (
              <div className="w-full space-y-4">
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-800">{progress.phase}</p>
                  <p className="text-sm text-gray-500 mt-1">{progress.detail}</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? Math.min(100, (progress.current / progress.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-center text-sm text-gray-500 font-mono">
                  {progress.current} / {progress.total}
                </p>
              </div>
            ) : (
              <p className="text-lg font-medium text-gray-700">מתחיל ייבוא...</p>
            )}
          </div>
        )}

        {/* ── STEP: DONE ──────────────────────────────────────────────── */}
        {step === 'done' && result && (
          <div className="max-w-lg mx-auto space-y-6 py-12">
            <div className="text-center space-y-3">
              {result.success ? (
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
              ) : (
                <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto" />
              )}
              <h2 className="text-2xl font-bold text-gray-900">
                {result.success ? 'הייבוא הושלם בהצלחה!' : 'הייבוא הושלם עם שגיאות'}
              </h2>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              <div className="flex justify-between px-6 py-4">
                <span className="text-gray-600">פארקים חדשים</span>
                <span className="font-bold text-gray-900">{result.createdParks}</span>
              </div>
              {result.updatedParks > 0 && (
                <div className="flex justify-between px-6 py-4">
                  <span className="text-gray-600">פארקים שעודכנו</span>
                  <span className="font-bold text-blue-600">{result.updatedParks}</span>
                </div>
              )}
              <div className="flex justify-between px-6 py-4">
                <span className="text-gray-600">מתקנים חדשים</span>
                <span className="font-bold text-gray-900">{result.createdEquipment}</span>
              </div>
              {result.updatedEquipment > 0 && (
                <div className="flex justify-between px-6 py-4">
                  <span className="text-gray-600">מתקנים שעודכנו</span>
                  <span className="font-bold text-blue-600">{result.updatedEquipment}</span>
                </div>
              )}
              <div className="flex justify-between px-6 py-4">
                <span className="text-gray-600">קבצי מדיה שהועברו ל-Firebase</span>
                <span className="font-bold text-gray-900">{result.migratedMedia}</span>
              </div>
              {result.migratedVideos > 0 && (
                <div className="flex justify-between px-6 py-4">
                  <span className="text-gray-600">סרטונים שהועברו ל-Firebase</span>
                  <span className="font-bold text-violet-600">{result.migratedVideos}</span>
                </div>
              )}
              {result.skippedMedia > 0 && (
                <div className="flex justify-between px-6 py-4">
                  <span className="text-gray-600">מדיה שכבר הועברה (דולגה)</span>
                  <span className="font-bold text-green-600">{result.skippedMedia}</span>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="px-6 py-4">
                  <p className="text-red-600 font-medium mb-2">שגיאות ({result.errors.length})</p>
                  <ul className="text-sm text-red-500 space-y-1 max-h-40 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Bulk upload after import */}
            <div className="bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-cyan-100 rounded-xl">
                  <FolderUp className="h-6 w-6 text-cyan-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">תמונות לא הועלו? העלה מתיקייה מקומית</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    בחר את תיקיית <code className="bg-white px-1.5 py-0.5 rounded text-xs font-mono">out-files</code> כדי
                    להעלות תמונות וסרטונים ישירות ל-Firebase Storage.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      ref={folderRefDone}
                      type="file"
                      className="hidden"
                      // @ts-expect-error webkitdirectory is non-standard
                      webkitdirectory=""
                      multiple
                      onChange={(e) => handleBulkUpload(e.target.files)}
                    />
                    <button
                      disabled={bulkUploading}
                      onClick={() => folderRefDone.current?.click()}
                      className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-medium
                                 hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {bulkUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderUp className="h-4 w-4" />}
                      {bulkUploading ? 'מעלה...' : 'בחר תיקייה והעלה'}
                    </button>
                    {bulkProgress && bulkProgress.phase !== 'done' && (
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>{bulkProgress.detail}</span>
                          <span className="font-mono">{bulkProgress.current}/{bulkProgress.total}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                            style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  {bulkResult && (
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {bulkResult.uploaded} הועלו
                      </span>
                      {bulkResult.notMatched > 0 && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-600 rounded-full">
                          {bulkResult.notMatched} ללא התאמה
                        </span>
                      )}
                      {bulkResult.errors.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-600 rounded-full">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {bulkResult.errors.length} שגיאות
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                onClick={resetAll}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                ייבוא נוסף
              </button>
              <Link
                href="/admin/parks"
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                צפה בפארקים ←
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StepBadge({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${
        active ? 'bg-blue-100 text-blue-700' : done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
      }`}
    >
      {done && !active ? '✓ ' : ''}{label}
    </span>
  );
}

function StatusIcon({ status }: { status: 'ready' | 'warning' | 'error' }) {
  switch (status) {
    case 'ready': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'error': return <AlertCircle className="h-5 w-5 text-red-500" />;
  }
}

function StatCard({ label, value, color }: { label: string; value: number; color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo' }) {
  const palette = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    indigo: 'bg-violet-50 border-violet-200 text-violet-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${palette[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-80 mt-1">{label}</p>
    </div>
  );
}

function FileDropZone({
  label, description, icon, file, inputRef, onFileChange, accept, optional,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (f: File | null) => void;
  accept: string;
  optional?: boolean;
}) {
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        file ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />
      <div className={`mx-auto mb-3 ${file ? 'text-green-500' : 'text-gray-400'}`}>
        {file ? <CheckCircle2 className="h-8 w-8 mx-auto" /> : icon}
      </div>
      <p className="font-semibold text-gray-800">
        {label}
        {optional && <span className="text-gray-400 font-normal text-xs mr-1">(אופציונלי)</span>}
      </p>
      <p className="text-xs text-gray-500 mt-1">{description}</p>
      {file && (
        <p className="text-xs text-green-600 mt-2 truncate">
          {file.name} ({(file.size / 1024).toFixed(0)} KB)
        </p>
      )}
    </div>
  );
}

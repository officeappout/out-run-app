'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import dynamicImport from 'next/dynamic';
import { auth, storage } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { InventoryService } from '@/features/parks';
import type { Route } from '@/features/parks';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Save,
  CheckCircle2,
  Route as RouteIcon,
  Clock,
  Upload,
  Link as LinkIcon,
  ImageIcon,
  X,
} from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';

// ── Dynamic map imports (SSR-safe) ─────────────────────────────────────────
const MapComponent = dynamicImport(
  () => import('react-map-gl').then((m) => m.default),
  { ssr: false, loading: () => <div className="h-full w-full bg-gray-100 animate-pulse rounded-2xl" /> }
);
const Source = dynamicImport(() => import('react-map-gl').then((m) => m.Source), { ssr: false });
const Layer  = dynamicImport(() => import('react-map-gl').then((m) => m.Layer),  { ssr: false });
const Marker = dynamicImport(() => import('react-map-gl').then((m) => m.Marker), { ssr: false });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const ACTIVITY_TYPES = [
  { value: 'running', label: 'ריצה' },
  { value: 'walking', label: 'הליכה' },
  { value: 'cycling', label: 'רכיבה' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy',     label: 'קל' },
  { value: 'moderate', label: 'בינוני' },
  { value: 'hard',     label: 'קשה' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function pathCenter(path: [number, number][]): { lng: number; lat: number } {
  if (path.length === 0) return { lng: 34.78, lat: 32.08 };
  const lng = path.reduce((s, p) => s + p[0], 0) / path.length;
  const lat = path.reduce((s, p) => s + p[1], 0) / path.length;
  return { lng, lat };
}

function applyHebrewLabels(map: any) {
  try {
    const style = map.getStyle?.();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      if (layer.type === 'symbol' && layer.layout?.['text-field']) {
        try { map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name_he'], ['get', 'name']]); }
        catch { /* skip locked layers */ }
      }
    }
  } catch { /* ignore */ }
}

// ── Component ──────────────────────────────────────────────────────────────
export default function EditRoutePage() {
  const router = useRouter();
  const params = useParams();
  const routeId = params?.id as string;

  const [route,   setRoute]   = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // ── Form fields ──────────────────────────────────────────────────────────
  const [name,         setName]         = useState('');
  const [description,  setDescription]  = useState('');
  const [activityType, setActivityType] = useState('running');
  const [difficulty,   setDifficulty]   = useState('moderate');

  // ── Image handling ───────────────────────────────────────────────────────
  const [imageUrl,      setImageUrl]      = useState('');       // committed URL (saved to Firestore)
  const [previewSrc,    setPreviewSrc]    = useState('');       // live preview (may be blob)
  const [imageMode,     setImageMode]     = useState<'url' | 'file'>('url');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError,   setUploadError]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!routeId) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/admin'); return; }

      try {
        const role = await checkUserRole(user.uid);
        if (!role.isSuperAdmin && !role.isAuthorityManager) { router.push('/admin'); return; }

        const data = await InventoryService.getRouteById(routeId);
        if (!data) { setError('מסלול לא נמצא'); setLoading(false); return; }

        setRoute(data);
        setName(data.name || '');
        setDescription(data.description || '');
        setActivityType(data.activityType || data.type || 'running');
        setDifficulty(data.difficulty || 'moderate');

        const firstImage = data.images?.[0] || '';
        setImageUrl(firstImage);
        setPreviewSrc(firstImage);
      } catch (err: any) {
        setError(err?.message || 'שגיאה בטעינת המסלול');
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [routeId, router]);

  // ── File upload to Firebase Storage ──────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Instant local preview
    const blob = URL.createObjectURL(file);
    setPreviewSrc(blob);
    setUploadError(null);
    setUploadProgress(0);

    try {
      const storagePath = `routes/${routeId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      const task = uploadBytesResumable(storageRef, file);

      task.on(
        'state_changed',
        (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => { setUploadError(err.message); setUploadProgress(null); },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setImageUrl(url);
          setPreviewSrc(url);
          setUploadProgress(null);
        }
      );
    } catch (err: any) {
      setUploadError(err?.message || 'שגיאה בהעלאת התמונה');
      setUploadProgress(null);
    }
  }, [routeId]);

  // ── URL mode change ───────────────────────────────────────────────────────
  const handleUrlChange = (val: string) => {
    setImageUrl(val);
    setPreviewSrc(val);
  };

  const clearImage = () => {
    setImageUrl('');
    setPreviewSrc('');
    setUploadProgress(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { setError('שם המסלול הוא שדה חובה'); return; }
    setSaving(true);
    setError(null);

    // Guard: don't save while upload is still in progress
    if (uploadProgress !== null) {
      setError('המתן לסיום העלאת התמונה לפני השמירה');
      setSaving(false);
      return;
    }

    try {
      const images: string[] = imageUrl.trim() ? [imageUrl.trim()] : [];

      await InventoryService.updateRoute(routeId, {
        name:         name.trim(),
        description:  description.trim(),
        activityType: activityType as any,
        difficulty:   difficulty as any,
        images,
      });

      setSaved(true);
      setTimeout(() => router.push('/admin/authority/routes'), 1400);
    } catch (err: any) {
      setError(err?.message || 'שגיאה בשמירת המסלול');
    } finally {
      setSaving(false);
    }
  };

  // ── Derived map data ──────────────────────────────────────────────────────
  const path   = route?.path ?? [];
  const center = pathCenter(path);

  const lineGeoJSON = path.length >= 2 ? {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: path },
  } : null;

  const routeColor =
    activityType === 'cycling' ? '#8B5CF6' :
    activityType === 'walking' ? '#10B981' : '#06B6D4';

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <Loader2 className="animate-spin text-cyan-500 ml-2" size={28} />
        <span className="text-gray-600">טוען מסלול...</span>
      </div>
    );
  }

  if (error && !route) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" dir="rtl">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-red-600 font-semibold">{error}</p>
        <Link href="/admin/authority/routes" className="text-cyan-600 underline text-sm">
          חזרה לניהול מסלולים
        </Link>
      </div>
    );
  }

  const isPending = route?.status === 'pending' || route?.published === false;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6" dir="rtl">
      {/* ── Header ── */}
      <div>
        <Link
          href="/admin/authority/routes"
          className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl transition-all active:scale-95 mb-3"
        >
          <ArrowLeft size={15} />
          חזור לניהול מסלולים
        </Link>
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
          <RouteIcon className="text-cyan-500" size={26} />
          עריכת מסלול
        </h1>
        {isPending && (
          <span className="inline-flex items-center gap-1 mt-2 text-xs font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">
            <Clock size={10} />
            ממתין לאישור
          </span>
        )}
      </div>

      {/* ── Route map preview ── */}
      {path.length >= 2 && (
        <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 280 }}>
          <MapComponent
            initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: 13 }}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
            mapboxAccessToken={MAPBOX_TOKEN}
            interactive={true}
            onLoad={(e: any) => {
              applyHebrewLabels(e.target);
              e.target?.on?.('style.load', () => applyHebrewLabels(e.target));
              // fitBounds so the full route path is visible immediately on open.
              // path has already been validated (length >= 2) by the outer condition.
              const lngs = path.map((p: [number, number]) => p[0]);
              const lats = path.map((p: [number, number]) => p[1]);
              const bounds: [number, number, number, number] = [
                Math.min(...lngs), Math.min(...lats),
                Math.max(...lngs), Math.max(...lats),
              ];
              try { e.target.fitBounds(bounds, { padding: 60, duration: 800, maxZoom: 16 }); }
              catch { /* ignore rare edge case of identical start/end */ }
            }}
          >
            {lineGeoJSON && (
              <Source id="edit-route-line" type="geojson" data={lineGeoJSON}>
                <Layer
                  id="edit-route-outline"
                  type="line"
                  paint={{ 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.4 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
                <Layer
                  id="edit-route-fill"
                  type="line"
                  paint={{ 'line-color': routeColor, 'line-width': 5, 'line-opacity': 0.9 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {/* Start marker */}
            {path.length > 0 && (
              <Marker longitude={path[0][0]} latitude={path[0][1]} anchor="center">
                <div className="w-7 h-7 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-black">
                  A
                </div>
              </Marker>
            )}

            {/* End marker */}
            {path.length > 1 && (
              <Marker longitude={path[path.length - 1][0]} latitude={path[path.length - 1][1]} anchor="center">
                <div className="w-7 h-7 rounded-full bg-red-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-black">
                  B
                </div>
              </Marker>
            )}
          </MapComponent>
        </div>
      )}

      {/* ── Status alerts ── */}
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm font-bold text-green-700">
          <CheckCircle2 size={16} />
          המסלול עודכן בהצלחה!
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-bold text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Form card ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">

        {/* Name */}
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 block">שם המסלול *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            placeholder="לדוג׳: מסלול פארק סביב העיר"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 block">תיאור</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none"
            placeholder="תיאור קצר של המסלול..."
          />
        </div>

        {/* ── Image section ── */}
        <div>
          <label className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
            <ImageIcon size={13} className="text-gray-400" />
            תמונה
            <span className="font-normal text-gray-400">— מוצגת בכרטיס בקרוסלה</span>
          </label>

          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-3 w-fit">
            <button
              type="button"
              onClick={() => setImageMode('url')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${
                imageMode === 'url' ? 'bg-cyan-500 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <LinkIcon size={12} />
              קישור URL
            </button>
            <button
              type="button"
              onClick={() => setImageMode('file')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${
                imageMode === 'file' ? 'bg-cyan-500 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Upload size={12} />
              העלאת קובץ
            </button>
          </div>

          {/* URL input */}
          {imageMode === 'url' && (
            <input
              type="url"
              value={imageUrl}
              onChange={e => handleUrlChange(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder="https://..."
              dir="ltr"
            />
          )}

          {/* File input */}
          {imageMode === 'file' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="route-image-upload"
              />
              <label
                htmlFor="route-image-upload"
                className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-300 hover:border-cyan-400 rounded-xl py-4 cursor-pointer transition-colors text-sm text-gray-500 font-medium hover:text-cyan-600 hover:bg-cyan-50"
              >
                <Upload size={18} />
                לחץ לבחירת תמונה
              </label>

              {/* Upload progress */}
              {uploadProgress !== null && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>מעלה...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {uploadError && (
                <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {uploadError}
                </p>
              )}
            </div>
          )}

          {/* Image preview */}
          {previewSrc && (
            <div className="mt-2 relative rounded-xl overflow-hidden border border-gray-200 h-28 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt="תצוגה מקדימה"
                className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
              {uploadProgress === null && imageUrl && (
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                  ✓ מוכן לשמירה
                </div>
              )}
            </div>
          )}
        </div>

        {/* Activity & Difficulty */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">סוג פעילות</label>
            <select
              value={activityType}
              onChange={e => setActivityType(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              {ACTIVITY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">רמת קושי</label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              {DIFFICULTY_OPTIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Read-only route stats */}
        {route && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 space-y-1">
            <p>
              מרחק:{' '}
              <span className="font-bold text-gray-700">
                {route.distance > 0
                  ? route.distance < 1
                    ? `${Math.round(route.distance * 1000)} מ׳`
                    : `${(Math.round(route.distance * 10) / 10)} ק״מ`
                  : '—'}
              </span>
            </p>
            <p>
              נקודות מסלול:{' '}
              <span className="font-bold text-gray-700">{path.length}</span>
            </p>
            {route.origin && (
              <p>
                מקור:{' '}
                <span className="font-bold text-gray-700">
                  {route.origin === 'authority_admin' ? 'רשות' : 'מנהל ראשי'}
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Save button ── */}
      <button
        onClick={handleSave}
        disabled={saving || saved || uploadProgress !== null}
        className="w-full flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 rounded-2xl shadow-lg shadow-cyan-200 transition-all disabled:opacity-60 text-sm"
      >
        {saving
          ? <Loader2 className="animate-spin" size={16} />
          : saved
          ? <CheckCircle2 size={16} />
          : <Save size={16} />}
        {saving ? 'שומר...' : saved ? 'נשמר!' : 'שמור שינויים'}
      </button>
    </div>
  );
}

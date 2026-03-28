'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
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
} from 'lucide-react';

const ACTIVITY_TYPES = [
  { value: 'running', label: 'ריצה' },
  { value: 'walking', label: 'הליכה' },
  { value: 'cycling', label: 'רכיבה' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'קל' },
  { value: 'moderate', label: 'בינוני' },
  { value: 'hard', label: 'קשה' },
];

export default function EditRoutePage() {
  const router = useRouter();
  const params = useParams();
  const routeId = params?.id as string;

  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activityType, setActivityType] = useState('running');
  const [difficulty, setDifficulty] = useState('moderate');

  useEffect(() => {
    if (!routeId) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/admin'); return; }

      try {
        const role = await checkUserRole(user.uid);
        if (!role.isSuperAdmin && !role.isAuthorityManager) {
          router.push('/admin');
          return;
        }

        const data = await InventoryService.getRouteById(routeId);
        if (!data) {
          setError('מסלול לא נמצא');
          setLoading(false);
          return;
        }

        setRoute(data);
        setName(data.name || '');
        setDescription(data.description || '');
        setActivityType(data.activityType || data.type || 'running');
        setDifficulty(data.difficulty || 'moderate');
      } catch (err: any) {
        setError(err?.message || 'שגיאה בטעינת המסלול');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [routeId, router]);

  const handleSave = async () => {
    if (!name.trim()) { setError('שם המסלול הוא שדה חובה'); return; }
    setSaving(true);
    setError(null);

    try {
      await InventoryService.updateRoute(routeId, {
        name: name.trim(),
        description: description.trim(),
        activityType: activityType as any,
        difficulty: difficulty as any,
      });
      setSaved(true);
      setTimeout(() => router.push('/admin/authority/routes'), 1200);
    } catch (err: any) {
      setError(err?.message || 'שגיאה בשמירת המסלול');
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6" dir="rtl">
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

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
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

        {route && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 space-y-1">
            <p>מרחק: <span className="font-bold text-gray-700">{route.distance > 0 ? `${route.distance < 1 ? `${Math.round(route.distance * 1000)}מ` : `${(Math.round(route.distance * 10) / 10)} ק״מ`}` : '—'}</span></p>
            {route.origin && (
              <p>מקור: <span className="font-bold text-gray-700">{route.origin === 'authority_admin' ? 'רשות' : 'מנהל ראשי'}</span></p>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving || saved}
        className="w-full flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 rounded-2xl shadow-lg shadow-cyan-200 transition-all disabled:opacity-60 text-sm"
      >
        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
        {saving ? 'שומר...' : saved ? 'נשמר!' : 'שמור שינויים'}
      </button>
    </div>
  );
}

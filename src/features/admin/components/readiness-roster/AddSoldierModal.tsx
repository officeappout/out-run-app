'use client';

import { useState, useEffect } from 'react';
import { X, UserPlus } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { RosterUnitEntry } from '@/features/readiness/core/services/readiness-read.service';

/**
 * "הוסף חייל" (blank, no account) and "פתח רשומה חדשה" (from a pending
 * self-declared row — creates AND links in one step) share this one
 * modal, distinguished by whether `prefill` is passed. Locked spec:
 * name + gender only — no account, no code, no personal number. Gender
 * is a one-tap toggle (never a blocking dropdown) — auto-selected when
 * `prefill.gender` is a clean male/female (mirrors computeCreateSoldier's
 * own auto-fill rule server-side: core.gender === 'other' never
 * auto-fills), otherwise the officer must tap one before submitting.
 */

interface AddSoldierModalProps {
  isOpen: boolean;
  onClose: () => void;
  units: RosterUnitEntry[];
  prefill?: { uid: string; name: string; gender: 'male' | 'female' | null };
  onSuccess: () => void;
}

export default function AddSoldierModal({ isOpen, onClose, units, prefill, onSuccess }: AddSoldierModalProps) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [unitId, setUnitId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(prefill?.name ?? '');
    setGender(prefill?.gender ?? null);
    setUnitId(units.length === 1 ? units[0].id : '');
    setError(null);
  }, [isOpen, prefill, units]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!name.trim()) { setError('יש להזין שם.'); return; }
    if (!gender) { setError('יש לבחור מגדר.'); return; }
    if (!unitId) { setError('יש לבחור יחידה.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
      const res = await fetch('/api/units/readiness/soldiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), gender, unitId, ...(prefill ? { uid: prefill.uid } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה (${res.status})`);
      onSuccess();
    } catch (err: any) {
      console.error('[AddSoldierModal] create failed:', err);
      setError(err?.message ?? 'שגיאה ביצירת הרשומה.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="flex items-start justify-center min-h-full py-6 px-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative" dir="rtl">
          <button onClick={onClose} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
          <h3 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2">
            <UserPlus size={22} className="text-lime-700" />
            {prefill ? 'פתיחת רשומה חדשה' : 'הוספת חייל'}
          </h3>
          {prefill && (
            <p className="text-xs text-gray-500 mb-4">הרשומה תשויך מיד לחשבון של {prefill.name}.</p>
          )}

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">שם</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם החייל"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl outline-none text-sm focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 transition-all"
                dir="rtl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">מגדר</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGender('male')}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                    gender === 'male' ? 'bg-lime-50 border-lime-600 text-lime-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  זכר
                </button>
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                    gender === 'female' ? 'bg-lime-50 border-lime-600 text-lime-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  נקבה
                </button>
              </div>
            </div>

            {units.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">יחידה</label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl outline-none text-sm focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 transition-all bg-white"
                  dir="rtl"
                >
                  <option value="">בחר יחידה...</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}

            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:from-cyan-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? 'שומר...' : 'שמירה'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

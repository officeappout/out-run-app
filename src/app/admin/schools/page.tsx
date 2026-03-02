'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  GraduationCap,
  Plus,
  Trash2,
  Save,
  X,
  Search,
  Copy,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================
interface SchoolRecord {
  id: string; // document ID = school code
  name: string;
  tier: 1 | 2 | 3;
  city?: string;
  authorityId?: string;
  maxStudents?: number;
  logoUrl?: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

const TIER_LABELS: Record<number, { label: string; emoji: string; color: string }> = {
  1: { label: 'Starter (חינמי)', emoji: '🟢', color: 'bg-green-100 text-green-700' },
  2: { label: 'Community (עירוני)', emoji: '🔵', color: 'bg-blue-100 text-blue-700' },
  3: { label: 'Elite (מתקדם)', emoji: '🟣', color: 'bg-violet-100 text-violet-700' },
};

// ============================================================================
// Page Component
// ============================================================================
export default function SchoolManagerPage() {
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    code: '',
    name: '',
    tier: 3 as 1 | 2 | 3,
    city: '',
    authorityId: '',
    maxStudents: 500,
    logoUrl: '',
    isActive: true,
  });

  // ── Load Schools ──
  const loadSchools = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'schools'), orderBy('name'));
      const snapshot = await getDocs(q);
      const data: SchoolRecord[] = [];
      snapshot.forEach((docSnap) => {
        data.push({
          id: docSnap.id,
          ...docSnap.data(),
        } as SchoolRecord);
      });
      setSchools(data);
    } catch (error: any) {
      console.error('[Schools] Load error:', error);
      // If orderBy fails (no index), try without ordering
      if (error?.code === 'failed-precondition') {
        try {
          const snapshot = await getDocs(collection(db, 'schools'));
          const data: SchoolRecord[] = [];
          snapshot.forEach((docSnap) => {
            data.push({ id: docSnap.id, ...docSnap.data() } as SchoolRecord);
          });
          setSchools(data.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (e2) {
          console.error('[Schools] Fallback load error:', e2);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  // ── Reset Form ──
  const resetForm = () => {
    setForm({
      code: '',
      name: '',
      tier: 3,
      city: '',
      authorityId: '',
      maxStudents: 500,
      logoUrl: '',
      isActive: true,
    });
    setEditingId(null);
    setShowForm(false);
  };

  // ── Open Edit ──
  const openEdit = (school: SchoolRecord) => {
    setForm({
      code: school.id,
      name: school.name,
      tier: school.tier ?? 3,
      city: school.city || '',
      authorityId: school.authorityId || '',
      maxStudents: school.maxStudents || 500,
      logoUrl: school.logoUrl || '',
      isActive: school.isActive !== false,
    });
    setEditingId(school.id);
    setShowForm(true);
  };

  // ── Save School ──
  const handleSave = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code) {
      alert('נא להזין קוד בית ספר');
      return;
    }
    if (!form.name.trim()) {
      alert('נא להזין שם בית ספר / ארגון');
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'schools', code), {
        name: form.name.trim(),
        tier: form.tier,
        city: form.city.trim() || null,
        authorityId: form.authorityId.trim() || null,
        maxStudents: form.maxStudents,
        logoUrl: form.logoUrl.trim() || null,
        isActive: form.isActive,
        ...(editingId ? { updatedAt: serverTimestamp() } : { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
      }, { merge: true });

      resetForm();
      await loadSchools();
    } catch (error) {
      console.error('[Schools] Save error:', error);
      alert('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete School ──
  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'schools', id));
      setDeleteConfirmId(null);
      await loadSchools();
    } catch (error) {
      console.error('[Schools] Delete error:', error);
      alert('שגיאה במחיקה');
    }
  };

  // ── Copy Code ──
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // ── Filter ──
  const filteredSchools = schools.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.id.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q)
    );
  });

  // ── Render ──
  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            <GraduationCap size={32} className="text-violet-600" />
            ניהול בתי ספר וארגונים
          </h1>
          <p className="text-gray-500 mt-2">
            הוספה וניהול של קודי גישה לבתי ספר, ארגונים וחברות (B2E)
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors"
        >
          <Plus size={20} />
          הוסף ארגון חדש
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-gray-900">{schools.length}</p>
          <p className="text-xs text-gray-500 mt-1">סה"כ ארגונים</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-green-600">{schools.filter(s => s.isActive).length}</p>
          <p className="text-xs text-gray-500 mt-1">פעילים</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-violet-600">{schools.filter(s => s.tier === 3).length}</p>
          <p className="text-xs text-gray-500 mt-1">Elite (Tier 3)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-blue-600">{schools.filter(s => s.tier === 2).length}</p>
          <p className="text-xs text-gray-500 mt-1">Community (Tier 2)</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="חיפוש לפי קוד, שם או עיר..."
          className="w-full pr-12 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
      </div>

      {/* Schools Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500" />
        </div>
      ) : filteredSchools.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
          <GraduationCap size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-bold">
            {searchQuery ? 'לא נמצאו תוצאות' : 'אין ארגונים רשומים עדיין'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {searchQuery ? 'נסה חיפוש אחר' : 'לחץ על "הוסף ארגון חדש" להתחלה'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">קוד גישה</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">שם הארגון</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500">עיר</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500">Tier</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500">סטטוס</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchools.map((school) => (
                <tr
                  key={school.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => openEdit(school)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono font-bold bg-gray-100 px-2.5 py-1 rounded-lg text-gray-800">
                        {school.id}
                      </code>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyCode(school.id); }}
                        className="p-1 text-gray-400 hover:text-violet-600 transition-colors"
                        title="העתק קוד"
                      >
                        {copiedCode === school.id ? (
                          <CheckCircle2 size={14} className="text-green-500" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-gray-900">{school.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">{school.city || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full ${
                      TIER_LABELS[school.tier]?.color || 'bg-gray-100 text-gray-600'
                    }`}>
                      {TIER_LABELS[school.tier]?.emoji} {school.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {school.isActive !== false ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full">
                        <CheckCircle2 size={12} /> פעיל
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 text-xs font-bold rounded-full">
                        <AlertCircle size={12} /> מושבת
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setDeleteConfirmId(school.id)}
                      className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                      title="מחק"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">מחיקת ארגון</h3>
            <p className="text-sm text-gray-600 mb-4">
              האם אתה בטוח שברצונך למחוק את הקוד <strong>{deleteConfirmId}</strong>?
              <br />פעולה זו לא ניתנת לביטול.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                מחק
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit School Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? `עריכת ${editingId}` : 'ארגון / בית ספר חדש'}
              </h2>
              <button onClick={resetForm} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Code */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">קוד גישה *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  disabled={!!editingId}
                  placeholder="למשל: HERZL2026"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 font-mono text-lg tracking-wider disabled:bg-gray-100 disabled:cursor-not-allowed"
                  dir="ltr"
                />
                <p className="text-xs text-gray-500 mt-1">
                  הקוד שהתלמידים/עובדים מזינים באפליקציה (אותיות ומספרים בלבד)
                </p>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">שם הארגון *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="למשל: בית ספר הרצל, חברת אינטל"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-right"
                />
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">לוגו (URL)</label>
                <input
                  type="url"
                  value={form.logoUrl}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5"
                  dir="ltr"
                />
                {form.logoUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={form.logoUrl}
                      alt="Logo preview"
                      className="w-10 h-10 object-contain rounded-lg border border-gray-200"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className="text-xs text-gray-500">תצוגה מקדימה</span>
                  </div>
                )}
              </div>

              {/* Tier */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">רמת גישה (Tier)</label>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 3] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setForm({ ...form, tier })}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                        form.tier === tier
                          ? tier === 1 ? 'border-green-500 bg-green-50' 
                            : tier === 2 ? 'border-blue-500 bg-blue-50' 
                            : 'border-violet-500 bg-violet-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{TIER_LABELS[tier].emoji}</span>
                      <span className="text-xs font-bold">Tier {tier}</span>
                      <span className="text-[10px] text-gray-500">{TIER_LABELS[tier].label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* City & Authority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">עיר (אופציונלי)</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="למשל: תל אביב"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-right"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">רשות (Authority ID)</label>
                  <input
                    type="text"
                    value={form.authorityId}
                    onChange={(e) => setForm({ ...form, authorityId: e.target.value })}
                    placeholder="מזהה רשות..."
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Max Students & Active Toggle */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">מקסימום תלמידים</label>
                  <input
                    type="number"
                    min="1"
                    value={form.maxStudents}
                    onChange={(e) => setForm({ ...form, maxStudents: parseInt(e.target.value) || 500 })}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      className="w-5 h-5 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
                    />
                    <span className="text-sm font-bold text-gray-700">פעיל</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={handleSave}
                  disabled={saving || !form.code.trim() || !form.name.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={18} />
                  {saving ? 'שומר...' : 'שמור'}
                </button>
                <button
                  onClick={resetForm}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors"
                >
                  <X size={18} />
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

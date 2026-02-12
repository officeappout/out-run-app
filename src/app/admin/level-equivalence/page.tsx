"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import {
  getAllPrograms,
  Program
} from '@/features/content/programs';
import {
  LevelEquivalenceRule,
} from '@/features/user/core/types/progression.types';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  ArrowRight,
  ToggleLeft,
  ToggleRight,
  Zap,
  AlertCircle,
  Check,
  GitBranch,
} from 'lucide-react';

const COLLECTION = 'level_equivalence_rules';

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

async function getAllEquivalenceRules(): Promise<LevelEquivalenceRule[]> {
  const q = query(collection(db, COLLECTION), orderBy('sourceProgramId'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data(),
  })) as LevelEquivalenceRule[];
}

async function saveEquivalenceRule(rule: Omit<LevelEquivalenceRule, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
  const docId = rule.id || `${rule.sourceProgramId}_L${rule.sourceLevel}_to_${rule.targetProgramId}_L${rule.targetLevel}`;
  const docRef = doc(db, COLLECTION, docId);

  const payload: Record<string, any> = {
    sourceProgramId: rule.sourceProgramId,
    sourceLevel: Number(rule.sourceLevel),
    targetProgramId: rule.targetProgramId,
    targetLevel: Number(rule.targetLevel),
    targetPercent: Number(rule.targetPercent ?? 0),
    addToActivePrograms: rule.addToActivePrograms ?? true,
    description: rule.description ?? '',
    isEnabled: rule.isEnabled ?? true,
  };

  await setDoc(docRef, {
    ...payload,
    id: docId,
    updatedAt: serverTimestamp(),
    ...(!rule.id ? { createdAt: serverTimestamp() } : {}),
  }, { merge: true });

  return docId;
}

async function deleteEquivalenceRule(ruleId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, ruleId));
}

// ============================================================================
// TYPES
// ============================================================================

interface RuleForm {
  sourceProgramId: string;
  sourceLevel: number;
  targetProgramId: string;
  targetLevel: number;
  targetPercent: number;
  addToActivePrograms: boolean;
  description: string;
  isEnabled: boolean;
}

const EMPTY_FORM: RuleForm = {
  sourceProgramId: '',
  sourceLevel: 1,
  targetProgramId: '',
  targetLevel: 1,
  targetPercent: 0,
  addToActivePrograms: true,
  description: '',
  isEnabled: true,
};

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function LevelEquivalencePage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [rules, setRules] = useState<LevelEquivalenceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [progs, rls] = await Promise.all([
        getAllPrograms(),
        getAllEquivalenceRules(),
      ]);
      setPrograms(progs);
      setRules(rls);
    } catch (e) {
      console.error('[LevelEquivalence] Load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const getProgramName = (id: string) => programs.find(p => p.id === id)?.name || id;

  const handleNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const handleEdit = (rule: LevelEquivalenceRule) => {
    setForm({
      sourceProgramId: rule.sourceProgramId,
      sourceLevel: rule.sourceLevel,
      targetProgramId: rule.targetProgramId,
      targetLevel: rule.targetLevel,
      targetPercent: rule.targetPercent ?? 0,
      addToActivePrograms: rule.addToActivePrograms ?? true,
      description: rule.description ?? '',
      isEnabled: rule.isEnabled ?? true,
    });
    setEditingId(rule.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.sourceProgramId || !form.targetProgramId) {
      alert('יש לבחור תוכנית מקור ויעד');
      return;
    }
    if (form.sourceProgramId === form.targetProgramId) {
      alert('תוכנית מקור ויעד לא יכולות להיות זהות');
      return;
    }

    setSaving(true);
    try {
      await saveEquivalenceRule({
        id: editingId || undefined,
        ...form,
      });
      setShowForm(false);
      setEditingId(null);
      setSaveSuccess('כלל שקילות נשמר בהצלחה');
      setTimeout(() => setSaveSuccess(null), 3000);
      await loadData();
    } catch (e) {
      console.error('[LevelEquivalence] Save failed:', e);
      alert('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם למחוק כלל שקילות זה?')) return;
    try {
      await deleteEquivalenceRule(id);
      await loadData();
    } catch (e) {
      console.error('[LevelEquivalence] Delete failed:', e);
      alert('שגיאה במחיקה');
    }
  };

  const handleToggleEnabled = async (rule: LevelEquivalenceRule) => {
    try {
      await saveEquivalenceRule({
        id: rule.id,
        sourceProgramId: rule.sourceProgramId,
        sourceLevel: rule.sourceLevel,
        targetProgramId: rule.targetProgramId,
        targetLevel: rule.targetLevel,
        targetPercent: rule.targetPercent,
        addToActivePrograms: rule.addToActivePrograms,
        description: rule.description,
        isEnabled: !rule.isEnabled,
      });
      await loadData();
    } catch (e) {
      console.error('[LevelEquivalence] Toggle failed:', e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
      </div>
    );
  }

  const enabledRules = rules.filter(r => r.isEnabled !== false);
  const disabledRules = rules.filter(r => r.isEnabled === false);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            <GitBranch className="text-indigo-500" size={32} />
            שקילות רמות (Level Equivalence)
          </h1>
          <p className="text-gray-500 mt-2">
            הגדר כללים שבהם הגעה לרמה מסוימת בתוכנית אחת פותחת/קובעת רמה בתוכנית אחרת
          </p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-600 transition-colors"
        >
          <Plus size={20} />
          כלל חדש
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Zap className="text-indigo-500 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-indigo-800">
            <p className="font-bold mb-1">איך זה עובד?</p>
            <p className="text-indigo-700">
              כשמשתמש מגיע לרמה X בתוכנית מקור, המערכת מפעילה אוטומטית את כלל השקילות ומגדירה את רמת היעד בתוכנית היעד.
              לדוגמה: &quot;Push רמה 15 → Planche רמה 4&quot;.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-indigo-700">{rules.length}</p>
          <p className="text-sm text-indigo-600">כללים סה&quot;כ</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-green-700">{enabledRules.length}</p>
          <p className="text-sm text-green-600">פעילים</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-gray-500">{disabledRules.length}</p>
          <p className="text-sm text-gray-500">מושבתים</p>
        </div>
      </div>

      {/* Success Banner */}
      {saveSuccess && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-center gap-3">
          <Check className="text-green-600 flex-shrink-0" size={20} />
          <span className="font-bold text-green-800">{saveSuccess}</span>
        </div>
      )}

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <GitBranch className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-500 mb-2">אין כללי שקילות</h3>
          <p className="text-gray-400 mb-4">צור כלל ראשון כדי לקשר בין רמות של תוכניות שונות</p>
          <button
            onClick={handleNew}
            className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-600 transition-colors"
          >
            צור כלל ראשון
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`bg-white rounded-2xl border p-5 transition-all ${
                rule.isEnabled !== false
                  ? 'border-indigo-200 shadow-sm'
                  : 'border-gray-200 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                {/* Rule Visual */}
                <div className="flex items-center gap-4">
                  {/* Source */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-center min-w-[140px]">
                    <p className="text-xs text-blue-600 font-medium mb-1">מקור</p>
                    <p className="font-bold text-blue-900">{getProgramName(rule.sourceProgramId)}</p>
                    <p className="text-lg font-black text-blue-700">רמה {rule.sourceLevel}</p>
                  </div>

                  {/* Arrow */}
                  <div className="flex flex-col items-center gap-1">
                    <ArrowRight className="text-indigo-400 rotate-180" size={24} />
                    {rule.addToActivePrograms && (
                      <span className="text-xs text-green-600 font-medium">+ הוספה</span>
                    )}
                  </div>

                  {/* Target */}
                  <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-center min-w-[140px]">
                    <p className="text-xs text-purple-600 font-medium mb-1">יעד</p>
                    <p className="font-bold text-purple-900">{getProgramName(rule.targetProgramId)}</p>
                    <p className="text-lg font-black text-purple-700">רמה {rule.targetLevel}</p>
                    {(rule.targetPercent ?? 0) > 0 && (
                      <p className="text-xs text-purple-500 mt-1">{rule.targetPercent}% התחלתי</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  {rule.description && (
                    <span className="text-sm text-gray-500 max-w-[200px] truncate" title={rule.description}>
                      {rule.description}
                    </span>
                  )}
                  <button
                    onClick={() => handleToggleEnabled(rule)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    title={rule.isEnabled !== false ? 'השבת' : 'הפעל'}
                  >
                    {rule.isEnabled !== false ? (
                      <ToggleRight className="text-green-500" size={24} />
                    ) : (
                      <ToggleLeft className="text-gray-400" size={24} />
                    )}
                  </button>
                  <button
                    onClick={() => handleEdit(rule)}
                    className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Form Modal ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'ערוך כלל שקילות' : 'כלל שקילות חדש'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Source Program + Level */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                  <Zap size={16} />
                  מקור (כשהמשתמש מגיע לרמה זו...)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">תוכנית מקור *</label>
                    <select
                      value={form.sourceProgramId}
                      onChange={(e) => setForm({ ...form, sourceProgramId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">בחר תוכנית...</option>
                      {programs.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.isMaster ? '(Master)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">רמת מקור *</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={form.sourceLevel}
                      onChange={(e) => setForm({ ...form, sourceLevel: Number(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <ArrowRight className="text-indigo-400 rotate-180" size={32} />
              </div>

              {/* Target Program + Level */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-purple-800 mb-3 flex items-center gap-2">
                  <Zap size={16} />
                  יעד (...תוגדר הרמה הבאה)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">תוכנית יעד *</label>
                    <select
                      value={form.targetProgramId}
                      onChange={(e) => setForm({ ...form, targetProgramId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">בחר תוכנית...</option>
                      {programs.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.isMaster ? '(Master)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">רמת יעד *</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={form.targetLevel}
                      onChange={(e) => setForm({ ...form, targetLevel: Number(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">אחוז התחלתי ביעד</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.targetPercent}
                    onChange={(e) => setForm({ ...form, targetPercent: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">0 = מתחיל מאפס ברמת היעד</p>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.addToActivePrograms}
                      onChange={(e) => setForm({ ...form, addToActivePrograms: e.target.checked })}
                      className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm font-bold text-gray-700">
                      הוסף לתוכניות פעילות
                    </span>
                  </label>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">תיאור (אופציונלי)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="למשל: שליטה ב-Push פותחת Planche"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              {/* Enabled Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
                  className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <span className="text-sm font-bold text-gray-700">כלל פעיל</span>
              </label>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-500 text-white font-bold py-3 rounded-xl hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                {saving ? 'שומר...' : (editingId ? 'עדכן' : 'צור כלל')}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

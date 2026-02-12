'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { Signal, Plus, Pencil, Trash2, Target, X, Save, ChevronDown, ChevronUp, ArrowLeft, Settings, Check } from 'lucide-react';
import Link from 'next/link';
import { getAllLevels, createLevel, updateLevel, deleteLevel } from '@/features/content/programs/core/level.service';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import ExerciseAutocomplete from '@/components/admin/ExerciseAutocomplete';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Level, LevelGoal } from '@/types/workout';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

// ============================================================================
// XP Multipliers Config (stored in Firestore: app_config/xp_settings)
// ============================================================================
interface XPSettings {
  strengthMultiplier: number;
  cardioMultiplier: number;
  hybridMultiplier: number;
  goalBonusBase: number;
  goalBonusIncrement: number;
  goalBonusCap: number;
  minWorkoutDuration: number;
}

const DEFAULT_XP_SETTINGS: XPSettings = {
  strengthMultiplier: 1.2,
  cardioMultiplier: 1.0,
  hybridMultiplier: 1.3,
  goalBonusBase: 50,
  goalBonusIncrement: 10,
  goalBonusCap: 150,
  minWorkoutDuration: 30,
};

const XP_CONFIG_DOC = 'app_config/xp_settings';

async function loadXPSettings(): Promise<XPSettings> {
  try {
    const snap = await getDoc(doc(db, 'app_config', 'xp_settings'));
    if (snap.exists()) {
      return { ...DEFAULT_XP_SETTINGS, ...snap.data() } as XPSettings;
    }
  } catch (e) {
    console.error('[XPSettings] Load failed:', e);
  }
  return DEFAULT_XP_SETTINGS;
}

async function saveXPSettings(settings: XPSettings): Promise<void> {
  await setDoc(doc(db, 'app_config', 'xp_settings'), {
    ...settings,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ============================================================================
// Types
// ============================================================================
interface LevelFormState {
  name: string;
  order: number;
  description: string;
  minXP: number;
  maxXP: number;
  targetGoals: LevelGoal[];
}

const EMPTY_FORM: LevelFormState = {
  name: '',
  order: 1,
  description: '',
  minXP: 0,
  maxXP: 100,
  targetGoals: [],
};

// ============================================================================
// Page Component
// ============================================================================
export default function LevelsPage() {
  // ── State ──────────────────────────────────────────────────────────
  const [levels, setLevels] = useState<Level[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LevelFormState>(EMPTY_FORM);

  // Goal sub-modal
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalExerciseId, setGoalExerciseId] = useState('');
  const [goalTargetValue, setGoalTargetValue] = useState<number>(10);
  const [goalUnit, setGoalUnit] = useState<'reps' | 'seconds'>('reps');
  const [goalEditIndex, setGoalEditIndex] = useState<number | null>(null);

  // Expanded rows for inline view
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // XP Multipliers
  const [xpSettings, setXpSettings] = useState<XPSettings>(DEFAULT_XP_SETTINGS);
  const [showXPSettings, setShowXPSettings] = useState(false);
  const [savingXP, setSavingXP] = useState(false);
  const [xpSaveSuccess, setXpSaveSuccess] = useState(false);

  // ── Load Data ──────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [levelsData, exercisesData, xpData] = await Promise.all([
        getAllLevels(),
        getAllExercises(),
        loadXPSettings(),
      ]);
      setLevels(levelsData);
      setExercises(exercisesData);
      setXpSettings(xpData);
    } catch (e) {
      console.error('[Levels] Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveXPSettings = async () => {
    setSavingXP(true);
    try {
      await saveXPSettings(xpSettings);
      setXpSaveSuccess(true);
      setTimeout(() => setXpSaveSuccess(false), 3000);
    } catch (e) {
      console.error('[XPSettings] Save failed:', e);
      alert('שגיאה בשמירת הגדרות XP');
    } finally {
      setSavingXP(false);
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────
  const openNewForm = () => {
    const nextOrder = levels.length > 0
      ? Math.max(...levels.map(l => l.order)) + 1
      : 1;
    const prevMax = levels.length > 0
      ? Math.max(...levels.map(l => l.maxXP || 0))
      : 0;
    setForm({
      ...EMPTY_FORM,
      order: nextOrder,
      minXP: prevMax,
      maxXP: prevMax + 200,
    });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (level: Level) => {
    setForm({
      name: level.name,
      order: level.order,
      description: level.description || '',
      minXP: level.minXP || 0,
      maxXP: level.maxXP || 0,
      targetGoals: level.targetGoals || [],
    });
    setEditingId(level.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('נא להזין שם רמה');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        order: form.order,
        description: form.description.trim() || undefined,
        minXP: form.minXP,
        maxXP: form.maxXP,
        targetGoals: form.targetGoals.length > 0 ? form.targetGoals : undefined,
      };

      if (editingId) {
        await updateLevel(editingId, payload);
      } else {
        await createLevel(payload as any);
      }
      setShowForm(false);
      await loadData();
    } catch (e) {
      console.error('[Levels] Save failed:', e);
      alert('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLevel(id);
      setDeleteConfirmId(null);
      await loadData();
    } catch (e) {
      console.error('[Levels] Delete failed:', e);
      alert('שגיאה במחיקה');
    }
  };

  // ── Goal Handlers ──────────────────────────────────────────────────
  const openGoalForm = (editIndex?: number) => {
    if (editIndex !== undefined) {
      const goal = form.targetGoals[editIndex];
      setGoalExerciseId(goal.exerciseId);
      setGoalTargetValue(goal.targetValue);
      setGoalUnit(goal.unit);
      setGoalEditIndex(editIndex);
    } else {
      setGoalExerciseId('');
      setGoalTargetValue(10);
      setGoalUnit('reps');
      setGoalEditIndex(null);
    }
    setShowGoalForm(true);
  };

  const saveGoal = () => {
    if (!goalExerciseId) {
      alert('נא לבחור תרגיל');
      return;
    }
    const exercise = exercises.find(e => e.id === goalExerciseId);
    if (!exercise) return;

    const newGoal: LevelGoal = {
      exerciseId: goalExerciseId,
      exerciseName: getLocalizedText(exercise.name, 'he') || getLocalizedText(exercise.name, 'en') || 'Unknown',
      targetValue: goalTargetValue,
      unit: goalUnit,
    };

    const updatedGoals = [...form.targetGoals];
    if (goalEditIndex !== null) {
      updatedGoals[goalEditIndex] = newGoal;
    } else {
      updatedGoals.push(newGoal);
    }

    setForm({ ...form, targetGoals: updatedGoals });
    setShowGoalForm(false);
  };

  const removeGoal = (index: number) => {
    const updatedGoals = form.targetGoals.filter((_, i) => i !== index);
    setForm({ ...form, targetGoals: updatedGoals });
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Signal className="w-8 h-8 text-cyan-600" />
          <div>
            <h1 className="text-2xl font-black text-gray-900">רמות למור (Lemur Levels)</h1>
            <p className="text-sm text-gray-500">רמות עבור מערכת ההישגים והגיימיפיקציה (התפתחות דמות, מטבעות, Widgets). מנותק מהתקדמות בתוכניות.</p>
          </div>
        </div>
        <button
          onClick={openNewForm}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition-colors"
        >
          <Plus size={18} />
          רמה חדשה
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-blue-700">{levels.length}</p>
          <p className="text-sm text-blue-600 font-medium">רמות מוגדרות</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-green-700">
            {levels.filter(l => l.targetGoals && l.targetGoals.length > 0).length}
          </p>
          <p className="text-sm text-green-600 font-medium">רמות עם יעדים</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-black text-purple-700">
            {levels.reduce((sum, l) => sum + (l.targetGoals?.length || 0), 0)}
          </p>
          <p className="text-sm text-purple-600 font-medium">יעדים כוללים</p>
        </div>
      </div>

      {/* XP Engine Settings (Collapsible) */}
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6">
        <button
          onClick={() => setShowXPSettings(!showXPSettings)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-3">
            <Settings className="text-orange-600" size={20} />
            <div>
              <h3 className="text-base font-bold text-orange-900">הגדרות מנוע XP</h3>
              <p className="text-xs text-orange-700">מכפילי סוג אימון, בונוסי יעד, משך מינימלי</p>
            </div>
          </div>
          {showXPSettings ? <ChevronUp size={20} className="text-orange-500" /> : <ChevronDown size={20} className="text-orange-500" />}
        </button>

        {showXPSettings && (
          <div className="mt-4 pt-4 border-t border-orange-200 space-y-4">
            {/* Type Multipliers */}
            <div>
              <h4 className="text-sm font-bold text-gray-800 mb-2">מכפילי סוג אימון (Type Multipliers)</h4>
              <p className="text-xs text-gray-500 mb-3">נוסחה: דקות אימון × דרגת קושי × מכפיל סוג = XP בסיסי</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-3">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Strength</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="5"
                    value={xpSettings.strengthMultiplier}
                    onChange={(e) => setXpSettings({ ...xpSettings, strengthMultiplier: Number(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-center"
                  />
                  <p className="text-xs text-gray-400 mt-1 text-center">ברירת מחדל: 1.2</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Cardio</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="5"
                    value={xpSettings.cardioMultiplier}
                    onChange={(e) => setXpSettings({ ...xpSettings, cardioMultiplier: Number(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-center"
                  />
                  <p className="text-xs text-gray-400 mt-1 text-center">ברירת מחדל: 1.0</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Hybrid</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="5"
                    value={xpSettings.hybridMultiplier}
                    onChange={(e) => setXpSettings({ ...xpSettings, hybridMultiplier: Number(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-center"
                  />
                  <p className="text-xs text-gray-400 mt-1 text-center">ברירת מחדל: 1.3</p>
                </div>
              </div>
            </div>

            {/* Goal Bonus */}
            <div>
              <h4 className="text-sm font-bold text-gray-800 mb-2">בונוס יעדים (Goal Bonus XP)</h4>
              <p className="text-xs text-gray-500 mb-3">XP נוסף כשמשתמש עומד/עובר יעד תרגיל</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-3">
                  <label className="block text-xs font-bold text-gray-700 mb-1">בסיס (Base)</label>
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={xpSettings.goalBonusBase}
                    onChange={(e) => setXpSettings({ ...xpSettings, goalBonusBase: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-center"
                  />
                  <p className="text-xs text-gray-400 mt-1 text-center">XP על עמידה ביעד</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3">
                  <label className="block text-xs font-bold text-gray-700 mb-1">תוספת (Per 10%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={xpSettings.goalBonusIncrement}
                    onChange={(e) => setXpSettings({ ...xpSettings, goalBonusIncrement: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-center"
                  />
                  <p className="text-xs text-gray-400 mt-1 text-center">+XP לכל 10% חריגה</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3">
                  <label className="block text-xs font-bold text-gray-700 mb-1">תקרה (Cap)</label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={xpSettings.goalBonusCap}
                    onChange={(e) => setXpSettings({ ...xpSettings, goalBonusCap: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-center"
                  />
                  <p className="text-xs text-gray-400 mt-1 text-center">מקסימום XP בונוס</p>
                </div>
              </div>
            </div>

            {/* Min Duration */}
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <label className="block text-xs font-bold text-gray-700 mb-1">משך אימון מינימלי (דקות)</label>
              <input
                type="number"
                min="1"
                max="120"
                value={xpSettings.minWorkoutDuration}
                onChange={(e) => setXpSettings({ ...xpSettings, minWorkoutDuration: Number(e.target.value) || 1 })}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold"
              />
              <span className="text-xs text-gray-500 mr-2">אימון קצר יותר ייספר כמשך מינימלי זה</span>
            </div>

            {/* Save Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveXPSettings}
                disabled={savingXP}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                <Save size={16} />
                {savingXP ? 'שומר...' : 'שמור הגדרות XP'}
              </button>
              {xpSaveSuccess && (
                <span className="flex items-center gap-1 text-green-600 font-bold text-sm">
                  <Check size={16} />
                  נשמר בהצלחה
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Program-Specific Goals Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-amber-800">יעדי תרגילים לפי תוכנית</p>
          <p className="text-xs text-amber-700 mt-0.5">
            כדי להגדיר יעדי תרגילים ספציפיים לתוכנית מסוימת, עבור לעורך התוכניות ולחץ על &quot;יעדי רמות&quot;.
          </p>
        </div>
        <Link
          href="/admin/programs"
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition-colors whitespace-nowrap"
        >
          עורך תוכניות
          <ArrowLeft size={14} />
        </Link>
      </div>

      {/* Levels Table */}
      {levels.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <Signal className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-500 mb-2">אין רמות מוגדרות</h3>
          <p className="text-gray-400 mb-4">צור את הרמה הראשונה כדי להתחיל</p>
          <button
            onClick={openNewForm}
            className="px-6 py-3 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition-colors"
          >
            צור רמה ראשונה
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right font-bold text-gray-700">#</th>
                <th className="px-4 py-3 text-right font-bold text-gray-700">שם</th>
                <th className="px-4 py-3 text-right font-bold text-gray-700">טווח XP</th>
                <th className="px-4 py-3 text-center font-bold text-gray-700">יעדים</th>
                <th className="px-4 py-3 text-center font-bold text-gray-700">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <React.Fragment key={level.id}>
                  <tr
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                      expandedRowId === level.id ? 'bg-cyan-50' : ''
                    }`}
                    onClick={() => setExpandedRowId(expandedRowId === level.id ? null : level.id)}
                  >
                    <td className="px-4 py-3 font-bold text-gray-900">{level.order}</td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-bold text-gray-900">{level.name}</span>
                        {level.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{level.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold">
                        {level.minXP ?? 0} – {level.maxXP ?? '∞'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {level.targetGoals && level.targetGoals.length > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-800 rounded-lg text-xs font-bold">
                          <Target size={12} />
                          {level.targetGoals.length}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditForm(level)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="ערוך"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(level.id)}
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                          title="מחק"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button
                          onClick={() => setExpandedRowId(expandedRowId === level.id ? null : level.id)}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          {expandedRowId === level.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Row — Goals Detail */}
                  {expandedRowId === level.id && (
                    <tr>
                      <td colSpan={5} className="bg-cyan-50/50 px-6 py-4">
                        {level.targetGoals && level.targetGoals.length > 0 ? (
                          <div>
                            <h4 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                              <Target size={14} className="text-cyan-600" />
                              יעדי תרגילים לרמה זו
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {level.targetGoals.map((goal, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-2.5"
                                >
                                  <span className="font-medium text-gray-800">{goal.exerciseName}</span>
                                  <span className="font-bold text-cyan-700">
                                    {goal.targetValue} {goal.unit === 'reps' ? 'חזרות' : 'שניות'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">אין יעדי תרגילים מוגדרים לרמה זו.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ──────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">מחיקת רמה</h3>
            <p className="text-sm text-gray-600 mb-6">האם אתה בטוח? פעולה זו לא ניתנת לביטול.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 transition-colors"
              >
                מחק
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl hover:bg-gray-300 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Level Form Modal ──────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'עריכת רמה' : 'רמה חדשה'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Basic Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">שם הרמה *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="למשל: מתחיל, מתקדם"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-right"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">סדר (Order)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.order}
                    onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 1 })}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">תיאור (אופציונלי)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-right"
                  placeholder="תיאור קצר של הרמה..."
                />
              </div>

              {/* XP Range */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-blue-800 mb-3">טווח XP (חישוב פנימי בלבד)</h3>
                <p className="text-xs text-blue-600 mb-3">ערכי XP משמשים לחישוב פנימי — המשתמש רואה רק אחוזים.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">XP מינימלי</label>
                    <input
                      type="number"
                      min="0"
                      value={form.minXP}
                      onChange={(e) => setForm({ ...form, minXP: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">XP מקסימלי</label>
                    <input
                      type="number"
                      min="0"
                      value={form.maxXP}
                      onChange={(e) => setForm({ ...form, maxXP: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2"
                    />
                  </div>
                </div>
              </div>

              {/* Target Goals Section */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-green-800 flex items-center gap-2">
                    <Target size={16} />
                    תרגילי יעד לרמה
                  </h3>
                  <button
                    onClick={() => openGoalForm()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Plus size={14} />
                    הוסף יעד
                  </button>
                </div>

                {form.targetGoals.length === 0 ? (
                  <p className="text-sm text-green-700/70">אין יעדים. לחץ &quot;הוסף יעד&quot; כדי להגדיר תרגילי שליטה.</p>
                ) : (
                  <div className="space-y-2">
                    {form.targetGoals.map((goal, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-white border border-green-200 rounded-xl px-4 py-2.5"
                      >
                        <div>
                          <span className="font-bold text-gray-800">{goal.exerciseName}</span>
                          <span className="text-sm text-gray-500 mr-2">
                            — {goal.targetValue} {goal.unit === 'reps' ? 'חזרות' : 'שניות'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openGoalForm(index)}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded-lg"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => removeGoal(index)}
                            className="p-1 text-red-600 hover:bg-red-100 rounded-lg"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-cyan-600 text-white font-bold py-3 rounded-xl hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                {saving ? 'שומר...' : (editingId ? 'עדכן' : 'צור רמה')}
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

      {/* ─── Goal Sub-Modal ────────────────────────────────────────── */}
      {showGoalForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                {goalEditIndex !== null ? 'ערוך יעד' : 'הוסף יעד חדש'}
              </h3>
              <button onClick={() => setShowGoalForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Exercise Selector (Searchable Autocomplete) */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">תרגיל *</label>
                <ExerciseAutocomplete
                  exercises={exercises}
                  selectedId={goalExerciseId}
                  onChange={(id) => setGoalExerciseId(id)}
                  placeholder="חפש תרגיל..."
                />
              </div>

              {/* Target Value */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">ערך יעד</label>
                <input
                  type="number"
                  min="1"
                  value={goalTargetValue}
                  onChange={(e) => setGoalTargetValue(parseInt(e.target.value) || 1)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5"
                  placeholder="10"
                />
              </div>

              {/* Unit Selector */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">יחידת מדידה</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setGoalUnit('reps')}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                      goalUnit === 'reps'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    חזרות (Reps)
                  </button>
                  <button
                    onClick={() => setGoalUnit('seconds')}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                      goalUnit === 'seconds'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    שניות (Seconds)
                  </button>
                </div>
              </div>
            </div>

            {/* Goal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={saveGoal}
                className="flex-1 bg-green-600 text-white font-bold py-2.5 rounded-xl hover:bg-green-700 transition-colors"
              >
                {goalEditIndex !== null ? 'עדכן' : 'הוסף'}
              </button>
              <button
                onClick={() => setShowGoalForm(false)}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition-colors"
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

'use client';

import React, { useState, useEffect } from 'react';
import { Signal, Plus, Pencil, Trash2, Target, X, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { getAllLevels, createLevel, updateLevel, deleteLevel } from '@/features/content/programs/core/level.service';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import ExerciseAutocomplete from '@/components/admin/ExerciseAutocomplete';
import type { Level, LevelGoal } from '@/types/workout';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

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
// Component
// ============================================================================
export default function GlobalLevelsManager() {
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

  // ── Load Data ──────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [levelsData, exercisesData] = await Promise.all([
        getAllLevels(),
        getAllExercises(),
      ]);
      setLevels(levelsData);
      setExercises(exercisesData);
    } catch (e) {
      console.error('[GlobalLevelsManager] Failed to load data:', e);
    } finally {
      setLoading(false);
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
      console.error('[GlobalLevelsManager] Save failed:', e);
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
      console.error('[GlobalLevelsManager] Delete failed:', e);
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
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-blue-700">
            רמות למור (Lemur Levels) — מערכת הישגים וגיימיפיקציה (התפתחות דמות, מטבעות, Widgets). מנותק מהתקדמות בתוכניות.
          </p>
        </div>
        <button
          onClick={openNewForm}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors text-sm"
        >
          <Plus size={16} />
          רמה חדשה
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-blue-100 border border-blue-300 rounded-lg p-3 text-center">
          <p className="text-2xl font-black text-blue-700">{levels.length}</p>
          <p className="text-xs text-blue-600 font-medium">רמות מוגדרות</p>
        </div>
        <div className="bg-green-100 border border-green-300 rounded-lg p-3 text-center">
          <p className="text-2xl font-black text-green-700">
            {levels.filter(l => l.targetGoals && l.targetGoals.length > 0).length}
          </p>
          <p className="text-xs text-green-600 font-medium">רמות עם יעדים</p>
        </div>
        <div className="bg-purple-100 border border-purple-300 rounded-lg p-3 text-center">
          <p className="text-2xl font-black text-purple-700">
            {levels.reduce((sum, l) => sum + (l.targetGoals?.length || 0), 0)}
          </p>
          <p className="text-xs text-purple-600 font-medium">יעדים כוללים</p>
        </div>
      </div>

      {/* Levels Table */}
      {levels.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <Signal className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-500 mb-2">אין רמות מוגדרות</h3>
          <p className="text-sm text-gray-400 mb-3">צור את הרמה הראשונה כדי להתחיל</p>
          <button
            onClick={openNewForm}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors text-sm"
          >
            צור רמה ראשונה
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-right font-bold text-gray-700">#</th>
                <th className="px-3 py-2 text-right font-bold text-gray-700">שם</th>
                <th className="px-3 py-2 text-right font-bold text-gray-700">טווח XP</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700">יעדים</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <React.Fragment key={level.id}>
                  <tr
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                      expandedRowId === level.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setExpandedRowId(expandedRowId === level.id ? null : level.id)}
                  >
                    <td className="px-3 py-2 font-bold text-gray-900">{level.order}</td>
                    <td className="px-3 py-2">
                      <div>
                        <span className="font-bold text-gray-900">{level.name}</span>
                        {level.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{level.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-bold">
                        {level.minXP ?? 0} – {level.maxXP ?? '∞'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {level.targetGoals && level.targetGoals.length > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-bold">
                          <Target size={10} />
                          {level.targetGoals.length}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditForm(level)}
                          className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                          title="ערוך"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(level.id)}
                          className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                          title="מחק"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          onClick={() => setExpandedRowId(expandedRowId === level.id ? null : level.id)}
                          className="p-1 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                        >
                          {expandedRowId === level.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Row — Goals Detail */}
                  {expandedRowId === level.id && (
                    <tr>
                      <td colSpan={5} className="bg-blue-50/50 px-4 py-3">
                        {level.targetGoals && level.targetGoals.length > 0 ? (
                          <div>
                            <h4 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                              <Target size={12} className="text-blue-600" />
                              יעדי תרגילים לרמה זו
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                              {level.targetGoals.map((goal, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2"
                                >
                                  <span className="font-medium text-gray-800 text-sm">{goal.exerciseName}</span>
                                  <span className="font-bold text-blue-700 text-sm">
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
          <div className="bg-white rounded-xl p-5 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-base font-bold text-gray-900 mb-2">מחיקת רמה</h3>
            <p className="text-sm text-gray-600 mb-4">האם אתה בטוח? פעולה זו לא ניתנת לביטול.</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg hover:bg-red-700 transition-colors text-sm"
              >
                מחק
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 bg-gray-200 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-300 transition-colors text-sm"
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
          <div className="bg-white rounded-xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 rounded-t-xl flex items-center justify-between z-10">
              <h2 className="text-base font-bold text-gray-900">
                {editingId ? 'עריכת רמה' : 'רמה חדשה'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Basic Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">שם הרמה *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="למשל: מתחיל, מתקדם"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">סדר (Order)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.order}
                    onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 1 })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">תיאור (אופציונלי)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right text-sm"
                  placeholder="תיאור קצר של הרמה..."
                />
              </div>

              {/* XP Range */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h3 className="text-sm font-bold text-blue-800 mb-2">טווח XP (Lemur Levels)</h3>
                <p className="text-xs text-blue-600 mb-2">משמש לחישוב התפתחות דמות למור/מטבעות. המשתמש רואה רק אחוזים.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">XP מינימלי</label>
                    <input
                      type="number"
                      min="0"
                      value={form.minXP}
                      onChange={(e) => setForm({ ...form, minXP: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">XP מקסימלי</label>
                    <input
                      type="number"
                      min="0"
                      value={form.maxXP}
                      onChange={(e) => setForm({ ...form, maxXP: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Target Goals Section */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-green-800 flex items-center gap-2">
                    <Target size={14} />
                    תרגילי יעד לרמה
                  </h3>
                  <button
                    onClick={() => openGoalForm()}
                    className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 transition-colors"
                  >
                    <Plus size={12} />
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
                        className="flex items-center justify-between bg-white border border-green-200 rounded-lg px-3 py-2"
                      >
                        <div>
                          <span className="font-bold text-gray-800 text-sm">{goal.exerciseName}</span>
                          <span className="text-sm text-gray-500 mr-2">
                            — {goal.targetValue} {goal.unit === 'reps' ? 'חזרות' : 'שניות'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openGoalForm(index)}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => removeGoal(index)}
                            className="p-1 text-red-600 hover:bg-red-100 rounded"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-3 rounded-b-xl flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
              >
                <Save size={16} />
                {saving ? 'שומר...' : (editingId ? 'עדכן' : 'צור רמה')}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition-colors text-sm"
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
          <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-2xl">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                {goalEditIndex !== null ? 'ערוך יעד' : 'הוסף יעד חדש'}
              </h3>
              <button onClick={() => setShowGoalForm(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {/* Exercise Selector */}
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="10"
                />
              </div>

              {/* Unit Selector */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">יחידת מדידה</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setGoalUnit('reps')}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${
                      goalUnit === 'reps'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    חזרות (Reps)
                  </button>
                  <button
                    onClick={() => setGoalUnit('seconds')}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${
                      goalUnit === 'seconds'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    שניות (Seconds)
                  </button>
                </div>
              </div>
            </div>

            {/* Goal Footer */}
            <div className="px-5 py-3 border-t border-gray-200 flex gap-2">
              <button
                onClick={saveGoal}
                className="flex-1 bg-green-600 text-white font-bold py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                {goalEditIndex !== null ? 'עדכן' : 'הוסף'}
              </button>
              <button
                onClick={() => setShowGoalForm(false)}
                className="px-5 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition-colors text-sm"
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

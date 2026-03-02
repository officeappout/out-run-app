"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  getAllPrograms, 
  createProgram, 
  updateProgram, 
  deleteProgram 
} from '@/features/content/programs';
import { Program } from '@/features/content/programs';
import {
  getProgramLevelSettingsByProgram,
  saveProgramLevelSettings,
} from '@/features/content/programs/core/programLevelSettings.service';
import { ProgramLevelSettings } from '@/features/content/programs/core/program.types';
import { LevelGoal } from '@/types/workout';
import { getAllExercises } from '@/features/content/exercises';
import { Exercise } from '@/features/content/exercises/core/exercise.types';
import ExerciseAutocomplete from '@/components/admin/ExerciseAutocomplete';
import {
  Plus, Edit2, Trash2, Save, X, ChevronDown, ChevronUp,
  Target, Dumbbell, ClipboardList, Crown, Eye, Lock, Check,
  Settings2, Percent,
} from 'lucide-react';
import { useUserRole } from '@/features/admin/services/auth.service';
// GlobalLevelsManager moved to standalone /admin/levels page

// ── Types ───────────────────────────────────────────────────────────

interface EditingGoal extends LevelGoal {
  _key: string; // client-side key for list rendering
}

// ── Main Page ───────────────────────────────────────────────────────

export default function ProgramsAdminPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProgram, setEditingProgram] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [expandedLevelGoals, setExpandedLevelGoals] = useState<string | null>(null);
  const [expandedMasterView, setExpandedMasterView] = useState<string | null>(null);
  // Role check — Master Program Read-Only View restricted to super_admin
  const { roleInfo } = useUserRole();
  const canViewMasterInternals = roleInfo?.isSuperAdmin === true;
  
  const [programForm, setProgramForm] = useState<Partial<Program>>({
    name: '',
    description: '',
    maxLevels: 5,
    isMaster: false,
    imageUrl: '',
    subPrograms: [],
    requiredTier: 1,
    trainingType: 'strength',
    iconKey: 'muscle',
  });

  useEffect(() => {
    loadPrograms();
  }, []);

  const loadPrograms = async () => {
    setLoading(true);
    try {
      const data = await getAllPrograms();
      setPrograms(data);
    } catch (error) {
      console.error('Error loading programs:', error);
      alert('שגיאה בטעינת התוכניות');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProgram = async () => {
    try {
      // Ensure no undefined values reach Firestore (Firebase rejects undefined)
      const sanitizedForm = {
        ...programForm,
        trainingType: programForm.trainingType || 'strength',
        iconKey: programForm.iconKey || 'muscle',
      };

      if (editingProgram) {
        await updateProgram(editingProgram, sanitizedForm);
      } else {
        await createProgram(sanitizedForm as Omit<Program, 'id' | 'createdAt' | 'updatedAt'>);
      }
      await loadPrograms();
      setEditingProgram(null);
      setShowNewForm(false);
      resetForm();
    } catch (error) {
      console.error('Error saving program:', error);
      alert('שגיאה בשמירת התוכנית');
    }
  };

  const handleDeleteProgram = async (programId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את התוכנית?')) return;
    
    try {
      await deleteProgram(programId);
      await loadPrograms();
    } catch (error) {
      console.error('Error deleting program:', error);
      alert('שגיאה במחיקת התוכנית');
    }
  };

  const handleStartEdit = (program: Program) => {
    setEditingProgram(program.id);
    setProgramForm({
      name: program.name,
      description: program.description || '',
      maxLevels: program.maxLevels || 5,
      isMaster: program.isMaster || false,
      imageUrl: program.imageUrl || '',
      subPrograms: program.subPrograms || [],
      requiredTier: program.requiredTier ?? 1,
      movementPattern: program.movementPattern,
      trainingType: program.trainingType || 'strength',
      iconKey: program.iconKey || 'muscle',
    });
    setShowNewForm(false);
  };

  const handleCancelEdit = () => {
    setEditingProgram(null);
    setShowNewForm(false);
    resetForm();
  };

  const resetForm = () => {
    setProgramForm({
      name: '',
      description: '',
      maxLevels: 5,
      isMaster: false,
      imageUrl: '',
      subPrograms: [],
      requiredTier: 1,
      trainingType: 'strength',
      iconKey: 'muscle',
    });
  };

  const toggleLevelGoals = (programId: string) => {
    setExpandedLevelGoals((prev) => (prev === programId ? null : programId));
  };

  const toggleMasterView = (programId: string) => {
    setExpandedMasterView((prev) => (prev === programId ? null : programId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900">ניהול תוכניות</h1>
          <p className="text-gray-500 mt-2">צור וערוך תוכניות אימון (Full Body, Upper Body, Lower Body, etc.)</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowNewForm(true);
            setEditingProgram(null);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors"
        >
          <Plus size={20} />
          תוכנית חדשה
        </button>
      </div>

      {/* Lemur Levels moved to standalone /admin/levels page */}

      {/* New Program Form */}
      {showNewForm && (
        <div className="bg-white rounded-2xl border-2 border-cyan-500 p-6 shadow-lg">
          <h3 className="text-xl font-bold mb-4">תוכנית חדשה</h3>
          <ProgramForm
            form={programForm}
            onChange={setProgramForm}
            onSave={handleSaveProgram}
            onCancel={handleCancelEdit}
            allPrograms={programs}
          />
        </div>
      )}

      {/* Programs List */}
      <div className="space-y-4">
        {programs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            אין תוכניות. התחל ביצירת תוכנית ראשונה.
          </div>
        ) : (
          programs.map((program) => (
            <div
              key={program.id}
              className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${
                editingProgram === program.id ? 'border-2 border-cyan-500' : 'border-gray-200'
              }`}
            >
              {/* Program Card Header */}
              <div className="p-6">
                {editingProgram === program.id ? (
                  <ProgramForm
                    form={programForm}
                    onChange={setProgramForm}
                    onSave={handleSaveProgram}
                    onCancel={handleCancelEdit}
                    allPrograms={programs.filter(p => p.id !== program.id)}
                  />
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        {program.isMaster && (
                          <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">
                            תוכנית ראשית
                          </span>
                        )}
                        {(program.requiredTier ?? 1) > 1 && (
                          <span className={`px-2.5 py-1 text-xs font-bold rounded ${
                            program.requiredTier === 3 
                              ? 'bg-violet-100 text-violet-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {program.requiredTier === 3 ? '🟣 עלית' : '🔵 קהילתי'}
                          </span>
                        )}
                        {program.movementPattern && (
                          <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 text-xs font-bold rounded">
                            {program.movementPattern === 'push' ? '💪 דחיפה' :
                             program.movementPattern === 'pull' ? '🏋️ משיכה' :
                             program.movementPattern === 'legs' ? '🦵 רגליים' :
                             program.movementPattern === 'core' ? '🧘 ליבה' : program.movementPattern}
                          </span>
                        )}
                        {program.trainingType && (
                          <span className={`px-2.5 py-1 text-xs font-bold rounded ${
                            program.trainingType === 'cardio'
                              ? 'bg-lime-100 text-lime-700'
                              : 'bg-sky-100 text-sky-700'
                          }`}>
                            {program.trainingType === 'cardio' ? '🟩 טבעת קרדיו' : '🟦 טבעת כוח'}
                          </span>
                        )}
                        {program.iconKey && (
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded">
                            📅 אייקון: {{ muscle: 'שריר', full_body: 'כל הגוף', pullup: 'מתח', leg: 'רגליים', core: 'ליבה', shoe: 'ריצה', heart: 'בריאות' }[program.iconKey] || program.iconKey}
                          </span>
                        )}
                        {program.maxLevels && (
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded">
                            עד רמה {program.maxLevels}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">
                        {program.name}
                        {/* Inline role indicator */}
                        {program.isMaster ? (
                          <span className="mr-2 text-sm font-medium text-purple-600">👑 ראשית</span>
                        ) : (
                          (() => {
                            const isChild = programs.some(p => p.isMaster && p.subPrograms?.includes(program.id));
                            return isChild ? (
                              <span className="mr-2 text-sm font-medium text-blue-500">🔗 תת-תוכנית</span>
                            ) : (
                              <span className="mr-2 text-sm font-medium text-gray-400">📦 עצמאית</span>
                            );
                          })()
                        )}
                      </h3>
                      {/* Master → Children: explicit linked children list */}
                      {program.isMaster && program.subPrograms && program.subPrograms.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          <span className="text-xs text-purple-500 font-semibold self-center">תתי-תוכניות:</span>
                          {program.subPrograms.map(childId => {
                            const childProg = programs.find(p => p.id === childId);
                            return (
                              <span
                                key={childId}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-lg border border-purple-200"
                              >
                                {childProg?.movementPattern === 'push' ? '💪' :
                                 childProg?.movementPattern === 'pull' ? '🏋️' :
                                 childProg?.movementPattern === 'legs' ? '🦵' :
                                 childProg?.movementPattern === 'core' ? '🧘' : '📋'}
                                {childProg?.name || childId}
                                <span className="text-purple-400 text-[10px]">({childId})</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {program.isMaster && (!program.subPrograms || program.subPrograms.length === 0) && (
                        <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-red-50 text-red-600 text-xs font-medium rounded border border-red-200 w-fit">
                          ⚠️ תוכנית ראשית ללא תתי-תוכניות מחוברות
                        </div>
                      )}
                      {/* Child → Parent: Show which Master(s) this program belongs to */}
                      {!program.isMaster && (() => {
                        const parentMasters = programs.filter(
                          p => p.isMaster && p.subPrograms?.includes(program.id)
                        );
                        if (parentMasters.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {parentMasters.map(master => (
                              <span
                                key={master.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-600 text-xs font-medium rounded border border-purple-200"
                              >
                                <Crown size={10} />
                                שייך ל-{master.name}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                      {program.description && (
                        <p className="text-gray-600 text-sm mb-3">{program.description}</p>
                      )}
                      {program.imageUrl && (
                        <div className="mt-2">
                          <img 
                            src={program.imageUrl} 
                            alt={program.name}
                            className="w-32 h-20 object-cover rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Master Read-Only View button — Super Admin only */}
                      {program.isMaster && canViewMasterInternals && (
                        <button
                          onClick={() => toggleMasterView(program.id)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-sm transition-colors ${
                            expandedMasterView === program.id
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                          }`}
                          title="תצוגת Master (Super Admin בלבד)"
                        >
                          <Eye size={16} />
                          תצוגת Master
                          {expandedMasterView === program.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                      {/* Locked indicator for non-super-admins on Master Programs */}
                      {program.isMaster && !canViewMasterInternals && (
                        <span className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed" title="Super Admin בלבד">
                          <Lock size={14} />
                          Master
                        </span>
                      )}
                      <button
                        onClick={() => toggleLevelGoals(program.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-sm transition-colors ${
                          expandedLevelGoals === program.id
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                        }`}
                        title="יעדי רמות"
                      >
                        <Target size={16} />
                        יעדי רמות
                        {expandedLevelGoals === program.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <button
                        onClick={() => handleStartEdit(program)}
                        className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteProgram(program.id)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Master Read-Only Aggregation View — Super Admin only */}
              {expandedMasterView === program.id && program.isMaster && canViewMasterInternals && (
                <div className="border-t border-purple-200 bg-purple-50/30">
                  <MasterProgramReadOnlyView program={program} allPrograms={programs} />
                </div>
              )}

              {/* Level Goals Panel (expanded) */}
              {expandedLevelGoals === program.id && (
                <div className="border-t border-amber-200 bg-amber-50/30">
                  <LevelGoalsPanel program={program} allPrograms={programs} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Master Program Read-Only View ────────────────────────────────────

function MasterProgramReadOnlyView({
  program,
  allPrograms,
}: {
  program: Program;
  allPrograms: Program[];
}) {
  const childPrograms = (program.subPrograms || [])
    .map((childId) => allPrograms.find((p) => p.id === childId))
    .filter(Boolean) as Program[];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Crown size={18} className="text-purple-600" />
        <h4 className="text-lg font-bold text-purple-900">תצוגת Master — קריאה בלבד</h4>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-800">
        <p className="font-bold mb-1">מודל ירושה (Inheritance Model):</p>
        <ul className="list-disc list-inside space-y-1 text-purple-700">
          <li>הרמה של תוכנית Master מחושבת <strong>אוטומטית</strong> מממוצע הילדים</li>
          <li>אין צורך להגדיר "Expected Sets" או "Progression Weight" ב-Master</li>
          <li>
            נוסחה: <code className="bg-purple-100 px-1.5 py-0.5 rounded text-xs font-mono">
              ΔMaster% = Σ(ΔChild%) / N
            </code>
          </li>
          <li>בונוסי ביצוע מהילדים משתקפים אוטומטית ב-Master</li>
        </ul>
      </div>

      {/* Child Programs Table */}
      <div>
        <h5 className="text-sm font-bold text-gray-700 mb-2">
          תוכניות ילד ({childPrograms.length})
        </h5>
        {childPrograms.length === 0 ? (
          <p className="text-sm text-gray-500">אין תוכניות ילד מוגדרות. הוסף ב-"ערוך".</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right px-4 py-2 font-bold text-gray-600">תוכנית</th>
                  <th className="text-center px-4 py-2 font-bold text-gray-600">רמות</th>
                  <th className="text-center px-4 py-2 font-bold text-gray-600">סוג</th>
                  <th className="text-center px-4 py-2 font-bold text-gray-600">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {childPrograms.map((child) => (
                  <tr key={child.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {child.imageUrl && (
                          <img
                            src={child.imageUrl}
                            alt=""
                            className="w-8 h-8 rounded object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <span className="font-bold text-gray-900">{child.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {child.maxLevels || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded">
                        Child
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <code className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                        {child.id}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Aggregation Formula Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h5 className="text-sm font-bold text-gray-700 mb-2">חישוב רמת Master</h5>
        <div className="text-sm text-gray-600 space-y-1">
          <p>
            <strong>Level:</strong>{' '}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
              floor(avg(child_levels))
            </code>
          </p>
          <p>
            <strong>Percent:</strong>{' '}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
              avg(child_percents)
            </code>
          </p>
          <p className="text-xs text-gray-400 mt-2">
            * חישוב זה מתבצע אוטומטית ב-<code>recalculateAncestorMasters()</code> בכל סיום אימון
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Program Form ────────────────────────────────────────────────────

function ProgramForm({
  form,
  onChange,
  onSave,
  onCancel,
  allPrograms,
}: {
  form: Partial<Program>;
  onChange: (form: Partial<Program>) => void;
  onSave: () => void;
  onCancel: () => void;
  allPrograms: Program[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">שם התוכנית *</label>
        <input
          type="text"
          value={form.name || ''}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="לדוגמה: Full Body, Upper Body"
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">תיאור (אופציונלי)</label>
        <textarea
          value={form.description || ''}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          rows={3}
          placeholder="תיאור התוכנית..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">רמות מקסימליות</label>
          <input
            type="number"
            min="1"
            max="25"
            value={form.maxLevels || 5}
            onChange={(e) => onChange({ ...form, maxLevels: parseInt(e.target.value) || 5 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">קישור תמונה (אופציונלי)</label>
          <input
            type="url"
            value={form.imageUrl || ''}
            onChange={(e) => onChange({ ...form, imageUrl: e.target.value || undefined })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            placeholder="https://example.com/image.jpg"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isMaster || false}
            onChange={(e) => onChange({ ...form, isMaster: e.target.checked })}
            className="w-4 h-4 text-cyan-500 border-gray-300 rounded focus:ring-cyan-500"
          />
          <span className="text-sm font-bold text-gray-700">
            Master Program (תוכנית ראשית)
          </span>
        </label>
      </div>

      {/* ── Required Tier (Access Level) ── */}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">רמת גישה נדרשת (Required Tier)</label>
        <select
          value={form.requiredTier ?? 1}
          onChange={(e) => onChange({ ...form, requiredTier: parseInt(e.target.value) as 1 | 2 | 3 })}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white"
        >
          <option value={1}>🟢 Tier 1 — Starter (חינמי)</option>
          <option value={2}>🔵 Tier 2 — Community (עירוני)</option>
          <option value={3}>🟣 Tier 3 — Elite (מתקדם / בי"ס)</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">משתמשים עם רמת גישה נמוכה יותר לא יוכלו לגשת לתוכנית זו</p>
      </div>

      {/* ── Movement Pattern (for volume mapping) ── */}
      {!form.isMaster && (
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">תבנית תנועה (Movement Pattern)</label>
          <select
            value={form.movementPattern ?? ''}
            onChange={(e) => onChange({ ...form, movementPattern: (e.target.value || undefined) as any })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white"
          >
            <option value="">ללא (תוכנית כללית)</option>
            <option value="push">💪 Push (דחיפה)</option>
            <option value="pull">🏋️ Pull (משיכה)</option>
            <option value="legs">🦵 Legs (רגליים)</option>
            <option value="core">🧘 Core (ליבה)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            קובע את המיפוי של "יעד נפח שבועי" ב-מנהל ההתקדמות. תוכניות ללא תבנית לא יציגו שדה נפח.
          </p>
        </div>
      )}

      {/* ── Activity Ring Color & Schedule Display Icon ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">צבע טבעת פעילות (Activity Ring Color)</label>
          <select
            value={form.trainingType || 'strength'}
            onChange={(e) => onChange({ ...form, trainingType: (e.target.value as 'strength' | 'cardio') || 'strength' })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white"
          >
            <option value="strength">🟦 כוח — Cyan (#06B6D4)</option>
            <option value="cardio">🟩 קרדיו — Lime (#84CC16)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            לאיזו טבעת פעילות ייכנסו דקות האימון — כוח (Cyan) או קרדיו (Lime).
          </p>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">אייקון לוח זמנים (Schedule Display Icon)</label>
          <select
            value={form.iconKey || 'muscle'}
            onChange={(e) => onChange({ ...form, iconKey: e.target.value || 'muscle' })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white"
          >
            <option value="muscle">💪 שריר — Muscle (ברירת מחדל)</option>
            <option value="full_body">🧍 כל הגוף — Full Body</option>
            <option value="pullup">🏋️ מתח — Pull-up Target</option>
            <option value="leg">🦵 רגליים — Leg</option>
            <option value="core">🧘 ליבה — Sparkles</option>
            <option value="shoe">🏃 ריצה — Running</option>
            <option value="heart">❤️ בריאות — Heart</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            האייקון שמוצג בלוח השבועי ובכרטיסי ההתקדמות של התוכנית.
          </p>
        </div>
      </div>

      {form.isMaster && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-xs font-bold text-purple-700 mb-2">
            Master Programs (כמו &quot;Full Body&quot;) עוקבים אחר רמות נפרדות לכל תת-תחום ברקע
          </p>
          <p className="text-xs text-purple-600">
            למתחילים (רמה 1-5) תוצג רק רמה גלובלית מאוחדת, אך המערכת תעקוב אחר Upper Body, Lower Body ו-Core בנפרד.
          </p>

          {/* Sub-Programs Multi-Select */}
          <div className="mt-4 pt-4 border-t border-purple-200">
            <label className="block text-sm font-bold text-purple-700 mb-2">
              תת-תוכניות (Sub-Programs)
            </label>
            <p className="text-xs text-purple-600 mb-3">
              בחר את התוכניות שרמתן תשפיע על רמת ה-Master. רמת ה-Master = ממוצע חשבוני (sum/count) של רמות התת-תוכניות.
            </p>
            
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto border border-purple-200 rounded-lg p-3 bg-white">
              {allPrograms
                .filter(p => 
                  p.id !== form.id && // Can't be a child of itself
                  !p.isMaster // Prevent circular refs (masters can't be children of masters)
                )
                .map(program => {
                  const isSelected = (form.subPrograms || []).includes(program.id);
                  return (
                    <button
                      key={program.id}
                      type="button"
                      onClick={() => {
                        const currentSubPrograms = form.subPrograms || [];
                        const newSubPrograms = isSelected
                          ? currentSubPrograms.filter(id => id !== program.id) // Remove
                          : [...currentSubPrograms, program.id]; // Add
                        onChange({ ...form, subPrograms: newSubPrograms });
                      }}
                      className={`
                        flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left
                        ${isSelected 
                          ? 'bg-purple-100 border-purple-500 shadow-sm' 
                          : 'bg-gray-50 border-gray-200 hover:border-purple-300'
                        }
                      `}
                    >
                      {/* Checkmark icon */}
                      <div className={`
                        w-5 h-5 rounded flex items-center justify-center flex-shrink-0
                        ${isSelected ? 'bg-purple-600 text-white' : 'bg-gray-300'}
                      `}>
                        {isSelected && <Check size={14} />}
                      </div>
                      
                      {/* Program thumbnail */}
                      {program.thumbnail && (
                        <img 
                          src={program.thumbnail} 
                          alt="" 
                          className="w-8 h-8 rounded object-cover flex-shrink-0"
                        />
                      )}
                      
                      {/* Program name */}
                      <span className="text-sm font-medium text-gray-800">
                        {program.name}
                      </span>
                    </button>
                  );
                })}
            </div>
            
            {/* Selected count indicator */}
            <p className="text-xs text-purple-500 mt-2">
              {(form.subPrograms || []).length} תת-תוכניות נבחרו
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={onSave}
          disabled={!form.name}
          className="flex items-center gap-2 px-6 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={18} />
          שמור
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
        >
          <X size={18} />
          ביטול
        </button>
      </div>
    </div>
  );
}

// ── Level Goals Panel ───────────────────────────────────────────────
// Shown inline beneath each program card when "יעדי רמות" is toggled.
// For Master Programs, automatically displays inherited goals from sub-programs.

// ── Training OS: Per-level protocol config (program-specific) ────────
// Volume targets (weeklyVolumeTarget) and intensity gating (maxIntenseWorkoutsPerWeek)
// are stored in ProgramLevelSettings and resolved via the Lead Program model
// at runtime (see lead-program.service.ts). They are editable in the
// Progression Manager (admin/progression-manager).
// Only protocol-related settings remain here per-program.
interface ProtocolLevelConfig {
  protocolProbability: number;
  allowEMOM: boolean;
  allowRestPause: boolean;
  allowPyramid: boolean;
  allowSupersets: boolean;
}

function getDefaultProtocolConfig(lvl: number): ProtocolLevelConfig {
  return {
    protocolProbability: lvl <= 5 ? 0 : lvl <= 12 ? 0.1 : 0.2,
    allowEMOM: lvl > 5,
    allowRestPause: lvl > 10,
    allowPyramid: lvl > 10,
    allowSupersets: lvl > 5,
  };
}

/** Convert ProgramLevelSettings → local editing config */
function settingsToProtocolConfig(s: ProgramLevelSettings | undefined, lvl: number): ProtocolLevelConfig {
  const defaults = getDefaultProtocolConfig(lvl);
  if (!s) return defaults;
  const prefs = s.preferredProtocols ?? [];
  return {
    protocolProbability: s.protocolProbability ?? defaults.protocolProbability,
    allowEMOM: prefs.includes('emom') || (!s.preferredProtocols && defaults.allowEMOM),
    allowRestPause: prefs.includes('pyramid') || (!s.preferredProtocols && defaults.allowRestPause),
    allowPyramid: prefs.includes('pyramid') || (!s.preferredProtocols && defaults.allowPyramid),
    allowSupersets: prefs.includes('antagonist_pair') || prefs.includes('superset') || (!s.preferredProtocols && defaults.allowSupersets),
  };
}

/** Convert local config → Firestore fields for save */
function protocolConfigToSettingsFields(cfg: ProtocolLevelConfig): Partial<ProgramLevelSettings> {
  const preferredProtocols: ProgramLevelSettings['preferredProtocols'] = [];
  if (cfg.allowEMOM) preferredProtocols.push('emom');
  if (cfg.allowPyramid) preferredProtocols.push('pyramid');
  if (cfg.allowSupersets) preferredProtocols.push('antagonist_pair');

  return {
    protocolProbability: cfg.protocolProbability,
    preferredProtocols,
  };
}

function LevelGoalsPanel({ program, allPrograms }: { program: Program; allPrograms: Program[] }) {
  const maxLevels = program.maxLevels || 5;

  const [levelSettings, setLevelSettings] = useState<Record<number, ProgramLevelSettings>>({});
  const [childLevelSettings, setChildLevelSettings] = useState<Record<string, Record<number, ProgramLevelSettings>>>({});
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [expandedLevel, setExpandedLevel] = useState<number | null>(null);

  // Temporary goal being edited per level
  const [editingGoals, setEditingGoals] = useState<Record<number, EditingGoal[]>>({}); 

  // Protocol config: per-level state (program-specific)
  const [protocolConfig, setProtocolConfig] = useState<Record<number, ProtocolLevelConfig>>({});

  // Load data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const loadPromises: Promise<any>[] = [
          getProgramLevelSettingsByProgram(program.id),
          getAllExercises(),
        ];

        // For Master Programs, also load child program goals
        const childProgramIds = program.isMaster ? (program.subPrograms || []) : [];
        for (const childId of childProgramIds) {
          loadPromises.push(getProgramLevelSettingsByProgram(childId));
        }

        const results = await Promise.all(loadPromises);
        const [settings, exList, ...childResults] = results;

        const map: Record<number, ProgramLevelSettings> = {};
        (settings as ProgramLevelSettings[]).forEach((s) => (map[s.levelNumber] = s));
        setLevelSettings(map);
        setExercises(exList as Exercise[]);

        // Build child level settings map
        if (program.isMaster && childProgramIds.length > 0) {
          const childMap: Record<string, Record<number, ProgramLevelSettings>> = {};
          childProgramIds.forEach((childId, index) => {
            const childSettings = childResults[index] as ProgramLevelSettings[];
            const childSettingsMap: Record<number, ProgramLevelSettings> = {};
            childSettings.forEach((s) => (childSettingsMap[s.levelNumber] = s));
            childMap[childId] = childSettingsMap;
          });
          setChildLevelSettings(childMap);
        }
      } catch (err) {
        console.error('Error loading level goals:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [program.id, program.isMaster, program.subPrograms]);

  // Start editing a level → copy existing goals + Training OS config to local state
  const handleExpandLevel = (lvl: number) => {
    if (expandedLevel === lvl) {
      setExpandedLevel(null);
      return;
    }
    setExpandedLevel(lvl);

    // Copy current goals into editing state
    const existing = levelSettings[lvl]?.targetGoals ?? [];
    setEditingGoals((prev) => ({
      ...prev,
      [lvl]: existing.map((g, i) => ({ ...g, _key: `${g.exerciseId}_${i}` })),
    }));

    // Copy protocol config into editing state
    setProtocolConfig((prev) => ({
      ...prev,
      [lvl]: settingsToProtocolConfig(levelSettings[lvl], lvl),
    }));
  };

  // Update a single protocol config field for a level
  const updateProtocol = (lvl: number, patch: Partial<ProtocolLevelConfig>) => {
    setProtocolConfig((prev) => ({
      ...prev,
      [lvl]: { ...(prev[lvl] || getDefaultProtocolConfig(lvl)), ...patch },
    }));
  };

  const addGoal = (lvl: number) => {
    setEditingGoals((prev) => ({
      ...prev,
      [lvl]: [
        ...(prev[lvl] || []),
        { exerciseId: '', exerciseName: '', targetValue: 10, unit: 'reps' as const, progressBonus: 5, _key: `new_${Date.now()}` },
      ],
    }));
  };

  const updateGoal = (lvl: number, key: string, patch: Partial<EditingGoal>) => {
    setEditingGoals((prev) => ({
      ...prev,
      [lvl]: (prev[lvl] || []).map((g) => (g._key === key ? { ...g, ...patch } : g)),
    }));
  };

  const removeGoal = (lvl: number, key: string) => {
    setEditingGoals((prev) => ({
      ...prev,
      [lvl]: (prev[lvl] || []).filter((g) => g._key !== key),
    }));
  };

  const saveLevel = async (lvl: number) => {
    setSaving(lvl);
    try {
      const goals: LevelGoal[] = (editingGoals[lvl] || [])
        .filter((g) => g.exerciseId)
        .map(({ exerciseId, exerciseName, targetValue, unit, progressBonus }) => ({
          exerciseId,
          exerciseName,
          targetValue,
          unit,
          progressBonus: progressBonus ?? 5,
        }));

      const existing = levelSettings[lvl];
      
      // Merge protocol config into save payload (program-specific only)
      const protoConfig = protocolConfig[lvl] || getDefaultProtocolConfig(lvl);
      const osFields = protocolConfigToSettingsFields(protoConfig);

      await saveProgramLevelSettings({
        programId: program.id,
        levelNumber: lvl,
        levelDescription: existing?.levelDescription || `רמה ${lvl}`,
        progressionWeight: existing?.progressionWeight ?? 1.0,
        intensityModifier: existing?.intensityModifier ?? 1.0,
        restMultiplier: existing?.restMultiplier ?? 1.0,
        volumeAdjustment: existing?.volumeAdjustment ?? 0,
        targetGoals: goals,
        // Training OS fields
        ...osFields,
        // SA Safety fields (persisted from level editor)
        straightArmRatio: existing?.straightArmRatio,
        weeklySACap: existing?.weeklySACap,
      });

      // Update local state
      setLevelSettings((prev) => ({
        ...prev,
        [lvl]: {
          ...(prev[lvl] || { id: '', programId: program.id, levelNumber: lvl, levelDescription: `רמה ${lvl}`, progressionWeight: 1.0 }),
          targetGoals: goals,
          ...osFields,
        },
      }));
    } catch (err) {
      console.error('Error saving level goals:', err);
      alert('שגיאה בשמירת יעדי הרמה');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        טוען יעדי רמות...
      </div>
    );
  }

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Target size={18} className="text-amber-600" />
        <h4 className="text-lg font-bold text-gray-800">
          יעדי רמות — {program.name}
        </h4>
        <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded font-bold">
          {maxLevels} רמות
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        הגדר תרגילי יעד לכל רמה בתוכנית זו. היעדים מופיעים כשאלה אחרי אימון ומאיצים את ההתקדמות באמצעות XP בונוס.
      </p>

      {/* Master Program: Inherited Goals from Sub-Programs */}
      {program.isMaster && (program.subPrograms || []).length > 0 && (
        <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Crown size={16} className="text-purple-600" />
            <h5 className="text-sm font-bold text-purple-800">יעדים מורשים מתת-תוכניות (Inherited Goals)</h5>
          </div>
          <p className="text-xs text-purple-600 mb-3">
            היעדים הבאים מגיעים אוטומטית מתת-התוכניות המקושרות. אין צורך להגדיר יעדים ידנית עבור תוכנית Master.
          </p>
          <div className="space-y-3">
            {(program.subPrograms || []).map(childId => {
              const childProg = allPrograms.find(p => p.id === childId);
              const childSettings = childLevelSettings[childId] || {};
              const childGoalsByLevel = Object.entries(childSettings)
                .filter(([_, s]) => s.targetGoals && s.targetGoals.length > 0)
                .sort(([a], [b]) => Number(a) - Number(b));

              return (
                <div key={childId} className="bg-white border border-purple-100 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {childProg?.imageUrl && (
                      <img src={childProg.imageUrl} alt="" className="w-6 h-6 rounded object-cover" />
                    )}
                    <span className="text-sm font-bold text-gray-800">{childProg?.name || childId}</span>
                    <span className="text-xs text-purple-500">
                      ({childGoalsByLevel.reduce((sum, [_, s]) => sum + (s.targetGoals?.length || 0), 0)} יעדים)
                    </span>
                  </div>
                  {childGoalsByLevel.length === 0 ? (
                    <p className="text-xs text-gray-400">אין יעדים מוגדרים לתוכנית זו.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1">
                      {childGoalsByLevel.map(([lvl, s]) => (
                        <div key={lvl} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-bold text-purple-600 w-12">רמה {lvl}:</span>
                          {s.targetGoals?.map((goal, gi) => (
                            <span key={gi} className="inline-flex px-2 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-200">
                              {goal.exerciseName} — {goal.targetValue} {goal.unit === 'reps' ? 'חזרות' : 'שניות'}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Level Rows */}
      <div className="space-y-2">
        {Array.from({ length: maxLevels }, (_, i) => i + 1).map((lvl) => {
          const settings = levelSettings[lvl];
          const goalCount = settings?.targetGoals?.length ?? 0;
          const isExpanded = expandedLevel === lvl;
          const currentGoals = editingGoals[lvl] || [];

          return (
            <div
              key={lvl}
              className={`rounded-xl border transition-all ${
                isExpanded
                  ? 'bg-white border-amber-400 shadow-md'
                  : 'bg-white/70 border-gray-200 hover:border-amber-300'
              }`}
            >
              {/* Level Row Header */}
              <button
                onClick={() => handleExpandLevel(lvl)}
                className="w-full flex items-center justify-between px-4 py-3 text-right"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm font-black flex items-center justify-center">
                    {lvl}
                  </span>
                  <div>
                    <span className="font-bold text-gray-800 text-sm">רמה {lvl}</span>
                    {settings?.levelDescription && (
                      <p className="text-xs text-gray-500 truncate max-w-xs">{settings.levelDescription}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {goalCount > 0 ? (
                    <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Dumbbell size={12} />
                      {goalCount} יעדים
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">ללא יעדים</span>
                  )}
                  {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </button>

              {/* Expanded Goal Editor */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-4 space-y-3">
                  {currentGoals.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-2">
                      אין יעדי תרגיל עבור רמה זו. הוסף יעד חדש למטה.
                    </p>
                  )}

                  {currentGoals.map((goal) => (
                    <div key={goal._key} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
                      {/* Exercise Autocomplete */}
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-bold text-gray-600 mb-1 block">תרגיל</label>
                        <ExerciseAutocomplete
                          exercises={exercises}
                          selectedId={goal.exerciseId}
                          onChange={(id, name) => updateGoal(lvl, goal._key, { exerciseId: id, exerciseName: name })}
                          placeholder="חפש תרגיל..."
                        />
                      </div>

                      {/* Target Value */}
                      <div className="w-24">
                        <label className="text-xs font-bold text-gray-600 mb-1 block">ערך יעד</label>
                        <input
                          type="number"
                          min={1}
                          value={goal.targetValue}
                          onChange={(e) => updateGoal(lvl, goal._key, { targetValue: parseInt(e.target.value) || 1 })}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-center focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                      </div>

                      {/* Unit */}
                      <div className="w-28">
                        <label className="text-xs font-bold text-gray-600 mb-1 block">יחידה</label>
                        <select
                          value={goal.unit}
                          onChange={(e) => updateGoal(lvl, goal._key, { unit: e.target.value as 'reps' | 'seconds' })}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        >
                          <option value="reps">חזרות</option>
                          <option value="seconds">שניות</option>
                        </select>
                      </div>

                      {/* Progress Bonus % */}
                      <div className="w-20">
                        <label className="text-xs font-bold text-amber-600 mb-1 flex items-center gap-1">
                          <Percent size={12} />
                          בונוס
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={goal.progressBonus ?? 5}
                          onChange={(e) => updateGoal(lvl, goal._key, { progressBonus: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2.5 border border-amber-300 rounded-xl text-center font-bold text-amber-700 bg-amber-50 focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => removeGoal(lvl, goal._key)}
                        className="mt-6 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="הסר יעד"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}

                  {/* Sum indicator + Add Goal Button */}
                  <div className="flex items-center justify-between pt-1 pb-2">
                    <button
                      onClick={() => addGoal(lvl)}
                      className="flex items-center gap-1 text-sm font-bold text-amber-600 hover:text-amber-700 transition-colors"
                    >
                      <Plus size={16} />
                      הוסף יעד
                    </button>
                    {currentGoals.length > 0 && (
                      <span className={`text-xs font-black px-3 py-1 rounded-full ${
                        currentGoals.reduce((s, g) => s + (g.progressBonus ?? 5), 0) === 100
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        סה״כ: {currentGoals.reduce((s, g) => s + (g.progressBonus ?? 5), 0)}%
                      </span>
                    )}
                  </div>

                  {/* ── Protocol Controls (Program-Specific) ─────────── */}
                  {(() => {
                    const cfg = protocolConfig[lvl] || getDefaultProtocolConfig(lvl);
                    return (
                      <div className="mt-4 pt-4 border-t border-gray-200 space-y-5">
                        <div className="flex items-center gap-2 mb-1">
                          <Settings2 size={16} className="text-cyan-600" />
                          <h5 className="text-sm font-bold text-gray-800">סגנון אימון — הגדרות תוכנית</h5>
                        </div>

                        {/* Info note about Lead Program model */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <p className="text-[10px] text-gray-500">
                            💡 יעדי נפח שבועי ושליטת עצימות (3-Bolt) מוגדרים ב<strong>מנהל ההתקדמות</strong> (Progression Manager).
                            בזמן ריצה, ה-Lead Program (הרמה הגבוהה ביותר של המשתמש) קובע את התקציב.
                            כאן מוגדר רק <strong>סגנון האימון</strong> הייחודי לתוכנית זו.
                          </p>
                        </div>

                        {/* 1. Protocol Toggles */}
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <ClipboardList size={14} className="text-purple-600" />
                            <span className="text-xs font-bold text-purple-800">פרוטוקולים מותרים (Protocol Toggles)</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {([
                              { key: 'allowEMOM' as const, label: 'EMOM', desc: 'Every Minute On the Minute' },
                              { key: 'allowSupersets' as const, label: 'Supersets', desc: 'סופר-סטים (Push + Pull)' },
                              { key: 'allowPyramid' as const, label: 'Pyramid', desc: 'סטים עולים/יורדים' },
                              { key: 'allowRestPause' as const, label: 'Rest-Pause', desc: 'הפסקה קצרה באמצע סט' },
                            ]).map((item) => (
                              <label
                                key={item.key}
                                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                  cfg[item.key]
                                    ? 'bg-purple-100 border-purple-400'
                                    : 'bg-white border-gray-200 hover:border-purple-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={cfg[item.key]}
                                  onChange={(e) => updateProtocol(lvl, { [item.key]: e.target.checked })}
                                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                />
                                <div>
                                  <span className="text-xs font-bold text-gray-800 block">{item.label}</span>
                                  <span className="text-[10px] text-gray-500">{item.desc}</span>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 2. Protocol Probability */}
                        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Percent size={14} className="text-cyan-600" />
                            <span className="text-xs font-bold text-cyan-800">סיכוי הזרקת פרוטוקול</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={Math.round(cfg.protocolProbability * 100)}
                              onChange={(e) => updateProtocol(lvl, { protocolProbability: parseInt(e.target.value) / 100 })}
                              className="flex-1 h-2 bg-cyan-200 rounded-full appearance-none cursor-pointer accent-cyan-600"
                            />
                            <div className="w-16 text-center">
                              <span className="text-lg font-black text-cyan-700">
                                {Math.round(cfg.protocolProbability * 100)}%
                              </span>
                            </div>
                          </div>
                          <p className="text-[10px] text-cyan-500 mt-1">
                            {cfg.protocolProbability === 0
                              ? 'פרוטוקולים כבויים — סטים ישרים בלבד'
                              : `סיכוי של ${Math.round(cfg.protocolProbability * 100)}% שהמנוע יזריק ${
                                  [cfg.allowEMOM && 'EMOM', cfg.allowPyramid && 'Pyramid', cfg.allowSupersets && 'Supersets']
                                    .filter(Boolean).join(' / ') || 'פרוטוקול'
                                }`
                            }
                          </p>
                        </div>

                        {/* 3. SA Safety Cap + SA Ratio */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Target size={14} className="text-amber-600" />
                            <span className="text-xs font-bold text-amber-800">בטיחות זרוע ישרה (Straight Arm Safety)</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            {/* SA Ratio */}
                            <div>
                              <label className="text-[10px] font-bold text-gray-600 mb-1 block">
                                יחס SA באימון (Straight Arm Ratio)
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={5}
                                  value={Math.round((settings?.straightArmRatio ?? (lvl <= 10 ? 0.4 : 0.5)) * 100)}
                                  onChange={(e) => {
                                    setLevelSettings((prev) => ({
                                      ...prev,
                                      [lvl]: {
                                        ...(prev[lvl] || { id: '', programId: program.id, levelNumber: lvl, levelDescription: `רמה ${lvl}`, progressionWeight: 1.0 }),
                                        straightArmRatio: parseInt(e.target.value) / 100,
                                      },
                                    }));
                                  }}
                                  className="flex-1 h-2 bg-amber-200 rounded-full appearance-none cursor-pointer accent-amber-600"
                                />
                                <span className="text-sm font-black text-amber-700 w-12 text-center">
                                  {Math.round((settings?.straightArmRatio ?? (lvl <= 10 ? 0.4 : 0.5)) * 100)}%
                                </span>
                              </div>
                              <p className="text-[10px] text-amber-500 mt-0.5">
                                אחוז תרגילי זרוע ישרה מתוך סה&quot;כ. מומלץ: 30-50%.
                              </p>
                            </div>

                            {/* Weekly SA Cap */}
                            <div>
                              <label className="text-[10px] font-bold text-gray-600 mb-1 block">
                                מכסת SA שבועית (Weekly SA Cap)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                placeholder="ללא הגבלה"
                                value={settings?.weeklySACap ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                  setLevelSettings((prev) => ({
                                    ...prev,
                                    [lvl]: {
                                      ...(prev[lvl] || { id: '', programId: program.id, levelNumber: lvl, levelDescription: `רמה ${lvl}`, progressionWeight: 1.0 }),
                                      weeklySACap: val,
                                    },
                                  }));
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-center focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm"
                              />
                              <p className="text-[10px] text-amber-500 mt-0.5">
                                סטים מקסימליים של זרוע ישרה בשבוע. ריק = ללא הגבלה.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Save Actions */}
                  <div className="flex items-center gap-3 pt-4 mt-2 border-t border-gray-100">
                    <div className="flex-1" />
                    <button
                      onClick={() => saveLevel(lvl)}
                      disabled={saving === lvl}
                      className="flex items-center gap-1.5 px-5 py-2 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition-colors disabled:opacity-50 text-sm"
                    >
                      <Save size={15} />
                      {saving === lvl ? 'שומר...' : 'שמור יעדי רמה'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

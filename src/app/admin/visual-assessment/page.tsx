"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAllVisualContent,
  saveVisualContent,
  deleteVisualContent,
  seedPlaceholderContent,
  purgeLevelsAbove,
  purgeCategory,
} from '@/features/user/onboarding/services/visual-assessment-content.service';
import type {
  VisualAssessmentContent,
  VideoVariant,
} from '@/features/user/onboarding/types/visual-assessment.types';
import type { MultilingualText } from '@/types/onboarding-questionnaire';
import { useUserRole } from '@/features/admin/services/auth.service';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import {
  Plus,
  Trash2,
  Save,
  X,
  Video,
  Loader2,
  Database,
  Filter,
  Edit2,
  Upload,
  Apple,
  Globe,
  Link2,
} from 'lucide-react';
import ExerciseAutocomplete from '@/components/admin/ExerciseAutocomplete';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_MAX_LEVELS = 25;

const GENDER_OPTIONS: { value: VideoVariant['gender']; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'male', label: 'זכר' },
  { value: 'female', label: 'נקבה' },
];

// ── Helpers ─────────────────────────────────────────────────────────

function emptyMultilingualText(): MultilingualText {
  return { he: { neutral: '' }, en: { neutral: '' }, ru: { neutral: '' } };
}

function getHebrewText(mt: MultilingualText | undefined): string {
  if (!mt) return '';
  return mt.he?.neutral ?? mt.en?.neutral ?? '';
}

function newVariantId(): string {
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyVariant(): VideoVariant {
  return {
    id: newVariantId(),
    videoUrl: '',
    videoUrlMov: '',
    videoUrlWebm: '',
    thumbnailUrl: '',
    gender: 'all',
    ageRange: { min: 14, max: 999 },
    isDefault: true,
  };
}

function buildLevelOptions(programId: string, maxLevels: number) {
  return Array.from({ length: maxLevels }, (_, i) => ({
    value: `${programId}_level_${i + 1}`,
    label: `רמה ${i + 1}`,
  }));
}

// ── Main Page ──────────────────────────────────────────────────────

export default function VisualAssessmentAdminPage() {
  const { roleInfo } = useUserRole();
  const isSuperAdmin = roleInfo?.isSuperAdmin === true;

  // Data
  const [items, setItems] = useState<VisualAssessmentContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Programs
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);

  // Exercises
  const [exercises, setExercises] = useState<Exercise[]>([]);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterMissing, setFilterMissing] = useState(false);

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VisualAssessmentContent | null>(null);

  // Add New Level dialog
  const [showAddNew, setShowAddNew] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newLevel, setNewLevel] = useState(1);

  // All assignable programs — non-master child programs + any program that
  // already has visual assessment content (so legacy/skill docs are visible).
  const assignablePrograms = useMemo(() => {
    const nonMaster = programs.filter(p => !p.isMaster);
    const existingCategoryIds = new Set(items.map(i => i.category));
    const extras = programs.filter(
      p => p.isMaster && existingCategoryIds.has(p.id) && !nonMaster.some(c => c.id === p.id),
    );
    return [...nonMaster, ...extras];
  }, [programs, items]);

  // Build category → display label map purely from program data
  const categoryLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of programs) {
      map[p.id] = p.name;
    }
    return map;
  }, [programs]);

  // Upload progress
  const [uploading, setUploading] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try { setItems(await getAllVisualContent()); } catch (error) { console.error('[AdminVisualAssessment] Load error:', error); alert('שגיאה בטעינת הנתונים'); }
    finally { setLoading(false); }
  }, []);

  const loadPrograms = useCallback(async () => {
    try { setProgramsLoading(true); setPrograms(await getAllPrograms()); } catch (err) { console.error('Failed to load programs:', err); }
    finally { setProgramsLoading(false); }
  }, []);

  const loadExercises = useCallback(async () => {
    try { setExercises(await getAllExercises()); } catch (err) { console.error('Failed to load exercises:', err); }
  }, []);

  useEffect(() => { loadData(); loadPrograms(); loadExercises(); }, [loadData, loadPrograms, loadExercises]);

  const programMap = useMemo(() => {
    const map = new Map<string, Program>();
    programs.forEach(p => map.set(p.id, p));
    return map;
  }, [programs]);

  // ── Seed ────────────────────────────────────────────────────────

  const handleSeed = async () => {
    if (!confirm('ליצור 100 מסמכי בסיס (4 קטגוריות × 25 רמות)? מסמכים קיימים לא יידרסו.')) return;
    setSeeding(true);
    try { const count = await seedPlaceholderContent(); alert(`נוצרו ${count} מסמכים חדשים`); await loadData(); }
    catch (error) { console.error('[AdminVisualAssessment] Seed error:', error); alert('שגיאה ביצירת מסמכים'); }
    finally { setSeeding(false); }
  };

  // ── Add New Level ──────────────────────────────────────────────

  const handleAddNewLevel = async () => {
    if (!newCategory) return alert('יש לבחור תוכנית (קטגוריה)');
    const existingId = `${newCategory}_${newLevel}`;
    if (items.some(i => i.id === existingId)) {
      alert(`הרמה ${newCategory} — Level ${newLevel} כבר קיימת. ערוך אותה ישירות.`);
      return;
    }
    const prog = programMap.get(newCategory);
    const maxLvl = prog?.maxLevels ?? DEFAULT_MAX_LEVELS;
    if (newLevel < 1 || newLevel > maxLvl) {
      return alert(`הרמה חייבת להיות בין 1 ל-${maxLvl}`);
    }
    setSaving(true);
    try {
      const displayName = prog?.name ?? categoryLabelMap[newCategory] ?? newCategory;
      await saveVisualContent({
        category: newCategory,
        level: newLevel,
        videoVariants: [],
        boldTitle: { he: { neutral: `${displayName} — רמה ${newLevel}` }, en: { neutral: `${displayName} — Level ${newLevel}` } },
        detailedDescription: emptyMultilingualText(),
        linkedProgramId: prog ? prog.id : undefined,
      });
      await loadData();
      setShowAddNew(false);
    } catch (error) { console.error('[AdminVisualAssessment] Add error:', error); alert('שגיאה ביצירה'); }
    finally { setSaving(false); }
  };

  const handleSeedProgram = async () => {
    if (!newCategory) return;
    const prog = programMap.get(newCategory);
    const maxLvl = prog?.maxLevels ?? DEFAULT_MAX_LEVELS;
    const displayName = prog?.name ?? newCategory;

    const existingIds = new Set(items.map(i => i.id));
    const toCreate: number[] = [];
    for (let l = 1; l <= maxLvl; l++) {
      if (!existingIds.has(`${newCategory}_${l}`)) toCreate.push(l);
    }

    if (toCreate.length === 0) {
      alert(`כל ${maxLvl} הרמות כבר קיימות עבור ${displayName}`);
      return;
    }

    if (!confirm(`ליצור ${toCreate.length} רמות חדשות (מתוך ${maxLvl}) עבור "${displayName}"?`)) return;

    setSaving(true);
    try {
      for (const level of toCreate) {
        await saveVisualContent({
          category: newCategory,
          level,
          videoVariants: [],
          boldTitle: { he: { neutral: `${displayName} — רמה ${level}` }, en: { neutral: `${displayName} — Level ${level}` } },
          detailedDescription: emptyMultilingualText(),
          linkedProgramId: prog ? prog.id : undefined,
        });
      }
      showToast(`✅ נוצרו ${toCreate.length} רמות עבור ${displayName}`);
      await loadData();
      setShowAddNew(false);
    } catch (error) { console.error('[AdminVisualAssessment] Seed program error:', error); alert('שגיאה ביצירת רמות'); }
    finally { setSaving(false); }
  };

  const handlePurgeLegacy = async () => {
    const toPurge = assignablePrograms.filter(p => {
      const max = p.maxLevels ?? DEFAULT_MAX_LEVELS;
      return items.some(i => i.category === p.id && i.level > max);
    });

    if (toPurge.length === 0) {
      alert('אין מסמכים לגזום — כל הרמות בטווח מקסימלי.');
      return;
    }

    const summary = toPurge.map(p => {
      const max = p.maxLevels ?? DEFAULT_MAX_LEVELS;
      const excess = items.filter(i => i.category === p.id && i.level > max).length;
      return `${p.name}: ${excess} רמות מעל ${max}`;
    }).join('\n');

    if (!confirm(`למחוק רמות עודפות?\n\n${summary}`)) return;

    setSaving(true);
    let totalDeleted = 0;
    try {
      for (const p of toPurge) {
        const max = p.maxLevels ?? DEFAULT_MAX_LEVELS;
        const deleted = await purgeLevelsAbove(p.id, max);
        totalDeleted += deleted;
      }
      showToast(`🗑️ נמחקו ${totalDeleted} רמות עודפות`);
      await loadData();
    } catch (error) { console.error('[AdminVisualAssessment] Purge error:', error); alert('שגיאה במחיקה'); }
    finally { setSaving(false); }
  };

  // Ghost / orphan categories — categories found in items but not matching any program ID
  const orphanCategories = useMemo(() => {
    const programIds = new Set(programs.map(p => p.id));
    return [...new Set(items.map(i => i.category))].filter(c => !programIds.has(c));
  }, [items, programs]);

  const handlePurgeGhosts = async () => {
    if (orphanCategories.length === 0) {
      alert('אין קטגוריות יתומות — הכל מסונכרן.');
      return;
    }

    const summary = orphanCategories.map(cat => {
      const count = items.filter(i => i.category === cat).length;
      return `"${cat}": ${count} מסמכים`;
    }).join('\n');

    if (!confirm(`למחוק את כל המסמכים בקטגוריות יתומות (לא מקושרות לתוכנית)?\n\n${summary}\n\nפעולה זו בלתי הפיכה!`)) return;

    setSaving(true);
    let totalDeleted = 0;
    try {
      for (const cat of orphanCategories) {
        const deleted = await purgeCategory(cat);
        totalDeleted += deleted;
      }
      showToast(`🗑️ נמחקו ${totalDeleted} מסמכי רפאים`);
      await loadData();
    } catch (error) { console.error('[AdminVisualAssessment] Ghost purge error:', error); alert('שגיאה במחיקה'); }
    finally { setSaving(false); }
  };

  // ── Edit ────────────────────────────────────────────────────────

  const handleStartEdit = (item: VisualAssessmentContent) => {
    setEditingId(item.id);
    setEditForm(JSON.parse(JSON.stringify(item)));
  };

  const handleCancelEdit = () => { setEditingId(null); setEditForm(null); };

  const handleSave = async () => {
    if (!editForm) return;
    setSaving(true);
    try {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...payload } = editForm;

      console.log('[AdminVisualAssessment] handleSave — payload snapshot:', {
        category: payload.category,
        level: payload.level,
        exerciseId: payload.exerciseId ?? '(none)',
        videoVariantsCount: payload.videoVariants?.length ?? 0,
        videoVariantsDetail: (payload.videoVariants ?? []).map(v => ({
          id: v.id,
          videoUrl: v.videoUrl || '(empty)',
          videoUrlMov: v.videoUrlMov || '(empty)',
          videoUrlWebm: v.videoUrlWebm || '(empty)',
          isDefault: v.isDefault,
          gender: v.gender,
        })),
      });

      if (!payload.videoVariants || payload.videoVariants.length === 0) {
        console.warn('[AdminVisualAssessment] ⚠️ Saving with EMPTY videoVariants array!');
      }

      await saveVisualContent(payload);
      showToast('✅ נשמר בהצלחה');
      await loadData();
      setEditingId(null);
      setEditForm(null);
    } catch (error) { console.error('[AdminVisualAssessment] Save error:', error); alert('שגיאה בשמירה'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (category: string, level: number) => {
    if (!confirm(`אתה בטוח שברצונך למחוק את ${category} רמה ${level}?\nפעולה זו לא ניתנת לביטול ותמחק את כל הווריאנטים.`)) return;
    try {
      await deleteVisualContent(category, level);
      await loadData();
      if (editingId === `${category}_${level}`) handleCancelEdit();
    } catch (error) { console.error('[AdminVisualAssessment] Delete error:', error); alert('שגיאה במחיקה'); }
  };

  // ── File Upload ───────────────────────────────────────────────

  const handleFileUpload = async (
    variantId: string,
    file: File,
    field: 'videoUrlMov' | 'videoUrlWebm',
  ) => {
    if (!editForm) return;
    const { category, level } = editForm;
    setUploading(`${variantId}_${field}`);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `visual_assessment/${category}/${level}/${variantId}_${field}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      console.log(`[AdminVisualAssessment] File uploaded → ${field}:`, url.substring(0, 60) + '…');

      // Use functional state update to avoid stale closure after async upload
      setEditForm(prev => {
        if (!prev) return prev;
        const updatedVariants = prev.videoVariants.map(v => {
          if (v.id !== variantId) return v;
          const patch: Partial<VideoVariant> = { [field]: url };
          if (!v.videoUrl) patch.videoUrl = url;
          return { ...v, ...patch };
        });
        console.log('[AdminVisualAssessment] Updated variant in state:', {
          variantId,
          field,
          variantsCount: updatedVariants.length,
        });
        return { ...prev, videoVariants: updatedVariants };
      });
    } catch (err) {
      console.error('Upload failed:', err);
      alert('שגיאה בהעלאת הקובץ');
    } finally {
      setUploading(null);
    }
  };

  // ── Variant editing helpers ─────────────────────────────────────

  const addVariant = () => {
    setEditForm(prev => {
      if (!prev) return prev;
      const newV = createEmptyVariant();
      if (prev.videoVariants.length === 0) newV.isDefault = true;
      console.log('[AdminVisualAssessment] addVariant — new variant id:', newV.id, 'total:', prev.videoVariants.length + 1);
      return { ...prev, videoVariants: [...prev.videoVariants, newV] };
    });
  };

  const removeVariant = (variantId: string) => {
    setEditForm(prev => {
      if (!prev) return prev;
      const updated = prev.videoVariants.filter(v => v.id !== variantId);
      if (updated.length > 0 && !updated.some(v => v.isDefault)) updated[0].isDefault = true;
      return { ...prev, videoVariants: updated };
    });
  };

  const updateVariant = (variantId: string, field: string, value: unknown) => {
    setEditForm(prev => {
      if (!prev) return prev;
      const updated = prev.videoVariants.map(v => {
        if (v.id !== variantId) return v;
        if (field === 'ageRange.min' || field === 'ageRange.max') {
          const key = field.split('.')[1] as 'min' | 'max';
          return { ...v, ageRange: { ...v.ageRange, [key]: Number(value) || 0 } };
        }
        if (field === 'isDefault' && value === true) return { ...v, isDefault: true };
        return { ...v, [field]: value };
      });
      if (field === 'isDefault' && value === true) {
        for (const v of updated) { if (v.id !== variantId) v.isDefault = false; }
      }
      return { ...prev, videoVariants: updated };
    });
  };

  // ── Multilingual text editing helpers ───────────────────────────

  const updateBoldTitle = (lang: string, value: string) => {
    if (!editForm) return;
    setEditForm({ ...editForm, boldTitle: { ...editForm.boldTitle, [lang]: { ...(editForm.boldTitle?.[lang] ?? { neutral: '' }), neutral: value } } });
  };

  const updateDescription = (lang: string, value: string) => {
    if (!editForm) return;
    setEditForm({ ...editForm, detailedDescription: { ...editForm.detailedDescription, [lang]: { ...(editForm.detailedDescription?.[lang] ?? { neutral: '' }), neutral: value } } });
  };

  // ── Filtered items ──────────────────────────────────────────────

  const filteredItems = items.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterMissing && item.videoVariants.length > 0) return false;
    return true;
  });

  // ── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <Loader2 size={32} className="!text-cyan-500 animate-spin" />
        <span className="mr-3 text-slate-600">טוען תוכן...</span>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto">
      {/* Success toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-xl text-sm font-bold animate-bounce">
          {toast}
        </div>
      )}

      {/* Header + Context */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-black !text-slate-900">ניהול תוכן הערכה ויזואלית</h1>
          <p className="text-sm !text-slate-500 mt-1">
            ניהול וריאנטי וידאו שקוף לכל קטגוריה ורמה בהערכה. העלאת HEVC (.mov) ל-iOS ו-VP9 (.webm) לאנדרואיד/ווב. קישור תוכן לתוכניות אימון לשם עקיבות מלאה.
          </p>
          <p className="text-xs !text-slate-400 mt-0.5">
            סה&quot;כ {items.length} מסמכים | {items.filter(i => i.videoVariants.length > 0).length} עם וידאו
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowAddNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors text-sm">
            <Plus size={16} /> הוסף רמה חדשה
          </button>
          {isSuperAdmin && (
            <>
              <button onClick={handleSeed} disabled={seeding}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm">
                {seeding ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                <span>{seeding ? 'יוצר...' : 'זרע תבניות בסיס'}</span>
              </button>
              <button type="button" onClick={handlePurgeLegacy} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-50 text-sm">
                <Trash2 size={16} />
                <span>גזום רמות עודפות</span>
              </button>
              {orphanCategories.length > 0 && (
                <button type="button" onClick={handlePurgeGhosts} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-red-800 text-white rounded-xl font-medium hover:bg-red-900 transition-colors disabled:opacity-50 text-sm">
                  <Trash2 size={16} />
                  <span>מחק רפאים ({orphanCategories.length})</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add New Level Dialog */}
      {showAddNew && (() => {
        const selectedProg = programMap.get(newCategory);
        const maxLvl = selectedProg?.maxLevels ?? DEFAULT_MAX_LEVELS;
        return (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-5 mb-6 space-y-3">
            <h3 className="font-bold !text-emerald-800 flex items-center gap-2"><Plus size={18} /> הוסף רמה חדשה</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs !text-slate-500 font-bold">תוכנית (קטגוריה)</label>
                <select value={newCategory} onChange={e => { setNewCategory(e.target.value); setNewLevel(1); }}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" disabled={programsLoading}>
                  <option value="">— בחר תוכנית —</option>
                  {assignablePrograms.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.movementPattern ? ` (${p.movementPattern})` : ''}</option>
                  ))}
                </select>
                {programsLoading && <p className="text-[10px] !text-slate-400 mt-0.5">טוען תוכניות...</p>}
              </div>
              <div>
                <label className="text-xs !text-slate-500 font-bold">רמה (1–{maxLvl})</label>
                <input type="number" min={1} max={maxLvl} value={newLevel} onChange={e => setNewLevel(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center" disabled={!newCategory} />
                {selectedProg && <p className="text-[10px] !text-slate-400 mt-0.5">מקסימום {maxLvl} רמות עבור {selectedProg.name}</p>}
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <button onClick={handleAddNewLevel} disabled={saving || !newCategory}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} צור רמה
                </button>
                <button type="button" onClick={handleSeedProgram} disabled={saving || !newCategory}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />} צור כל הרמות
                </button>
                <button onClick={() => setShowAddNew(false)} className="px-4 py-2 bg-slate-200 !text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-300">ביטול</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <Filter size={16} className="!text-slate-400" />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm !text-slate-800 focus:ring-2 focus:ring-cyan-400 outline-none">
          <option value="all">כל הקטגוריות ({items.length})</option>
          {/* Real programs only */}
          {assignablePrograms.map(p => {
            const count = items.filter(i => i.category === p.id).length;
            return <option key={p.id} value={p.id}>{p.name}{p.movementPattern ? ` (${p.movementPattern})` : ''} [{count}]</option>;
          })}
          {/* Orphan / ghost categories — marked for deletion */}
          {orphanCategories.length > 0 && (
            <option disabled>── רפאים (למחיקה) ──</option>
          )}
          {orphanCategories.map(cat => {
            const count = items.filter(i => i.category === cat).length;
            return <option key={cat} value={cat}>⚠️ {cat} [{count}]</option>;
          })}
        </select>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={filterMissing} onChange={e => setFilterMissing(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400" />
          <span className="text-sm !text-slate-600">רק ללא וידאו</span>
        </label>
        <span className="text-sm !text-slate-400 mr-auto">{filteredItems.length} תוצאות</span>
      </div>

      {/* Ghost Categories Warning */}
      {orphanCategories.length > 0 && (
        <div className="flex items-center gap-3 p-4 mb-4 bg-red-50 border-2 border-red-200 rounded-2xl">
          <span className="text-2xl">👻</span>
          <div className="flex-1">
            <p className="text-sm font-bold !text-red-800">
              {orphanCategories.length} קטגוריות רפאים: {orphanCategories.map(c => `"${c}"`).join(', ')}
            </p>
            <p className="text-xs !text-red-600 mt-0.5">
              מסמכים אלו לא מקושרים לשום תוכנית ולא ייטענו באונבורדינג. לחץ &quot;מחק רפאים&quot; לניקוי.
            </p>
          </div>
          <button type="button" onClick={handlePurgeGhosts} disabled={saving}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 whitespace-nowrap">
            מחק {items.filter(i => orphanCategories.includes(i.category)).length} מסמכים
          </button>
        </div>
      )}

      {/* Program Summary Chips */}
      {filterCategory === 'all' && (
        <div className="flex flex-wrap gap-2 mb-4">
          {assignablePrograms.map(p => {
            const total = p.maxLevels ?? DEFAULT_MAX_LEVELS;
            const existing = items.filter(i => i.category === p.id).length;
            const withVideo = items.filter(i => i.category === p.id && i.videoVariants.length > 0).length;
            return (
              <button key={p.id} onClick={() => setFilterCategory(p.id)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 hover:border-cyan-400 transition-colors text-xs font-bold !text-slate-700">
                <span>{p.name}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${existing === 0 ? 'bg-slate-100 !text-slate-400' : withVideo === existing ? 'bg-emerald-100 !text-emerald-700' : 'bg-amber-100 !text-amber-700'}`}>
                  {withVideo}/{existing}/{total}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Content List */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Video size={40} className="mx-auto !text-slate-300 mb-3" />
            <p className="!text-slate-500 font-medium">
              {items.length === 0 ? 'אין מסמכים עדיין. לחץ על "זרע תבניות בסיס" ליצירת 100 מסמכים.' : 'אין תוצאות עבור הסינון הנוכחי.'}
            </p>
          </div>
        ) : (
          filteredItems.map(item => {
            const isEditing = editingId === item.id;

            return (
              <div key={item.id} className={`border rounded-2xl transition-all ${isEditing ? 'border-cyan-400 bg-cyan-50/30 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                {/* Row header */}
                <div className="flex items-center gap-4 px-5 py-4">
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide ${
                    (() => {
                      const pattern = programMap.get(item.category)?.movementPattern ?? item.category;
                      switch (pattern) {
                        case 'push': return 'bg-red-100 !text-red-700';
                        case 'pull': return 'bg-blue-100 !text-blue-700';
                        case 'legs': return 'bg-green-100 !text-green-700';
                        case 'core': return 'bg-orange-100 !text-orange-700';
                        default:     return 'bg-violet-100 !text-violet-700';
                      }
                    })()
                  }`}>{categoryLabelMap[item.category] ?? item.category}</span>

                  <span className="text-lg font-black !text-slate-800 min-w-[60px]">רמה {item.level}</span>
                  <span className="text-sm !text-slate-500 truncate flex-1">{getHebrewText(item.boldTitle) || '(ללא כותרת)'}</span>

                  {/* Linked program badge */}
                  {item.linkedProgramId && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 !text-indigo-700 text-[10px] font-bold">
                      <Link2 size={10} /> {programMap.get(item.linkedProgramId)?.name ?? item.linkedProgramId}
                    </span>
                  )}

                  {/* Linked exercise badge */}
                  {item.showInOnboarding && (
                    <span className="px-2 py-0.5 rounded-full bg-cyan-100 !text-cyan-700 text-[10px] font-bold">
                      👁️ אונבורדינג
                    </span>
                  )}

                  {item.onboardingBubbleText && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 !text-amber-700 text-[10px] font-bold max-w-[120px] truncate">
                      💬 {item.onboardingBubbleText}
                    </span>
                  )}

                  {item.exerciseId && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 !text-emerald-700 text-[10px] font-bold">
                      🎬 {exercises.find(e => e.id === item.exerciseId)?.name?.he ?? item.exerciseId}
                    </span>
                  )}

                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    item.videoVariants.length > 0 ? 'bg-emerald-100 !text-emerald-700' : 'bg-slate-100 !text-slate-400'
                  }`}>{item.videoVariants.length} וידאו</span>

                  <div className="flex gap-1">
                    {isEditing ? (
                      <>
                        <button type="button" onClick={handleSave} disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 disabled:opacity-50 transition-colors">
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} שמור
                        </button>
                        <button type="button" onClick={handleCancelEdit} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 rounded-lg text-sm font-medium hover:bg-slate-300 !text-slate-700 transition-colors">
                          <X size={14} /> ביטול
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleStartEdit(item)} className="p-2 rounded-lg hover:bg-slate-100 !text-slate-500 transition-colors" title="עריכה"><Edit2 size={16} /></button>
                        <button onClick={() => handleDelete(item.category, item.level)} className="p-2 rounded-lg hover:bg-red-50 !text-red-400 transition-colors" title="מחיקה"><Trash2 size={16} /></button>
                      </>
                    )}
                  </div>
                </div>

                {/* Edit form (expanded) */}
                {isEditing && editForm && (
                  <div className="px-5 pb-5 border-t border-cyan-200 pt-4 space-y-6">

                    {/* Program Linking */}
                    <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-bold !text-indigo-700">
                        <Link2 size={16} /> קישור לתוכנית אימון
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs !text-slate-500 font-bold">תוכנית מקושרת</label>
                          <select value={editForm.linkedProgramId ?? ''} disabled={programsLoading}
                            onChange={e => setEditForm({ ...editForm, linkedProgramId: e.target.value || undefined, linkedLevelId: undefined })}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                            <option value="">— ללא קישור —</option>
                            {programs.map(p => <option key={p.id} value={p.id}>{p.name}{p.isMaster ? ' ⭐ (הורה)' : ''}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs !text-slate-500 font-bold">רמה מקושרת</label>
                          <select value={editForm.linkedLevelId ?? ''} disabled={!editForm.linkedProgramId}
                            onChange={e => setEditForm({ ...editForm, linkedLevelId: e.target.value || undefined })}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                            <option value="">— ללא —</option>
                            {editForm.linkedProgramId && buildLevelOptions(
                              editForm.linkedProgramId,
                              programMap.get(editForm.linkedProgramId)?.maxLevels ?? DEFAULT_MAX_LEVELS,
                            ).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Show in Onboarding toggle */}
                    <label className="flex items-center gap-3 px-4 py-3 bg-cyan-50 border border-cyan-200 rounded-xl cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editForm.showInOnboarding ?? false}
                        onChange={e => setEditForm({ ...editForm, showInOnboarding: e.target.checked })}
                        className="w-5 h-5 rounded border-cyan-300 text-cyan-600 focus:ring-cyan-400"
                      />
                      <div>
                        <span className="text-sm font-bold !text-cyan-800">👁️ הצג באונבורדינג (Simple Mode)</span>
                        <p className="text-[11px] !text-cyan-600 mt-0.5">כשמופעל, הרמה תופיע בסליידר הפשוט בזמן ההרשמה</p>
                      </div>
                    </label>

                    {/* Onboarding Bubble Text */}
                    <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-amber-700">
                        💬 טקסט בועה באונבורדינג
                      </div>
                      <input
                        type="text"
                        value={editForm.onboardingBubbleText ?? ''}
                        onChange={e => setEditForm({ ...editForm, onboardingBubbleText: e.target.value })}
                        placeholder="לדוגמה: ״אני יכול/ה לעשות שכיבות סמיכה רגילות״"
                        className="w-full px-3 py-2 rounded-xl border border-amber-200 text-sm bg-white"
                        dir="rtl"
                      />
                      <p className="text-[11px] text-amber-600">
                        הטקסט יוצג בבועה הצפה מעל הסליידר באונבורדינג. השאירו ריק כדי להציג את תיאור הרמה.
                      </p>
                    </div>

                    {/* Exercise Linking */}
                    <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                        🎬 קישור תרגיל
                      </div>
                      <ExerciseAutocomplete
                        exercises={exercises}
                        selectedId={editForm.exerciseId || ''}
                        onChange={(exerciseId) =>
                          setEditForm({ ...editForm, exerciseId })
                        }
                        placeholder="חפש תרגיל לקישור..."
                      />
                      {editForm.exerciseId && (
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, exerciseId: null })}
                          className="text-xs text-red-500 hover:text-red-700 underline"
                        >
                          הסר קישור תרגיל
                        </button>
                      )}
                      <p className="text-xs text-emerald-600">
                        קישור תרגיל ישויך לרמה הנוכחית — הסרטון שלו ישמש כ-fallback באונבורדינג.
                      </p>
                    </div>

                    {/* Bold Title — Multilingual */}
                    <div>
                      <label className="block text-sm font-bold !text-slate-700 mb-2">כותרת מודגשת</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {(['he', 'en', 'ru'] as const).map(lang => (
                          <div key={lang}>
                            <label className="text-xs !text-slate-400 mb-1 block">{lang === 'he' ? 'עברית' : lang === 'en' ? 'English' : 'Русский'}</label>
                            <input type="text" value={editForm.boldTitle?.[lang]?.neutral ?? ''} onChange={e => updateBoldTitle(lang, e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white" dir={lang === 'he' ? 'rtl' : 'ltr'} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Description — Multilingual */}
                    <div>
                      <label className="block text-sm font-bold !text-slate-700 mb-2">תיאור מפורט</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {(['he', 'en', 'ru'] as const).map(lang => (
                          <div key={lang}>
                            <label className="text-xs !text-slate-400 mb-1 block">{lang === 'he' ? 'עברית' : lang === 'en' ? 'English' : 'Русский'}</label>
                            <textarea value={editForm.detailedDescription?.[lang]?.neutral ?? ''} onChange={e => updateDescription(lang, e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white resize-y min-h-[60px]"
                              dir={lang === 'he' ? 'rtl' : 'ltr'} rows={2} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Video Variants */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-bold !text-slate-700">וריאנטים של וידאו ({editForm.videoVariants.length})</label>
                        <button onClick={addVariant} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition-colors">
                          <Plus size={14} /> הוסף וריאנט
                        </button>
                      </div>

                      {editForm.videoVariants.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                          <Video size={28} className="mx-auto !text-slate-300 mb-2" />
                          <p className="text-sm !text-slate-400">אין וריאנטים. לחץ &quot;הוסף וריאנט&quot; ליצירת הראשון.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {editForm.videoVariants.map((variant, idx) => (
                            <div key={variant.id} className={`p-4 rounded-xl border ${variant.isDefault ? 'border-cyan-300 bg-cyan-50/50' : 'border-slate-200 bg-white'}`}>
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold !text-slate-500">
                                  וריאנט #{idx + 1}
                                  {variant.isDefault && <span className="mr-2 px-2 py-0.5 bg-cyan-100 !text-cyan-700 rounded-full text-[10px] font-bold">ברירת מחדל</span>}
                                </span>
                                <button onClick={() => removeVariant(variant.id)} className="p-1.5 rounded-lg hover:bg-red-50 !text-red-400 transition-colors" title="הסר וריאנט"><Trash2 size={14} /></button>
                              </div>

                              {/* ── File Upload Section ── */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                {/* iOS .mov Upload */}
                                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Apple size={14} className="!text-slate-600" />
                                    <span className="text-xs font-bold !text-slate-600">iOS — וידאו שקוף HEVC (.mov)</span>
                                  </div>
                                  {variant.videoUrlMov ? (
                                    <div className="space-y-1">
                                      <p className="text-[10px] !text-emerald-600 font-bold truncate">הועלה בהצלחה</p>
                                      <div className="flex gap-1">
                                        <button onClick={() => updateVariant(variant.id, 'videoUrlMov', '')}
                                          className="text-[10px] px-2 py-0.5 rounded bg-red-100 !text-red-600 hover:bg-red-200">הסר</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-slate-300 cursor-pointer hover:border-cyan-400 hover:bg-cyan-50/50 transition-all ${uploading === `${variant.id}_videoUrlMov` ? 'opacity-50 pointer-events-none' : ''}`}>
                                      {uploading === `${variant.id}_videoUrlMov` ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} className="!text-slate-400" />}
                                      <span className="text-xs !text-slate-500">העלה .mov</span>
                                      <input type="file" accept=".mov,video/quicktime" className="hidden"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(variant.id, f, 'videoUrlMov'); }} />
                                    </label>
                                  )}
                                </div>

                                {/* Android/Web .webm Upload */}
                                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Globe size={14} className="!text-slate-600" />
                                    <span className="text-xs font-bold !text-slate-600">אנדרואיד/ווב — וידאו שקוף VP9 (.webm)</span>
                                  </div>
                                  {variant.videoUrlWebm ? (
                                    <div className="space-y-1">
                                      <p className="text-[10px] !text-emerald-600 font-bold truncate">הועלה בהצלחה</p>
                                      <div className="flex gap-1">
                                        <button onClick={() => updateVariant(variant.id, 'videoUrlWebm', '')}
                                          className="text-[10px] px-2 py-0.5 rounded bg-red-100 !text-red-600 hover:bg-red-200">הסר</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-slate-300 cursor-pointer hover:border-cyan-400 hover:bg-cyan-50/50 transition-all ${uploading === `${variant.id}_videoUrlWebm` ? 'opacity-50 pointer-events-none' : ''}`}>
                                      {uploading === `${variant.id}_videoUrlWebm` ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} className="!text-slate-400" />}
                                      <span className="text-xs !text-slate-500">העלה .webm</span>
                                      <input type="file" accept=".webm,video/webm" className="hidden"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(variant.id, f, 'videoUrlWebm'); }} />
                                    </label>
                                  )}
                                </div>
                              </div>

                              {/* Fallback URL + metadata */}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="md:col-span-2">
                                  <label className="text-xs !text-slate-400 mb-1 block">כתובת חלופית (אופציונלי)</label>
                                  <input type="url" value={variant.videoUrl} onChange={e => updateVariant(variant.id, 'videoUrl', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white" placeholder="https://..." dir="ltr" />
                                </div>
                                <div>
                                  <label className="text-xs !text-slate-400 mb-1 block">מגדר</label>
                                  <select value={variant.gender} onChange={e => updateVariant(variant.id, 'gender', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                                    {GENDER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                  </select>
                                </div>
                                <div className="flex items-end pb-1">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={variant.isDefault} onChange={e => updateVariant(variant.id, 'isDefault', e.target.checked)}
                                      className="w-4 h-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400" />
                                    <span className="text-sm !text-slate-600">ברירת מחדל</span>
                                  </label>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3 mt-2">
                                <div>
                                  <label className="text-xs !text-slate-400 mb-1 block">גיל מינימום</label>
                                  <input type="number" value={variant.ageRange.min} onChange={e => updateVariant(variant.id, 'ageRange.min', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white" min={1} max={120} />
                                </div>
                                <div>
                                  <label className="text-xs !text-slate-400 mb-1 block">גיל מקסימום</label>
                                  <input type="number" value={variant.ageRange.max} onChange={e => updateVariant(variant.id, 'ageRange.max', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white" min={1} max={999} />
                                </div>
                              </div>

                              {/* Video preview */}
                              {(variant.videoUrlWebm || variant.videoUrlMov || variant.videoUrl) && (
                                <div className="mt-3 p-3 bg-slate-900 rounded-xl">
                                  <video key={`${variant.videoUrlWebm}_${variant.videoUrlMov}_${variant.videoUrl}`}
                                    controls muted loop playsInline className="w-full max-h-48 rounded-lg object-contain" style={{ background: 'transparent' }}>
                                    {variant.videoUrlWebm && <source src={variant.videoUrlWebm} type="video/webm" />}
                                    {variant.videoUrlMov && <source src={variant.videoUrlMov} type="video/quicktime" />}
                                    {variant.videoUrl && <source src={variant.videoUrl} />}
                                  </video>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

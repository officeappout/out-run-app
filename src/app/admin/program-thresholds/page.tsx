'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  BarChart3,
  Cpu,
  Lock,
  Pencil,
  X,
} from 'lucide-react';
import type {
  ProgramThreshold,
  LevelMode,
} from '@/features/user/onboarding/types/visual-assessment.types';
import {
  getAllThresholds,
  createThreshold,
  updateThreshold,
  deleteThreshold,
  detectCoverageGaps,
  seedExampleThresholds,
  type CoverageGap,
} from '@/features/user/onboarding/services/program-threshold-mapper.service';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';

// ── Helpers ──────────────────────────────────────────────────────────

const DEFAULT_MAX_LEVELS = 25;

function emptyThreshold(): Omit<ProgramThreshold, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '',
    description: '',
    isActive: true,
    priority: 100,
    averageRange: { min: 1, max: 5 },
    programId: '',
    levelMode: 'manual',
    levelId: '',
    displayName: { he: { neutral: '' }, en: { neutral: '' } },
  };
}

/** Generate level options 1..maxLevels for a given program. */
function buildLevelOptions(programId: string, maxLevels: number) {
  return Array.from({ length: maxLevels }, (_, i) => ({
    value: `${programId}_level_${i + 1}`,
    label: `רמה ${i + 1}`,
    num: i + 1,
  }));
}

export default function ProgramThresholdsAdmin() {
  const [thresholds, setThresholds] = useState<ProgramThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Programs from Firestore
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);

  // Form state — used for both new and edit
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyThreshold());

  // ── Data loading ────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllThresholds();
      setThresholds(data);
    } catch (err) {
      console.error('Failed to load thresholds:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPrograms = useCallback(async () => {
    try {
      setProgramsLoading(true);
      const data = await getAllPrograms();
      setPrograms(data);
    } catch (err) {
      console.error('Failed to load programs:', err);
    } finally {
      setProgramsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); loadPrograms(); }, [loadData, loadPrograms]);

  // Build lookup map: programId → Program
  const programMap = useMemo(() => {
    const map = new Map<string, Program>();
    programs.forEach(p => map.set(p.id, p));
    return map;
  }, [programs]);

  // ── Gap detection ──────────────────────────────────────────────

  const gaps: CoverageGap[] = useMemo(() => detectCoverageGaps(thresholds), [thresholds]);
  const hasFullCoverage = gaps.length === 0 && thresholds.filter(t => t.isActive).length > 0;

  const coverageMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of thresholds.filter(t => t.isActive && t.averageRange)) {
      if (!t.averageRange) continue;
      for (let i = Math.max(1, t.averageRange.min); i <= Math.min(25, t.averageRange.max); i++) {
        if (!map.has(i)) map.set(i, t.name);
      }
    }
    return map;
  }, [thresholds]);

  const colorPalette = ['bg-cyan-400', 'bg-emerald-400', 'bg-amber-400', 'bg-violet-400', 'bg-rose-400', 'bg-sky-400', 'bg-orange-400'];
  const thresholdColor = useCallback((name: string) => {
    const activeNames = thresholds.filter(t => t.isActive).map(t => t.name);
    const idx = activeNames.indexOf(name);
    return colorPalette[idx % colorPalette.length];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thresholds]);

  // ── Shared UI: Program Select ──────────────────────────────────

  const ProgramSelect = ({ value, onChange, className = '' }: {
    value: string; onChange: (id: string) => void; className?: string;
  }) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white ${className}`}
      disabled={programsLoading}
    >
      <option value="">— בחר תוכנית —</option>
      {programs.map(p => (
        <option key={p.id} value={p.id}>
          {p.name}{p.isMaster ? ' ⭐ (הורה)' : ''}
        </option>
      ))}
    </select>
  );

  // ── Shared UI: Level Select ────────────────────────────────────

  const LevelSelect = ({ programId, levelMode, value, onChange, onModeChange, className = '' }: {
    programId: string; levelMode: LevelMode; value: string;
    onChange: (id: string) => void; onModeChange: (m: LevelMode) => void; className?: string;
  }) => {
    const prog = programMap.get(programId);
    const isParent = prog?.isMaster ?? false;
    const maxLvl = prog?.maxLevels ?? DEFAULT_MAX_LEVELS;
    const levelOpts = programId ? buildLevelOptions(programId, maxLvl) : [];

    useEffect(() => {
      if (isParent && levelMode !== 'auto') onModeChange('auto');
    }, [isParent, levelMode, onModeChange]);

    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onModeChange(levelMode === 'auto' ? 'manual' : 'auto')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
              levelMode === 'auto'
                ? 'bg-violet-100 !text-violet-700 border-violet-300'
                : 'bg-slate-100 !text-slate-600 border-slate-200'
            }`}
          >
            {levelMode === 'auto' ? <Cpu size={12} /> : <Lock size={12} />}
            {levelMode === 'auto' ? 'אוטומטי (הורה)' : 'ידני (קבוע)'}
          </button>
          {isParent && levelMode !== 'auto' && (
            <span className="text-[10px] !text-amber-600 font-bold">⚠ תוכנית הורה — מומלץ אוטומטי</span>
          )}
        </div>

        {levelMode === 'manual' && (
          <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            disabled={!programId}
          >
            <option value="">— בחר רמה (1–{maxLvl}) —</option>
            {levelOpts.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}

        {levelMode === 'auto' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-xs !text-violet-600">
            <Cpu size={12} />
            הרמה תחושב אוטומטית ע&quot;י מנוע התוכנית מתוך רמות הקטגוריות
          </div>
        )}
      </div>
    );
  };

  // ── Form helpers ───────────────────────────────────────────────

  const openNewForm = () => {
    setEditingId(null);
    setDraft(emptyThreshold());
    setShowForm(true);
  };

  const openEditForm = (t: ProgramThreshold) => {
    setEditingId(t.id);
    setDraft({
      name: t.name,
      description: t.description,
      isActive: t.isActive,
      priority: t.priority,
      averageRange: t.averageRange ?? { min: 1, max: 5 },
      programId: t.programId,
      levelMode: t.levelMode ?? 'manual',
      levelId: t.levelId,
      displayName: t.displayName ?? { he: { neutral: '' }, en: { neutral: '' } },
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyThreshold());
  };

  // ── Handlers ─────────────────────────────────────────────────

  const handleSaveForm = async () => {
    if (!draft.name.trim()) return alert('שם חסר');
    if (!draft.programId.trim()) return alert('יש לבחור תוכנית');
    if (!draft.averageRange || draft.averageRange.min > draft.averageRange.max) {
      return alert('טווח ממוצע לא תקין');
    }
    if (draft.levelMode === 'manual' && !draft.levelId) {
      return alert('יש לבחור רמה (Level) או לעבור למצב אוטומטי');
    }
    try {
      setSaving(editingId ?? 'new');
      const payload = { ...draft, levelId: draft.levelMode === 'auto' ? '' : draft.levelId };

      if (editingId) {
        await updateThreshold(editingId, payload);
      } else {
        await createThreshold(payload);
      }
      closeForm();
      await loadData();
    } catch (err) {
      console.error('Failed to save threshold:', err);
      alert('שגיאה בשמירה');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק את הסף? פעולה זו לא ניתנת לביטול.')) return;
    try {
      setSaving(id);
      await deleteThreshold(id);
      if (editingId === id) closeForm();
      await loadData();
    } catch (err) {
      console.error('Failed to delete threshold:', err);
    } finally {
      setSaving(null);
    }
  };

  const handleToggle = async (t: ProgramThreshold) => {
    try {
      setSaving(t.id);
      await updateThreshold(t.id, { isActive: !t.isActive });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle threshold:', err);
    } finally {
      setSaving(null);
    }
  };

  const handleSeed = async () => {
    try {
      setSeeding(true);
      const count = await seedExampleThresholds();
      alert(count === 0 ? 'כבר קיימים סיפי תוכנית — לא נוצרו דוגמאות.' : `נוצרו ${count} סיפי תוכנית לדוגמה.`);
      await loadData();
    } catch (err) {
      console.error('Failed to seed thresholds:', err);
    } finally {
      setSeeding(false);
    }
  };

  // ── Display helpers ────────────────────────────────────────────

  const programDisplayName = useCallback((programId: string) => {
    const p = programMap.get(programId);
    return p ? `${p.name}${p.isMaster ? ' ⭐' : ''}` : programId || '—';
  }, [programMap]);

  const levelDisplayName = useCallback((levelId: string) => {
    if (!levelId) return '—';
    const match = levelId.match(/level_(\d+)$/);
    return match ? `רמה ${match[1]}` : levelId;
  }, []);

  // ── Main Render ──────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header + Context */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black !text-slate-900">מיפוי סיפי תוכנית</h1>
          <p className="text-sm !text-slate-500 mt-1">
            ממפה ציוני ממוצע מההערכה הוויזואלית לתוכניות אימון. כל סף מגדיר טווח ממוצע ומקצה תוכנית ורמה ספציפיים. פערים מסומנים אוטומטית.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSeed} disabled={seeding}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-100 !text-amber-700 hover:bg-amber-200 transition-all disabled:opacity-50">
            {seeding ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            זרע דוגמאות
          </button>
          <button onClick={openNewForm}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-cyan-600 !text-white hover:bg-cyan-700 transition-all">
            <Plus size={16} /> סף חדש
          </button>
        </div>
      </div>

      {/* Coverage visualization */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 size={18} className="!text-slate-500" />
          <span className="font-bold text-sm !text-slate-700">כיסוי טווח ממוצע (1–25)</span>
          {hasFullCoverage ? (
            <span className="flex items-center gap-1 text-xs font-bold !text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <CheckCircle size={12} /> כיסוי מלא
            </span>
          ) : gaps.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-bold !text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <AlertTriangle size={12} /> {gaps.length} פער{gaps.length > 1 ? 'ים' : ''}
            </span>
          )}
        </div>
        <div className="flex gap-px">
          {Array.from({ length: 25 }, (_, i) => i + 1).map(level => {
            const name = coverageMap.get(level);
            const bg = name ? thresholdColor(name) : 'bg-red-200';
            return (
              <div key={level} className={`flex-1 h-8 ${bg} rounded-sm flex items-center justify-center relative group`}
                title={name ? `${level}: ${name}` : `${level}: ⚠️ לא מכוסה`}>
                <span className="text-[9px] font-bold !text-white/80">{level}</span>
                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 !text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                  {name ?? '⚠️ לא מכוסה'}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {thresholds.filter(t => t.isActive).map(t => (
            <span key={t.id} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${thresholdColor(t.name)}`} />
              <span className="!text-slate-600">{t.name}</span>
              <span className="!text-slate-400">→ {programDisplayName(t.programId)}</span>
              {(t.levelMode ?? 'manual') === 'auto' && (
                <span className="px-1.5 py-0.5 rounded bg-violet-100 !text-violet-600 text-[10px] font-bold">אוטו׳</span>
              )}
            </span>
          ))}
          {gaps.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-200" />
              <span className="!text-red-500 font-bold">פערים</span>
            </span>
          )}
        </div>
        {gaps.length > 0 && (
          <div className="mt-2 space-y-1">
            {gaps.map((gap, i) => (
              <div key={i} className="flex items-center gap-2 text-xs !text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">
                <AlertTriangle size={14} />
                <span>פער: ממוצע <strong>{gap.from === gap.to ? gap.from : `${gap.from}–${gap.to}`}</strong> — לא מוגדרת תוכנית. ייעשה שימוש ב-fallback.</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create / Edit Form ──────────────────────────────────── */}
      {showForm && (
        <div className={`border-2 rounded-2xl p-5 space-y-4 ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-cyan-50 border-cyan-200'}`}>
          <div className="flex items-center justify-between">
            <h3 className={`font-bold flex items-center gap-2 ${editingId ? '!text-amber-800' : '!text-cyan-800'}`}>
              {editingId ? <><Pencil size={18} /> עריכת סף</> : <><Plus size={18} /> סף חדש</>}
            </h3>
            <button onClick={closeForm} className="p-1 rounded hover:bg-slate-200 !text-slate-500"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs !text-slate-500 font-bold">שם</label>
              <input type="text" value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" dir="rtl" placeholder="לדוגמה: מתחילים — גוף מלא" />
            </div>
            <div>
              <label className="text-xs !text-slate-500 font-bold">עדיפות</label>
              <input type="number" min={1} value={draft.priority} onChange={e => setDraft(p => ({ ...p, priority: Number(e.target.value) }))}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs !text-slate-500 font-bold">טווח ממוצע (מינ׳–מקס׳)</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="number" min={1} max={25} value={draft.averageRange?.min ?? 1}
                  onChange={e => setDraft(p => ({ ...p, averageRange: { min: Number(e.target.value), max: p.averageRange?.max ?? 25 } }))}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center" />
                <span className="!text-slate-400">—</span>
                <input type="number" min={1} max={25} value={draft.averageRange?.max ?? 25}
                  onChange={e => setDraft(p => ({ ...p, averageRange: { min: p.averageRange?.min ?? 1, max: Number(e.target.value) } }))}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center" />
              </div>
            </div>
            <div>
              <label className="text-xs !text-slate-500 font-bold">תוכנית</label>
              <div className="mt-1">
                <ProgramSelect value={draft.programId} onChange={programId => {
                  const prog = programMap.get(programId);
                  setDraft(p => ({ ...p, programId, levelMode: prog?.isMaster ? 'auto' : p.levelMode, levelId: prog?.isMaster ? '' : p.levelId }));
                }} className="w-full py-2" />
              </div>
            </div>
            <div>
              <label className="text-xs !text-slate-500 font-bold">רמה</label>
              <div className="mt-1">
                <LevelSelect programId={draft.programId} levelMode={draft.levelMode ?? 'manual'} value={draft.levelId}
                  onChange={levelId => setDraft(p => ({ ...p, levelId }))}
                  onModeChange={mode => setDraft(p => ({ ...p, levelMode: mode, levelId: mode === 'auto' ? '' : p.levelId }))} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs !text-slate-500 font-bold">שם תצוגה (עברית)</label>
              <input type="text" value={draft.displayName?.he?.neutral ?? ''}
                onChange={e => setDraft(p => ({ ...p, displayName: { ...p.displayName, he: { neutral: e.target.value } } }))}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" dir="rtl" />
            </div>
            <div>
              <label className="text-xs !text-slate-500 font-bold">שם תצוגה (אנגלית)</label>
              <input type="text" value={draft.displayName?.en?.neutral ?? ''}
                onChange={e => setDraft(p => ({ ...p, displayName: { ...p.displayName, en: { neutral: e.target.value } } }))}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSaveForm} disabled={saving !== null}
              className="flex items-center gap-2 px-5 py-2 bg-cyan-600 !text-white rounded-xl text-sm font-bold hover:bg-cyan-700 transition-all disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editingId ? 'עדכן' : 'שמור'}
            </button>
            <button onClick={closeForm}
              className="px-5 py-2 bg-slate-200 !text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-300 transition-all">ביטול</button>
          </div>
        </div>
      )}

      {/* ── Thresholds Table ──────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-cyan-500" /></div>
      ) : thresholds.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <BarChart3 size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="!text-slate-500 font-bold">אין סיפי תוכנית</p>
          <p className="text-sm !text-slate-400 mt-1">לחץ &quot;זרע דוגמאות&quot; או &quot;סף חדש&quot; להתחלה</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-3 text-center font-bold !text-slate-500 w-14">#</th>
                <th className="px-3 py-3 text-right font-bold !text-slate-500">שם</th>
                <th className="px-3 py-3 text-center font-bold !text-slate-500 w-32">טווח</th>
                <th className="px-3 py-3 text-right font-bold !text-slate-500">תוכנית</th>
                <th className="px-3 py-3 text-right font-bold !text-slate-500">רמה</th>
                <th className="px-3 py-3 text-right font-bold !text-slate-500">שם תצוגה</th>
                <th className="px-3 py-3 text-center font-bold !text-slate-500 w-36">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {thresholds.map(t => {
                const isSavingThis = saving === t.id;
                const isEditingThis = editingId === t.id;
                return (
                  <tr key={t.id} className={`border-b border-slate-100 ${!t.isActive ? 'opacity-50' : ''} ${isEditingThis ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-3 py-3 text-center font-mono text-xs !text-slate-400">{t.priority}</td>
                    <td className="px-3 py-3 font-medium !text-slate-800" dir="rtl">{t.name || '—'}</td>
                    <td className="px-3 py-3 text-center font-mono text-xs !text-slate-600">
                      {t.averageRange ? `${t.averageRange.min}–${t.averageRange.max}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-sm !text-slate-600">{programDisplayName(t.programId)}</td>
                    <td className="px-3 py-3">
                      {(t.levelMode ?? 'manual') === 'auto' ? (
                        <span className="px-2 py-0.5 rounded bg-violet-100 !text-violet-600 text-xs font-bold">אוטו׳</span>
                      ) : (
                        <span className="font-mono text-xs !text-slate-600">{levelDisplayName(t.levelId)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm !text-slate-600" dir="rtl">{t.displayName?.he?.neutral || '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditForm(t)} className="p-1.5 rounded-lg hover:bg-amber-100 !text-amber-600" title="ערוך">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => handleToggle(t)}
                          className={`p-1.5 rounded-lg ${t.isActive ? '!text-emerald-500 hover:bg-emerald-50' : '!text-slate-300 hover:bg-slate-100'}`}
                          title={t.isActive ? 'פעיל' : 'כבוי'}>
                          {t.isActive ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                        </button>
                        <button onClick={() => handleDelete(t.id)} disabled={isSavingThis}
                          className="p-1.5 rounded-lg hover:bg-red-50 !text-red-400 disabled:opacity-50" title="מחק">
                          {isSavingThis ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

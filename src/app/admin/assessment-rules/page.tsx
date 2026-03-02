'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  AlertTriangle,
  TestTube,
  Copy,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Cpu,
  Lock,
  Pencil,
} from 'lucide-react';
import type {
  AssessmentRule,
  RuleCondition,
  RuleAction,
  ComparisonOperator,
  AssessmentLevels,
  LevelMode,
} from '@/features/user/onboarding/types/visual-assessment.types';
import {
  getAllRules,
  createRule,
  updateRule,
  deleteRule,
  evaluateRulesSync,
  seedExampleRules,
} from '@/features/user/onboarding/services/assessment-rule-engine.service';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_MAX_LEVELS = 25;

type FieldOption = RuleCondition['field'];
const FIELD_OPTIONS: { value: FieldOption; label: string }[] = [
  { value: 'push', label: 'דחיפה (Push)' },
  { value: 'pull', label: 'משיכה (Pull)' },
  { value: 'legs', label: 'רגליים (Legs)' },
  { value: 'core', label: 'ליבה (Core)' },
  { value: 'average', label: 'ממוצע (Average)' },
];

const OPERATOR_OPTIONS: { value: ComparisonOperator; label: string }[] = [
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
];

const ACTION_TYPES: { value: RuleAction['type']; label: string; desc: string }[] = [
  { value: 'BRANCH_TO_FOLLOW_UP', label: 'המשך להערכה נוספת', desc: 'הסתעפות לקטגוריות המשך' },
  { value: 'SKIP_TO_RESULT', label: 'דלג לתוצאה', desc: 'הקצאת תוכנית ישירה' },
  { value: 'INJECT_QUESTIONS', label: 'הזרק שאלות ספציפיות', desc: 'הוספת שאלות לזרימה לפי מזהה' },
  { value: 'SKIP_CATEGORY', label: 'דלג על קטגוריה', desc: 'הסתרת שאלות לפי תגית קטגוריה' },
  { value: 'SET_PROGRAM_TRACK', label: 'הגדר מסלול תוכנית', desc: 'קביעת מסלול בריאות/כוח/ריצה' },
];

const TRACK_OPTIONS: { value: 'health' | 'strength' | 'run' | 'hybrid'; label: string; desc: string; color: string }[] = [
  { value: 'health', label: 'בריאות', desc: 'מסלול בריאות כללי (DEFAULT)', color: 'emerald' },
  { value: 'strength', label: 'כוח', desc: 'מסלול אימוני כוח (PERFORMANCE)', color: 'blue' },
  { value: 'run', label: 'ריצה', desc: 'מסלול ריצה (RUNNING)', color: 'orange' },
  { value: 'hybrid', label: 'משולב', desc: 'שילוב כוח + ריצה', color: 'violet' },
];

const CATEGORY_OPTIONS = ['push', 'pull', 'legs', 'core', 'handstand', 'skills'];

function emptyCondition(): RuleCondition {
  return { field: 'push', operator: '>', value: 10 };
}

function emptyAction(): RuleAction {
  return { type: 'BRANCH_TO_FOLLOW_UP', followUpCategories: [] };
}

function emptyRule(): Omit<AssessmentRule, 'id' | 'createdAt' | 'updatedAt'> {
  return { name: '', description: '', isActive: true, priority: 100, conditions: [emptyCondition()], action: emptyAction() };
}

function buildLevelOptions(programId: string, maxLevels: number) {
  return Array.from({ length: maxLevels }, (_, i) => ({
    value: `${programId}_level_${i + 1}`,
    label: `רמה ${i + 1}`,
  }));
}

// ── Component ──────────────────────────────────────────────────────

export default function AssessmentRulesAdmin() {
  const [rules, setRules] = useState<AssessmentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Programs
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);

  // Draft for new rule
  const [showNewForm, setShowNewForm] = useState(false);
  const [newRuleDraft, setNewRuleDraft] = useState(emptyRule());

  // Test simulator
  const [showTest, setShowTest] = useState(false);
  const [testLevels, setTestLevels] = useState<AssessmentLevels>({ push: 10, pull: 10, legs: 10, core: 10 });
  const [testResult, setTestResult] = useState<AssessmentRule | null | 'none'>(null);

  // ── Data loading ────────────────────────────────────────────────

  const loadRules = useCallback(async () => {
    try { setLoading(true); setRules(await getAllRules()); } catch (err) { console.error('Failed to load rules:', err); } finally { setLoading(false); }
  }, []);

  const loadPrograms = useCallback(async () => {
    try { setProgramsLoading(true); setPrograms(await getAllPrograms()); } catch (err) { console.error('Failed to load programs:', err); } finally { setProgramsLoading(false); }
  }, []);

  useEffect(() => { loadRules(); loadPrograms(); }, [loadRules, loadPrograms]);

  const programMap = new Map<string, Program>();
  programs.forEach(p => programMap.set(p.id, p));

  // ── Shared UI: Program Select ──────────────────────────────────

  const ProgramSelect = ({ value, onChange, className = '' }: {
    value: string; onChange: (id: string) => void; className?: string;
  }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white ${className}`} disabled={programsLoading}>
      <option value="">— בחר תוכנית —</option>
      {programs.map(p => <option key={p.id} value={p.id}>{p.name}{p.isMaster ? ' ⭐ (הורה)' : ''}</option>)}
    </select>
  );

  // ── Shared UI: Level Select ────────────────────────────────────

  const LevelSelect = ({ programId, levelMode, value, onChange, onModeChange }: {
    programId: string; levelMode: LevelMode; value: string;
    onChange: (id: string) => void; onModeChange: (m: LevelMode) => void;
  }) => {
    const prog = programMap.get(programId);
    const isParent = prog?.isMaster ?? false;
    const maxLvl = prog?.maxLevels ?? DEFAULT_MAX_LEVELS;
    const levelOpts = programId ? buildLevelOptions(programId, maxLvl) : [];

    useEffect(() => {
      if (isParent && levelMode !== 'auto') onModeChange('auto');
    }, [isParent, levelMode, onModeChange]);

    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onModeChange(levelMode === 'auto' ? 'manual' : 'auto')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
              levelMode === 'auto' ? 'bg-violet-100 !text-violet-700 border-violet-300' : 'bg-slate-100 !text-slate-600 border-slate-200'
            }`}>
            {levelMode === 'auto' ? <Cpu size={12} /> : <Lock size={12} />}
            {levelMode === 'auto' ? 'אוטומטי (הורה)' : 'ידני (קבוע)'}
          </button>
          {isParent && levelMode !== 'auto' && <span className="text-[10px] !text-amber-600 font-bold">⚠ תוכנית הורה</span>}
        </div>

        {levelMode === 'manual' && (
          <select value={value} onChange={e => onChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white" disabled={!programId}>
            <option value="">— בחר רמה (1–{maxLvl}) —</option>
            {levelOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        {levelMode === 'auto' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-xs !text-violet-600">
            <Cpu size={12} /> רמה אוטומטית — מנוע התוכנית יחשב מרמות הקטגוריות
          </div>
        )}
      </div>
    );
  };

  // ── Handlers ─────────────────────────────────────────────────

  const handleSaveNew = async () => {
    if (!newRuleDraft.name.trim()) return alert('שם הכלל חסר');
    if (newRuleDraft.conditions.length === 0) return alert('יש להוסיף לפחות תנאי אחד');
    if (newRuleDraft.action.type === 'SKIP_TO_RESULT' && !newRuleDraft.action.forceProgramId) return alert('יש לבחור תוכנית עבור SKIP_TO_RESULT');
    if (newRuleDraft.action.type === 'INJECT_QUESTIONS' && (!newRuleDraft.action.injectQuestionIds || newRuleDraft.action.injectQuestionIds.length === 0)) return alert('יש להזין לפחות מזהה שאלה אחד עבור הזרקת שאלות');
    if (newRuleDraft.action.type === 'SKIP_CATEGORY' && (!newRuleDraft.action.skipCategories || newRuleDraft.action.skipCategories.length === 0)) return alert('יש לבחור לפחות קטגוריה אחת עבור דילוג על קטגוריה');
    if (newRuleDraft.action.type === 'SET_PROGRAM_TRACK' && !newRuleDraft.action.programTrack) return alert('יש לבחור מסלול תוכנית');
    try {
      setSaving('new');
      const draft = { ...newRuleDraft };
      if (draft.action.type === 'SKIP_TO_RESULT' && draft.action.forceLevelMode === 'auto') draft.action = { ...draft.action, forceLevelId: '' };
      await createRule(draft);
      setNewRuleDraft(emptyRule());
      setShowNewForm(false);
      await loadRules();
    } catch (err) { console.error('Failed to create rule:', err); alert('שגיאה ביצירת הכלל'); } finally { setSaving(null); }
  };

  const handleUpdate = async (rule: AssessmentRule) => {
    try {
      setSaving(rule.id);
      const { id, createdAt, updatedAt, ...rest } = rule;
      if (rest.action.type === 'SKIP_TO_RESULT' && rest.action.forceLevelMode === 'auto') rest.action = { ...rest.action, forceLevelId: '' };
      await updateRule(id, rest);
      await loadRules();
    } catch (err) { console.error('Failed to update rule:', err); alert('שגיאה בעדכון הכלל'); } finally { setSaving(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק את הכלל? פעולה זו לא ניתנת לביטול.')) return;
    try { setSaving(id); await deleteRule(id); await loadRules(); } catch (err) { console.error('Failed to delete rule:', err); } finally { setSaving(null); }
  };

  const handleToggleActive = async (rule: AssessmentRule) => {
    try { setSaving(rule.id); await updateRule(rule.id, { isActive: !rule.isActive }); await loadRules(); } catch (err) { console.error('Failed to toggle rule:', err); } finally { setSaving(null); }
  };

  const handleDuplicate = async (rule: AssessmentRule) => {
    try {
      setSaving(rule.id);
      const { id, createdAt, updatedAt, ...rest } = rule;
      await createRule({ ...rest, name: `${rest.name} (העתק)`, priority: rest.priority + 1 });
      await loadRules();
    } catch (err) { console.error('Failed to duplicate rule:', err); } finally { setSaving(null); }
  };

  const handleSeed = async () => {
    try { setSeeding(true); const count = await seedExampleRules(); alert(count === 0 ? 'כבר קיימים כללים.' : `נוצרו ${count} כללים לדוגמה.`); await loadRules(); }
    catch (err) { console.error('Failed to seed rules:', err); } finally { setSeeding(false); }
  };

  const runTest = () => { setTestResult(evaluateRulesSync(rules, testLevels) ?? 'none'); };

  // ── Edit helpers ─────────────────────────────────────────────

  function updateRuleLocal(id: string, patch: Partial<AssessmentRule>) { setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r)); }
  function updateConditionInRule(ruleId: string, condIdx: number, patch: Partial<RuleCondition>) {
    setRules(prev => prev.map(r => { if (r.id !== ruleId) return r; const c = [...r.conditions]; c[condIdx] = { ...c[condIdx], ...patch }; return { ...r, conditions: c }; }));
  }
  function addConditionToRule(ruleId: string) { setRules(prev => prev.map(r => r.id !== ruleId ? r : { ...r, conditions: [...r.conditions, emptyCondition()] })); }
  function removeConditionFromRule(ruleId: string, condIdx: number) { setRules(prev => prev.map(r => r.id !== ruleId ? r : { ...r, conditions: r.conditions.filter((_, i) => i !== condIdx) })); }
  function updateActionInRule(ruleId: string, patch: Partial<RuleAction>) { setRules(prev => prev.map(r => r.id !== ruleId ? r : { ...r, action: { ...r.action, ...patch } })); }

  // ── "Edit via pencil" handler ──────────────────────────────────

  const handleEditPencil = (rule: AssessmentRule) => {
    setExpandedRuleId(rule.id);
    setTimeout(() => document.getElementById(`rule-editor-${rule.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  };

  // ── Render helpers ───────────────────────────────────────────

  const ConditionEditor = ({ conditions, onChange, onAdd, onRemove }: {
    conditions: RuleCondition[]; onChange: (i: number, p: Partial<RuleCondition>) => void; onAdd: () => void; onRemove: (i: number) => void;
  }) => (
    <div className="space-y-2">
      <span className="text-xs font-bold !text-slate-500">תנאים (AND)</span>
      {conditions.map((cond, idx) => (
        <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
          {idx > 0 && <span className="text-xs font-bold !text-amber-600 bg-amber-50 px-2 py-0.5 rounded">AND</span>}
          <select value={cond.field} onChange={e => onChange(idx, { field: e.target.value as FieldOption })} className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white">
            {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select value={cond.operator} onChange={e => onChange(idx, { operator: e.target.value as ComparisonOperator })} className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-16 text-center font-mono">
            {OPERATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="number" min={1} max={25} value={cond.value} onChange={e => onChange(idx, { value: Number(e.target.value) })} className="w-16 px-2 py-1.5 text-sm border border-slate-300 rounded-lg text-center" />
          {conditions.length > 1 && <button onClick={() => onRemove(idx)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>}
        </div>
      ))}
      <button onClick={onAdd} className="flex items-center gap-1 text-xs !text-cyan-600 hover:!text-cyan-800 font-medium"><Plus size={14} /> הוסף תנאי</button>
    </div>
  );

  const ActionEditor = ({ action, onChange }: { action: RuleAction; onChange: (p: Partial<RuleAction>) => void }) => (
    <div className="space-y-3 mt-4">
      <div className="text-xs font-bold !text-slate-500">פעולה</div>
      <div className="grid grid-cols-2 gap-2">
        {ACTION_TYPES.map(at => {
          const colorMap: Record<string, { active: string; ring: string }> = {
            'BRANCH_TO_FOLLOW_UP': { active: 'border-cyan-500 bg-cyan-50 !text-cyan-700', ring: 'hover:border-cyan-300' },
            'SKIP_TO_RESULT':      { active: 'border-emerald-500 bg-emerald-50 !text-emerald-700', ring: 'hover:border-emerald-300' },
            'INJECT_QUESTIONS':    { active: 'border-amber-500 bg-amber-50 !text-amber-700', ring: 'hover:border-amber-300' },
            'SKIP_CATEGORY':       { active: 'border-rose-500 bg-rose-50 !text-rose-700', ring: 'hover:border-rose-300' },
            'SET_PROGRAM_TRACK':   { active: 'border-violet-500 bg-violet-50 !text-violet-700', ring: 'hover:border-violet-300' },
          };
          const colors = colorMap[at.value] ?? { active: 'border-cyan-500 bg-cyan-50 !text-cyan-700', ring: '' };
          return (
            <button key={at.value} onClick={() => onChange({ type: at.value })}
              className={`py-2 px-3 rounded-lg border-2 text-xs font-bold transition-all text-right ${
                action.type === at.value ? colors.active : `border-slate-200 bg-white !text-slate-500 ${colors.ring}`
              }`}>
              <div>{at.label}</div><div className="font-normal mt-0.5 !text-slate-400">{at.desc}</div>
            </button>
          );
        })}
      </div>

      {action.type === 'BRANCH_TO_FOLLOW_UP' && (
        <div className="space-y-2 bg-cyan-50/50 p-3 rounded-lg border border-cyan-200">
          <div className="text-xs font-bold !text-cyan-700">קטגוריות המשך</div>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map(cat => {
              const selected = action.followUpCategories?.includes(cat) ?? false;
              return (
                <button key={cat} onClick={() => {
                  const cats = action.followUpCategories ?? [];
                  onChange({ followUpCategories: selected ? cats.filter(c => c !== cat) : [...cats, cat] });
                }} className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                  selected ? 'bg-cyan-500 !text-white border-cyan-600' : 'bg-white !text-slate-500 border-slate-200 hover:border-cyan-300'
                }`}>{cat}</button>
              );
            })}
          </div>
          <div className="mt-2">
            <label className="text-xs !text-slate-500">כותרת המשך (עברית)</label>
            <input type="text" value={action.followUpTitle?.he?.neutral ?? ''} dir="rtl"
              onChange={e => onChange({ followUpTitle: { ...action.followUpTitle, he: { neutral: e.target.value } } })}
              className="w-full mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="text-xs !text-slate-500">תיאור המשך (עברית)</label>
            <input type="text" value={action.followUpDescription?.he?.neutral ?? ''} dir="rtl"
              onChange={e => onChange({ followUpDescription: { ...action.followUpDescription, he: { neutral: e.target.value } } })}
              className="w-full mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg" />
          </div>
        </div>
      )}

      {action.type === 'SKIP_TO_RESULT' && (
        <div className="space-y-3 bg-emerald-50/50 p-3 rounded-lg border border-emerald-200">
          <div className="text-xs font-bold !text-emerald-700">תוכנית מוכתבת</div>
          <ProgramSelect value={action.forceProgramId ?? ''} onChange={programId => {
            const prog = programMap.get(programId);
            onChange({ forceProgramId: programId, forceLevelMode: prog?.isMaster ? 'auto' : (action.forceLevelMode ?? 'manual'), forceLevelId: prog?.isMaster ? '' : action.forceLevelId });
          }} className="w-full" />
          {action.forceProgramId && (
            <div>
              <div className="text-xs font-bold !text-emerald-700 mb-1">רמה מוכתבת</div>
              <LevelSelect programId={action.forceProgramId} levelMode={action.forceLevelMode ?? 'manual'} value={action.forceLevelId ?? ''}
                onChange={levelId => onChange({ forceLevelId: levelId })}
                onModeChange={mode => onChange({ forceLevelMode: mode, forceLevelId: mode === 'auto' ? '' : action.forceLevelId })} />
            </div>
          )}
        </div>
      )}

      {action.type === 'INJECT_QUESTIONS' && (
        <div className="space-y-3 bg-amber-50/50 p-3 rounded-lg border border-amber-200">
          <div className="text-xs font-bold !text-amber-700">הזרקת שאלות ספציפיות</div>
          <p className="text-xs !text-amber-600">הזן מזהי שאלות (Question IDs) מופרדים בפסיקים. המנוע יזריק שאלות אלה לזרימה כאשר הכלל תואם.</p>
          <textarea
            value={(action.injectQuestionIds ?? []).join(', ')}
            onChange={e => {
              const ids = e.target.value.split(',').map(id => id.trim()).filter(Boolean);
              onChange({ injectQuestionIds: ids });
            }}
            className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg bg-white font-mono"
            rows={3}
            dir="ltr"
            placeholder="question_id_1, question_id_2, question_id_3"
          />
          {(action.injectQuestionIds ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {action.injectQuestionIds!.map((id, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 !text-amber-800 rounded-full text-xs font-mono border border-amber-200">
                  {id}
                  <button onClick={() => {
                    const updated = action.injectQuestionIds!.filter((_, i) => i !== idx);
                    onChange({ injectQuestionIds: updated });
                  }} className="hover:!text-red-600 ml-0.5">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {action.type === 'SKIP_CATEGORY' && (
        <div className="space-y-2 bg-rose-50/50 p-3 rounded-lg border border-rose-200">
          <div className="text-xs font-bold !text-rose-700">קטגוריות לדילוג</div>
          <p className="text-xs !text-rose-600">שאלות שקטגוריית ה-Logic שלהן תואמת אחת מהתגיות הבאות יוסתרו אוטומטית.</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map(cat => {
              const selected = action.skipCategories?.includes(cat) ?? false;
              return (
                <button key={cat} onClick={() => {
                  const cats = action.skipCategories ?? [];
                  onChange({ skipCategories: selected ? cats.filter(c => c !== cat) : [...cats, cat] });
                }} className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                  selected ? 'bg-rose-500 !text-white border-rose-600' : 'bg-white !text-slate-500 border-slate-200 hover:border-rose-300'
                }`}>{cat}</button>
              );
            })}
          </div>
          {(action.skipCategories ?? []).length > 0 && (
            <div className="text-xs !text-rose-600 mt-1">
              ✓ {action.skipCategories!.length} קטגוריות נבחרו לדילוג
            </div>
          )}
        </div>
      )}

      {action.type === 'SET_PROGRAM_TRACK' && (
        <div className="space-y-3 bg-violet-50/50 p-3 rounded-lg border border-violet-200">
          <div className="text-xs font-bold !text-violet-700">מסלול תוכנית</div>
          <p className="text-xs !text-violet-600">בחר את המסלול שיוקצה למשתמש. זה קובע את מצב הדשבורד (DEFAULT/PERFORMANCE/RUNNING) ואת ווידג&apos;טים שיוצגו.</p>
          <div className="grid grid-cols-2 gap-2">
            {TRACK_OPTIONS.map(track => {
              const selected = action.programTrack === track.value;
              const colorStyles: Record<string, { active: string; idle: string }> = {
                emerald: { active: 'bg-emerald-500 !text-white border-emerald-600', idle: 'bg-white !text-slate-500 border-slate-200 hover:border-emerald-300' },
                blue:    { active: 'bg-blue-500 !text-white border-blue-600', idle: 'bg-white !text-slate-500 border-slate-200 hover:border-blue-300' },
                orange:  { active: 'bg-orange-500 !text-white border-orange-600', idle: 'bg-white !text-slate-500 border-slate-200 hover:border-orange-300' },
                violet:  { active: 'bg-violet-500 !text-white border-violet-600', idle: 'bg-white !text-slate-500 border-slate-200 hover:border-violet-300' },
              };
              const cs = colorStyles[track.color] ?? colorStyles.emerald;
              return (
                <button key={track.value} onClick={() => onChange({ programTrack: track.value })}
                  className={`py-2 px-3 rounded-lg border-2 text-xs font-bold transition-all text-right ${selected ? cs.active : cs.idle}`}>
                  <div>{track.label}</div>
                  <div className={`font-normal mt-0.5 ${selected ? '!text-white/80' : '!text-slate-400'}`}>{track.desc}</div>
                </button>
              );
            })}
          </div>
          {action.programTrack && (
            <div className="text-xs !text-violet-600 mt-1">
              ✓ מסלול נבחר: {TRACK_OPTIONS.find(t => t.value === action.programTrack)?.label ?? action.programTrack}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const programDisplayName = (pid: string | undefined) => { if (!pid) return '?'; const p = programMap.get(pid); return p ? p.name : pid; };

  // ── Main Render ──────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header + Context */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black !text-slate-900">מנוע כללים</h1>
          <p className="text-sm !text-slate-500 mt-1">
            הגדרת לוגיקת הסתעפות מתקדמת על בסיס ציוני ההערכה הוויזואלית. הכללים נבדקים לפי סדר עדיפות — ההתאמה הראשונה מפעילה את הפעולה.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTest(!showTest)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-violet-100 !text-violet-700 hover:bg-violet-200 transition-all">
            <TestTube size={16} /> מבחן כללים
          </button>
          <button onClick={handleSeed} disabled={seeding} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-100 !text-amber-700 hover:bg-amber-200 transition-all disabled:opacity-50">
            {seeding ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} זרע דוגמאות
          </button>
          <button onClick={() => setShowNewForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-cyan-600 !text-white hover:bg-cyan-700 transition-all">
            <Plus size={16} /> כלל חדש
          </button>
        </div>
      </div>

      {/* Test Simulator */}
      {showTest && (
        <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold !text-violet-800 flex items-center gap-2"><TestTube size={18} /> סימולטור כללים — הזן רמות ובדוק איזה כלל נופל</h3>
          <div className="grid grid-cols-4 gap-3">
            {(['push', 'pull', 'legs', 'core'] as const).map(cat => (
              <div key={cat}>
                <label className="text-xs font-bold !text-violet-600 uppercase">{cat}</label>
                <input type="number" min={1} max={25} value={testLevels[cat]}
                  onChange={e => setTestLevels(prev => ({ ...prev, [cat]: Number(e.target.value) }))}
                  className="w-full mt-1 px-3 py-2 border border-violet-300 rounded-lg text-center font-mono text-lg bg-white" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm !text-violet-600">ממוצע: <strong>{Math.round((testLevels.push + testLevels.pull + testLevels.legs + testLevels.core) / 4)}</strong></span>
            <button onClick={runTest} className="px-4 py-2 bg-violet-600 !text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-all">הפעל מבחן</button>
          </div>
          {testResult !== null && (
            <div className={`p-3 rounded-xl text-sm font-bold ${testResult === 'none' ? 'bg-slate-100 !text-slate-500' : 'bg-green-100 !text-green-800'}`}>
              {testResult === 'none' ? (
                <span className="flex items-center gap-2"><AlertTriangle size={16} /> אין כלל תואם — ימשיך לתוצאה רגילה דרך סיפי תוכנית</span>
              ) : (
                <span className="flex items-center gap-2"><Zap size={16} /> כלל תואם: &quot;{testResult.name}&quot; → {
                  testResult.action.type === 'BRANCH_TO_FOLLOW_UP'
                    ? `המשך [${testResult.action.followUpCategories?.join(', ')}]`
                    : testResult.action.type === 'INJECT_QUESTIONS'
                    ? `הזרק שאלות [${testResult.action.injectQuestionIds?.join(', ')}]`
                    : testResult.action.type === 'SKIP_CATEGORY'
                    ? `דלג על קטגוריות [${testResult.action.skipCategories?.join(', ')}]`
                    : testResult.action.type === 'SET_PROGRAM_TRACK'
                    ? `מסלול → ${testResult.action.programTrack ?? '?'}`
                    : `דלג → ${programDisplayName(testResult.action.forceProgramId)}${testResult.action.forceLevelMode === 'auto' ? ' (אוטו׳)' : ` (${testResult.action.forceLevelId ?? '?'})`}`
                }</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* New Rule Form */}
      {showNewForm && (
        <div className="bg-cyan-50 border-2 border-cyan-200 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold !text-cyan-800 flex items-center gap-2"><Plus size={18} /> כלל חדש</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs !text-slate-500 font-bold">שם הכלל</label>
              <input type="text" value={newRuleDraft.name} onChange={e => setNewRuleDraft(prev => ({ ...prev, name: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" dir="rtl" placeholder="לדוגמה: פלג גוף עליון מתקדם" />
            </div>
            <div>
              <label className="text-xs !text-slate-500 font-bold">עדיפות (מספר נמוך = ראשון)</label>
              <input type="number" min={1} value={newRuleDraft.priority} onChange={e => setNewRuleDraft(prev => ({ ...prev, priority: Number(e.target.value) }))}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center" />
            </div>
          </div>
          <div>
            <label className="text-xs !text-slate-500 font-bold">תיאור (אופציונלי)</label>
            <input type="text" value={newRuleDraft.description ?? ''} onChange={e => setNewRuleDraft(prev => ({ ...prev, description: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" dir="rtl" />
          </div>
          <ConditionEditor conditions={newRuleDraft.conditions}
            onChange={(idx, patch) => { setNewRuleDraft(prev => { const c = [...prev.conditions]; c[idx] = { ...c[idx], ...patch }; return { ...prev, conditions: c }; }); }}
            onAdd={() => setNewRuleDraft(prev => ({ ...prev, conditions: [...prev.conditions, emptyCondition()] }))}
            onRemove={idx => setNewRuleDraft(prev => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== idx) }))} />
          <ActionEditor action={newRuleDraft.action} onChange={patch => setNewRuleDraft(prev => ({ ...prev, action: { ...prev.action, ...patch } }))} />
          <div className="flex gap-2 pt-2">
            <button onClick={handleSaveNew} disabled={saving === 'new'}
              className="flex items-center gap-2 px-5 py-2 bg-cyan-600 !text-white rounded-xl text-sm font-bold hover:bg-cyan-700 transition-all disabled:opacity-50">
              {saving === 'new' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} שמור כלל
            </button>
            <button onClick={() => { setShowNewForm(false); setNewRuleDraft(emptyRule()); }}
              className="px-5 py-2 bg-slate-200 !text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-300 transition-all">ביטול</button>
          </div>
        </div>
      )}

      {/* Rules List */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-cyan-500" /></div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <Zap size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="!text-slate-500 font-bold">אין כללים עדיין</p>
          <p className="text-sm !text-slate-400 mt-1">לחץ &quot;זרע דוגמאות&quot; או &quot;כלל חדש&quot; להתחלה</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, idx) => {
            const isExpanded = expandedRuleId === rule.id;
            const isSavingThis = saving === rule.id;
            return (
              <div key={rule.id} id={`rule-editor-${rule.id}`}
                className={`border-2 rounded-2xl transition-all ${rule.isActive ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                {/* Collapsed header */}
                <div className="flex items-center gap-3 px-5 py-3 cursor-pointer" onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}>
                  <span className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-xs font-bold !text-slate-500">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm !text-slate-800 truncate">{rule.name}</div>
                    <div className="text-xs !text-slate-400 mt-0.5 font-mono">
                      {rule.conditions.map((c, ci) => (
                        <span key={ci}>{ci > 0 && <span className="!text-amber-500 mx-1">AND</span>}<span className="!text-cyan-600">{c.field}</span><span className="mx-0.5">{c.operator}</span><span className="!text-emerald-600">{c.value}</span></span>
                      ))}
                      <span className="mx-2 !text-slate-300">→</span>
                      <span className={
                        rule.action.type === 'BRANCH_TO_FOLLOW_UP' ? '!text-cyan-600'
                          : rule.action.type === 'INJECT_QUESTIONS' ? '!text-amber-600'
                          : rule.action.type === 'SKIP_CATEGORY' ? '!text-rose-600'
                          : rule.action.type === 'SET_PROGRAM_TRACK' ? '!text-violet-600'
                          : '!text-emerald-600'
                      }>
                        {rule.action.type === 'BRANCH_TO_FOLLOW_UP'
                          ? `המשך [${rule.action.followUpCategories?.join(', ') ?? ''}]`
                          : rule.action.type === 'INJECT_QUESTIONS'
                          ? `הזרק [${rule.action.injectQuestionIds?.join(', ') ?? ''}]`
                          : rule.action.type === 'SKIP_CATEGORY'
                          ? `דלג קטגוריות [${rule.action.skipCategories?.join(', ') ?? ''}]`
                          : rule.action.type === 'SET_PROGRAM_TRACK'
                          ? `מסלול → ${rule.action.programTrack ?? '?'}`
                          : `דלג → ${programDisplayName(rule.action.forceProgramId)}${rule.action.forceLevelMode === 'auto' ? ' (אוטו׳)' : ''}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs !text-slate-400 font-mono">#{rule.priority}</span>
                    <button onClick={e => { e.stopPropagation(); handleEditPencil(rule); }}
                      className="p-1 rounded hover:bg-amber-100 !text-amber-600" title="ערוך"><Pencil size={15} /></button>
                    <button onClick={e => { e.stopPropagation(); handleToggleActive(rule); }}
                      className={`p-1 rounded ${rule.isActive ? '!text-emerald-500' : '!text-slate-300'}`}>
                      {rule.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                {/* Expanded editor */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs !text-slate-500 font-bold">שם הכלל</label>
                        <input type="text" value={rule.name} onChange={e => updateRuleLocal(rule.id, { name: e.target.value })}
                          className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" dir="rtl" />
                      </div>
                      <div>
                        <label className="text-xs !text-slate-500 font-bold">עדיפות</label>
                        <input type="number" min={1} value={rule.priority} onChange={e => updateRuleLocal(rule.id, { priority: Number(e.target.value) })}
                          className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs !text-slate-500 font-bold">תיאור</label>
                      <input type="text" value={rule.description ?? ''} onChange={e => updateRuleLocal(rule.id, { description: e.target.value })}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" dir="rtl" />
                    </div>
                    <ConditionEditor conditions={rule.conditions}
                      onChange={(idx, patch) => updateConditionInRule(rule.id, idx, patch)}
                      onAdd={() => addConditionToRule(rule.id)}
                      onRemove={idx => removeConditionFromRule(rule.id, idx)} />
                    <ActionEditor action={rule.action} onChange={patch => updateActionInRule(rule.id, patch)} />
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                      <button onClick={() => handleUpdate(rule)} disabled={isSavingThis}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 !text-white rounded-xl text-sm font-bold hover:bg-cyan-700 transition-all disabled:opacity-50">
                        {isSavingThis ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} שמור שינויים
                      </button>
                      <button onClick={() => handleDuplicate(rule)} disabled={isSavingThis}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 !text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all disabled:opacity-50">
                        <Copy size={14} /> שכפל
                      </button>
                      <div className="flex-1" />
                      <button onClick={() => handleDelete(rule.id)} disabled={isSavingThis}
                        className="flex items-center gap-2 px-4 py-2 bg-red-50 !text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-all disabled:opacity-50">
                        <Trash2 size={14} /> מחק
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

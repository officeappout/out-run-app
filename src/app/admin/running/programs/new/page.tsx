'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Save, Loader2, Plus, Trash2, ChevronDown, ChevronUp, Play } from 'lucide-react';
import {
  createRunProgramTemplate,
  getRunWorkoutTemplates,
} from '@/features/workout-engine/core/services/running-admin.service';
import type {
  RunProgramTemplate,
  RunProgramWeekTemplate,
  ProgressionRule,
  RunnerProfileType,
  ProgramPhase,
  WeekSlot,
  VolumeCap,
  WorkoutCategory,
} from '@/features/workout-engine/core/types/running.types';
import type { RunWorkoutTemplate } from '@/features/workout-engine/core/types/running.types';

const TARGET_DISTANCES = ['3k', '5k', '10k', 'maintenance'] as const;
const PHASE_NAMES = [
  { value: 'base', label: 'בסיס' },
  { value: 'build', label: 'בנייה' },
  { value: 'peak', label: 'שיא' },
  { value: 'taper', label: 'טאפר' },
] as const;
const SLOT_TYPES = [
  { value: 'quality_primary', label: 'איכות ראשי' },
  { value: 'quality_secondary', label: 'איכות משני' },
  { value: 'long_run', label: 'ריצה ארוכה' },
  { value: 'easy_run', label: 'ריצה קלה' },
  { value: 'recovery', label: 'התאוששות' },
] as const;
const WORKOUT_CATEGORIES: { value: WorkoutCategory; label: string }[] = [
  { value: 'short_intervals', label: 'אינטרוולים קצרים' },
  { value: 'long_intervals', label: 'אינטרוולים ארוכים' },
  { value: 'fartlek_easy', label: 'פארטלק קל' },
  { value: 'fartlek_structured', label: 'פארטלק מובנה' },
  { value: 'tempo', label: 'טמפו' },
  { value: 'hill_long', label: 'עליות ארוכות' },
  { value: 'hill_short', label: 'עליות קצרות' },
  { value: 'hill_sprints', label: 'ספרינט עליות' },
  { value: 'long_run', label: 'ריצה ארוכה' },
  { value: 'easy_run', label: 'ריצה קלה' },
  { value: 'strides', label: 'סטרייד' },
];
const CAP_TARGETS = [
  { value: 'weekly_volume', label: 'נפח שבועי (דקות)' },
  { value: 'single_run', label: 'ריצה בודדת (דקות)' },
  { value: 'sets_per_block', label: 'סטים לבלוק' },
  { value: 'total_session', label: 'אימון שלם (דקות)' },
] as const;

const emptyPhase = (startWeek: number, endWeek: number): ProgramPhase => ({
  name: 'base',
  startWeek,
  endWeek,
  weekSlots: [],
  progressionRules: [],
  qualityPool: [],
  volumeMultiplier: 1,
});

const emptySlot = (): WeekSlot => ({
  id: `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  slotType: 'quality_primary',
  required: true,
  priority: 1,
  allowedCategories: [],
});

export default function NewRunProgramTemplatePage() {
  const router = useRouter();
  const [workoutTemplates, setWorkoutTemplates] = useState<RunWorkoutTemplate[]>([]);
  const [name, setName] = useState('');
  const [targetDistance, setTargetDistance] = useState<RunProgramTemplate['targetDistance']>('5k');
  const [targetProfileTypes, setTargetProfileTypes] = useState<RunnerProfileType[]>([1, 2, 3, 4]);
  const [canonicalWeeks, setCanonicalWeeks] = useState(12);
  const [canonicalFrequency, setCanonicalFrequency] = useState<2 | 3 | 4>(3);

  // Legacy week assignment (kept for backward compat)
  const [weekTemplates, setWeekTemplates] = useState<RunProgramWeekTemplate[]>([]);
  const [progressionRules, setProgressionRules] = useState<ProgressionRule[]>([]);

  // New phase-based fields
  const [phases, setPhases] = useState<ProgramPhase[]>([]);
  const [volumeCaps, setVolumeCaps] = useState<VolumeCap[]>([]);
  const [activeTab, setActiveTab] = useState<'phases' | 'legacy'>('phases');
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRunWorkoutTemplates().then(setWorkoutTemplates).catch(() => []);
  }, []);

  useEffect(() => {
    setWeekTemplates((prev) => {
      const next: RunProgramWeekTemplate[] = [];
      for (let i = 0; i < canonicalWeeks; i++) {
        next.push({ weekNumber: i + 1, workoutIds: prev[i]?.workoutIds ?? [] });
      }
      return next;
    });
  }, [canonicalWeeks]);

  const addPhase = () => {
    const lastEnd = phases.length > 0 ? phases[phases.length - 1].endWeek : 0;
    setPhases((p) => [...p, emptyPhase(lastEnd + 1, Math.min(lastEnd + 4, canonicalWeeks))]);
  };

  const updatePhase = (idx: number, updates: Partial<ProgramPhase>) => {
    setPhases((p) => p.map((ph, i) => (i === idx ? { ...ph, ...updates } : ph)));
  };

  const removePhase = (idx: number) => {
    setPhases((p) => p.filter((_, i) => i !== idx));
  };

  const addSlotToPhase = (phaseIdx: number) => {
    setPhases((p) =>
      p.map((ph, i) =>
        i === phaseIdx ? { ...ph, weekSlots: [...ph.weekSlots, emptySlot()] } : ph,
      ),
    );
  };

  const updateSlot = (phaseIdx: number, slotIdx: number, updates: Partial<WeekSlot>) => {
    setPhases((p) =>
      p.map((ph, i) =>
        i === phaseIdx
          ? {
              ...ph,
              weekSlots: ph.weekSlots.map((s, j) => (j === slotIdx ? { ...s, ...updates } : s)),
            }
          : ph,
      ),
    );
  };

  const removeSlot = (phaseIdx: number, slotIdx: number) => {
    setPhases((p) =>
      p.map((ph, i) =>
        i === phaseIdx
          ? { ...ph, weekSlots: ph.weekSlots.filter((_, j) => j !== slotIdx) }
          : ph,
      ),
    );
  };

  const toggleCategory = (phaseIdx: number, cat: WorkoutCategory) => {
    setPhases((p) =>
      p.map((ph, i) => {
        if (i !== phaseIdx) return ph;
        const pool = ph.qualityPool.includes(cat)
          ? ph.qualityPool.filter((c) => c !== cat)
          : [...ph.qualityPool, cat];
        return { ...ph, qualityPool: pool };
      }),
    );
  };

  const addVolumeCap = () => {
    setVolumeCaps((c) => [...c, { type: 'cap', target: 'weekly_volume', maxValue: 300, maxWeeklyIncreasePercent: 10 }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { alert('הזן שם לתוכנית'); return; }
    const template: Omit<RunProgramTemplate, 'id'> = {
      name: name.trim(),
      targetDistance,
      targetProfileTypes,
      canonicalWeeks,
      canonicalFrequency,
      weekTemplates: weekTemplates.map((wt, i) => ({ weekNumber: i + 1, workoutIds: wt.workoutIds ?? [] })),
      progressionRules,
      ...(phases.length > 0 ? { phases } : {}),
      ...(volumeCaps.length > 0 ? { volumeCaps } : {}),
    };
    setSaving(true);
    try {
      const id = await createRunProgramTemplate(template);
      if (id) router.push('/admin/running/programs');
      else alert('שגיאה בשמירה');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-5xl space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/running/programs" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2">
            <ArrowRight size={18} />
            חזרה לתוכניות
          </Link>
          <h1 className="text-3xl font-black text-gray-900">תוכנית ריצה חדשה</h1>
          <p className="text-gray-500 mt-1">הגדר פאזות, סלוטים ומגבלות נפח</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled
            title="שמור קודם את התוכנית כדי להריץ סימולציה"
            className="flex items-center gap-2 px-5 py-3 bg-purple-300 text-white rounded-xl font-bold cursor-not-allowed opacity-50"
          >
            <Play size={18} />
            סימולציה
          </button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">פרטים כלליים</h2>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">שם התוכנית</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="למשל: שיפור 5 ק״מ" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">מרחק יעד</label>
              <select value={targetDistance} onChange={(e) => setTargetDistance(e.target.value as RunProgramTemplate['targetDistance'])} className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                {TARGET_DISTANCES.map((d) => (<option key={d} value={d}>{d}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">מספר שבועות</label>
              <input type="number" value={canonicalWeeks} onChange={(e) => setCanonicalWeeks(Math.max(1, parseInt(e.target.value, 10) || 1))} className="w-full px-4 py-2 border border-gray-300 rounded-lg" min={1} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">אימונים בשבוע</label>
              <select value={canonicalFrequency} onChange={(e) => setCanonicalFrequency(Number(e.target.value) as 2 | 3 | 4)} className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2">
          <button type="button" onClick={() => setActiveTab('phases')} className={`px-4 py-2 rounded-lg font-bold text-sm ${activeTab === 'phases' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
            פאזות (חדש)
          </button>
          <button type="button" onClick={() => setActiveTab('legacy')} className={`px-4 py-2 rounded-lg font-bold text-sm ${activeTab === 'legacy' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
            הקצאה ידנית (Legacy)
          </button>
        </div>

        {activeTab === 'phases' ? (
          <>
            {/* Phases */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">פאזות אימון</h2>
                <button type="button" onClick={addPhase} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-sm">
                  <Plus size={18} />
                  הוסף פאזה
                </button>
              </div>

              {phases.length === 0 && <p className="text-gray-500 text-sm">אין פאזות. הוסף פאזה לתחילת התכנון.</p>}

              <div className="space-y-4">
                {phases.map((phase, pi) => (
                  <div key={pi} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedPhase(expandedPhase === pi ? null : pi)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedPhase === pi ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        <span className="font-bold text-gray-800">
                          {PHASE_NAMES.find((p) => p.value === phase.name)?.label ?? phase.name} — שבועות {phase.startWeek}–{phase.endWeek}
                        </span>
                      </div>
                      <button type="button" onClick={(e) => { e.stopPropagation(); removePhase(pi); }} className="p-1 text-red-500 hover:bg-red-50 rounded">
                        <Trash2 size={18} />
                      </button>
                    </div>

                    {expandedPhase === pi && (
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-4 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">שם</label>
                            <select value={phase.name} onChange={(e) => updatePhase(pi, { name: e.target.value as ProgramPhase['name'] })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                              {PHASE_NAMES.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">שבוע התחלה</label>
                            <input type="number" value={phase.startWeek} onChange={(e) => updatePhase(pi, { startWeek: parseInt(e.target.value, 10) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" min={1} max={canonicalWeeks} />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">שבוע סיום</label>
                            <input type="number" value={phase.endWeek} onChange={(e) => updatePhase(pi, { endWeek: parseInt(e.target.value, 10) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" min={1} max={canonicalWeeks} />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">מכפיל נפח</label>
                            {typeof phase.volumeMultiplier === 'number' ? (
                              <div className="flex items-center gap-2">
                                <input type="number" step="0.1" value={phase.volumeMultiplier} onChange={(e) => updatePhase(pi, { volumeMultiplier: parseFloat(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" min={0.1} max={2} />
                                <button type="button" onClick={() => { const weeks = phase.endWeek - phase.startWeek + 1; updatePhase(pi, { volumeMultiplier: Array.from({ length: weeks }, () => typeof phase.volumeMultiplier === 'number' ? phase.volumeMultiplier : 1) }); }} className="whitespace-nowrap text-xs text-cyan-600 hover:text-cyan-800 font-bold" title="הגדר מכפיל שונה לכל שבוע בפאזה">לפי שבוע</button>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">מכפיל לכל שבוע</span>
                                  <button type="button" onClick={() => updatePhase(pi, { volumeMultiplier: 1 })} className="text-xs text-gray-500 hover:text-gray-700 font-bold">אחיד</button>
                                </div>
                                <div className="grid grid-cols-4 gap-1">
                                  {phase.volumeMultiplier.map((val, wi) => (
                                    <div key={wi} className="relative">
                                      <label className="absolute -top-1.5 right-1 text-[10px] text-gray-400 bg-white px-0.5">ש{phase.startWeek + wi}</label>
                                      <input type="number" step="0.05" min={0.1} max={2} value={val} onChange={(e) => { const arr = [...(phase.volumeMultiplier as number[])]; arr[wi] = parseFloat(e.target.value) || 1; updatePhase(pi, { volumeMultiplier: arr }); }} className={`w-full px-2 py-1.5 border rounded text-xs text-center ${val < 1 ? 'border-amber-300 bg-amber-50' : val > 1 ? 'border-emerald-300 bg-emerald-50' : 'border-gray-300'}`} />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quality Pool */}
                        <div>
                          <label className="block text-xs font-bold text-gray-600 mb-2">מאגר אימוני איכות</label>
                          <div className="flex flex-wrap gap-2">
                            {WORKOUT_CATEGORIES.map((cat) => (
                              <button
                                key={cat.value}
                                type="button"
                                onClick={() => toggleCategory(pi, cat.value)}
                                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                  phase.qualityPool.includes(cat.value)
                                    ? 'bg-cyan-100 border-cyan-400 text-cyan-800'
                                    : 'bg-gray-50 border-gray-200 text-gray-500'
                                }`}
                              >
                                {cat.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Week Slots */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-gray-600">סלוטים שבועיים</label>
                            <button type="button" onClick={() => addSlotToPhase(pi)} className="flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-800 font-bold">
                              <Plus size={14} /> הוסף סלוט
                            </button>
                          </div>
                          {phase.weekSlots.length === 0 && <p className="text-gray-400 text-xs">אין סלוטים. הוסף סלוט לקביעת מיקומי אימונים בשבוע.</p>}
                          <div className="space-y-2">
                            {phase.weekSlots.map((slot, si) => (
                              <div key={slot.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                <select value={slot.slotType} onChange={(e) => updateSlot(pi, si, { slotType: e.target.value as WeekSlot['slotType'] })} className="px-2 py-1 border border-gray-300 rounded text-xs">
                                  {SLOT_TYPES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                                </select>
                                <input type="number" value={slot.priority} onChange={(e) => updateSlot(pi, si, { priority: parseInt(e.target.value, 10) || 1 })} className="w-16 px-2 py-1 border border-gray-300 rounded text-xs" placeholder="עדיפות" min={1} />
                                <label className="flex items-center gap-1 text-xs">
                                  <input type="checkbox" checked={slot.required} onChange={(e) => updateSlot(pi, si, { required: e.target.checked })} />
                                  חובה
                                </label>
                                <button type="button" onClick={() => removeSlot(pi, si)} className="p-0.5 text-red-400 hover:text-red-600">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Volume Caps */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">מגבלות נפח</h2>
                <button type="button" onClick={addVolumeCap} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-sm">
                  <Plus size={18} />
                  הוסף מגבלה
                </button>
              </div>
              {volumeCaps.length === 0 && <p className="text-gray-500 text-sm">אין מגבלות. הוסף מגבלה למניעת עומס יתר.</p>}
              <div className="space-y-3">
                {volumeCaps.map((cap, ci) => (
                  <div key={ci} className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg">
                    <select value={cap.target} onChange={(e) => setVolumeCaps((c) => c.map((v, i) => (i === ci ? { ...v, target: e.target.value as VolumeCap['target'] } : v)))} className="px-3 py-2 border border-gray-300 rounded text-sm">
                      {CAP_TARGETS.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                    </select>
                    <input type="number" value={cap.maxValue} onChange={(e) => setVolumeCaps((c) => c.map((v, i) => (i === ci ? { ...v, maxValue: parseInt(e.target.value, 10) || 0 } : v)))} className="w-24 px-3 py-2 border border-gray-300 rounded text-sm" placeholder="מקסימום" />
                    <span className="text-gray-500 text-xs">גידול שבועי מקס׳:</span>
                    <input type="number" value={cap.maxWeeklyIncreasePercent} onChange={(e) => setVolumeCaps((c) => c.map((v, i) => (i === ci ? { ...v, maxWeeklyIncreasePercent: parseInt(e.target.value, 10) || 10 } : v)))} className="w-16 px-3 py-2 border border-gray-300 rounded text-sm" />
                    <span className="text-gray-500 text-xs">%</span>
                    <button type="button" onClick={() => setVolumeCaps((c) => c.filter((_, i) => i !== ci))} className="p-1 text-red-500 hover:bg-red-50 rounded">
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Legacy week assignment */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">הקצאת אימונים לשבועות (Legacy)</h2>
              <div className="space-y-4 max-h-64 overflow-y-auto">
                {weekTemplates.map((wt, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <span className="w-16 font-bold text-gray-700">שבוע {i + 1}</span>
                    <div className="flex-1 flex flex-wrap gap-2">
                      {workoutTemplates.map((w) => (
                        <label key={w.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={wt.workoutIds?.includes(w.id) ?? false}
                            onChange={(e) => {
                              const ids = wt.workoutIds ?? [];
                              const next = e.target.checked ? [...ids, w.id] : ids.filter((id) => id !== w.id);
                              setWeekTemplates((all) => all.map((t, j) => (j === i ? { ...t, workoutIds: next } : t)));
                            }}
                          />
                          <span className="text-sm">{w.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legacy progression rules */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">חוקי התקדמות (Legacy)</h2>
                <button type="button" onClick={() => setProgressionRules((r) => [...r, { type: 'add_sets', value: 1, everyWeeks: 2, appliesTo: 'all' }])} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-sm">
                  <Plus size={18} />
                  הוסף כלל
                </button>
              </div>
              <div className="space-y-4">
                {progressionRules.length === 0 ? (
                  <p className="text-gray-500 text-sm">אין כללים.</p>
                ) : (
                  progressionRules.map((rule, idx) => (
                    <div key={idx} className="p-4 border border-gray-200 rounded-xl flex flex-wrap items-center gap-4">
                      <select value={rule.type} onChange={(e) => setProgressionRules((r) => r.map((rl, i) => (i === idx ? { ...rl, type: e.target.value as ProgressionRule['type'] } : rl)))} className="px-3 py-2 border border-gray-300 rounded text-sm">
                        <option value="add_sets">הוסף סטים</option>
                        <option value="increase_base_value_percent">הגדל ערך בסיס (%)</option>
                        <option value="increase_distance">הגדל מרחק</option>
                      </select>
                      <input type="number" value={'value' in rule ? rule.value : 0} onChange={(e) => setProgressionRules((r) => r.map((rl, i) => (i === idx ? { ...rl, value: parseFloat(e.target.value) || 0 } : rl)))} className="w-20 px-3 py-2 border border-gray-300 rounded text-sm" />
                      <span className="text-gray-600">כל</span>
                      <input type="number" value={rule.everyWeeks} onChange={(e) => setProgressionRules((r) => r.map((rl, i) => (i === idx ? { ...rl, everyWeeks: parseInt(e.target.value, 10) || 1 } : rl)))} className="w-16 px-3 py-2 border border-gray-300 rounded text-sm" min={1} />
                      <span className="text-gray-600">שבועות</span>
                      <button type="button" onClick={() => setProgressionRules((r) => r.filter((_, i) => i !== idx))} className="p-1 text-red-500 hover:bg-red-50 rounded">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

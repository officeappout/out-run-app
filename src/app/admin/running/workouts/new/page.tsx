'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  createRunWorkoutTemplate,
  getPaceMapConfig,
} from '@/features/workout-engine/core/services/running-admin.service';
import { computeZones, formatPaceSeconds } from '@/features/workout-engine/core/services/running-engine.service';
import { DEFAULT_PACE_MAP_CONFIG } from '@/features/workout-engine/core/config/pace-map-config';
import type {
  RunWorkoutTemplate,
  RunBlockTemplate,
  RunZoneType,
  RunnerProfileType,
  WorkoutCategory,
} from '@/features/workout-engine/core/types/running.types';
import { ALL_RUN_ZONES } from '@/features/workout-engine/core/types/running.types';
import type { PaceMapConfig } from '@/features/workout-engine/core/types/running.types';

const RUN_BLOCK_TYPES = ['warmup', 'run', 'walk', 'interval', 'recovery', 'cooldown'] as const;
const ZONE_LABELS: Record<RunZoneType, string> = {
  walk: 'הליכה',
  jogging: 'ג׳וגינג',
  recovery: 'התאוששות',
  easy: 'קל',
  long_run: 'נפח',
  fartlek_medium: 'פארטלק בינוני',
  tempo: 'טמפו',
  fartlek_fast: 'פארטלק מהיר',
  interval_short: 'אינטרוולים קצרים',
};
const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
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
const EFFORT_LEVELS = [
  { value: 'moderate', label: 'בינוני' },
  { value: 'hard', label: 'גבוה' },
  { value: 'max', label: 'מקסימלי' },
] as const;

function generateId() {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const emptyBlock = (): RunBlockTemplate => ({
  id: generateId(),
  type: 'warmup',
  zoneType: 'easy',
  isQualityExercise: false,
  measureBy: 'time',
  baseValue: 300,
  sets: 1,
  label: '',
  colorHex: COLORS[0],
});

export default function NewRunWorkoutTemplatePage() {
  const router = useRouter();
  const [config, setConfig] = useState<PaceMapConfig>(DEFAULT_PACE_MAP_CONFIG);
  const [name, setName] = useState('');
  const [isQualityWorkout, setIsQualityWorkout] = useState(false);
  const [targetProfileTypes, setTargetProfileTypes] = useState<RunnerProfileType[]>([1, 2, 3, 4]);
  const [blocks, setBlocks] = useState<RunBlockTemplate[]>([emptyBlock()]);
  const [previewBasePace, setPreviewBasePace] = useState(330);
  const [previewProfile, setPreviewProfile] = useState<RunnerProfileType>(1);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<WorkoutCategory | ''>('');
  const [priority, setPriority] = useState<number | ''>('');

  useEffect(() => {
    getPaceMapConfig().then(setConfig).catch(() => {});
  }, []);

  const addBlock = () => setBlocks((b) => [...b, emptyBlock()]);
  const removeBlock = (idx: number) => setBlocks((b) => b.filter((_, i) => i !== idx));
  const updateBlock = (idx: number, updates: Partial<RunBlockTemplate>) => {
    setBlocks((b) => b.map((bl, i) => (i === idx ? { ...bl, ...updates } : bl)));
  };

  const zones = computeZones(previewBasePace, previewProfile, config);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('הזן שם לאימון');
      return;
    }
    const template: Omit<RunWorkoutTemplate, 'id'> = {
      name: name.trim(),
      isQualityWorkout,
      targetProfileTypes,
      blocks: blocks.map((b) => ({
        ...b,
        label: b.label || ZONE_LABELS[b.zoneType],
      })),
      ...(category ? { category } : {}),
      ...(priority !== '' ? { priority: Number(priority) } : {}),
    };
    setSaving(true);
    try {
      const id = await createRunWorkoutTemplate(template);
      if (id) router.push('/admin/running/workouts');
      else alert('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/running/workouts"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowRight size={18} />
            חזרה לתבניות
          </Link>
          <h1 className="text-3xl font-black text-gray-900">אימון ריצה חדש</h1>
          <p className="text-gray-500 mt-1">בנה אימון עם בלוקים ואזורי קצב</p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {saving ? 'שומר...' : 'שמור'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">פרטים כלליים</h2>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">שם האימון</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              placeholder="למשל: אינטרוולים קלאסי"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isQualityWorkout}
              onChange={(e) => setIsQualityWorkout(e.target.checked)}
            />
            <span className="font-bold">אימון איכות</span>
            <span className="text-gray-500 text-sm">(משפיע על עדכון קצב הבסיס)</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">קטגוריה</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as WorkoutCategory)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">ללא</option>
                {WORKOUT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">עדיפות (נמוך = מועדף)</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="אופציונלי"
                min={1}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">בלוקים</h2>
            <button
              type="button"
              onClick={addBlock}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-sm"
            >
              <Plus size={18} />
              הוסף בלוק
            </button>
          </div>
          <div className="space-y-4">
            {blocks.map((block, idx) => (
              <div
                key={block.id}
                className="p-4 border border-gray-200 rounded-xl space-y-3"
                style={{ borderRightColor: block.colorHex, borderRightWidth: 4 }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-700">בלוק {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeBlock(idx)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">סוג</label>
                    <select
                      value={block.type}
                      onChange={(e) => updateBlock(idx, { type: e.target.value as RunBlockTemplate['type'] })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      {RUN_BLOCK_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">מצב</label>
                    <select
                      value={block.blockMode ?? 'pace'}
                      onChange={(e) => updateBlock(idx, { blockMode: e.target.value as 'pace' | 'effort' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      <option value="pace">קצב</option>
                      <option value="effort">מאמץ</option>
                    </select>
                  </div>
                  {(block.blockMode ?? 'pace') === 'pace' ? (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">אזור קצב</label>
                      <select
                        value={block.zoneType}
                        onChange={(e) => updateBlock(idx, { zoneType: e.target.value as RunZoneType })}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      >
                        {ALL_RUN_ZONES.map((z) => (
                          <option key={z} value={z}>{ZONE_LABELS[z]}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">רמת מאמץ</label>
                      <select
                        value={block.effortConfig?.effortLevel ?? 'moderate'}
                        onChange={(e) => updateBlock(idx, { effortConfig: { ...(block.effortConfig ?? {}), effortLevel: e.target.value as 'moderate' | 'hard' | 'max' } })}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      >
                        {EFFORT_LEVELS.map((l) => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">מדידה</label>
                    <select
                      value={block.measureBy}
                      onChange={(e) => updateBlock(idx, { measureBy: e.target.value as 'time' | 'distance' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      <option value="time">זמן</option>
                      <option value="distance">מרחק</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">
                      {block.measureBy === 'time' ? 'שניות' : 'מטרים'}
                    </label>
                    <input
                      type="number"
                      value={block.baseValue}
                      onChange={(e) => updateBlock(idx, { baseValue: parseInt(e.target.value, 10) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      min={1}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">סטים</label>
                    <input
                      type="number"
                      value={block.sets}
                      onChange={(e) => updateBlock(idx, { sets: parseInt(e.target.value, 10) || 1 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      min={1}
                    />
                  </div>
                  {block.sets > 1 && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">מנוחה בין סטים (שנ׳)</label>
                        <input
                          type="number"
                          value={block.restBetweenSetsSeconds ?? 0}
                          onChange={(e) => updateBlock(idx, { restBetweenSetsSeconds: parseInt(e.target.value, 10) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">סוג מנוחה</label>
                        <select
                          value={block.restType ?? 'standing'}
                          onChange={(e) => updateBlock(idx, { restType: e.target.value as 'standing' | 'walk' | 'jog' })}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="standing">עמידה</option>
                          <option value="walk">הליכה</option>
                          <option value="jog">ריצת התאוששות</option>
                        </select>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">צבע</label>
                    <input
                      type="color"
                      value={block.colorHex}
                      onChange={(e) => updateBlock(idx, { colorHex: e.target.value })}
                      className="w-full h-10 rounded border border-gray-300"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-600 mb-1">תווית (אופציונלי)</label>
                    <input
                      type="text"
                      value={block.label}
                      onChange={(e) => updateBlock(idx, { label: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder={ZONE_LABELS[block.zoneType]}
                    />
                  </div>
                  <label className="flex items-center gap-2 col-span-2">
                    <input
                      type="checkbox"
                      checked={block.isQualityExercise}
                      onChange={(e) => updateBlock(idx, { isQualityExercise: e.target.checked })}
                    />
                    <span className="text-sm font-bold">החלק המהיר (לא חימום/שחרור)</span>
                  </label>
                </div>
                {(block.blockMode ?? 'pace') === 'pace' ? (
                  <div className="text-sm text-cyan-600 font-medium">
                    טווח קצב: {zones[block.zoneType]
                      ? `${formatPaceSeconds(zones[block.zoneType].minPace)} – ${formatPaceSeconds(zones[block.zoneType].maxPace)}`
                      : '—'}
                  </div>
                ) : (
                  <div className="text-sm text-amber-600 font-medium">
                    מצב מאמץ: {EFFORT_LEVELS.find(l => l.value === (block.effortConfig?.effortLevel ?? 'moderate'))?.label ?? 'בינוני'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-cyan-50 rounded-xl border border-cyan-200 p-6">
          <h2 className="text-lg font-bold text-cyan-900 mb-4">תצוגה מקדימה — קצב</h2>
          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-cyan-800 mb-1">קצב בסיס (דק׳/ק״מ)</label>
              <input
                type="number"
                min="4"
                max="12"
                step="0.5"
                value={previewBasePace / 60}
                onChange={(e) => setPreviewBasePace(Math.round(parseFloat(e.target.value || '5.5') * 60))}
                className="w-24 px-3 py-2 border border-cyan-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-cyan-800 mb-1">פרופיל</label>
              <select
                value={previewProfile}
                onChange={(e) => setPreviewProfile(Number(e.target.value) as RunnerProfileType)}
                className="px-3 py-2 border border-cyan-300 rounded"
              >
                <option value={1}>משפר מהיר</option>
                <option value={2}>משפר איטי</option>
                <option value={3}>מתחיל</option>
                <option value={4}>שימור</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {blocks.map((b, i) => {
              const z = zones[b.zoneType];
              return (
                <div
                  key={b.id}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: b.colorHex }}
                >
                  {b.label || ZONE_LABELS[b.zoneType]}: {z ? `${formatPaceSeconds(z.minPace)}–${formatPaceSeconds(z.maxPace)}` : '—'}
                </div>
              );
            })}
          </div>
        </div>
      </form>
    </div>
  );
}

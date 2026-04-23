'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import type { ReadinessConfig, ReadinessTest } from '@/features/admin/services/readiness.service';
import { saveReadinessConfig } from '@/features/admin/services/readiness.service';

interface ThresholdConfigProps {
  config: ReadinessConfig;
  adminUid: string;
  onSaved: () => void;
}

const METRIC_OPTIONS = [
  { value: 'cardio_minutes', label: 'דקות אירובי (ריצה)', unit: 'minutes' as const },
  { value: 'strength_reps', label: 'חזרות (שכיבות שמיכה / מתח)', unit: 'reps' as const },
  { value: 'distance_meters', label: 'מרחק (מטרים)', unit: 'meters' as const },
];

function emptyTest(): ReadinessTest {
  return {
    id: `test_${Date.now()}`,
    label: '',
    metric: 'cardio_minutes',
    passThreshold: 0,
    yellowThreshold: 0,
    unit: 'minutes',
    lowerIsBetter: true,
  };
}

export default function ThresholdConfig({ config, adminUid, onSaved }: ThresholdConfigProps) {
  const [tests, setTests] = useState<ReadinessTest[]>(config.tests);
  const [saving, setSaving] = useState(false);

  const updateTest = (idx: number, patch: Partial<ReadinessTest>) => {
    setTests(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
  };

  const removeTest = (idx: number) => {
    setTests(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveReadinessConfig({ ...config, tests }, adminUid);
      onSaved();
    } catch (err) {
      console.error('[ThresholdConfig] save failed', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black text-gray-900">הגדרות סף כשירות</h3>
        <button
          onClick={() => setTests(prev => [...prev, emptyTest()])}
          className="flex items-center gap-1.5 text-sm font-bold text-cyan-600 hover:text-cyan-800"
        >
          <Plus size={14} /> הוסף מבחן
        </button>
      </div>

      {tests.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">
          לא הוגדרו מבחנים. לחצו &quot;הוסף מבחן&quot; להגדרת סף כשירות.
        </p>
      )}

      {tests.map((test, idx) => (
        <div key={test.id} className="bg-slate-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">מבחן {idx + 1}</span>
            <button onClick={() => removeTest(idx)} className="text-red-400 hover:text-red-600">
              <Trash2 size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 mb-1 block">שם המבחן</label>
              <input
                value={test.label}
                onChange={e => updateTest(idx, { label: e.target.value })}
                placeholder='לדוגמה: ריצת 3 ק"מ'
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 mb-1 block">מדד</label>
              <select
                value={test.metric}
                onChange={e => {
                  const opt = METRIC_OPTIONS.find(o => o.value === e.target.value);
                  updateTest(idx, {
                    metric: e.target.value,
                    unit: opt?.unit ?? 'reps',
                    lowerIsBetter: e.target.value === 'cardio_minutes',
                  });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                {METRIC_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 mb-1 block">
                סף ירוק ({test.lowerIsBetter ? 'מתחת ל' : 'מעל'})
              </label>
              <input
                type="number"
                dir="ltr"
                value={test.passThreshold}
                onChange={e => updateTest(idx, { passThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 mb-1 block">
                סף צהוב ({test.lowerIsBetter ? 'מתחת ל' : 'מעל'})
              </label>
              <input
                type="number"
                dir="ltr"
                value={test.yellowThreshold}
                onChange={e => updateTest(idx, { yellowThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? 'שומר...' : 'שמור הגדרות'}
      </button>
    </div>
  );
}

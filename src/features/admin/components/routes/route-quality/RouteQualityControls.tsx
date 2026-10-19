'use client';
import { Loader2, Play, Square } from 'lucide-react';
import type { ActivityType } from '@/features/parks';
import { QUALITY_CITY_NAMES, QUALITY_START_PRESETS } from './presets';
import type { QualityVariant } from './types';

export interface QualityControlsValue {
  presetId: string | null;
  start: { lat: number; lng: number };
  cityName: string;
  targetKm: number;
  activity: ActivityType;
  runs: number;
  mode: 'ab' | QualityVariant;
}

const input = 'w-full px-3 py-2 bg-gray-50 rounded-xl border-2 border-transparent focus:border-cyan-400 focus:bg-white outline-none text-sm';
const label = 'block text-xs font-bold text-gray-500 mb-1';

export function RouteQualityControls({ value, onChange, running, onRun, onCancel, flagNote }: {
  value: QualityControlsValue; onChange: (v: QualityControlsValue) => void;
  running: boolean; onRun: () => void; onCancel: () => void; flagNote: string;
}) {
  const set = (patch: Partial<QualityControlsValue>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div>
        <span className={label}>נקודת התחלה</span>
        <select
          className={input}
          value={value.presetId ?? ''}
          onChange={e => {
            const p = QUALITY_START_PRESETS.find(x => x.id === e.target.value);
            if (p) set({ presetId: p.id, start: { lat: p.lat, lng: p.lng }, cityName: p.cityName });
          }}
        >
          <option value="" disabled>נקודה מהמפה ({value.start.lat.toFixed(4)}, {value.start.lng.toFixed(4)})</option>
          {QUALITY_START_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">או לחיצה על המפה</p>
      </div>
      <div>
        <span className={label}>עיר (למקטעי הרחוב)</span>
        <select className={input} value={value.cityName} onChange={e => set({ cityName: e.target.value })}>
          {QUALITY_CITY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label><span className={label}>יעד ק״מ</span>
          <input type="number" min={1} max={30} step={0.5} className={input} value={value.targetKm} onChange={e => set({ targetKm: Number(e.target.value) || 3 })} />
        </label>
        <label><span className={label}>פעילות</span>
          <select className={input} value={value.activity} onChange={e => set({ activity: e.target.value as ActivityType })}>
            <option value="running">ריצה</option><option value="walking">הליכה</option><option value="cycling">אופניים</option>
          </select>
        </label>
        <label><span className={label}>הרצות</span>
          <input type="number" min={1} max={10} className={input} value={value.runs} onChange={e => set({ runs: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
        </label>
      </div>
      <div className="flex items-center gap-1 bg-gray-100 rounded-2xl p-1">
        {([['ab', 'השוואה'], ['off', 'נוכחי'], ['on', 'v1']] as const).map(([k, t]) => (
          <button key={k} onClick={() => set({ mode: k })}
            className={`flex-1 px-3 py-1.5 rounded-xl text-sm font-bold transition-all ${value.mode === k ? 'bg-white shadow-sm text-cyan-600' : 'text-gray-500'}`}>{t}</button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed">{flagNote}</p>
      {running ? (
        <button onClick={onCancel} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 text-white font-bold text-sm">
          <Loader2 size={16} className="animate-spin" /> <Square size={12} /> עצור
        </button>
      ) : (
        <button onClick={onRun} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm">
          <Play size={16} /> הרץ
        </button>
      )}
    </div>
  );
}

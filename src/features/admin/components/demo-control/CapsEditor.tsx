'use client';
/**
 * /admin/demo — caps + price table editor (PUT /api/admin/demo/config). Prices are
 * placeholders the owner fills from the provider's current price page ($ per million
 * tokens); an empty field = not set. Nothing here ships real prices.
 */
import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button, Panel } from '@/features/admin/components/ui';
import type { DemoCaps, DemoConfig, ModelPrice } from '@/lib/demo-control/usage-cost';
import { demoFetch, readError } from './demo-client';

type Row = { model: string; input: string; output: string; cached: string };
type CapsForm = Record<keyof DemoCaps, string>;

const CAP_FIELDS: Array<{ key: keyof DemoCaps; label: string; unit: string }> = [
  { key: 'dailyUsdCap', label: 'תקרה יומית', unit: '$' },
  { key: 'monthlyUsdCap', label: 'תקרה חודשית', unit: '$' },
  { key: 'maxTesterSessionsPerDay', label: 'סיורי בודקים ביום', unit: 'מקס׳' },
  { key: 'maxLlmCallsPerDay', label: 'קריאות AI ביום', unit: 'מקס׳' },
];

const str = (v: number | null) => (v === null ? '' : String(v));
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

function toForm(config: DemoConfig): { caps: CapsForm; rows: Row[] } {
  return {
    caps: Object.fromEntries(CAP_FIELDS.map((f) => [f.key, str(config.caps[f.key])])) as CapsForm,
    rows: Object.entries(config.prices).map(([model, p]) => ({
      model,
      input: str(p.inputPerMTok),
      output: str(p.outputPerMTok),
      cached: str(p.cachedPerMTok),
    })),
  };
}

const inputCls = 'h-10 w-full rounded-xl bg-white px-3 text-[14px] text-slate-900 ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400';

export default function CapsEditor({ config, onSaved }: { config: DemoConfig; onSaved: () => void }) {
  const [form, setForm] = useState(() => toForm(config));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Follow the server while the owner isn't editing (the status poll refreshes `config`).
  useEffect(() => {
    if (!dirty) setForm(toForm(config));
  }, [config, dirty]);

  const edit = (fn: (f: typeof form) => typeof form) => {
    setForm(fn);
    setDirty(true);
    setMsg(null);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const prices: Record<string, ModelPrice> = {};
      for (const r of form.rows) {
        const model = r.model.trim();
        if (!model) continue;
        prices[model] = { inputPerMTok: numOrNull(r.input), outputPerMTok: numOrNull(r.output), cachedPerMTok: numOrNull(r.cached) };
      }
      const caps = Object.fromEntries(CAP_FIELDS.map((f) => [f.key, numOrNull(form.caps[f.key])]));
      const res = await demoFetch('/api/admin/demo/config', { method: 'PUT', body: JSON.stringify({ caps, prices }) });
      if (!res.ok) throw new Error(await readError(res));
      setDirty(false);
      setMsg({ ok: true, text: 'נשמר' });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'השמירה נכשלה' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="תקרות ומחירים">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CAP_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block whitespace-nowrap text-[13px] font-extrabold text-slate-700">
              {f.label} <span className="font-bold text-slate-400">({f.unit})</span>
            </span>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              dir="ltr"
              placeholder="לא הוגדר"
              className={inputCls}
              value={form.caps[f.key]}
              onChange={(e) => edit((s) => ({ ...s, caps: { ...s.caps, [f.key]: e.target.value } }))}
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-slate-500">ריק = בלי תקרה. 0 = לא להריץ בכלל. כשמגיעים לתקרה, המנוע והבודקים עוצרים עד מחר (או עד החודש הבא).</p>

      <h3 className="mt-5 text-[15px] font-black text-slate-900">מחירים לפי מודל ($ למיליון טוקנים)</h3>
      <p className="text-[12px] text-slate-500">מלאו מדף המחירים העדכני של הספק. מזהה המודל צריך להיות זהה למה שהמנוע רושם בשימוש.</p>
      <div className="mt-2 space-y-2">
        {form.rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_repeat(3,minmax(70px,110px))_40px] items-center gap-2">
            {(['model', 'input', 'output', 'cached'] as const).map((k) => (
              <input
                key={k}
                aria-label={{ model: 'מזהה מודל', input: 'קלט', output: 'פלט', cached: 'קלט מה-cache' }[k]}
                placeholder={{ model: 'מזהה מודל', input: 'קלט', output: 'פלט', cached: 'cache' }[k]}
                type={k === 'model' ? 'text' : 'number'}
                min={0}
                step="any"
                dir="ltr"
                className={inputCls}
                value={r[k]}
                onChange={(e) => edit((s) => ({ ...s, rows: s.rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }))}
              />
            ))}
            <button
              type="button"
              aria-label="הסר מודל"
              className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-500 ring-1 ring-inset ring-slate-200 active:scale-[0.97]"
              onClick={() => edit((s) => ({ ...s, rows: s.rows.filter((_, j) => j !== i) }))}
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => edit((s) => ({ ...s, rows: [...s.rows, { model: '', input: '', output: '', cached: '' }] }))}>
          <Plus size={14} aria-hidden /> הוסף מודל
        </Button>
        <Button onClick={save} disabled={saving || !dirty}>
          <Save size={14} aria-hidden /> {saving ? 'שומר…' : 'שמור'}
        </Button>
        {msg && <span className={`text-[13px] font-bold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</span>}
      </div>
    </Panel>
  );
}

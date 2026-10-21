'use client';
/**
 * "הערות בעלים לבודקים" — a free Hebrew note (+ optional screen + severity) becomes an OWN-1xx
 * rule the AI testers check first at their next run; below it, the notes so far and what the
 * testers learned from "לא רלוונטי" marks.
 */
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Panel, StatusPill } from '@/features/admin/components/ui';
import { QA_SEVERITIES, type QaSeverity } from '@/lib/demo-control/qa-summary';
import { NOTE_TEXT_MAX } from '@/lib/demo-control/owner-rules-model';
import { useOwnerNotes } from './useOwnerNotes';

const inputCls =
  'h-10 w-full rounded-xl bg-white px-3 text-[14px] text-slate-900 ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400';

export default function OwnerNotesPanel({ enabled }: { enabled: boolean }) {
  const { notes, learned, error, saving, add } = useOwnerNotes(enabled);
  const [text, setText] = useState('');
  const [screen, setScreen] = useState('');
  const [severity, setSeverity] = useState<QaSeverity>('P2');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    setMsg(null);
    const err = await add({ text: text.trim(), screen: screen.trim() || null, severity });
    if (err) setMsg({ ok: false, text: err });
    else {
      setText('');
      setScreen('');
      setMsg({ ok: true, text: 'נשמר. הבודקים יקבלו את ההערה בריצה הבאה.' });
    }
  };

  return (
    <Panel title="הערות בעלים לבודקים">
      <details>
        <summary className="cursor-pointer text-[14px] font-extrabold text-slate-800">
          הוסף הערה ({notes.length} הערות{learned.some((g) => g.suppressed) ? ` · ${learned.filter((g) => g.suppressed).length} השתקות` : ''})
        </summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[13px] font-extrabold text-slate-700">ההערה</span>
            <textarea
              className="min-h-[80px] w-full rounded-xl bg-white px-3 py-2 text-[14px] text-slate-900 ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              maxLength={NOTE_TEXT_MAX}
              value={text}
              placeholder="למשל: בכרטיס הריצה במפה, המיקום שלי חייב להיראות מעל הכרטיס"
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[13px] font-extrabold text-slate-700">מסך (לא חובה)</span>
              <input className={inputCls} dir="ltr" value={screen} placeholder="home_today או /map" onChange={(e) => setScreen(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-extrabold text-slate-700">חומרה</span>
              <select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value as QaSeverity)}>
                {QA_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={saving || text.trim().length < 4} onClick={() => void submit()}>
              <Plus size={14} aria-hidden /> {saving ? 'שומר…' : 'הוסף לחוקי הבעלים'}
            </Button>
            {msg && <span className={`text-[13px] font-bold ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</span>}
          </div>
          {error && <p className="text-[13px] font-bold text-amber-700">{error}</p>}

          {notes.length > 0 && (
            <ul className="space-y-1.5">
              {notes.map((n) => (
                <li key={n.id} className="flex flex-wrap items-baseline gap-2 text-[14px] text-slate-700">
                  <span className="whitespace-nowrap text-[12px] font-extrabold text-slate-500" dir="ltr">
                    {n.id}
                  </span>
                  <StatusPill tone={n.severity === 'P0' || n.severity === 'P1' ? 'bad' : n.severity === 'P2' ? 'warn' : 'neutral'}>{n.severity}</StatusPill>
                  <span className="min-w-0 flex-1">{n.text}</span>
                  {n.screen && (
                    <span className="whitespace-nowrap text-[12px] font-bold text-slate-400" dir="ltr">
                      {n.screen}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {learned.length > 0 && (
            <div>
              <h4 className="text-[13px] font-extrabold text-slate-700">מה הבודקים למדו מ״לא רלוונטי״</h4>
              <ul className="mt-1 space-y-1 text-[13px] text-slate-600">
                {learned.slice(0, 20).map((g) => (
                  <li key={`${g.rule}|${g.screen}`}>
                    <b className="font-extrabold">{g.suppressed ? 'מושתק' : 'הבהרה'}</b> · <span dir="ltr">{g.rule}</span> · <span dir="ltr">{g.screen}</span> · {g.count} פעמים
                    {g.reasons.length ? ` · ${g.reasons.join(' / ')}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </Panel>
  );
}

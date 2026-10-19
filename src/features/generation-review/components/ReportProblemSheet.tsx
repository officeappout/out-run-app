'use client';
/**
 * "דווח על בעיה" — reason chips + an optional note, attached to the generated session the user is
 * looking at (generation_log/{id}). When that session was not sampled, its on-device summary is
 * sent with the report so the report still lands. No screenshot (v1).
 */
import { useState } from 'react';
import Sheet from '@/components/ui/v2/Sheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { REPORT_NOTE_MAX, REPORT_REASONS, REPORT_REASON_LABEL_HE, type GenerationType, type ReportReason } from '@/lib/generation-review/types';
import { postGenerationReview } from '../capture/api';
import { latest } from '../capture/memory';

export default function ReportProblemSheet({ open, onClose, types }: { open: boolean; onClose: () => void; types: GenerationType[] }) {
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'none'>('idle');

  const toggle = (r: ReportReason) => setReasons((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  const send = async () => {
    const session = latest((r) => types.includes(r.draft.type));
    if (!session) {
      setState('none');
      return;
    }
    setState('sending');
    const res = await postGenerationReview('report', {
      id: session.draft.id,
      reasons,
      note: note.trim() || null,
      ...(session.stored ? {} : { draft: session.draft }),
    });
    setState(res.ok ? 'sent' : 'error');
    if (res.ok) {
      setTimeout(() => {
        onClose();
        setReasons([]);
        setNote('');
        setState('idle');
      }, 1200);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="דווח על בעיה" zIndex={SHEET_Z.overlay} layout="nested" scroll="body">
      <div className="px-4 pb-6 space-y-4" dir="rtl">
        <p className="text-sm text-slate-500">מה לא הסתדר באימון או במסלול? זה עוזר לנו לשפר את מה שהאפליקציה בונה.</p>
        <div className="flex flex-wrap gap-2">
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggle(r)}
              aria-pressed={reasons.includes(r)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${reasons.includes(r) ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700 border-slate-200'}`}
            >
              {REPORT_REASON_LABEL_HE[r]}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, REPORT_NOTE_MAX))}
          rows={3}
          placeholder="רוצה להוסיף משהו? (לא חובה)"
          className="w-full rounded-xl border border-slate-200 p-3 text-base"
        />
        {state === 'none' && <p className="text-sm text-amber-700">לא מצאנו את האימון הזה. נסה לפתוח אותו שוב.</p>}
        {state === 'error' && <p className="text-sm text-red-600">השליחה נכשלה. נסה שוב.</p>}
        {state === 'sent' && <p className="text-sm text-emerald-700">תודה! הדיווח נשלח.</p>}
        <button
          type="button"
          disabled={reasons.length === 0 || state === 'sending' || state === 'sent'}
          onClick={() => void send()}
          className="w-full rounded-xl bg-sky-600 py-3 text-white font-bold disabled:opacity-40"
        >
          {state === 'sending' ? 'שולח…' : 'שליחה'}
        </button>
      </div>
    </Sheet>
  );
}

'use client';
/** One flagged session row (collapsed summary + expandable preview + actions). */
import { useState } from 'react';
import { CheckCircle2, ChevronDown, FlaskConical, RotateCcw } from 'lucide-react';
import { RULE_BY_ID } from '@/lib/generation-review/invariants';
import { GENERATION_TYPE_LABEL_HE } from '@/lib/generation-review/types';
import type { FlaggedRow } from '@/lib/generation-review/review/list';
import SessionPreview from './SessionPreview';

const SEVERITY_CLASS: Record<number, string> = {
  0: 'bg-slate-100 text-slate-600',
  1: 'bg-slate-100 text-slate-600',
  2: 'bg-amber-100 text-amber-800',
  3: 'bg-red-100 text-red-700',
};
const STATUS_HE: Record<FlaggedRow['status'], string> = { open: 'פתוח', fixed: 'תוקן', fixture: 'הפך לבדיקה' };

export default function FlaggedRowItem({ row, busy, onAction }: {
  row: FlaggedRow;
  busy: boolean;
  onAction: (action: 'mark_fixed' | 'reopen' | 'fixture') => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 p-3 text-start hover:bg-slate-50">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${SEVERITY_CLASS[row.maxSeverity] ?? SEVERITY_CLASS[0]}`}>{row.reports.length && !row.findings.length ? 'דיווח' : `חומרה ${row.maxSeverity}`}</span>
        <span className="text-sm font-bold text-slate-800">{GENERATION_TYPE_LABEL_HE[row.type] ?? row.type}</span>
        <span className="text-xs text-slate-500 truncate flex-1">
          {row.ruleIds.map((r) => RULE_BY_ID[r as keyof typeof RULE_BY_ID]?.titleHe ?? r).join(' · ')}
          {row.reports.length ? ` · ${row.reports.length} דיווחים` : ''}
        </span>
        <span className="text-xs text-slate-400">{row.day}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded ${row.status === 'open' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>{STATUS_HE[row.status]}</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <SessionPreview row={row} />
          <div className="flex gap-2 p-3 border-t border-slate-200">
            {row.status === 'open' ? (
              <button disabled={busy} onClick={() => onAction('mark_fixed')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg disabled:opacity-50">
                <CheckCircle2 size={14} /> סמן כתוקן
              </button>
            ) : (
              <button disabled={busy} onClick={() => onAction('reopen')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50">
                <RotateCcw size={14} /> פתח מחדש
              </button>
            )}
            <button disabled={busy} onClick={() => onAction('fixture')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg disabled:opacity-50">
              <FlaskConical size={14} /> הפוך לבדיקת רגרסיה
            </button>
          </div>
        </>
      )}
    </li>
  );
}

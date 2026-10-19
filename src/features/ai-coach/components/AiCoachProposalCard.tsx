'use client';

/**
 * Kelly phase 2 — the schedule change card under Kelly's reply (flag ai_coach_phase2).
 * Nothing is saved until the user taps "אשר"; "בטל" dismisses. The write itself is the
 * existing schedule-builder save path (services/schedule-proposal-api.ts).
 */
import React, { useState } from 'react';
import { CalendarCheck, CalendarDays, Check, Loader2 } from 'lucide-react';
import type { ProposalStatus, ProposalView } from '@/lib/ai/coach/schedule-proposal/types';
import { confirmScheduleProposal, dismissScheduleProposal, type ProposalOutcome } from '../services/schedule-proposal-api';

const NOTE: Partial<Record<ProposalOutcome, string>> = {
  stale: 'הלו״ז השתנה מאז שההצעה הוכנה, אז היא לא נשמרה. אפשר לבקש מקלי הצעה חדשה.',
  expired: 'ההצעה כבר לא בתוקף. אפשר לבקש מקלי הצעה חדשה.',
  busy: 'השמירה כבר בתהליך, עוד רגע.',
  failed: 'השמירה לא הצליחה. אפשר לנסות שוב.',
  offline: 'אין חיבור. אפשר לאשר כשהחיבור יחזור.',
};

export default function AiCoachProposalCard({
  messageId,
  proposal,
  disabled,
  onStatus,
  onSaved,
}: {
  messageId: string;
  proposal: ProposalView;
  disabled?: boolean;
  onStatus: (status: ProposalStatus) => void;
  /** After a successful write (e.g. refresh the profile so home shows the new week). */
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState<'confirm' | 'dismiss' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const status = proposal.status;

  const confirm = async () => {
    if (busy) return;
    setBusy('confirm');
    setNote(null);
    onStatus('applying');
    const r = await confirmScheduleProposal(messageId, proposal.id);
    setBusy(null);
    if (r === 'applied') {
      onStatus('applied');
      onSaved?.();
    } else if (r === 'dismissed') {
      onStatus('dismissed');
    } else {
      onStatus(r === 'busy' ? 'applying' : 'pending');
      setNote(NOTE[r] ?? NOTE.failed!);
    }
  };

  const dismiss = async () => {
    if (busy) return;
    setBusy('dismiss');
    const r = await dismissScheduleProposal(messageId, proposal.id);
    setBusy(null);
    if (r === 'dismissed') onStatus('dismissed');
    else setNote(NOTE[r] ?? NOTE.failed!);
  };

  const done = status === 'applied';
  const closed = status === 'dismissed';
  return (
    <div className="mt-2 w-[min(320px,80vw)] rounded-2xl border border-cyan-100 bg-white p-3.5 text-right shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cyan-50 text-cyan-600">
          {done ? <CalendarCheck className="h-4 w-4" aria-hidden /> : <CalendarDays className="h-4 w-4" aria-hidden />}
        </span>
        <p className="text-[13.5px] font-black text-gray-900">{proposal.title}</p>
      </div>
      <ul className="mt-2 space-y-1">
        {proposal.lines.map((l) => (
          <li key={l} className="text-[13px] leading-snug text-gray-700">
            {l}
          </li>
        ))}
      </ul>
      {done ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-bold text-emerald-700">
          <Check className="h-4 w-4" aria-hidden />
          נשמר בלו״ז
        </p>
      ) : closed ? (
        <p className="mt-3 text-[12.5px] font-semibold text-gray-400">בוטל. הלו״ז נשאר כמו שהיה.</p>
      ) : (
        <>
          <p className="mt-2 text-[11.5px] font-semibold text-gray-400">שום דבר לא משתנה עד שמאשרים.</p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={disabled || !!busy || status === 'applying'}
              className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full bg-cyan-500 px-4 text-[13.5px] font-black text-white transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              {busy === 'confirm' || status === 'applying' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              אשר
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={disabled || !!busy || status === 'applying'}
              className="min-h-[40px] rounded-full bg-gray-100 px-4 text-[13.5px] font-black text-gray-700 transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              בטל
            </button>
          </div>
        </>
      )}
      {note && <p className="mt-2 text-[12px] font-semibold text-amber-700">{note}</p>}
    </div>
  );
}

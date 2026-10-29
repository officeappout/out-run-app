'use client';

/**
 * "דגשי האימון" — the coach note block on the workout overview.
 * Renders nothing unless the note is on (enable_workout_coach_note_v1 or the WORKOUT_COACH_NOTE_V1
 * constant, useWorkoutCoachNoteV1) AND the record yields a
 * 2–4 sentence note (callers use `useCoachNote` to decide whether to hide the
 * old logicCue line, so both stay in sync).
 */

import React, { useMemo } from 'react';
import { useWorkoutCoachNoteV1 } from '@/hooks/useWorkoutCoachNoteV1';
import { renderCoachNote } from '../services/coach-note';
import type { DecisionRecord } from '../services/decision-record';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

/** The note text, or '' when the flag is off / nothing trustworthy to say. */
export function useCoachNote(record: DecisionRecord | null | undefined): string {
  const on = useWorkoutCoachNoteV1();
  return useMemo(() => {
    if (!on || !record) return '';
    try {
      return renderCoachNote(record);
    } catch {
      return '';
    }
  }, [on, record]);
}

export default function CoachNoteBlock({
  note,
  v2 = false,
  className = '',
}: {
  note: string;
  v2?: boolean;
  className?: string;
}) {
  const t = useT(player);
  if (!note) return null;
  return (
    <section className={`text-start ${className}`} aria-label={t('coachNote.title')}>
      <h3
        className={`${v2 ? 'text-[16px] font-black text-[#0e1419]' : 'text-[15px] font-semibold text-slate-900'} dark:text-white mb-1.5`}
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        {t('coachNote.title')}
      </h3>
      <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">{note}</p>
    </section>
  );
}

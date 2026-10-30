'use client';

/**
 * "דגשי האימון" — the coach note block on the workout overview.
 * Renders nothing unless the note is on (enable_workout_coach_note_v1 or the WORKOUT_COACH_NOTE_V1
 * constant, useWorkoutCoachNoteV1) AND the record yields a
 * 2–4 sentence note (callers use `useCoachNote` to decide whether to hide the
 * old logicCue line, so both stay in sync).
 */

import React, { useEffect, useMemo } from 'react';
import { useWorkoutCoachNoteV1 } from '@/hooks/useWorkoutCoachNoteV1';
import { renderCoachNote } from '../services/coach-note';
import type { DecisionRecord } from '../services/decision-record';
import { useT } from '@/hooks/useT';
import { useLocaleStore } from '@/store/useLocaleStore';
import { ensureCatalog } from '@/lib/i18n/catalogs';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { coach } from '@/messages/ns/coach';
import { player } from '@/messages/ns/player';

/** The note text, or '' when the flag is off / nothing trustworthy to say. */
export function useCoachNote(record: DecisionRecord | null | undefined): string {
  const on = useWorkoutCoachNoteV1();
  const locale = useLocaleStore((s) => s.locale);
  const catalogVersion = useLocaleStore((s) => s.catalogVersion);
  // The note is rendered from the saved decision record on every open, so it follows the UI language
  // (the stored record has no text). A catalog that is not loaded yet renders Hebrew until it lands.
  useEffect(() => {
    if (locale !== SOURCE_LOCALE) void ensureCatalog(locale, coach.name);
  }, [locale]);
  return useMemo(() => {
    if (!on || !record) return '';
    try {
      return renderCoachNote(record, { locale });
    } catch {
      return '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, record, locale, catalogVersion]);
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

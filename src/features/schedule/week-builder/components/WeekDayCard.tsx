'use client';

/**
 * One day of the week builder (boards S-2c…S-2g): the shared WeekDayRow (tap the date to edit
 * the day), the day's sessions with their drag handles ("1 מתוך 2" on a double day), and the
 * engine's "why" under them. Empty days read "מנוחה" (open) or "לא פנוי" (closed). The row
 * lights up while a dragged session hovers it.
 */
import { Sparkles } from 'lucide-react';
import { WeekDayRow } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import { dayNameHe } from '../../engine-v2/reasonsV2';
import { DAY_LETTERS_HE } from '../../utils/runWeekRecommendation';
import { inTab, type WbTab } from '../summary';
import type { WbDay } from '../types';
import WeekSessionCard from './WeekSessionCard';

export interface WeekDayCardProps {
  day: WbDay;
  date: number;
  tab: WbTab;
  hovered: boolean;
  /** Just changed by Kelly's builder proposal (a short tint). */
  highlighted?: boolean;
  rowRef: (el: HTMLElement | null) => void;
  onEdit: () => void;
  onDragMove: (clientY: number | null) => void;
  onDrop: (sessionId: string, clientY: number | null) => void;
}

export default function WeekDayCard({ day, date, tab, hovered, highlighted = false, rowRef, onEdit, onDragMove, onDrop }: WeekDayCardProps) {
  const t = useT(schedule);
  const shown = day.sessions.filter((s) => inTab(tab, s.track));
  const total = day.sessions.length;
  return (
    <div
      ref={rowRef}
      data-dow={day.dow}
      className={`transition-colors duration-150 ease-v2 first:rounded-t-[22px] last:rounded-b-[22px] ${day.dow > 0 ? 'border-t border-v2-hairline' : ''} ${hovered || highlighted ? 'bg-v2-tint/70' : ''}`}
    >
      <WeekDayRow
        letter={DAY_LETTERS_HE[day.dow]}
        date={date}
        muted={total === 0}
        emptyLabel={day.past ? t('weekBuilder.past') : day.open ? t('weekBuilder.rest') : t('weekBuilder.notFree')}
        onDateTap={onEdit}
        dateAriaLabel={t('weekBuilder.dateAria', { day: dayNameHe(day.dow) })}
      >
        {shown.length > 0 ? (
          <>
            {shown.map((s) => (
              <WeekSessionCard
                key={s.id}
                session={s}
                dow={day.dow}
                past={day.past}
                counterHe={total > 1 ? t('weekBuilder.double', { n: String(day.sessions.indexOf(s) + 1), total: String(total) }) : null}
                draggable={!s.locked}
                onDragMove={onDragMove}
                onDrop={(y) => onDrop(s.id, y)}
              />
            ))}
            {day.whyHe && (
              <p className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-bold text-v2-deep">
                <Sparkles size={12} strokeWidth={2.2} aria-hidden className="shrink-0" />
                <span className="truncate">{day.whyHe}</span>
              </p>
            )}
          </>
        ) : null}
      </WeekDayRow>
    </div>
  );
}

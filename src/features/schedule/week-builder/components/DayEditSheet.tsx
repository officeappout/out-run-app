'use client';

/**
 * Tap a date → edit that day (board S-2c): its time of day (when the host lets the window
 * change) and "move to another day" for each of its sessions — the same engine-validated
 * move as a drag, for anyone who'd rather tap than drag. An empty open day offers to bring a
 * session here. A refused move shows the engine's short reason in place.
 */
import { useState } from 'react';
import { Sun, Sunrise, Sunset } from 'lucide-react';
import { Sheet } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import type { TimeWindow } from '../../engine-v2/types';
import { dayNameHe } from '../../engine-v2/reasonsV2';
import { DAY_LETTERS_HE, RUN_TIME_PRESETS, TIME_WINDOWS } from '../../utils/runWeekRecommendation';
import type { WbMove, WbWeek } from '../types';

const WINDOW_ICON: Record<TimeWindow, typeof Sun> = { morning: Sunrise, noon: Sun, evening: Sunset };

const chipCls = (on: boolean) =>
  `inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
    on ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
  }`;

export interface DayEditSheetProps {
  week: WbWeek;
  dow: number | null;
  dates: number[];
  onClose: () => void;
  /** Returns the refusal reason, or null when the move landed. */
  onMove: (move: WbMove) => string | null;
  /** Absent = the time of day is not editable here. */
  onWindow?: (dow: number, w: TimeWindow) => void;
}

export default function DayEditSheet({ week, dow, dates, onClose, onMove, onWindow }: DayEditSheetProps) {
  const t = useT(schedule);
  const [refusal, setRefusal] = useState<string | null>(null);
  const day = dow == null ? null : week.days[dow];
  const movable = day?.sessions.filter((s) => !s.locked) ?? [];
  const incoming = day && day.open && day.sessions.length === 0 ? week.days.flatMap((d) => d.sessions.filter((s) => !s.locked)) : [];
  const targets = week.days.filter((d) => d.open && d.dow !== dow);

  const move = (m: WbMove) => {
    const reason = onMove(m);
    setRefusal(reason);
    if (!reason) onClose();
  };
  const close = () => {
    setRefusal(null);
    onClose();
  };

  return (
    <Sheet
      open={day != null}
      onClose={close}
      title={day ? t('weekBuilder.edit.title', { day: dayNameHe(day.dow), date: String(dates[day.dow] ?? '') }) : ''}
      ariaLabel={day ? t('weekBuilder.edit.title', { day: dayNameHe(day.dow), date: String(dates[day.dow] ?? '') }) : undefined}
    >
      {day && (
        <div dir="rtl" className="flex flex-col gap-4 px-5 pb-6 font-simpler text-v2-ink">
          {!day.open && <p className="text-[13.5px] font-bold text-v2-muted">{t('weekBuilder.edit.closed')}</p>}

          {onWindow && day.open && day.sessions.length > 0 && (
            <section>
              <p className="mb-2 text-[13px] font-extrabold text-v2-muted">{t('weekBuilder.edit.time')}</p>
              <div className="flex gap-1.5" role="radiogroup" aria-label={t('weekBuilder.edit.time')}>
                {TIME_WINDOWS.map((w) => {
                  const Icon = WINDOW_ICON[w];
                  return (
                    <button key={w} type="button" role="radio" aria-checked={day.window === w} onClick={() => onWindow(day.dow, w)} className={chipCls(day.window === w)}>
                      <Icon size={14} strokeWidth={2.2} aria-hidden />
                      {RUN_TIME_PRESETS[w].label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {movable.map((s) => (
            <section key={s.id}>
              <p className="mb-2 truncate text-[13px] font-extrabold text-v2-muted">{t('weekBuilder.edit.moveTo', { title: s.titleHe })}</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {targets.map((d) => (
                  <button key={d.dow} type="button" onClick={() => move({ sessionId: s.id, toDow: d.dow })} className={chipCls(false)}>
                    {/* i18n-allow-hebrew: weekday letter (wave 3) */}{DAY_LETTERS_HE[d.dow]}׳
                  </button>
                ))}
              </div>
            </section>
          ))}

          {incoming.length > 0 && (
            <section>
              <p className="mb-2 text-[13px] font-extrabold text-v2-muted">{t('weekBuilder.edit.bringHere')}</p>
              <div className="flex flex-wrap gap-1.5">
                {incoming.map((s) => (
                  <button key={s.id} type="button" onClick={() => move({ sessionId: s.id, toDow: day.dow })} className={chipCls(false)}>
                    {s.titleHe}
                  </button>
                ))}
              </div>
            </section>
          )}

          {day.open && movable.length === 0 && incoming.length === 0 && (
            <p className="text-[13.5px] font-bold text-v2-muted">{t('weekBuilder.edit.nothing')}</p>
          )}

          {refusal && (
            <p role="status" className="rounded-[14px] bg-amber-50 px-3.5 py-2.5 text-[13px] font-bold text-amber-800">
              {t('weekBuilder.refused', { reason: refusal })}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

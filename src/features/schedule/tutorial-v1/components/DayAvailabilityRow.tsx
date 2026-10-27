'use client';

/**
 * One day of ל3 (boards SchedDays / SchedDaysPro, S-2b rows): weekday + date, then either the
 * morning / noon / evening chips and the check (free day) or "לא פנוי" and a plus.
 * Tapping the selected chip again opens an exact time for that day only.
 */
import { Check, Clock, Pencil, Plus } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import { TIME_WINDOWS } from '@/features/schedule/utils/runWeekRecommendation';
import { WINDOW_ICON } from '@/features/schedule/utils/timeWindowIcons';
import { timeOfChoice, type DayChoice } from '../model/days';

export interface DayAvailabilityRowProps {
  dayLabel: string;
  dayName: string;
  dayOfMonth: number;
  first: boolean;
  choice: DayChoice | undefined;
  editingTime: boolean;
  onToggle: () => void;
  onWindow: (w: TimeWindow) => void;
  onTime: (time: string) => void;
  onTimeDone: () => void;
}

const CHIP = 'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13.5px] transition-transform duration-150 ease-v2 active:scale-[0.97]';

export default function DayAvailabilityRow(p: DayAvailabilityRowProps) {
  const t = useT(schedule);
  const on = !!p.choice;
  return (
    <div className={`flex items-center gap-3 px-3 py-2 ${p.first ? '' : 'border-t border-v2-hairline'} ${on ? 'min-h-[64px] bg-v2-tint/70' : 'min-h-[56px]'}`}>
      <div className="w-10 shrink-0 text-center">
        <span className="block text-[12px] font-extrabold text-v2-muted">{p.dayLabel}</span>
        <span className={`mx-auto mt-0.5 grid h-8 w-8 place-items-center text-[16px] font-black tabular-nums ${on ? 'text-v2-ink' : 'text-v2-muted'}`}>{p.dayOfMonth}</span>
      </div>
      <span aria-hidden className="h-9 w-px shrink-0 bg-v2-hairline" />
      {p.choice ? (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex min-w-0 gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label={t('tutorial.days.windowAria', { day: p.dayName })}>
            {TIME_WINDOWS.map((w) => {
              const sel = p.choice!.window === w;
              if (sel && p.editingTime) {
                return (
                  <input
                    key={w}
                    type="time"
                    dir="ltr"
                    autoFocus
                    aria-label={t('tutorial.days.timeAria', { day: p.dayName })}
                    defaultValue={timeOfChoice(p.choice!)}
                    onChange={(e) => p.onTime(e.target.value)}
                    onBlur={p.onTimeDone}
                    className="h-8 w-[92px] shrink-0 rounded-full bg-v2-tint px-2.5 text-[13.5px] font-black text-v2-deep ring-[1.5px] ring-inset ring-v2-accent"
                  />
                );
              }
              const Icon = WINDOW_ICON[w];
              const exact = sel && p.choice!.time;
              return (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => p.onWindow(w)}
                  className={`${CHIP} ${
                    exact ? 'bg-v2-tint px-2.5 font-black text-v2-deep ring-[1.5px] ring-inset ring-v2-accent'
                      : sel ? 'bg-v2-tint font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40'
                        : 'bg-white font-extrabold text-v2-ink-2 shadow-v2-ring'
                  }`}
                >
                  {exact ? (
                    <>
                      <Clock size={13} strokeWidth={2.3} aria-hidden />
                      <span dir="ltr">{p.choice!.time}</span>
                      <Pencil size={11} strokeWidth={2.4} aria-hidden />
                    </>
                  ) : (
                    <>
                      <Icon size={13} strokeWidth={2.3} aria-hidden />
                      {t('tutorial.days.window', { window: w })}
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <span className="flex-1" />
          <button
            type="button"
            onClick={p.onToggle}
            aria-label={t('tutorial.days.removeAria', { day: p.dayName })}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-v2-accent text-white transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <Check size={15} strokeWidth={3} aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={p.onToggle}
          aria-label={t('tutorial.days.addAria', { day: p.dayName })}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-start"
        >
          <span className="whitespace-nowrap text-[13.5px] font-bold text-v2-muted">{t('tutorial.days.notFree')}</span>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-v2-deep ring-1 ring-inset ring-v2-pill-border">
            <Plus size={16} strokeWidth={2.6} aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}

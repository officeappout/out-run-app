'use client';

/**
 * ל3 / ל3ב (boards SchedDays / SchedDaysPro): which days, the part of the day per day (exact time on a
 * second tap), "כמה זמן לאימון?", the smart note, and only when the user runs: "two workouts the same
 * day" and the long-run day. The container owns the state; this screen only draws it.
 */
import type { ReactNode } from 'react';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import { common } from '@/messages/ns/common';
import { weekdayLabel, withUnit } from '@/lib/i18n/units';
import StickyActionButton from '@/components/ui/StickyActionButton';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import { SESSION_MINUTES, freeDays, type DaysState } from '../model/days';
import DayAvailabilityRow from './DayAvailabilityRow';
import LemurNote from './LemurNote';
import StepBars from './StepBars';

export interface SchedDaysStepProps {
  step: number;
  total: number;
  /** Display order of the days (the coming week from today). */
  order: readonly number[];
  /** Day of month per weekday. */
  dates: readonly number[];
  days: DaysState;
  editingDow: number | null;
  minutes: number;
  /** The smart note (already translated, may hold <b>). */
  note: ReactNode;
  running: null | {
    twoPerDay: boolean;
    onTwoPerDay: (v: boolean) => void;
    longRunLabel: string;
    longRunAria: string;
    onCycleLongRun: () => void;
  };
  onToggleDay: (dow: number) => void;
  onWindow: (dow: number, w: TimeWindow) => void;
  onTime: (dow: number, time: string) => void;
  onTimeDone: () => void;
  onMinutes: (m: number) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function SchedDaysStep(p: SchedDaysStepProps) {
  const t = useT(schedule);
  const tc = useT(common);
  const b = (c: ReactNode) => <b>{c}</b>;
  const count = freeDays(p.days).length;
  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col bg-v2-surface font-simpler text-v2-ink">
      <StepBars step={p.step} total={p.total} />
      <div className="flex items-center justify-between px-5 pt-3">
        <div className="min-w-0">
          <h1 className="truncate whitespace-nowrap text-[24px] font-black !tracking-[-0.02em]">{t('tutorial.days.title')}</h1>
          <p className="truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">{t('tutorial.days.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={p.onBack}
          aria-label={t('tutorial.back')}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <ArrowRight size={17} strokeWidth={2.4} className="ltr:-scale-x-100" aria-hidden />
        </button>
      </div>

      <div className="mx-5 mt-3">
        <LemurNote size={36}>{t.rich('tutorial.days.coach', { b })}</LemurNote>
      </div>

      <div className="px-5 pt-3.5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="truncate whitespace-nowrap text-[13px] font-extrabold text-v2-muted">{t('tutorial.days.tapHint')}</span>
          <span className="inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-full bg-v2-tint px-2.5 text-[12.5px] font-extrabold tabular-nums text-v2-deep">
            {t('tutorial.days.count', { done: count, total: p.order.length })}
          </span>
        </div>
        <div className="overflow-hidden rounded-[22px] bg-white shadow-v2-card ring-1 ring-v2-accent/40">
          {p.order.map((dow, i) => (
            <DayAvailabilityRow
              key={dow}
              first={i === 0}
              dayLabel={weekdayLabel(dow, 'short', tc)}
              dayName={weekdayLabel(dow, 'long', tc)}
              dayOfMonth={p.dates[dow]}
              choice={p.days[dow]}
              editingTime={p.editingDow === dow}
              onToggle={() => p.onToggleDay(dow)}
              onWindow={(w) => p.onWindow(dow, w)}
              onTime={(time) => p.onTime(dow, time)}
              onTimeDone={p.onTimeDone}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-[15px] font-black">{t('tutorial.days.durationTitle')}</span>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t('tutorial.days.durationTitle')}>
            {SESSION_MINUTES.map((m) => {
              const sel = m === p.minutes;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => p.onMinutes(m)}
                  className={`rounded-xl py-[7px] text-center text-[14px] transition-transform duration-150 ease-v2 active:scale-[0.97] ${
                    sel ? 'bg-v2-tint font-black ring-2 ring-v2-accent' : 'bg-white font-extrabold ring-1 ring-[rgba(14,27,42,0.12)]'
                  }`}
                >
                  {withUnit('min', m, tc)}
                </button>
              );
            })}
          </div>
        </div>

        {count > 0 && (
          <div className="mt-2.5 flex items-start gap-2 rounded-[14px] bg-[#fff8e8] px-2.5 py-2">
            <Lightbulb size={18} strokeWidth={2} className="mt-px shrink-0 text-[#b45f06]" aria-hidden />
            <span className="text-[13px] leading-[19px] text-[#5c3a00]">{p.note}</span>
          </div>
        )}

        {p.running && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 shadow-v2-ring">
              <span className="flex-1 whitespace-nowrap text-[13.5px] font-extrabold">{t('tutorial.days.twoPerDay')}</span>
              <input
                type="checkbox"
                role="switch"
                checked={p.running.twoPerDay}
                onChange={(e) => p.running!.onTwoPerDay(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${p.running.twoPerDay ? 'bg-v2-accent' : 'bg-v2-hairline'}`}
              >
                <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${p.running.twoPerDay ? 'end-0.5' : 'start-0.5'}`} />
              </span>
            </label>
            <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 shadow-v2-ring">
              <span className="flex-1 whitespace-nowrap text-[13.5px] font-extrabold">{t('tutorial.days.longRun')}</span>
              <button
                type="button"
                onClick={p.running.onCycleLongRun}
                aria-label={p.running.longRunAria}
                className="inline-flex h-[30px] items-center whitespace-nowrap rounded-full bg-v2-tint px-3 text-[13px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40"
              >
                {p.running.longRunLabel}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="min-h-6 flex-grow" />
      <StickyActionButton variant="v2" label={t('tutorial.continue')} disabled={count === 0} onPress={p.onNext} />
    </div>
  );
}

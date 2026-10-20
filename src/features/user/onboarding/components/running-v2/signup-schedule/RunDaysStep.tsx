'use client';

/**
 * Run signup · Q2 "באילו ימים?" — the recommended days pre-marked, each with
 * a time-of-day chip (enable_home_v2; boards jr/J2-07, sch/S-5e). One CTA.
 */
import { Check, Plus, Sparkles, Sun, Sunrise, Sunset } from 'lucide-react';
import StickyActionButton from '@/components/ui/StickyActionButton';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import { DAY_LETTERS_HE, RUN_TIME_PRESETS, TIME_WINDOWS, DEFAULT_RUN_WINDOW } from '@/features/schedule/utils/runWeekRecommendation';

const WINDOW_ICON: Record<TimeWindow, typeof Sun> = { morning: Sunrise, noon: Sun, evening: Sunset };

export interface RunDaysStepProps {
  frequency: number;
  days: number[];
  windows: Partial<Record<number, TimeWindow>>;
  /** Day-of-month per weekday of the coming week (display only). */
  dates: number[];
  onToggleDay: (dow: number) => void;
  onWindow: (dow: number, w: TimeWindow) => void;
  onNext: () => void;
}

export default function RunDaysStep(p: RunDaysStepProps) {
  const done = p.days.length === p.frequency;
  return (
    <div dir="rtl" className="relative mx-auto flex w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <div className="px-4 pb-2 pt-1">
        <h1 className="truncate whitespace-nowrap text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">באילו ימים?</h1>
        <p className="mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">ומתי ביום</p>

        <div className="mb-2.5 mt-3.5 flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
            <Sparkles size={14} strokeWidth={2.2} aria-hidden />
            סימנו לפי ההמלצה · אפשר לשנות
          </span>
          <span className="inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-full bg-v2-tint px-2.5 text-[12.5px] font-extrabold tabular-nums text-v2-deep">
            {p.days.length} מתוך {p.frequency}
          </span>
        </div>

        <div className="overflow-hidden rounded-[22px] bg-white shadow-v2-card">
          {DAY_LETTERS_HE.map((letter, dow) => {
            const on = p.days.includes(dow);
            const w = p.windows[dow] ?? DEFAULT_RUN_WINDOW;
            return (
              <div
                key={dow}
                className={`flex min-h-[56px] items-center gap-3 px-3 py-2 ${dow > 0 ? 'border-t border-v2-hairline' : ''} ${on ? 'min-h-[64px] bg-v2-tint/70' : ''}`}
              >
                <div className="w-10 shrink-0 text-center">
                  <span className="block text-[12px] font-extrabold text-v2-muted">{letter}׳</span>
                  <span className={`mx-auto mt-0.5 grid h-8 w-8 place-items-center text-[16px] font-black tabular-nums ${on ? 'text-v2-ink' : 'text-v2-muted'}`}>
                    {p.dates[dow]}
                  </span>
                </div>
                <span aria-hidden className="h-9 w-px shrink-0 bg-v2-hairline" />
                {on ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <div className="flex min-w-0 gap-1.5 overflow-x-auto" role="radiogroup" aria-label={`שעה ביום ${letter}׳`}>
                      {TIME_WINDOWS.map((tw) => {
                        const sel = tw === w;
                        const Icon = WINDOW_ICON[tw];
                        return (
                          <button
                            key={tw}
                            type="button"
                            role="radio"
                            aria-checked={sel}
                            onClick={() => p.onWindow(dow, tw)}
                            className={`inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[13px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
                              sel ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
                            }`}
                          >
                            <Icon size={14} strokeWidth={2.2} aria-hidden />
                            {RUN_TIME_PRESETS[tw].label}
                          </button>
                        );
                      })}
                    </div>
                    <span className="flex-1" />
                    <button
                      type="button"
                      onClick={() => p.onToggleDay(dow)}
                      aria-label={`הסרת יום ${letter}׳`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-v2-accent text-white transition-transform duration-150 ease-v2 active:scale-[0.97]"
                    >
                      <Check size={15} strokeWidth={3} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => p.onToggleDay(dow)}
                    aria-label={`הוספת יום ${letter}׳`}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-start"
                  >
                    <span className="whitespace-nowrap text-[13.5px] font-bold text-v2-muted">לא פנוי</span>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-v2-deep ring-1 ring-inset ring-v2-pill-border">
                      <Plus size={16} strokeWidth={2.4} aria-hidden />
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {p.days.length < p.frequency && (
          <p className="mt-2 px-1 text-[12.5px] font-bold text-v2-muted">
            {p.frequency - p.days.length === 1 ? 'עוד יום אחד לסמן' : `עוד ${p.frequency - p.days.length} ימים לסמן`}
          </p>
        )}
      </div>

      <div className="flex-grow" />
      <StickyActionButton variant="v2" label="המשך" disabled={!done} onPress={p.onNext} />
    </div>
  );
}

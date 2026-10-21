'use client';

/**
 * Run signup · Q3 "השבוע שלך" — the engine-v2 week for the chosen days:
 * which run goes where, the engine's reason per day, the long-run day the
 * user can move (enable_home_v2; boards jr/J2-08, sch/S-5f). One CTA.
 */
import { Footprints, Info, Zap } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { IconTile } from '@/components/ui/v2';
import type { RunSlot } from '@/features/schedule/engine-v2/types';
import {
  DAY_LETTERS_HE,
  RUN_TIME_PRESETS,
  runSlotNameHe,
  type RunWeekRecommendation,
} from '@/features/schedule/utils/runWeekRecommendation';

const isQuality = (s: RunSlot) => s === 'quality_primary' || s === 'quality_secondary';

export interface RunWeekStepProps {
  /** "ריצה · תוכנית 10 ק״מ · מוכן לאישור" */
  subtitle: string;
  week: RunWeekRecommendation;
  /** Chosen run days (for the long-run chips). */
  days: number[];
  dates: number[];
  onLongRunDay: (dow: number) => void;
  onConfirm: () => void | Promise<void>;
}

export default function RunWeekStep(p: RunWeekStepProps) {
  const t = useT(onboarding);
  const byDow = new Map(p.week.days.map((d) => [d.dow, d]));
  const sortedDays = [...p.days].sort((a, b) => a - b);
  return (
    <div dir="rtl" className="relative mx-auto flex w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <div className="px-4 pb-2 pt-1">
        <h1 className="truncate whitespace-nowrap text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">{t('signup.run.week.title')}</h1>
        <p className="mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">{p.subtitle}</p>

        {p.week.longRunDow != null && sortedDays.length > 1 && (
          <div className="mt-3.5 flex items-center gap-2" role="radiogroup" aria-label={t('signup.run.week.longRunAria')}>
            <span className="shrink-0 whitespace-nowrap text-[13px] font-extrabold text-v2-muted">{t('signup.run.week.longRunLabel')}</span>
            <div className="flex min-w-0 gap-1.5 overflow-x-auto">
              {sortedDays.map((dow) => {
                const on = dow === p.week.longRunDow;
                return (
                  <button
                    key={dow}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => p.onLongRunDay(dow)}
                    className={`inline-flex h-8 min-w-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
                      on ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
                    }`}
                  >
                    {/* i18n-allow-hebrew: weekday letter (wave 3) */}{DAY_LETTERS_HE[dow]}׳
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3.5 overflow-hidden rounded-[22px] bg-white shadow-v2-card">
          {DAY_LETTERS_HE.map((letter, dow) => {
            const run = byDow.get(dow);
            return (
              <div key={dow} className={`flex gap-3 px-3 py-2.5 ${dow > 0 ? 'border-t border-v2-hairline' : ''}`}>
                <div className="w-10 shrink-0 pt-1 text-center">
                  <span className="block text-[12px] font-extrabold text-v2-muted">{/* i18n-allow-hebrew: weekday letter (wave 3) */}{letter}׳</span>
                  <span className={`mx-auto mt-0.5 block text-[16px] font-black tabular-nums ${run ? 'text-v2-ink' : 'text-v2-muted'}`}>{p.dates[dow]}</span>
                </div>
                <span aria-hidden className="w-px shrink-0 self-stretch bg-v2-hairline" />
                {run ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex min-h-[52px] items-center gap-2.5 rounded-[14px] bg-v2-surface px-2.5 py-2">
                      <IconTile icon={isQuality(run.slot) ? Zap : Footprints} tone="run" size="sm" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate whitespace-nowrap text-[15px] font-extrabold">{runSlotNameHe(run.slot)}</span>
                        <span className="truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">
                          {RUN_TIME_PRESETS[run.window].label} · {RUN_TIME_PRESETS[run.window].time}
                        </span>
                      </span>
                    </div>
                    {run.reasonHe && (
                      <p className="flex items-center gap-1.5 truncate whitespace-nowrap text-[12px] font-bold text-v2-deep">
                        <Info size={13} strokeWidth={2.2} aria-hidden className="shrink-0" />
                        <span className="truncate">{run.reasonHe}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex h-11 flex-1 items-center">
                    <span className="whitespace-nowrap text-[14px] font-bold text-v2-muted">{p.days.includes(dow) ? t('signup.run.week.rest') : t('signup.run.week.notFree')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {p.week.warningsHe.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-[14px] bg-v2-tint px-3.5 py-2.5 text-[13px] font-bold leading-snug text-v2-ink">
            <Info size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-v2-deep" />
            <span className="min-w-0">{p.week.warningsHe[0]}</span>
          </div>
        )}
      </div>

      <div className="flex-grow" />
      <StickyActionButton variant="v2" label={t('signup.run.week.confirm')} onPress={p.onConfirm} />
    </div>
  );
}

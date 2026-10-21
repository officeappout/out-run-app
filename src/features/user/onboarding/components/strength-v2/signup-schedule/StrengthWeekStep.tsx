'use client';

/**
 * Strength schedule · Q3 "השבוע שלך" — the engine-v2 week, ready to confirm
 * (enable_home_v2; boards jr/J1-09, sch/S-5c). Rows are the real agenda rows
 * (AgendaDayCard in preview mode, exactly as ScheduleBuilderDrawer shows a
 * proposal) with the engine's reason under each training day. A secondary
 * "רוצה להוסיף ריצה?" starts the running signup. One CTA.
 */
import { Info, Plus, Sparkles } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import ErrorBoundary from '@/components/ErrorBoundary';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { Chip, SegmentedPicker } from '@/components/ui/v2';
import AgendaDayCard from '@/features/home/components/agenda/AgendaDayCard';
import { scheduleIdNameHe } from '@/features/schedule/engine/strengthVocabulary';
import type { ComingWeekDay } from '@/features/schedule/utils/comingWeekDates';
import { RUN_TIME_PRESETS } from '@/features/schedule/utils/runWeekRecommendation';
import { strengthItemCounts, type StrengthWeekRecommendation } from '@/features/schedule/utils/strengthWeekRecommendation';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';

export interface StrengthWeekStepProps {
  /** "כוח · כל הגוף ×3 · מוכן לאישור" */
  subtitle: string;
  week: StrengthWeekRecommendation;
  /** The coming 7 days, today first. */
  coming: ComingWeekDay[];
  userId: string;
  frequency: number;
  onFrequency: (n: number) => void;
  onAddRun: () => void | Promise<void>;
  onConfirm: () => void | Promise<void>;
}

const COUNT_OPTIONS = [2, 3, 4, 5, 6];

export default function StrengthWeekStep(p: StrengthWeekStepProps) {
  const t = useT(onboarding);
  const byDow = new Map(p.week.days.map((d) => [d.dow, d]));
  const counts = strengthItemCounts(p.week);
  const countOptions = (COUNT_OPTIONS.includes(p.frequency) ? COUNT_OPTIONS : [...COUNT_OPTIONS, p.frequency].sort((a, b) => a - b))
    .map((n) => ({ key: String(n), label: String(n) }));
  const gaps = p.week.days.map((d, i) => (i === 0 ? Infinity : (d.dow - p.week.days[i - 1].dow) * 24));
  const fullRecovery = p.week.days.length > 1 && gaps.every((g) => g >= p.week.recoveryHours);
  const note = p.week.warningsHe[0] ?? (fullRecovery ? t('signup.strength.week.recoveryNote', { hours: String(p.week.recoveryHours) }) : null);

  return (
    <div dir="rtl" className="relative mx-auto flex min-h-full w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <div className="px-4 pb-2 pt-1">
        <h1 className="truncate whitespace-nowrap text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">{t('signup.strength.week.title')}</h1>
        <p className="mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">{p.subtitle}</p>

        <div className="mt-3.5 flex items-center gap-2.5">
          <span className="shrink-0 whitespace-nowrap text-[13px] font-extrabold text-v2-muted">{t('signup.strength.week.days')}</span>
          <SegmentedPicker
            ariaLabel={t('signup.strength.week.days')}
            className="min-w-0 flex-1"
            options={countOptions}
            value={String(p.frequency)}
            onChange={(k) => p.onFrequency(Number(k))}
          />
        </div>

        {counts.length > 0 && (
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
            {counts.map((c) => (
              <Chip key={c.id} tone="accent" className="shrink-0">
                {scheduleIdNameHe(c.id)} <span className="tabular-nums">×{c.count}</span>
              </Chip>
            ))}
          </div>
        )}

        <div className="mt-3.5 overflow-hidden rounded-[22px] bg-white shadow-v2-card">
          <ErrorBoundary fallback={null}>
            {p.coming.map((day, i) => {
              const session = byDow.get(day.dow);
              const entries: UserScheduleEntry[] = session
                ? [{
                    userId: p.userId,
                    date: day.iso,
                    programIds: session.items.filter((id) => id !== 'HANDSTAND'),
                    type: 'training',
                    source: 'recurring',
                    completed: false,
                    scheduledCategories: ['strength'],
                    startTime: RUN_TIME_PRESETS[session.window].time,
                  }]
                : [];
              return (
                <div key={day.iso} className={i > 0 ? 'border-t border-v2-hairline' : ''}>
                  <AgendaDayCard
                    v2
                    date={day.iso}
                    isSelected={false}
                    onSelect={() => {}}
                    userId={p.userId}
                    scheduleMap={{ [day.iso]: entries }}
                    runningOverride={null}
                    suppressScheduleDaysFallback
                  />
                  {session?.reasonHe && (
                    <p className="-mt-1 flex items-center gap-1.5 truncate whitespace-nowrap pb-2 pe-3 ps-[64px] text-[12px] font-bold text-v2-deep">
                      <Sparkles size={12} strokeWidth={2.2} aria-hidden className="shrink-0" />
                      <span className="truncate">{session.reasonHe}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </ErrorBoundary>
        </div>

        <button
          type="button"
          onClick={() => p.onAddRun()}
          className="mx-auto mt-3 flex h-9 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-[13.5px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Plus size={15} strokeWidth={2.4} aria-hidden />
          {t('signup.strength.week.addRun')}
        </button>

        {note && (
          <div className="mt-2 flex items-start gap-2 rounded-[14px] bg-v2-tint px-3.5 py-2.5 text-[13px] font-bold leading-snug text-v2-ink">
            <Info size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-v2-deep" />
            <span className="min-w-0">{note}</span>
          </div>
        )}
      </div>

      <div className="flex-grow" />
      <StickyActionButton variant="v2" label={t('signup.strength.week.confirm')} onPress={p.onConfirm} />
    </div>
  );
}

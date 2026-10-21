'use client';

/**
 * Plan summary tiles built from the chosen week (enable_home_v2, jr/J2-10):
 * "הימים שבחרת" (7 day columns) and "השבוע הראשון" (one row per run).
 */
import { Footprints } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { Card, SectionHeader } from '@/components/ui/v2';
import type { RunSlot } from '@/features/schedule/engine-v2/types';
import {
  DAY_LETTERS_HE,
  RUN_SLOT_SHORT_HE,
  RUN_TIME_PRESETS,
  runSlotNameHe,
  type RunWeekDay,
} from '@/features/schedule/utils/runWeekRecommendation';

/** Slot colours from the boards: quality red, easy cardio green, long deep green. */
export const SLOT_COLOR: Record<RunSlot, string> = {
  quality_primary: '#e5484d',
  quality_secondary: '#f08a8d',
  easy_run: '#84cc16',
  long_run: '#4d7c0f',
  recovery: '#a3d96b',
};

export function ChosenDaysTile(p: { days: RunWeekDay[]; timesLine: string | null; onEdit?: () => void }) {
  const t = useT(onboarding);
  const byDow = new Map(p.days.map((d) => [d.dow, d]));
  return (
    <Card padding="none" className="px-4 py-3.5">
      <SectionHeader size={15} title={t('signup.runSummary.days.title')} action={p.onEdit ? { label: t('signup.runSummary.days.edit'), onClick: p.onEdit } : undefined} />
      <div className="mt-2.5 flex gap-0.5">
        {DAY_LETTERS_HE.map((letter, dow) => {
          const d = byDow.get(dow);
          return (
            <div key={dow} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[11.5px] font-extrabold text-v2-muted">{/* i18n-allow-hebrew: weekday letter (wave 3) */}{letter}׳</span>
              <span
                className="grid h-[34px] w-[34px] place-items-center rounded-xl"
                style={{ background: d ? SLOT_COLOR[d.slot] : '#f1f5f9' }}
                aria-label={d ? t('signup.runSummary.days.runAria', { letter, slot: runSlotNameHe(d.slot) }) : t('signup.runSummary.days.restAria', { letter })}
              >
                {d && <Footprints size={16} strokeWidth={2.4} className="text-white" aria-hidden />}
              </span>
              <span className={`whitespace-nowrap text-[11px] font-extrabold ${d ? 'text-v2-ink' : 'text-transparent'}`} aria-hidden>
                {d ? RUN_SLOT_SHORT_HE[d.slot] : '-'}
              </span>
            </div>
          );
        })}
      </div>
      {p.timesLine && <p className="mt-2 truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{p.timesLine}</p>}
    </Card>
  );
}

export function FirstWeekTile({ days }: { days: RunWeekDay[] }) {
  const t = useT(onboarding);
  return (
    <Card padding="none" className="px-4 pb-1.5 pt-3.5">
      <div className="flex items-baseline justify-between">
        <h2 className="whitespace-nowrap text-[15px] font-black">{t('signup.runSummary.firstWeek.title')}</h2>
        <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{t('signup.runSummary.firstWeek.count', { count: String(days.length) })}</span>
      </div>
      {days.map((d, i) => (
        <div key={d.dow} className={`flex items-center gap-2.5 py-2.5 ${i > 0 ? 'border-t border-v2-hairline' : ''}`}>
          <span className="w-[34px] shrink-0 text-[13px] font-black text-v2-deep">{/* i18n-allow-hebrew: weekday letter (wave 3) */}{DAY_LETTERS_HE[d.dow]}׳</span>
          <span aria-hidden className="h-[26px] w-2 shrink-0 rounded-full" style={{ background: SLOT_COLOR[d.slot] }} />
          <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[14px] font-extrabold">{runSlotNameHe(d.slot)}</span>
          <span className="shrink-0 whitespace-nowrap text-[12.5px] font-extrabold tabular-nums text-v2-muted">
            {RUN_TIME_PRESETS[d.window].label} {RUN_TIME_PRESETS[d.window].time}
          </span>
        </div>
      ))}
    </Card>
  );
}

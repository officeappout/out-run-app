'use client';

/**
 * Strength signup · the week builder (enable_week_builder_v1, complex plans only — a split,
 * several programs / skills, or 5+ days; boards S-2d / S-2f / S-2g). Replaces
 * StrengthWeekStep for those plans. The engine week comes in ready; the user's edits are kept
 * here until the recommendation itself changes (days count). The layout IS what is saved
 * (buildStrengthScheduleWrite over wbToStrengthWeek), so the host saves the edited week.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { SessionType } from '@/features/workout-engine/services/split-decision/split-decision.types';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import type { StrengthWeekRecommendation } from '@/features/schedule/utils/strengthWeekRecommendation';
import { createWeekEngine, refreshDetails, type WbWeek } from '@/features/schedule/week-builder';
import { applyStrengthFocus, strengthRules, strengthWeekToWb, wbToStrengthWeek, type StrengthWbData } from '@/features/schedule/week-builder/adapters/strength';
import WeekBuilder from '@/features/schedule/week-builder/components/WeekBuilder';

const COUNT_OPTIONS = [2, 3, 4, 5, 6];

export interface StrengthWeekBuilderStepProps {
  subtitle: string;
  /** The engine's week for the current inputs. */
  week: StrengthWeekRecommendation;
  split: SessionType | null;
  /** Days a session may move to (Sun–Fri, + Saturday when the user marked it). */
  openDays: number[];
  dates: number[];
  frequency: number;
  onFrequency: (n: number) => void;
  headerAction?: ReactNode;
  onAddRun: (week: StrengthWeekRecommendation) => void | Promise<void>;
  onConfirm: (week: StrengthWeekRecommendation) => void | Promise<void>;
}

export default function StrengthWeekBuilderStep(p: StrengthWeekBuilderStepProps) {
  const t = useT(onboarding);
  const rules = useMemo(() => strengthRules(p.frequency), [p.frequency]);
  const freshWb = useMemo(() => strengthWeekToWb({ week: p.week, openDays: p.openDays, split: p.split }, rules), [p.week, p.openDays, p.split, rules]);
  // Edits belong to the engine week they were made on; a new recommendation starts clean.
  const [edited, setEdited] = useState<{ base: StrengthWeekRecommendation; wb: WbWeek<StrengthWbData> } | null>(null);
  const wb = edited?.base === p.week ? edited.wb : freshWb;
  const engine = useMemo(() => createWeekEngine<StrengthWbData>(rules, { normalize: (w) => applyStrengthFocus(w, p.split) }), [rules, p.split]);

  const setWb = (next: WbWeek<StrengthWbData>) => setEdited({ base: p.week, wb: next });
  const onWindow = (dow: number, w: TimeWindow) =>
    setWb(refreshDetails({ ...wb, days: wb.days.map((d) => (d.dow === dow ? { ...d, window: w } : d)) }));
  const final = () => wbToStrengthWeek(wb, p.week.recoveryHours);
  const countOptions = COUNT_OPTIONS.includes(p.frequency) ? COUNT_OPTIONS : [...COUNT_OPTIONS, p.frequency].sort((a, b) => a - b);

  return (
    <WeekBuilder
      title={t('signup.strength.week.title')}
      subtitle={p.subtitle}
      week={wb}
      engine={engine}
      onChange={setWb}
      dates={p.dates}
      headerAction={p.headerAction}
      daysCount={{ value: p.frequency, options: countOptions, onChange: p.onFrequency }}
      onWindow={onWindow}
      extra={
        <button
          type="button"
          onClick={() => p.onAddRun(final())}
          className="mx-auto mt-3 flex h-9 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-[13.5px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Plus size={15} strokeWidth={2.4} aria-hidden />
          {t('signup.strength.week.addRun')}
        </button>
      }
      confirmLabel={t('signup.strength.week.confirm')}
      onConfirm={() => p.onConfirm(final())}
    />
  );
}

'use client';

/**
 * Run signup · the week builder (enable_week_builder_v1; board S-2e). Replaces RunWeekStep
 * when the week is complex (quality / easy / long runs — any plan whose runs differ).
 * Controlled by the run flow: a run week saves its days + long-run day, so an accepted move
 * hands those back (onDays) and the flow's own engine week re-renders — the same engine call
 * the move was validated with (runMoveOptions), so what the user sees is what gets saved.
 */
import { useMemo, type ReactNode } from 'react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import type { RunWeekRecommendation } from '@/features/schedule/utils/runWeekRecommendation';
import { createWeekEngine } from '@/features/schedule/week-builder';
import { longRunAfterEdit, runDaysOf, runMoveOptions, runRules, runWeekToWb, type RunWbContext } from '@/features/schedule/week-builder/adapters/run';
import WeekBuilder from '@/features/schedule/week-builder/components/WeekBuilder';

export interface RunWeekBuilderStepProps {
  subtitle: string;
  /** "ריצת 10 ק״מ" — the run chip's label. */
  planLabel: string;
  week: RunWeekRecommendation;
  ctx: RunWbContext;
  /** The long-run day the user chose (null = the engine's default). */
  chosenLongRunDay: number | null;
  frequency: number;
  frequencyOptions: number[];
  onFrequency: (n: number) => void;
  /** An accepted edit: the new run days and the user's long-run day (null = default). */
  onDays: (days: number[], chosenLongRunDay: number | null) => void;
  onWindow: (dow: number, w: TimeWindow) => void;
  dates: number[];
  headerAction?: ReactNode;
  onConfirm: () => void | Promise<void>;
}

export default function RunWeekBuilderStep(p: RunWeekBuilderStepProps) {
  const t = useT(onboarding);
  const rules = useMemo(() => runRules(p.frequency, p.ctx.level), [p.frequency, p.ctx.level]);
  const wb = useMemo(() => runWeekToWb(p.week, p.ctx, rules, p.chosenLongRunDay), [p.week, p.ctx, rules, p.chosenLongRunDay]);
  const longRun = useMemo(() => ({ chosen: p.chosenLongRunDay, current: p.week.longRunDow }), [p.chosenLongRunDay, p.week.longRunDow]);
  const engine = useMemo(() => createWeekEngine(rules, runMoveOptions(p.ctx, rules, longRun)), [rules, p.ctx, longRun]);

  return (
    <WeekBuilder
      title={t('signup.run.week.title')}
      subtitle={p.subtitle}
      week={wb}
      engine={engine}
      onChange={(next) => {
        const { days, longRunDow } = runDaysOf(next);
        p.onDays(days, longRunAfterEdit(longRunDow, longRun));
      }}
      dates={p.dates}
      headerAction={p.headerAction}
      chipLabels={{ run: p.planLabel }}
      daysCount={{ value: p.frequency, options: p.frequencyOptions, onChange: p.onFrequency }}
      onWindow={p.onWindow}
      confirmLabel={t('signup.run.week.confirm')}
      onConfirm={p.onConfirm}
    />
  );
}

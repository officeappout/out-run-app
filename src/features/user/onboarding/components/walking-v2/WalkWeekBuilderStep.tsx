'use client';

/**
 * Walking signup · the week builder (enable_week_builder_v1). Replaces WalkWeekStep when the
 * walk week is complex: 5+ walks, or walks next to the strength / run week the user already
 * has (shown locked — this flow never writes the other track). Controlled by the walk flow:
 * a walk week saves its days (the plan picks the long walk), so an accepted move hands the
 * new days back and the flow re-plans.
 */
import { useMemo, type ReactNode } from 'react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import type { WalkPlan } from '@/features/schedule/walking';
import { walkWeekSubtitle } from '@/features/schedule/walking';
import type { PolicyAddOn } from '@/features/schedule/recommendation-policy/types';
import { createWeekEngine } from '@/features/schedule/week-builder';
import { walkDaysOf, walkRules, walkWeekToWb, type WalkWbContext } from '@/features/schedule/week-builder/adapters/walk';
import WeekBuilder from '@/features/schedule/week-builder/components/WeekBuilder';
import { kellyWeekAction } from '@/features/ai-coach/components/KellyWeekChip';

export interface WalkWeekBuilderStepProps {
  plan: WalkPlan;
  addOn: PolicyAddOn | null;
  ctx: WalkWbContext;
  dates: number[];
  onDays: (days: number[]) => void;
  onWindow: (dow: number, w: TimeWindow) => void;
  /** Under the list (the "not alone" walking-group card). */
  extra?: ReactNode;
  error: string | null;
  onConfirm: () => void | Promise<void>;
}

export default function WalkWeekBuilderStep(p: WalkWeekBuilderStepProps) {
  const t = useT(onboarding);
  const rules = useMemo(() => walkRules(p.ctx), [p.ctx]);
  const wb = useMemo(() => walkWeekToWb(p.plan.weeks[0] ?? { index: 0, totalMinutes: 0, walks: [] }, p.ctx, rules), [p.plan, p.ctx, rules]);
  const engine = useMemo(() => createWeekEngine(rules), [rules]);

  return (
    <WeekBuilder
      title={t('signup.walk.week.title')}
      subtitle={walkWeekSubtitle(p.plan, p.addOn)}
      week={wb}
      engine={engine}
      onChange={(next) => p.onDays(walkDaysOf(next))}
      dates={p.dates}
      headerAction={kellyWeekAction}
      onWindow={p.onWindow}
      extra={p.extra}
      error={p.error}
      confirmLabel={t('signup.walk.week.confirm')}
      onConfirm={p.onConfirm}
    />
  );
}

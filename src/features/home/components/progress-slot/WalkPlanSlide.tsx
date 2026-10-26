'use client';

/**
 * Home progress slot — the walking plan card (boards PG-1, slot 2, walking variant, in
 * the shared steps/walking orange): ring = this week's walking minutes against the
 * plan's weekly target (lifestyle.walkingGoal.targetWeeklyMinutes). The walking plan
 * stores no week index / progress yet, so there is no "שבוע N מתוך M" here.
 * Tap → the running/walking deeper page.
 */
import { useRouter } from 'next/navigation';
import { STEPS_WALK_COLORS } from '@/components/ui/v2/track-colors';
import { PROGRESS_RUN_HREF, walkPercent } from '@/features/home/utils/progress-slot';
import { useWeekActivitySummary } from '@/features/home/hooks/useWeekActivitySummary';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import PlanProgressCard from './PlanProgressCard';

export default function WalkPlanSlide({ targetWeeklyMinutes }: { targetWeeklyMinutes: number }) {
  const t = useT(home);
  const router = useRouter();
  const { current } = useWeekActivitySummary();
  const minutes = Math.round(current?.byKind.walk.minutes ?? 0);
  const pct = walkPercent(minutes, targetWeeklyMinutes);
  const pctText = formatNumber(pct / 100, t.locale, { style: 'percent', maximumFractionDigits: 0 });

  return (
    <PlanProgressCard
      kind="walk"
      color={STEPS_WALK_COLORS.fill}
      textColor={STEPS_WALK_COLORS.text}
      pct={pct}
      ringText={pctText}
      ringLabel={t('progressSlot.walk.ringLabel', { pct: pctText })}
      kicker={t('progressSlot.walk.kicker')}
      value={t('progressSlot.walk.minutes', { minutes: formatNumber(minutes, t.locale) })}
      line={t('progressSlot.walk.ofTarget', { target: formatNumber(targetWeeklyMinutes, t.locale) })}
      onClick={() => router.push(PROGRESS_RUN_HREF)}
    />
  );
}

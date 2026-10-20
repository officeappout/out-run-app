'use client';

/**
 * The running plan, opened from the progress tab (P-4): the same
 * RunningPlanSummaryV2 the questionnaire ends with, in view mode — chip
 * "שבוע X מתוך Y", done weeks marked on the volume chart, no CTA.
 * Data: running.activeProgram + generatedProgramTemplate (no reads).
 * Flag-off (or no plan) → back to /progression.
 */
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import RunningPlanSummaryV2 from '@/features/user/onboarding/components/running-v2/RunningPlanSummaryV2';
import { readDate } from '../utils/progress-model';
import { RUN_DIST_LABEL, runningPlanProgress } from '../utils/running-plan-progress';

export default function RunningPlanViewV2() {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const isSuperAdmin = !!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  const running = profile?.running;
  const plan = useMemo(() => runningPlanProgress(running as Parameters<typeof runningPlanProgress>[0]), [running]);

  const blocked = !!profile && !loading && (!flags.enableHomeV2 || !plan);
  useEffect(() => {
    if (blocked) router.replace('/progression');
  }, [blocked, router]);

  if (!profile || !plan || !flags.enableHomeV2) return <div className="min-h-[100dvh] bg-v2-surface" />;

  const start = readDate(running?.activeProgram?.startDate) ?? new Date();
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + plan.weeks * 7);
  return (
    <div className="min-h-[100dvh] bg-v2-surface">
      <RunningPlanSummaryV2
        mode="view"
        answers={{ targetDistance: plan.distKey ?? undefined }}
        distLabel={plan.distKey ? RUN_DIST_LABEL[plan.distKey] ?? '' : ''}
        weeks={plan.weeks}
        frequency={plan.frequency}
        endDateShort={end.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
        weekDays={[]}
        timesLine={null}
        progress={{ currentWeek: plan.currentWeek, done: plan.done, dueSoFar: plan.dueSoFar }}
        onBack={() => router.back()}
      />
    </div>
  );
}

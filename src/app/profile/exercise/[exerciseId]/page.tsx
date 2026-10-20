'use client';

export const dynamic = 'force-dynamic';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useUserStore } from '@/features/user';
import ExerciseAnalyticsPage from '@/features/profile/components/ExerciseAnalyticsPage';
import ExerciseAnalyticsV2 from '@/features/profile/components/exercise-analytics-v2/ExerciseAnalyticsV2';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

/**
 * Route: /profile/exercise/[exerciseId]
 *
 * Data-centric analytics view for a single exercise.
 * Triggered by tapping a GoalCard sparkline or a chart data point on the
 * dashboard — NOT the tutorial/muscles ExerciseDetailPage.
 */
export default function ExerciseAnalyticsRoute() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const exerciseId = params.exerciseId as string;
  const nameHint = searchParams.get('name') ?? undefined;
  const profile = useUserStore((s) => s.profile);
  // enable_home_v2: the v2 page (P-5/P-6) — paged reads, v2 look.
  const isSuperAdmin = !!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
  const { flags, loading: flagsLoading } = useFeatureFlags(isSuperAdmin);
  const v2 = flags.enableHomeV2;

  // Redirect unauthenticated visitors
  useEffect(() => {
    if (profile === null) {
      router.replace('/');
    }
  }, [profile, router]);

  // Wait for the flags so a v2 user never fires the v1 page's unbounded read.
  if (!profile || flagsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#F8FAFC]">
        <div className="w-8 h-8 border-2 border-[#00ADEF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (v2) {
    return <ExerciseAnalyticsV2 exerciseId={exerciseId} userId={profile.id} exerciseNameHint={nameHint} />;
  }

  return (
    <ExerciseAnalyticsPage
      exerciseId={exerciseId}
      userId={profile.id}
      exerciseNameHint={nameHint}
    />
  );
}

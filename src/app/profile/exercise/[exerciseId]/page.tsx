'use client';

export const dynamic = 'force-dynamic';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useUserStore } from '@/features/user';
import ExerciseAnalyticsPage from '@/features/profile/components/ExerciseAnalyticsPage';

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

  // Redirect unauthenticated visitors
  useEffect(() => {
    if (profile === null) {
      router.replace('/');
    }
  }, [profile, router]);

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#F8FAFC]">
        <div className="w-8 h-8 border-2 border-[#00ADEF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ExerciseAnalyticsPage
      exerciseId={exerciseId}
      userId={profile.id}
      exerciseNameHint={nameHint}
    />
  );
}

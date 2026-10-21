'use client';

/**
 * /help/tour — the tour preview (Kelly round 4): an in-workout tour (player, route, route
 * player, station) replayed over a static illustration, opened from the tours list or a Kelly
 * chip via tour-replay.ts. Exists only while ai_coach_round4 is on (real value) and only for a
 * pending preview request; otherwise it goes back to the help hub / home. Never starts a
 * workout and never writes anything.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import TourPreviewScreen from '@/features/help/components/tour-preview/TourPreviewScreen';
import { consumePreviewReplay, type ReplayableTour } from '@/features/user/onboarding/services/tour-replay';

export default function TourPreviewPage() {
  const router = useRouter();
  const { flags, loading } = useFeatureFlags();
  const on = flags.aiCoachRound4 === true;
  const gender = useUserStore((s) => s.profile?.core?.gender);
  const [req, setReq] = useState<{ tour: ReplayableTour; step: number } | null | undefined>(undefined);

  useEffect(() => {
    setReq(consumePreviewReplay());
  }, []);

  useEffect(() => {
    if (!loading && !on) router.replace('/home');
    else if (!loading && req === null) router.replace('/help');
  }, [loading, on, req, router]);

  const close = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace('/help');
  }, [router]);

  if (loading || !on || !req) return <div className="fixed inset-0 bg-[#F8FAFC]" style={{ colorScheme: 'light' }} />;
  return <TourPreviewScreen tour={req.tour} step={req.step} gender={gender} onClose={close} />;
}

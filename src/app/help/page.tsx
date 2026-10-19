'use client';

/**
 * /help — "איך משתמשים ושאלות נפוצות" (Kelly round 4). Opened from Settings → כללי and from
 * Kelly's "איך משתמשים" chip. Exists only while ai_coach_round4 is on (real value); otherwise
 * it sends the user home.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import HelpHub from '@/features/help/components/HelpHub';

export default function HelpPage() {
  const router = useRouter();
  const { flags, loading } = useFeatureFlags();
  const on = flags.aiCoachRound4 === true;

  useEffect(() => {
    if (!loading && !on) router.replace('/home');
  }, [loading, on, router]);

  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace('/home');
  };

  if (loading || !on) return <div className="fixed inset-0 bg-[#F8FAFC]" style={{ colorScheme: 'light' }} />;
  return <HelpHub onClose={close} />;
}

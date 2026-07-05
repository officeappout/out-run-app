'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import ChallengeTimerScreen from '@/features/challenge/components/ChallengeTimerScreen';
import { useTranslation } from '@/hooks/useTranslation';
import ChallengeLangToggle from '@/features/challenge/components/ChallengeLangToggle';

const EXERCISE_ID = 'Ma6QH3kwbEZoIiME7r0K';
const TARGET_SECS = 60;

export default function ChallengeTimerPage() {
  const params     = useParams();
  const router     = useRouter();
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : '';

  const { t } = useTranslation();

  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [groupId, setGroupId]           = useState<string | null>(null);
  const [submitting, setSubmitting]     = useState(false);

  useEffect(() => {
    const gid = sessionStorage.getItem('challenge_group_id');
    if (!gid) {
      router.replace(`/challenge/${inviteCode}/join`);
      return;
    }
    setGroupId(gid);
  }, [inviteCode, router]);

  useEffect(() => {
    fetch(`/api/challenge/exercise?id=${EXERCISE_ID}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setVideoUrl(data?.videoUrl ?? null))
      .catch(() => setVideoUrl(null))
      .finally(() => setLoadingVideo(false));
  }, []);

  const handleComplete = async (elapsedSeconds: number) => {
    if (submitting || !groupId) return;
    setSubmitting(true);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('no-token');

      await fetch('/api/challenge/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ groupId, value: elapsedSeconds }),
      });
    } catch {
      // Non-fatal — navigate to done regardless
    }

    sessionStorage.setItem('challenge_elapsed', String(elapsedSeconds));
    router.push(`/challenge/${inviteCode}/done`);
  };

  if (loadingVideo || !groupId) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="relative">
      <ChallengeTimerScreen
        exerciseId={EXERCISE_ID}
        exerciseName={t('challenge.timer.exerciseName')}
        videoUrl={videoUrl}
        targetSeconds={TARGET_SECS}
        instructionText={t('challenge.timer.instruction')}
        onComplete={handleComplete}
      />
      {/* Language toggle — unobtrusive overlay at top start corner */}
      <div className="absolute top-4 left-4 z-30">
        <ChallengeLangToggle variant="dark" />
      </div>
    </div>
  );
}

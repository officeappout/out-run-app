'use client';

export const dynamic = 'force-dynamic';

/**
 * /challenge/[inviteCode]/timer
 *
 * Challenge execution screen — video background + isometric timer.
 * Reads groupId from sessionStorage (set by /join page).
 * On complete: POSTs result to /api/challenge/submit → redirects to /done.
 *
 * Requires authenticated user (set up by /join page).
 * Falls back gracefully if exercises/l_sit has no video (videoUrl = null).
 */

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import ChallengeTimerScreen from '@/features/challenge/components/ChallengeTimerScreen';

// ── L-sit exercise config (fetched from Firestore via a lightweight API) ─────
// Exercise ID: Ma6QH3kwbEZoIiME7r0K = "ישיבת L" (base_movement_id: 'l_sit')
// Video is in execution_methods[0].media.mainVideoUrl (Bunny CDN park version)
const EXERCISE_ID   = 'Ma6QH3kwbEZoIiME7r0K';
const EXERCISE_NAME = 'ישיבת L';
const TARGET_SECS   = 60;           // soft target — count-up continues past this
const INSTRUCTION   = 'החזק כמה שיותר זמן. שחרר כשאתה חייב.';

export default function ChallengeTimerPage() {
  const params     = useParams();
  const router     = useRouter();
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : '';

  const [videoUrl, setVideoUrl]     = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [groupId, setGroupId]       = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Read groupId from sessionStorage ────────────────────────────────────────
  useEffect(() => {
    const gid = sessionStorage.getItem('challenge_group_id');
    if (!gid) {
      // User navigated directly — send back to join
      router.replace(`/challenge/${inviteCode}/join`);
      return;
    }
    setGroupId(gid);
  }, [inviteCode, router]);

  // ── Fetch exercise videoUrl from Firestore via lightweight API ───────────────
  // We hit a minimal internal endpoint rather than using the client Firestore SDK
  // so this page stays fully public-safe (no client auth dependency for the video).
  useEffect(() => {
    fetch(`/api/challenge/exercise?id=${EXERCISE_ID}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setVideoUrl(data?.videoUrl ?? null))
      .catch(() => setVideoUrl(null))
      .finally(() => setLoadingVideo(false));
  }, []);

  // ── Handle timer completion ───────────────────────────────────────────────────
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

    // Store elapsed for done page
    sessionStorage.setItem('challenge_elapsed', String(elapsedSeconds));
    router.push(`/challenge/${inviteCode}/done`);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loadingVideo || !groupId) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <ChallengeTimerScreen
      exerciseId={EXERCISE_ID}
      exerciseName={EXERCISE_NAME}
      videoUrl={videoUrl}
      targetSeconds={TARGET_SECS}
      instructionText={INSTRUCTION}
      onComplete={handleComplete}
    />
  );
}

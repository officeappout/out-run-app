'use client';

/**
 * ChallengeTimerScreen
 *
 * Standalone challenge execution screen — video background + isometric timer.
 * Modelled after ActiveExerciseView but stripped of all session chrome:
 *   REMOVED: rep-input card, cues/muscles, badges, swap button, session header,
 *            exit modal, pause overlay, rest timer, XP popup.
 *   KEPT: ExerciseVideoPlayer (full-screen bg) + IsometricTimerCard (bottom overlay).
 *
 * Works for anonymous (guest) users — no store dependencies.
 * onComplete(elapsed) receives raw elapsed seconds → caller submits to Firestore.
 */

import React, { useState } from 'react';
import ExerciseVideoPlayer from '@/features/workout-engine/players/strength/components/ExerciseVideoPlayer';
import IsometricTimerCard from '@/features/workout-engine/players/strength/components/IsometricTimerCard';

interface ChallengeTimerScreenProps {
  exerciseId: string;
  exerciseName: string;
  videoUrl: string | null;
  /** Soft target in seconds. IsometricTimerCard shows overtime past this point.
   *  Use 60 for L-sit (count up continues freely past 60s). */
  targetSeconds: number;
  /** Sub-label shown in the timer card, e.g. "החזק כמה שיותר" */
  instructionText: string;
  onComplete: (elapsedSeconds: number) => void;
}

export default function ChallengeTimerScreen({
  exerciseId,
  exerciseName,
  videoUrl,
  targetSeconds,
  instructionText,
  onComplete,
}: ChallengeTimerScreenProps) {
  const [isPaused, setIsPaused] = useState(false);

  return (
    <div className="relative w-full h-dvh bg-black overflow-hidden" dir="rtl">
      {/* ── Video — full-screen background ──────────────────────────────────── */}
      <div className="absolute inset-0">
        <ExerciseVideoPlayer
          key={exerciseId}
          exerciseId={exerciseId}
          videoUrl={videoUrl}
          exerciseName={exerciseName}
          exerciseType="time"
          isPaused={isPaused}
        />
      </div>

      {/* ── Dark gradient so the timer card is readable over the video ───────── */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: '55%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
        }}
      />

      {/* ── Timer card — bottom overlay ──────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-8">
        <IsometricTimerCard
          duration={targetSeconds}
          exerciseName={exerciseName}
          repsOrDurationText={instructionText}
          hideControls
          onComplete={(elapsed) => {
            setIsPaused(true);
            onComplete(elapsed);
          }}
        />
      </div>
    </div>
  );
}

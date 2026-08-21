'use client';

/**
 * WorkoutHistoryPage — F1.3 (19.08.2026, "unified workout summary" plan).
 *
 * The one shared route all 3 entry points (profile→history, the big
 * schedule, home) link to, so they open the exact same screen instead of
 * each having their own. No precedent existed for "fetch a saved workout by
 * id" before this — active/page.tsx's own Firestore fallback synthesizes a
 * fresh generic plan, it doesn't read a saved doc (confirmed during F1's
 * investigation) — so this is genuinely new fetch code, via the new
 * getWorkoutById() in storage.service.ts.
 *
 * Branches on category, not a new component: strength/recovery reuse
 * StrengthHistoryDetail (now showing the F1.1/F1.2 per-set exerciseLog when
 * present, and delete-capable on its own — no wiring needed here); cardio
 * reuses FreeRunSummary in its existing isReadOnly mode (F2.1 fix, 19.08.2026
 * — the initial F1.3 cut built a smaller custom view here instead of reusing
 * FreeRunSummary, which silently dropped delete capability for cardio
 * workouts and diverged from what the plan's own investigation identified as
 * the correct destination; caught while wiring real navigation to this route
 * in F2.1, before that gap could reach production). FreeRunSummary owns its
 * own map/stats/laps rendering; this file only owns the delete-confirm flow
 * around it, mirroring the exact pattern profile/page.tsx used to own before
 * F2.1 replaced its in-page overlay with real navigation here.
 *
 * hybrid reuses HybridSummary (21.08.2026 fix) instead of StrengthHistoryDetail
 * — it was grouped under isStrengthLike originally because no mapping existed
 * from the saved WorkoutHistoryEntry to the HybridFinalizeResult shape
 * HybridSummary expects. hybrid-history-adapter.ts rebuilds it (segments are
 * a byte-compatible passthrough; summary is recomputed from them). This file
 * owns the delete-confirm flow around it too, same split as cardio.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getWorkoutById, type WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import StrengthHistoryDetail from '@/features/profile/components/StrengthHistoryDetail';
import FreeRunSummary from '@/features/workout-engine/players/running/components/FreeRun/FreeRunSummary';
import HybridSummary from '@/features/workout-engine/summary/pages/HybridSummary';
import { workoutHistoryEntryToHybridFinalizeResult } from '@/features/workout-engine/hybrid/hybrid-history-adapter';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import DeleteWorkoutConfirmModal from '@/components/ui/DeleteWorkoutConfirmModal';
import { deleteWorkoutWithReversal } from '@/lib/workoutDeletion';
import { WORKOUT_DELETE_EXPANDED_ENABLED } from '@/config/feature-flags';
import { workoutActivityLabel, workoutDateLabel } from '@/features/workout-engine/core/utils/workoutLabels';

type LoadStatus = 'loading' | 'ready' | 'not-found';

export default function WorkoutHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const workoutId = params.id as string;
  const [workout, setWorkout] = useState<WorkoutHistoryEntry | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  // Cardio/hybrid delete-confirm state — declared unconditionally at the top
  // (rules-of-hooks) even though it's only ever used once status==='ready'.
  // Shared across both branches since exactly one of them renders per page
  // instance (category is fixed for a given workout). Mirrors profile/page.tsx's
  // pre-F2.1 handleConfirmDeleteWorkout, just relocated here now that this
  // route (not the old in-page overlay) owns viewing these workouts.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Hybrid's streakDays isn't persisted on the workout doc (it's a "current
  // streak" display value, not a historical fact) — same convention
  // FreeRunSummary already uses internally for its own streakDays.
  const currentStreak = useProgressionStore((s) => s.currentStreak);

  useEffect(() => {
    if (!workoutId) {
      setStatus('not-found');
      return;
    }
    let cancelled = false;
    // Gate on auth readiness (not auth.currentUser read synchronously) —
    // same pattern useWorkoutHistory.ts already uses for this exact reason:
    // Firebase's persisted-session restore isn't necessarily done on first
    // render, so reading auth.currentUser directly here could false-negative
    // a genuine owner as "not found" on a fast enough Firestore response.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;
      if (!user) {
        setStatus('not-found');
        return;
      }
      const result = await getWorkoutById(workoutId, user.uid);
      if (cancelled) return;
      if (!result) {
        setStatus('not-found');
        return;
      }
      setWorkout(result);
      setStatus('ready');
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [workoutId]);

  const handleClose = () => router.back();

  if (status === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-gray-400 text-sm">טוען...</p>
      </div>
    );
  }

  if (status === 'not-found' || !workout) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-[#F8FAFC]" dir="rtl">
        <p className="text-gray-500 text-sm">האימון לא נמצא</p>
        <button onClick={handleClose} className="text-[#00ADEF] text-sm font-bold">
          חזרה
        </button>
      </div>
    );
  }

  const isStrengthLike = workout.category === 'strength' || workout.category === 'recovery';

  // Shared by the hybrid and cardio branches below — category-agnostic.
  const handleConfirmDeleteWorkout = async () => {
    if (!workout.id) {
      setShowDeleteConfirm(false);
      return;
    }
    await deleteWorkoutWithReversal(workout.id);
    setShowDeleteConfirm(false);
    handleClose();
  };

  if (isStrengthLike) {
    return <StrengthHistoryDetail workout={workout} onClose={handleClose} />;
  }

  if (workout.category === 'hybrid') {
    return (
      <>
        <HybridSummary
          result={workoutHistoryEntryToHybridFinalizeResult(workout)}
          calories={workout.calories}
          streakDays={currentStreak}
          xpEarned={workout.xpEarned ?? 0}
          onFinish={handleClose}
          onDelete={WORKOUT_DELETE_EXPANDED_ENABLED ? () => setShowDeleteConfirm(true) : undefined}
        />
        {WORKOUT_DELETE_EXPANDED_ENABLED && (
          <DeleteWorkoutConfirmModal
            isOpen={showDeleteConfirm}
            activityLabel={workoutActivityLabel(workout.workoutType)}
            dateLabel={workoutDateLabel(workout.date)}
            xpToReverse={workout.xpEarned ?? 0}
            onConfirm={handleConfirmDeleteWorkout}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </>
    );
  }

  // Cardio — FreeRunSummary already owns the exact read-only rendering this
  // needs (map/stats/laps + share/save chrome hidden via isReadOnly); this
  // route only owns the delete-confirm flow around it, same split
  // profile/page.tsx's pre-F2.1 overlay used.
  return (
    <>
      <FreeRunSummary
        workout={workout}
        isReadOnly
        onClose={handleClose}
        onDelete={WORKOUT_DELETE_EXPANDED_ENABLED ? () => setShowDeleteConfirm(true) : undefined}
      />
      {WORKOUT_DELETE_EXPANDED_ENABLED && (
        <DeleteWorkoutConfirmModal
          isOpen={showDeleteConfirm}
          activityLabel={workoutActivityLabel(workout.workoutType)}
          dateLabel={workoutDateLabel(workout.date)}
          xpToReverse={workout.xpEarned ?? 0}
          onConfirm={handleConfirmDeleteWorkout}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}

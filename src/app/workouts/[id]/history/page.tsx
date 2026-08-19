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
 * Branches on category, not a new component: strength/hybrid/recovery reuse
 * StrengthHistoryDetail (now showing the F1.1/F1.2 per-set exerciseLog when
 * present); cardio reuses the existing summary display blocks
 * (RunMapBlock/LapPaceChart/LapTableBlock) against the doc's own saved
 * routePath/laps — no new GPS-trace persistence (David's call, 19.08.2026):
 * "יש כבר בסיס מספיק... זה מספיק ל-F1".
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { ArrowRight } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getWorkoutById, type WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import StrengthHistoryDetail from '@/features/profile/components/StrengthHistoryDetail';
import SummaryStatsGrid from '@/features/workout-engine/summary/components/shared/SummaryStatsGrid';
import RunMapBlock from '@/features/workout-engine/summary/components/running/RunMapBlock';
import LapTableBlock from '@/features/workout-engine/summary/components/running/LapTableBlock';
import LapPaceChart from '@/features/workout-engine/summary/components/shared/LapPaceChart';

type LoadStatus = 'loading' | 'ready' | 'not-found';

function formatDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Firestore always persists {lat,lng} objects (storage.service.ts's saveWorkout
 * conversion) — this tolerates legacy [lng,lat] tuple docs too, matching the
 * same defensive check getWorkoutById itself already does on read. */
function toLngLatTuples(routePath: WorkoutHistoryEntry['routePath']): number[][] {
  if (!routePath) return [];
  return routePath.map((p) => (Array.isArray(p) ? p : [p.lng, p.lat]));
}

export default function WorkoutHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const workoutId = params.id as string;
  const [workout, setWorkout] = useState<WorkoutHistoryEntry | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');

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

  const isStrengthLike =
    workout.category === 'strength' || workout.category === 'hybrid' || workout.category === 'recovery';

  if (isStrengthLike) {
    return <StrengthHistoryDetail workout={workout} onClose={handleClose} />;
  }

  // Cardio — reuse the existing summary display blocks against the doc's own
  // saved routePath/laps. Same header chrome as StrengthHistoryDetail's for
  // visual consistency across the two branches of this one shared route.
  const routeCoords = toLngLatTuples(workout.routePath);
  const hasLaps = !!workout.laps && workout.laps.length > 0;

  return (
    <div className="fixed inset-0 z-[200] bg-[#F8FAFC] flex flex-col" dir="rtl">
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 bg-white border-b border-gray-100">
        <button
          onClick={handleClose}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="חזור"
        >
          <ArrowRight className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-900">סיכום אימון</h1>
          <p className="text-xs text-gray-500 mt-0.5">{formatDate(workout.date)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {routeCoords.length > 1 ? (
          <div style={{ height: 200, borderRadius: 12, overflow: 'hidden' }}>
            <RunMapBlock
              routeCoords={routeCoords}
              startCoord={routeCoords[0]}
              endCoord={routeCoords[routeCoords.length - 1]}
            />
          </div>
        ) : (
          <div
            style={{ height: 200, borderRadius: 12, background: '#E7F1ED' }}
            className="flex items-center justify-center text-[13px] text-gray-400"
          >
            אין נתוני מסלול
          </div>
        )}

        <SummaryStatsGrid
          time={workout.duration}
          distance={workout.distance}
          calories={workout.calories}
          pace={workout.pace}
          elevationGain={workout.elevationGain}
        />

        {hasLaps && <LapPaceChart laps={workout.laps!} />}
        {hasLaps && <LapTableBlock laps={workout.laps!} />}
      </div>
    </div>
  );
}

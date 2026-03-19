'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Play, Home, Link2 } from 'lucide-react';
import WorkoutPreviewHeader from '@/features/workout-engine/components/WorkoutPreviewHeader';
import StrengthExerciseCard from '@/features/workout-engine/components/cards/StrengthExerciseCard';
import RunningSegmentCard from '@/features/workout-engine/components/cards/RunningSegmentCard';
import { getAllExercises, Exercise as FirestoreExercise, getLocalizedText } from '@/features/content/exercises';

// ============================================================================
// Types
// ============================================================================

interface WorkoutSegment {
  id: string;
  type: 'running' | 'strength';
  title: string;
  durationOrDistance?: string;
  pace?: string;
  statusColor?: string;
  repsOrDuration?: string;
  imageUrl?: string | null;
}

interface WorkoutData {
  id: string;
  title: string;
  description?: string;
  level?: string;
  difficulty?: string;
  duration?: number;
  coverImage?: string;
  routePath?: number[][] | Array<{ lat: number; lng: number }>;
  segments: WorkoutSegment[];
}

/** Shape of a single exercise inside a stored workout-plan segment */
interface StoredExercise {
  id: string;
  name: string;
  type?: string;
  reps?: string;
  sets?: number;
  imageUrl?: string;
  repsRange?: { min: number; max: number };
  isTimeBased?: boolean;
  isGoalExercise?: boolean;
  rampedTarget?: number;
}

/** Shape of a segment inside the stored workout plan */
interface StoredSegment {
  id: string;
  title?: string;
  type?: string;
  exercises?: StoredExercise[];
}

/** Grouped segment for rendering -- may be a superset (2+ exercises) or single */
interface DisplayGroup {
  id: string;
  isSuperset: boolean;
  label?: string;
  exercises: {
    id: string;
    title: string;
    repsOrDuration: string;
    imageUrl?: string;
    isGoalExercise?: boolean;
    rampedTarget?: number;
    repsRange?: { min: number; max: number };
    isTimeBased?: boolean;
  }[];
}

// ============================================================================
// Helpers
// ============================================================================

function buildRangeLabel(ex: StoredExercise): string {
  if (ex.repsRange) {
    const { min, max } = ex.repsRange;
    const unit = ex.isTimeBased ? 'שניות' : 'חזרות';
    const goalSuffix = ex.isGoalExercise && ex.rampedTarget ? ` (יעד: ${ex.rampedTarget})` : '';
    return min !== max ? `${min}-${max} ${unit}${goalSuffix}` : `${min} ${unit}${goalSuffix}`;
  }
  if (ex.reps) return ex.reps;
  return ex.type === 'hold' ? '20-40 שניות' : '8-12 חזרות';
}

function buildDisplayGroups(segments: StoredSegment[]): DisplayGroup[] {
  const groups: DisplayGroup[] = [];
  let supersetIdx = 0;

  for (const seg of segments) {
    if (!seg.exercises?.length) continue;

    const isSuperset = seg.exercises.length >= 2 || (seg.title?.includes('סופר') ?? false);

    if (isSuperset) {
      supersetIdx++;
      groups.push({
        id: seg.id,
        isSuperset: true,
        label: `סופרסט ${supersetIdx}`,
        exercises: seg.exercises.map((ex) => ({
          id: ex.id,
          title: ex.name,
          repsOrDuration: buildRangeLabel(ex),
          imageUrl: ex.imageUrl,
          isGoalExercise: ex.isGoalExercise,
          rampedTarget: ex.rampedTarget,
          repsRange: ex.repsRange,
          isTimeBased: ex.isTimeBased,
        })),
      });
    } else {
      for (const ex of seg.exercises) {
        groups.push({
          id: `${seg.id}-${ex.id}`,
          isSuperset: false,
          exercises: [{
            id: ex.id,
            title: ex.name,
            repsOrDuration: buildRangeLabel(ex),
            imageUrl: ex.imageUrl,
            isGoalExercise: ex.isGoalExercise,
            rampedTarget: ex.rampedTarget,
            repsRange: ex.repsRange,
            isTimeBased: ex.isTimeBased,
          }],
        });
      }
    }
  }
  return groups;
}

/**
 * Fallback: fetch exercise data from Firestore when no stored plan exists
 */
async function fetchWorkoutFromFirestore(workoutId: string): Promise<WorkoutData | null> {
  try {
    const exercises = await getAllExercises();
    if (!exercises?.length) return null;

    const resolveImageUrl = (ex: FirestoreExercise): string | null =>
      ex.execution_methods?.[0]?.media?.imageUrl
      || ex.execution_methods?.[0]?.media?.mainVideoUrl
      || ex.media?.imageUrl
      || ex.media?.videoUrl
      || null;

    let rangeMap: Record<string, { repsRange?: { min: number; max: number }; sets?: number; isTimeBased?: boolean; isGoalExercise?: boolean; rampedTarget?: number }> = {};
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('generatedExerciseRanges');
        if (stored) rangeMap = JSON.parse(stored);
      } catch { /* ignore */ }
    }

    const segments: WorkoutSegment[] = exercises.slice(0, 8).map((ex) => {
      const rangeData = rangeMap[ex.id];
      const uniSuffix = (ex as any).symmetry === 'unilateral' ? ' (לכל צד)' : '';
      let repsOrDuration: string;

      if (rangeData?.repsRange) {
        const { min, max } = rangeData.repsRange;
        const unit = rangeData.isTimeBased ? 'שניות' : 'חזרות';
        const goalSuffix = rangeData.isGoalExercise && rangeData.rampedTarget
          ? ` (יעד: ${rangeData.rampedTarget})` : '';
        repsOrDuration = min !== max
          ? `${min}-${max} ${unit}${uniSuffix}${goalSuffix}`
          : `${min} ${unit}${uniSuffix}${goalSuffix}`;
      } else {
        repsOrDuration = ex.type === 'reps' ? `8-12 חזרות${uniSuffix}` : '20-40 שניות';
      }

      return {
        id: ex.id,
        type: 'strength' as const,
        title: getLocalizedText(ex.name),
        repsOrDuration,
        imageUrl: resolveImageUrl(ex),
      };
    });

    return {
      id: workoutId,
      title: 'אימון כוח מותאם',
      description: 'אימון דינמי המותאם לרמה שלך',
      level: 'medium',
      difficulty: 'medium',
      duration: 45,
      segments,
    };
  } catch (error) {
    console.error('[WorkoutPreviewPage] Error fetching workout:', error);
    return null;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function WorkoutPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const workoutId = params.id as string;
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hero media from Home Screen (persisted via sessionStorage)
  const [heroMedia, setHeroMedia] = useState<{ thumbnailUrl?: string; videoUrl?: string } | null>(null);

  // Stored workout plan segments for superset grouping
  const [storedSegments, setStoredSegments] = useState<StoredSegment[] | null>(null);

  // Coach's Note (logic cue from the workout generator)
  const [logicCue, setLogicCue] = useState<string | null>(null);

  // Hydrate sessionStorage data on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Hero media continuity
    try {
      const raw = sessionStorage.getItem('workout_hero_media');
      if (raw) setHeroMedia(JSON.parse(raw));
    } catch { /* ignore */ }

    // 2. Full workout plan (for superset structure + logicCue)
    try {
      const raw = sessionStorage.getItem('active_workout_data');
      if (raw) {
        const plan = JSON.parse(raw);
        if (plan?.segments) setStoredSegments(plan.segments);
        if (plan?.logicCue) setLogicCue(plan.logicCue);
        if (plan?.name || plan?.totalDuration) {
          setWorkout((prev) => prev ?? {
            id: workoutId,
            title: plan.name || 'אימון כוח מותאם',
            description: plan.description || 'אימון דינמי המותאם לרמה שלך',
            difficulty: plan.difficulty || 'medium',
            duration: plan.totalDuration || 45,
            segments: [],
          });
        }
      }
    } catch { /* ignore */ }
  }, [workoutId]);

  // Fetch from Firestore as fallback
  useEffect(() => {
    async function loadWorkout() {
      setIsLoading(true);
      setError(null);

      const firestoreWorkout = await fetchWorkoutFromFirestore(workoutId);
      if (firestoreWorkout) {
        setWorkout((prev) => prev ?? firestoreWorkout);
      } else if (!workout) {
        setError('לא הצלחנו לטעון את האימון');
      }

      setIsLoading(false);
    }

    loadWorkout();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId]);

  // Build display groups from stored segments (superset-aware)
  const displayGroups: DisplayGroup[] = useMemo(() => {
    if (storedSegments) return buildDisplayGroups(storedSegments);
    return [];
  }, [storedSegments]);

  const hasStructuredGroups = displayGroups.length > 0;

  const handleStartWorkout = () => {
    router.push(`/workouts/${workoutId}/active`);
  };

  const handleSwapExercise = (exerciseId: string) => {
    console.log('[WorkoutPreviewPage] Swap exercise:', exerciseId);
  };

  // ── Loading state ──
  if (isLoading && !workout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">טוען את האימון...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error && !workout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 dark:from-gray-950 dark:to-gray-900" dir="rtl">
        <div className="text-center px-6">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">:(</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">לא הצלחנו לטעון את האימון</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">{error || 'נסה שוב מאוחר יותר'}</p>
          <button
            onClick={() => router.push('/home')}
            className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-8 rounded-xl transition-all"
          >
            חזרה לדף הבית
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-white dark:bg-gray-900 flex flex-col overflow-hidden"
      dir="rtl"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* ── Hero Header (with media continuity from Home Screen) ─────── */}
      <WorkoutPreviewHeader
        title={workout?.title || 'אימון כוח מותאם'}
        description={logicCue || workout?.description}
        difficulty={workout?.difficulty === 'easy' ? 1 : workout?.difficulty === 'hard' ? 3 : 2}
        estimatedDuration={workout?.duration}
        heroMediaUrl={heroMedia?.thumbnailUrl}
        heroVideoUrl={heroMedia?.videoUrl}
        routePath={workout?.routePath || undefined}
        categoryIcon="/icons/programs/full_body.svg"
      />

      {/* ── Exercise List ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="px-4 py-5 space-y-3">

          {/* ── Structured groups (from stored workout plan) ────────── */}
          {hasStructuredGroups ? (
            displayGroups.map((group) => {
              if (group.isSuperset) {
                return (
                  <div key={group.id} className="space-y-0">
                    {/* Superset header */}
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <Link2 size={14} className="text-cyan-500" />
                      <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 tracking-wide">
                        {group.label}
                      </span>
                      <div className="flex-1 h-px bg-cyan-200/60 dark:bg-cyan-800/40" />
                    </div>
                    {/* Superset exercises — connected via left border */}
                    <div className="border-r-[3px] border-cyan-400/70 dark:border-cyan-600/50 pr-3 space-y-2 mr-1">
                      {group.exercises.map((ex) => (
                        <StrengthExerciseCard
                          key={ex.id}
                          title={ex.title}
                          repsOrDuration={ex.repsOrDuration}
                          imageUrl={ex.imageUrl || undefined}
                          onSwap={() => handleSwapExercise(ex.id)}
                          isTargetGoal={ex.isGoalExercise}
                          repsRange={ex.repsRange}
                          isTimeBased={ex.isTimeBased}
                          rampedTarget={ex.rampedTarget}
                          isInSuperset
                        />
                      ))}
                    </div>
                  </div>
                );
              }

              // Single exercise
              const ex = group.exercises[0];
              return (
                <StrengthExerciseCard
                  key={group.id}
                  title={ex.title}
                  repsOrDuration={ex.repsOrDuration}
                  imageUrl={ex.imageUrl || undefined}
                  onSwap={() => handleSwapExercise(ex.id)}
                  isTargetGoal={ex.isGoalExercise}
                  repsRange={ex.repsRange}
                  isTimeBased={ex.isTimeBased}
                  rampedTarget={ex.rampedTarget}
                />
              );
            })
          ) : (
            /* ── Flat fallback (from Firestore fetch) ─────────────── */
            workout?.segments.map((segment: WorkoutSegment) => {
              if (segment.type === 'running') {
                return (
                  <RunningSegmentCard
                    key={segment.id}
                    title={segment.title}
                    durationOrDistance={segment.durationOrDistance}
                    pace={segment.pace}
                    statusColor={segment.statusColor}
                  />
                );
              }
              return (
                <StrengthExerciseCard
                  key={segment.id}
                  title={segment.title}
                  repsOrDuration={segment.repsOrDuration}
                  imageUrl={segment.imageUrl || undefined}
                  onSwap={() => handleSwapExercise(segment.id)}
                />
              );
            })
          )}
        </div>
      </div>

      {/* ── Sticky Footer ────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-t border-gray-200/80 dark:border-gray-800 z-50">
        <div className="px-4 py-4 flex items-center gap-3" dir="rtl">
          {/* Start Workout — RIGHT in RTL */}
          <button
            onClick={handleStartWorkout}
            className="flex-1 text-white font-bold rounded-full active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-0 outline-none"
            style={{ background: 'linear-gradient(to left, #0CF2E3, #00BAF7)', height: 42 }}
          >
            <Play size={20} fill="currentColor" />
            <span>התחלת אימון</span>
          </button>

          {/* Home — LEFT in RTL, pill-border circle */}
          <button
            onClick={() => router.push('/home')}
            className="flex-shrink-0 w-[42px] h-[42px] rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform shadow-sm"
            style={{ background: '#FEFEFE', border: '0.5px solid #E0E9FF' }}
            aria-label="בית"
          >
            <Home size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

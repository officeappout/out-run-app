'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Home, Link2 } from 'lucide-react';
import WorkoutPreviewHeader from '@/features/workout-engine/components/WorkoutPreviewHeader';
import StrengthExerciseCard from '@/features/workout-engine/components/cards/StrengthExerciseCard';
import RunningSegmentCard from '@/features/workout-engine/components/cards/RunningSegmentCard';
import { getAllExercises, Exercise as FirestoreExercise, getLocalizedText } from '@/features/content/exercises';
import { getSharedWorkout, type SharedWorkoutDoc } from '@/features/workout-engine/services/share.service';

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
  /** Section header rendered above this group (e.g. "חימום", "שחרור") */
  sectionLabel?: string;
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

  const SECTION_TITLES = new Set(['חימום', 'שחרור']);

  for (const seg of segments) {
    if (!seg.exercises?.length) continue;

    const sectionLabel = seg.title && SECTION_TITLES.has(seg.title) ? seg.title : undefined;
    const isSuperset = seg.exercises.length >= 2 || (seg.title?.includes('סופר') ?? false);

    if (isSuperset && !sectionLabel) {
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
      let isFirst = true;
      for (const ex of seg.exercises) {
        groups.push({
          id: `${seg.id}-${ex.id}`,
          isSuperset: false,
          sectionLabel: isFirst ? sectionLabel : undefined,
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
        isFirst = false;
      }
    }
  }
  return groups;
}

const DIFFICULTY_MAP: Record<number, string> = { 1: 'easy', 2: 'medium', 3: 'hard' };

function sharedExToStored(ex: SharedWorkoutDoc['exercises'][number]): StoredExercise {
  return {
    id: ex.exerciseId,
    name: ex.name,
    sets: ex.sets,
    reps: ex.isTimeBased ? `${ex.reps} שניות` : `${ex.reps} חזרות`,
    imageUrl: ex.imageUrl ?? undefined,
    repsRange: ex.repsRange,
    isTimeBased: ex.isTimeBased,
  };
}

function convertSharedToLocal(shared: SharedWorkoutDoc & { id: string }): {
  workout: WorkoutData;
  segments: StoredSegment[];
} {
  type SE = SharedWorkoutDoc['exercises'][number];
  const warmup: SE[] = [];
  const main: SE[] = [];
  const cooldown: SE[] = [];

  for (const ex of shared.exercises) {
    switch (ex.exerciseRole) {
      case 'warmup': warmup.push(ex); break;
      case 'cooldown': cooldown.push(ex); break;
      default: main.push(ex); break;
    }
  }

  const storedSegments: StoredSegment[] = [];

  if (warmup.length > 0) {
    storedSegments.push({
      id: 'section-warmup',
      title: 'חימום',
      type: 'station',
      exercises: warmup.map(sharedExToStored),
    });
  }

  const usedIds = new Set<string>();
  for (const ex of main) {
    if (usedIds.has(ex.exerciseId)) continue;
    usedIds.add(ex.exerciseId);

    if (ex.pairedWith) {
      const partner = main.find(
        (m) => m.exerciseId === ex.pairedWith && !usedIds.has(m.exerciseId),
      );
      if (partner) {
        usedIds.add(partner.exerciseId);
        storedSegments.push({
          id: `superset-${ex.exerciseId}`,
          title: 'סופרסט',
          type: 'superset',
          exercises: [sharedExToStored(ex), sharedExToStored(partner)],
        });
        continue;
      }
    }

    storedSegments.push({
      id: `main-${ex.exerciseId}`,
      type: 'station',
      exercises: [sharedExToStored(ex)],
    });
  }

  if (cooldown.length > 0) {
    storedSegments.push({
      id: 'section-cooldown',
      title: 'שחרור',
      type: 'station',
      exercises: cooldown.map(sharedExToStored),
    });
  }

  const segments: WorkoutSegment[] = shared.exercises.map((ex) => ({
    id: ex.exerciseId,
    type: 'strength' as const,
    title: ex.name,
    repsOrDuration: ex.isTimeBased
      ? `${ex.repsRange ? `${ex.repsRange.min}-${ex.repsRange.max}` : ex.reps} שניות`
      : `${ex.repsRange ? `${ex.repsRange.min}-${ex.repsRange.max}` : ex.reps} חזרות`,
    imageUrl: ex.imageUrl ?? null,
  }));

  return {
    workout: {
      id: shared.id,
      title: shared.title,
      description: shared.description,
      difficulty: DIFFICULTY_MAP[shared.difficulty] || 'medium',
      duration: shared.estimatedDuration,
      segments,
    },
    segments: storedSegments,
  };
}

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
// Props from Server Component
// ============================================================================

export interface WorkoutPreviewClientProps {
  workoutId: string;
  /** Pre-fetched workout title from server (used to avoid flash of generic title) */
  serverTitle?: string;
  /** Pre-fetched difficulty label from server */
  serverDifficulty?: string;
  /** Pre-fetched duration from server */
  serverDuration?: number;
}

// ============================================================================
// Main Component
// ============================================================================

export default function WorkoutPreviewClient({
  workoutId,
  serverTitle,
  serverDifficulty,
  serverDuration,
}: WorkoutPreviewClientProps) {
  const router = useRouter();
  const [workout, setWorkout] = useState<WorkoutData | null>(
    serverTitle
      ? {
          id: workoutId,
          title: serverTitle,
          difficulty: serverDifficulty || 'medium',
          duration: serverDuration || 0,
          segments: [],
        }
      : null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [heroMedia, setHeroMedia] = useState<{ thumbnailUrl?: string; videoUrl?: string } | null>(null);
  const [storedSegments, setStoredSegments] = useState<StoredSegment[] | null>(null);
  const [logicCue, setLogicCue] = useState<string | null>(null);

  // Hydrate sessionStorage data on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = sessionStorage.getItem('workout_hero_media');
      if (raw) setHeroMedia(JSON.parse(raw));
    } catch { /* ignore */ }

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

  // Fetch workout data — try sharedWorkouts first, then generic Firestore fallback
  useEffect(() => {
    async function loadWorkout() {
      setIsLoading(true);
      setError(null);

      if (storedSegments) {
        setIsLoading(false);
        return;
      }

      const shared = await getSharedWorkout(workoutId);
      if (shared) {
        const { workout: sharedWorkout, segments } = convertSharedToLocal(shared);
        setWorkout((prev) => prev ?? sharedWorkout);
        setStoredSegments(segments);
        setIsLoading(false);
        return;
      }

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
      {/* ── Hero Header ─────────────────────────────────────────────── */}
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

          {hasStructuredGroups ? (
            displayGroups.map((group) => (
              <React.Fragment key={group.id}>
                {/* Section header (warmup / cooldown) */}
                {group.sectionLabel && (
                  <div className="flex items-center gap-2 pt-3 pb-1 px-1">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wide">
                      {group.sectionLabel}
                    </span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  </div>
                )}

                {group.isSuperset ? (
                  <div className="space-y-0">
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <Link2 size={14} className="text-cyan-500" />
                      <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 tracking-wide">
                        {group.label}
                      </span>
                      <div className="flex-1 h-px bg-cyan-200/60 dark:bg-cyan-800/40" />
                    </div>
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
                ) : (
                  <StrengthExerciseCard
                    title={group.exercises[0].title}
                    repsOrDuration={group.exercises[0].repsOrDuration}
                    imageUrl={group.exercises[0].imageUrl || undefined}
                    onSwap={() => handleSwapExercise(group.exercises[0].id)}
                    isTargetGoal={group.exercises[0].isGoalExercise}
                    repsRange={group.exercises[0].repsRange}
                    isTimeBased={group.exercises[0].isTimeBased}
                    rampedTarget={group.exercises[0].rampedTarget}
                  />
                )}
              </React.Fragment>
            ))
          ) : (
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
          <button
            onClick={handleStartWorkout}
            className="flex-1 text-white font-bold rounded-full active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-0 outline-none"
            style={{ background: 'linear-gradient(to left, #0CF2E3, #00BAF7)', height: 42 }}
          >
            <Play size={20} fill="currentColor" />
            <span>התחלת אימון</span>
          </button>

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

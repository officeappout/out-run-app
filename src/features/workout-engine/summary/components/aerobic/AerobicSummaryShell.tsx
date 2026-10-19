'use client';

import React from 'react';
import { useGroupSummaryCtx } from '@/features/workout-engine/summary/hooks/useGroupSummaryCtx';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import RunMapBlock from '../running/RunMapBlock';
import { createContribution } from '@/features/parks/core/services/contribution.service';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { deleteWorkoutWithReversal } from '@/lib/workoutDeletion';
import AerobicSummaryView from './AerobicSummaryView';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { PendingSummaryFeedShare } from '@/features/social/components/SummaryFeedShare';
import { useSummaryStreakWeek } from '@/features/workout-engine/summary/hooks/useSummaryStreakWeek';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { WHO_COMPLIANCE_BASELINE } from '@/features/activity/types/activity.types';
import type { AerobicSummaryV2Data } from './AerobicSummaryView';

interface Props {
  variant: 'group' | 'solo' | 'pair';
  activityType: 'walking' | 'running';
  workout: WorkoutHistoryEntry & { date: Date };
  currentUid: string | undefined;
  streakDays: number;
  onSave: () => void;
  onClose: () => void;
  /** XP earned this session; pill hidden when 0 or undefined */
  xpEarned?: number;
  /**
   * History (read-only) mode — see AerobicSummaryView. The container also
   * skips the group-context Firestore reads and ignores the running store's
   * savedWorkoutId (it belongs to the last live run, not this doc).
   */
  isReadOnly?: boolean;
  /** History delete trigger (caller owns confirm + delete). */
  onDelete?: () => void;
  /** Gap above the open drawer; history passes 0 (no map behind). */
  peekHeight?: number;
}

/**
 * AerobicSummaryShell — data container for the aerobic (walk/run) summary.
 * Reads the running store + group context and owns every write (route
 * rating, workout delete); AerobicSummaryView renders it.
 */
export default function AerobicSummaryShell(props: Props) {
  const { workout, currentUid, isReadOnly = false } = props;

  // Home v2 (enable_home_v2): offer this run's pending feed share here too.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  // Home v2: streak strip + week bars (read-only activity-store reads). The
  // run's own activity write already ran in finishWorkout, so the store
  // numbers include this session; today is marked trained either way.
  const streakWeek = useSummaryStreakWeek({ todayDone: !isReadOnly });
  const weeklySummary = useActivityStore((s) => s.weeklySummary);
  // Home v2: the running program already on the profile (no extra reads)
  // feeds the program ring; the history view leaves it out.
  const activeProgram = useUserStore((st) => st.profile?.running?.activeProgram);
  const programName = useUserStore((st) => st.profile?.running?.generatedProgramTemplate?.name);
  const v2Data: AerobicSummaryV2Data | undefined = v2
    ? {
        streak: isReadOnly ? null : streakWeek,
        weekBars: isReadOnly
          ? undefined
          : [
              { label: 'אימוני אירובי השבוע', value: weeklySummary?.categorySessions?.cardio ?? 0 },
              {
                label: 'דקות פעילות',
                value: (weeklySummary?.categoryTotals?.strength ?? 0) + (weeklySummary?.categoryTotals?.cardio ?? 0),
                max: WHO_COMPLIANCE_BASELINE.weeklyAerobicMinutes,
              },
            ],
        plan: isReadOnly || !activeProgram ? null : { program: activeProgram, programName },
      }
    : undefined;

  const storeSavedWorkoutId = useRunningPlayer((s) => s.savedWorkoutId);
  const savedWorkoutId = isReadOnly ? null : storeSavedWorkoutId;

  const { ctx: groupCtx, loading: groupLoading } = useGroupSummaryCtx(
    isReadOnly ? undefined : workout.groupId,
    isReadOnly ? undefined : workout.attendanceId,
    currentUid,
  );

  const routeCoords = Array.isArray(workout.routePath)
    ? (workout.routePath as [number, number][]).filter(
        (c): c is [number, number] => Array.isArray(c) && c.length === 2,
      )
    : [];

  // Dev-only: inject a Yarkon Park loop so the map+line can be visually tested locally
  // without real GPS movement. Tree-shaken from production builds.
  const displayCoords: [number, number][] =
    process.env.NODE_ENV === 'development' && routeCoords.length < 2
      ? [
          [34.7906, 32.1019],
          [34.7920, 32.1031],
          [34.7938, 32.1045],
          [34.7955, 32.1038],
          [34.7963, 32.1022],
          [34.7950, 32.1010],
          [34.7930, 32.1000],
          [34.7908, 32.1008],
        ]
      : routeCoords;

  const submitRating = async (routeQuality: number) => {
    if (!currentUid) return;
    const loc = routeCoords.length > 0
      ? { lat: routeCoords[0][0], lng: routeCoords[0][1] }
      : { lat: 0, lng: 0 };
    await createContribution({
      userId: currentUid,
      type: 'review',
      status: 'pending',
      location: loc,
      routeQuality,
    });
    // Write cumulative aggregate to the entity doc so the recommendation
    // engine can rank by average quality (ratingSum / ratingCount).
    // official/generated routes → official_routes/{routeId}
    // free runs in a park       → parks/{parkId}
    const { routeId, parkId } = workout;
    const [collection, entityId] = routeId
      ? ['official_routes', routeId]
      : parkId
        ? ['parks', parkId]
        : [null, null];
    if (collection && entityId) {
      try {
        const { doc, updateDoc, increment } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        await updateDoc(doc(db, collection, entityId), {
          ratingSum: increment(routeQuality),
          ratingCount: increment(1),
        });
      } catch (ratingErr) {
        // Non-fatal — contribution already saved
        console.warn('[AerobicSummaryShell] Rating aggregate write failed:', ratingErr);
      }
    }
  };

  return (
    <AerobicSummaryView
      {...props}
      groupCtx={groupCtx}
      groupLoading={groupLoading}
      savedWorkoutId={savedWorkoutId}
      renderMap={() => <RunMapBlock routeCoords={displayCoords} />}
      submitRating={submitRating}
      deleteLastWorkout={() => useRunningPlayer.getState().deleteLastWorkout()}
      deleteWorkoutWithReversal={deleteWorkoutWithReversal}
      feedShareSlot={
        v2 && !isReadOnly ? (
          <PendingSummaryFeedShare activity="cardio" durationSeconds={workout.duration} dateMs={workout.date?.getTime?.()} />
        ) : undefined
      }
      v2={v2Data}
    />
  );
}

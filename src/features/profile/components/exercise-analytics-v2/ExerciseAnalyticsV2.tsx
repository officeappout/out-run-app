'use client';

/**
 * Exercise page v2 (enable_home_v2; boards P-5 / P-6) — replaces the
 * 734-line ExerciseAnalyticsPage for flagged users only:
 *   hero (image, name, goal) → trend card (range, metric, LineChart + goal)
 *   → best set + improvement → history (sets boxes, 20 at a time, "טען עוד").
 * Data: sessions in pages of 60 (never the whole sub-collection) + custom goal.
 * No emoji, no text under 11px.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dumbbell } from 'lucide-react';
import { Card, ErrorState, IconTile } from '@/components/ui/v2';
import { useExerciseSessionsPaged } from '../../hooks/useExerciseSessionsPaged';
import { useExerciseMeta } from '../../hooks/useExerciseMeta';
import { bestSession, filterRange, lastImprovement, type ExerciseMetric, type ExerciseRange } from './exercise-analytics.utils';
import ExerciseHeroV2 from './ExerciseHeroV2';
import ExerciseTrendCardV2 from './ExerciseTrendCardV2';
import ExerciseBestSetCardV2 from './ExerciseBestSetCardV2';
import ExerciseHistoryV2 from './ExerciseHistoryV2';
import ExerciseGoalSheetV2 from './ExerciseGoalSheetV2';

const HISTORY_STEP = 20;

export interface ExerciseAnalyticsV2Props {
  exerciseId: string;
  userId: string;
  exerciseNameHint?: string;
}

export default function ExerciseAnalyticsV2({ exerciseId, userId, exerciseNameHint }: ExerciseAnalyticsV2Props) {
  const router = useRouter();
  const [range, setRange] = useState<ExerciseRange>('3m');
  const [metric, setMetric] = useState<ExerciseMetric>('maxReps');
  const [goalOpen, setGoalOpen] = useState(false);
  const [visible, setVisible] = useState(HISTORY_STEP);
  const data = useExerciseSessionsPaged(userId, exerciseId);
  const meta = useExerciseMeta(exerciseId);
  const nowMs = useMemo(() => Date.now(), []);

  const name = meta.name ?? data.desc[0]?.exerciseName ?? exerciseNameHint ?? exerciseId;
  const latestTarget = data.desc.length ? data.desc[0].targetReps : null;
  const goal = data.customGoal ?? (latestTarget && latestTarget > 1 ? latestTarget : null);
  const inRange = useMemo(() => filterRange(data.asc, range, nowMs), [data.asc, range, nowMs]);
  const best = useMemo(() => bestSession(data.asc), [data.asc]);
  const improvement = useMemo(() => lastImprovement(data.asc), [data.asc]);

  const onLoadMore = useCallback(() => {
    const next = visible + HISTORY_STEP;
    setVisible(next);
    if (next > data.desc.length && data.hasMore) void data.loadMore();
  }, [visible, data]);

  const onSaveGoal = useCallback(
    async (v: number) => {
      setGoalOpen(false);
      await data.saveGoal(v);
    },
    [data],
  );

  return (
    <div className="min-h-[100dvh] bg-v2-surface pb-16 text-v2-ink" dir="rtl">
      <ExerciseHeroV2 name={name} imageUrl={meta.imageUrl} goal={goal} onBack={() => router.back()} onEditGoal={() => setGoalOpen(true)} />

      <div className="mx-auto max-w-md space-y-3 px-4 pt-4">
        {data.loading ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-[380px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
            <div className="h-[140px] animate-pulse rounded-v2-card bg-white shadow-v2-ring" />
          </div>
        ) : data.error ? (
          <ErrorState variant="compact" title="לא הצלחנו לטעון את ההיסטוריה" description="נסו שוב בעוד רגע." />
        ) : data.desc.length === 0 ? (
          <Card padding="none" className="flex flex-col items-center gap-2.5 px-5 py-8 text-center">
            <IconTile icon={Dumbbell} size="lg" />
            <p className="text-[14px] font-bold text-v2-ink-2">אחרי האימון הראשון עם התרגיל הזה, ההתקדמות תופיע כאן.</p>
          </Card>
        ) : (
          <>
            <ExerciseTrendCardV2 sessions={inRange} range={range} metric={metric} goal={goal} onRange={setRange} onMetric={setMetric} />
            <ExerciseBestSetCardV2 best={best} improvement={improvement} />
            <ExerciseHistoryV2
              sessions={data.desc}
              visible={visible}
              canLoadMore={visible < data.desc.length || data.hasMore}
              loadingMore={data.loadingMore}
              onLoadMore={onLoadMore}
            />
            {range === 'all' && data.hasMore && (
              <p className="text-center text-[12px] font-bold text-v2-muted">הגרף מציג את {data.desc.length} האימונים האחרונים</p>
            )}
          </>
        )}
      </div>

      <ExerciseGoalSheetV2
        open={goalOpen}
        currentGoal={data.customGoal}
        initialValue={data.customGoal ?? (best ? Math.min(best.maxReps + 2, 100) : 10)}
        saving={data.savingGoal}
        onClose={() => setGoalOpen(false)}
        onSave={onSaveGoal}
      />
    </div>
  );
}

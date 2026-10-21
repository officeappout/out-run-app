'use client';

/**
 * P-6 — history as ExerciseSetsTable rows (the thumb is the date): turquoise
 * = at target, amber = below. 20 at a time; "טען עוד" shows the next 20 and,
 * once the loaded page runs out, reads the next page (startAfter).
 */
import { ExerciseSetsTable, type ExerciseSetsRow } from '@/components/ui/v2';
import type { RichExerciseSession } from '@/features/workout-engine/services/exercise-history.service';
import { dayMonth, sessionTarget, setTiles } from './exercise-analytics.utils';
import { useT } from '@/hooks/useT';
import { profile } from '@/messages/ns/profile';

export interface ExerciseHistoryV2Props {
  /** Newest first. */
  sessions: RichExerciseSession[];
  visible: number;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

function DateThumb({ ms }: { ms: number }) {
  const { day, month } = dayMonth(ms);
  return (
    <span className="grid w-[58px] shrink-0 place-items-center bg-v2-surface">
      <span className="text-center leading-none">
        <span className="block text-[15px] font-black tabular-nums text-v2-ink">{day}</span>
        <span className="block text-[11px] font-bold text-v2-muted">{month}</span>
      </span>
    </span>
  );
}

export default function ExerciseHistoryV2({ sessions, visible, canLoadMore, loadingMore, onLoadMore }: ExerciseHistoryV2Props) {
  const t = useT(profile);
  const rows: ExerciseSetsRow[] = sessions.slice(0, visible).map((s, i) => {
    const target = sessionTarget(s);
    return {
      key: `${s.dateMs}-${i}`,
      name:
        target != null
          ? t('exerciseAnalytics.history.row.withTarget', { target: String(target), max: String(s.maxReps) })
          : t('exerciseAnalytics.history.row.noTarget', { max: String(s.maxReps) }),
      subtitle: t('exerciseAnalytics.history.row.subtitle', { reps: String(s.totalVolume), sets: String(s.reps.length) }),
      tiles: setTiles(s.reps, target),
      thumb: <DateThumb ms={s.dateMs} />,
    };
  });
  return (
    <section>
      <h3 className="mb-2 whitespace-nowrap text-[17px] font-black text-v2-ink">{t('exerciseAnalytics.history.title')}</h3>
      <ExerciseSetsTable rows={rows} />
      {canLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-3 flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full bg-white text-[14px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60"
        >
          {loadingMore ? t('exerciseAnalytics.history.loadingMore') : t('exerciseAnalytics.history.loadMore')}
        </button>
      )}
    </section>
  );
}

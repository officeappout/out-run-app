'use client';

/** P-6 top — "הסט הטוב ביותר" (date + the sets of that workout) and "שיפור מהפעם הקודמת". */
import { Card, SetTileBox } from '@/components/ui/v2';
import type { RichExerciseSession } from '@/features/workout-engine/services/exercise-history.service';
import { longDate, sessionTarget, setTiles } from './exercise-analytics.utils';
import { useT } from '@/hooks/useT';
import { profile } from '@/messages/ns/profile';

export interface ExerciseBestSetCardV2Props {
  best: RichExerciseSession | null;
  improvement: { previous: number; latest: number; delta: number } | null;
}

export default function ExerciseBestSetCardV2({ best, improvement }: ExerciseBestSetCardV2Props) {
  const t = useT(profile);
  if (!best && !improvement) return null;
  return (
    <div className="space-y-3">
      {best && (
        <Card padding="none" className="p-4">
          <p className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{t('exerciseAnalytics.best.title')}</p>
          <p className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{longDate(best.dateMs)}</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[34px] font-black leading-none tabular-nums text-v2-ink">{best.maxReps}</span>
            <span className="text-[14px] font-bold text-v2-muted">{t('exerciseAnalytics.best.unitReps')}</span>
          </div>
          {best.reps.length > 0 && (
            <>
              <p className="mt-3 text-[12px] font-bold text-v2-muted">{t('exerciseAnalytics.best.setsThatDay')}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {setTiles(best.reps, sessionTarget(best)).map((tile, i) => (
                  <SetTileBox key={i} tile={tile} size={32} />
                ))}
              </div>
            </>
          )}
        </Card>
      )}
      {improvement && improvement.delta !== 0 && (
        <Card padding="none" className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('exerciseAnalytics.best.improvement.title')}</p>
            <p className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted tabular-nums">
              {t('exerciseAnalytics.best.improvement.line', {
                previous: String(improvement.previous),
                latest: String(improvement.latest),
              })}
            </p>
          </div>
          <span
            className={`whitespace-nowrap text-[28px] font-black tabular-nums ${improvement.delta > 0 ? 'text-[#00a86a]' : 'text-v2-ink-2'}`}
            dir="ltr"
          >
            {improvement.delta > 0 ? `+${improvement.delta}` : improvement.delta}
          </span>
        </Card>
      )}
    </div>
  );
}

'use client';

/** P-5 — best set in range vs goal, range + metric pickers, the v2 LineChart with the goal line, 3 numbers. */
import { useMemo } from 'react';
import { Card, DeltaBadge, LineChart, SegmentedPicker } from '@/components/ui/v2';
import type { RichExerciseSession } from '@/features/workout-engine/services/exercise-history.service';
import { chartData, trendStats, type ExerciseMetric, type ExerciseRange } from './exercise-analytics.utils';

const RANGES = [
  { key: '1m', label: 'חודש' },
  { key: '3m', label: '3 חודשים' },
  { key: 'all', label: 'הכל' },
] as const;
const METRICS = [
  { key: 'maxReps', label: 'שיא בסט' },
  { key: 'totalVolume', label: 'נפח כולל' },
] as const;
const RANGE_LABEL: Record<ExerciseRange, string> = { '1m': 'חודש', '3m': '3 חודשים', all: 'הכל' };

export interface ExerciseTrendCardV2Props {
  sessions: RichExerciseSession[];
  range: ExerciseRange;
  metric: ExerciseMetric;
  goal: number | null;
  onRange: (r: ExerciseRange) => void;
  onMetric: (m: ExerciseMetric) => void;
}

export default function ExerciseTrendCardV2({ sessions, range, metric, goal, onRange, onMetric }: ExerciseTrendCardV2Props) {
  const stats = useMemo(() => trendStats(sessions), [sessions]);
  const data = useMemo(() => chartData(sessions, metric), [sessions, metric]);
  const toGoal = goal != null ? goal - stats.best : null;
  const first = sessions[0]?.maxReps ?? 0;
  const last = sessions[sessions.length - 1]?.maxReps ?? 0;

  return (
    <Card padding="none" className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">שיא בסט · {RANGE_LABEL[range]}</span>
        {sessions.length >= 2 && <DeltaBadge current={last} previous={first} suffix="מתחילת הטווח" />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[40px] font-black leading-none !tracking-[-0.03em] tabular-nums text-v2-ink">{stats.best}</span>
        <span className="text-[14px] font-bold text-v2-muted">חזרות</span>
        {toGoal != null && toGoal > 0 && <span className="ms-2 whitespace-nowrap text-[13px] font-extrabold text-v2-deep">עוד {toGoal} ליעד</span>}
        {toGoal != null && toGoal <= 0 && <span className="ms-2 whitespace-nowrap text-[13px] font-extrabold text-[#00845a]">הגעת ליעד</span>}
      </div>

      <SegmentedPicker className="mt-3" options={RANGES} value={range} onChange={onRange} ariaLabel="טווח זמן" />
      <SegmentedPicker className="mt-2" options={METRICS} value={metric} onChange={onMetric} ariaLabel="מדד" />

      <div className="mt-3">
        {data.length > 0 ? (
          <LineChart data={data} goal={metric === 'maxReps' ? goal : null} goalLabel={goal != null ? `יעד ${goal}` : undefined} ariaLabel="מגמה בתרגיל" />
        ) : (
          <p className="py-8 text-center text-[13px] font-bold text-v2-muted">אין אימונים בטווח הזה</p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-v2-hairline pt-3 text-center">
        {[
          { v: String(stats.sessions), l: 'אימונים' },
          { v: stats.totalReps.toLocaleString('he-IL'), l: 'חזרות בסה״כ' },
          { v: String(stats.perWeek), l: 'בשבוע בממוצע' },
        ].map((s) => (
          <div key={s.l}>
            <p className="text-[20px] font-black tabular-nums text-v2-ink">{s.v}</p>
            <p className="whitespace-nowrap text-[12px] font-bold text-v2-muted">{s.l}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

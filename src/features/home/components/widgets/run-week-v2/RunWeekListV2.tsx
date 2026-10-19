'use client';

/**
 * "השבוע שלך" — the week's runs, each type looking different (board
 * R1-prop-types, enable_home_v2). Rendered by NextRunWorkoutCard in place of
 * its run-day / rest-day card when the flag is on. Reads nothing itself:
 * the schedule comes from the profile, today's workout from the card's
 * existing loader (one template read, as before).
 */

import { useMemo } from 'react';
import type RunWorkout from '@/features/workout-engine/players/running/types/run-workout.type';
import { useRunPreviewModel } from '@/features/workout-engine/players/running/components/preview-v2/useRunPreviewModel';
import { inferRunKind, resolveRunCategory, runTypeLabel } from '@/features/workout-engine/players/running/utils/run-preview/run-kind';
import {
  buildRunWeekRows,
  runWeekSummary,
  type RunScheduleEntryLike,
} from '@/features/workout-engine/players/running/utils/run-preview/run-week';
import RunWeekCardV2 from './RunWeekCardV2';

interface RunWeekListV2Props {
  schedule: readonly RunScheduleEntryLike[] | undefined;
  week: number;
  totalWeeks?: number;
  /** "תוכנית 10 ק״מ". */
  programLabel: string;
  scheduleDays: readonly string[];
  /** The entry the home card targets (its `day`). */
  targetDay?: number;
  isRunDay: boolean;
  todayWorkout: RunWorkout | null;
  onStartToday: () => void;
  /** "אין לי כוח היום" — the card's existing skip. */
  onSkipToday?: () => void;
  /** Undo a skip ("ביטול — אני בכל זאת רוצה להתאמן"). */
  onUndoSkip?: () => void;
}

export default function RunWeekListV2({
  schedule, week, totalWeeks, programLabel, scheduleDays, targetDay, isRunDay, todayWorkout, onStartToday, onSkipToday, onUndoSkip,
}: RunWeekListV2Props) {
  const rows = useMemo(
    () => buildRunWeekRows(schedule, week, scheduleDays, { targetDay, isRunDay }),
    [schedule, week, scheduleDays, targetDay, isRunDay],
  );
  const summary = runWeekSummary(rows);
  const todayCategory = rows.find((r) => r.state === 'today')?.entry.category ?? null;
  const extras = useMemo(() => ({ templateCategory: todayCategory }), [todayCategory]);
  const todayModel = useRunPreviewModel(isRunDay ? todayWorkout : null, extras);

  if (rows.length === 0) return null;

  return (
    <section dir="rtl" aria-label="השבוע שלך">
      <p className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
        {programLabel} · {totalWeeks ? `שבוע ${week} מתוך ${totalWeeks}` : `שבוע ${week}`}
      </p>
      <h2 className="text-[22px] font-black !tracking-[-0.02em] text-v2-ink">השבוע שלך</h2>
      <div className="mt-2 flex gap-1.5">
        <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-v2-tint px-2.5 text-[12px] font-extrabold text-v2-deep">
          {summary.total} אימונים
        </span>
        <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-white px-2.5 text-[12px] font-extrabold text-v2-ink-2 shadow-v2-ring">
          {summary.label}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        {rows.map((r) => {
          const category = resolveRunCategory(r.entry.category);
          const isToday = r.state === 'today';
          const model = isToday ? todayModel : null;
          const kind = model?.kind ?? inferRunKind(category);
          return (
            <RunWeekCardV2
              key={`${r.entry.week}-${r.entry.day}-${r.entry.workoutId}`}
              kind={kind}
              typeLabel={model?.typeLabel ?? runTypeLabel(category, kind)}
              title={model?.title ?? r.entry.workoutName ?? runTypeLabel(category, kind)}
              state={r.state}
              dayLetter={r.dayLetter}
              model={model}
              onStart={isToday ? onStartToday : undefined}
            />
          );
        })}
      </div>

      {isRunDay && onSkipToday && (
        <button
          type="button"
          onClick={onSkipToday}
          className="mt-2 w-full whitespace-nowrap py-2 text-[12.5px] font-bold text-v2-muted"
        >
          אין לי כוח היום — דלג לעוד
        </button>
      )}
      {!isRunDay && onUndoSkip && (
        <button type="button" onClick={onUndoSkip} className="mt-2 whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep">
          ביטול — אני בכל זאת רוצה להתאמן
        </button>
      )}
    </section>
  );
}

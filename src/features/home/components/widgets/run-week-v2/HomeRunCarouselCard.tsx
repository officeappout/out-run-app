'use client';

/**
 * Today's planned run (or the next one, "הבא") as a slide of the home daily
 * carousel "האימון היומי שלך" (enable_home_v2). The slot itself is chosen by
 * resolveHomeRunSlot (home-run-slot.ts); this only renders it: the program
 * line, the existing v2 week card (RunWeekCardV2: kind, title, journey,
 * intensity profile) and the unified run overview (RunOverviewHomeSheet,
 * #495) on tap. Today's workout is preloaded with the same loader the week
 * list uses (usePlannedRunWorkout); a "next" run loads only when opened.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CalmReturnState } from '@/lib/calm-return';
import type { WeatherFlag } from '@/features/weather/core/weather.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { usePlannedRunWorkout } from '@/features/home/hooks/usePlannedRunWorkout';
import { nextRunDayHint, type HomeRunSlot } from '@/features/home/utils/home-run-slot';
import { useRunPreviewModel } from '@/features/workout-engine/players/running/components/preview-v2/useRunPreviewModel';
import { inferRunKind, resolveRunCategory, runTypeLabel } from '@/features/workout-engine/players/running/utils/run-preview/run-kind';
import RunOverviewHomeSheet from '@/features/workout-engine/players/running/components/overview-v2/RunOverviewHomeSheet';
import { plannedRunMapUrl } from '@/features/workout-engine/players/running/utils/run-overview/run-overview-url';
import type { RunEdits } from '@/features/workout-engine/players/running/utils/run-overview/run-edits';
import RunWeekCardV2 from './RunWeekCardV2';

const DIST_LABEL: Record<string, string> = {
  '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ', '10k': '10 ק״מ', maintenance: '5 ק״מ',
};

export interface HomeRunCarouselCardProps {
  slot: HomeRunSlot;
  profile: UserFullProfile | null | undefined;
  /** The program's current week (resolveRunningCurrentWeek). */
  currentWeek: number | undefined;
  weatherFlag?: WeatherFlag | null;
  calmReturn?: CalmReturnState | null;
}

export default function HomeRunCarouselCard({ slot, profile, currentWeek, weatherFlag = null, calmReturn = null }: HomeRunCarouselCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isToday = slot.kind === 'today';
  const { entry } = slot;
  const calmLoad = calmReturn?.isLightened ? calmReturn.load : null;

  const { workout, loading } = usePlannedRunWorkout({
    enabled: open || isToday,
    profile,
    workoutId: entry.workoutId,
    week: entry.week,
    currentWeek,
    weatherFlag,
    calmLoad,
  });

  const category = resolveRunCategory(entry.category);
  const extras = useMemo(() => ({ templateCategory: entry.category ?? null }), [entry.category]);
  const model = useRunPreviewModel(isToday ? workout : null, extras);
  const kind = model?.kind ?? inferRunKind(category);
  const typeLabel = model?.typeLabel ?? runTypeLabel(category, kind);

  const running = profile?.running;
  const distLabel = DIST_LABEL[running?.generatedProgramTemplate?.targetDistance ?? '5k'] ?? '5 ק״מ';
  const totalWeeks = running?.generatedProgramTemplate?.canonicalWeeks;
  const weekLabel = totalWeeks ? `שבוע ${entry.week} מתוך ${totalWeeks}` : `שבוע ${entry.week}`;

  const go = (edits: RunEdits, suggest: boolean) => {
    setOpen(false);
    router.push(plannedRunMapUrl({
      workoutId: entry.workoutId, week: entry.week, day: entry.day, autoStart: !suggest, suggest, edits,
    }));
  };

  const card = (
    <RunWeekCardV2
      kind={kind}
      typeLabel={isToday ? typeLabel : `${typeLabel} · הבא`}
      title={model?.title ?? entry.workoutName ?? typeLabel}
      state={isToday ? 'today' : 'upcoming'}
      dayLetter={isToday ? null : nextRunDayHint(slot.daysAway)}
      model={model}
      onStart={isToday ? () => setOpen(true) : undefined}
    />
  );

  return (
    <div className="flex h-full w-full flex-col rounded-v2-card bg-v2-surface p-3" dir="rtl">
      <p className="truncate whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
        תוכנית {distLabel} · {weekLabel}
      </p>
      <h3 className="whitespace-nowrap text-[19px] font-black !tracking-[-0.02em] text-v2-ink">
        {isToday ? 'הריצה של היום' : 'הריצה הבאה'}
      </h3>
      <div className="mt-3">
        {isToday ? card : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block w-full text-right transition-transform duration-150 ease-v2 active:scale-[0.97]"
            aria-label={`הריצה הבאה: ${entry.workoutName ?? typeLabel}`}
          >
            {card}
          </button>
        )}
      </div>
      {!isToday && (
        <p className="mt-auto whitespace-nowrap pt-2 text-[12px] font-bold text-v2-muted">
          לחיצה לפרטי האימון
        </p>
      )}
      <RunOverviewHomeSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        onGo={(edits) => go(edits, false)}
        onSuggestRoute={(edits) => go(edits, true)}
        workout={workout}
        isLoading={loading}
        templateCategory={entry.category ?? null}
        week={{ week: entry.week, day: entry.day, totalWeeks }}
      />
    </div>
  );
}

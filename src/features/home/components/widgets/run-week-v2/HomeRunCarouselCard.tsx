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
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

export interface HomeRunCarouselCardProps {
  slot: HomeRunSlot;
  profile: UserFullProfile | null | undefined;
  /** The program's current week (resolveRunningCurrentWeek). */
  currentWeek: number | undefined;
  weatherFlag?: WeatherFlag | null;
  calmReturn?: CalmReturnState | null;
  /** "אין לי כוח היום — דלג לעוד" — RunWeekListV2's local skip (useHomeRunSlot). */
  onSkipToday?: () => void;
  /** "ביטול — אני בכל זאת רוצה להתאמן". */
  onUndoSkip?: () => void;
  /** Rendered on its own (carousel hidden): no fixed slide height. */
  standalone?: boolean;
}

export default function HomeRunCarouselCard({
  slot, profile, currentWeek, weatherFlag = null, calmReturn = null, onSkipToday, onUndoSkip, standalone = false,
}: HomeRunCarouselCardProps) {
  const t = useT(home);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const skipped = !!slot.skippedToday;
  // Today's run, still on (not skipped) — the one with the CTA and the preloaded strip.
  const isToday = slot.kind === 'today' && !skipped;
  const isSkippedToday = slot.kind === 'today' && skipped;
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
  const distLabel = t('runCard.dist', { dist: running?.generatedProgramTemplate?.targetDistance ?? '5k' });
  const totalWeeks = running?.generatedProgramTemplate?.canonicalWeeks;
  const programLine = totalWeeks
    ? t('runCard.program.withTotal', { dist: distLabel, week: String(entry.week), total: String(totalWeeks) })
    : t('runCard.program.noTotal', { dist: distLabel, week: String(entry.week) });

  const go = (edits: RunEdits, suggest: boolean) => {
    setOpen(false);
    router.push(plannedRunMapUrl({
      workoutId: entry.workoutId, week: entry.week, day: entry.day, autoStart: !suggest, suggest, edits,
    }));
  };

  const card = (
    <RunWeekCardV2
      kind={kind}
      typeLabel={isToday || isSkippedToday ? typeLabel : t('runCard.typeNext', { type: typeLabel })}
      title={model?.title ?? entry.workoutName ?? typeLabel}
      state={isToday ? 'today' : isSkippedToday ? 'skipped' : 'upcoming'}
      dayLetter={isToday || isSkippedToday ? null : nextRunDayHint(slot.daysAway)}
      model={model}
      onStart={isToday ? () => setOpen(true) : undefined}
    />
  );

  return (
    <div className={`flex w-full flex-col rounded-v2-card bg-v2-surface p-3 ${standalone ? '' : 'h-full'}`} dir="rtl">
      <p className="truncate whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
        {programLine}
      </p>
      <h3 className="whitespace-nowrap text-[19px] font-black !tracking-[-0.02em] text-v2-ink">
        {isToday || isSkippedToday ? t('runCard.title.today') : t('runCard.title.next')}
      </h3>
      <div className="mt-3">
        {isToday || isSkippedToday ? card : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block w-full text-right transition-transform duration-150 ease-v2 active:scale-[0.97]"
            aria-label={t('runCard.nextAria', { name: entry.workoutName ?? typeLabel })}
          >
            {card}
          </button>
        )}
      </div>
      <div className="mt-auto flex flex-col items-start pt-2">
        {slot.kind === 'next' && (
          <p className="whitespace-nowrap text-[12px] font-bold text-v2-muted">{t('runCard.tapHint')}</p>
        )}
        {isToday && onSkipToday && (
          <button
            type="button"
            onClick={onSkipToday}
            className="w-full whitespace-nowrap py-2 text-[12.5px] font-bold text-v2-muted"
          >
            {t('runCard.skip')}
          </button>
        )}
        {skipped && onUndoSkip && (
          <button
            type="button"
            onClick={onUndoSkip}
            className="whitespace-nowrap py-1 text-[12.5px] font-extrabold text-v2-deep"
          >
            {t('runCard.undoSkip')}
          </button>
        )}
      </div>
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

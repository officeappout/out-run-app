'use client';

/**
 * HomeDonePost: enable_home_after_v1 stage 3. One finished workout as a post, a slide of the after-workout
 * carousel (canvas boards HomePost / HomeAfterPostKit, surface "home"): "done today" + the finish time, the
 * workout's icon and title, a row of big numbers, and "details". Tapping it opens that workout's summary
 * (onOpen); a met step goal has no summary, so it is not a button. Numbers come from homeDonePostStats,
 * real values only.
 *
 * enable_workout_post_v1 (board PostCompact): the slide is the one workout post card, compact surface
 * (icon, title, one line, 3 small rings), so home, feed and share read the same.
 */

import React from 'react';
import { resolveIconKey, getProgramIcon } from '@/features/content/programs/core/program-icon.util';
import { DoneCheck } from '@/components/ui/v2/DoneRow';
import { homeDonePostStats, donePostTime, type DonePostWorkout } from '@/features/home/utils/home-done-post';
import type { TodayActivityCardData } from './TodayActivityCard';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { useUiDir } from '@/lib/i18n/useUiDir';
import WorkoutPostCard from '@/features/social/post-card/WorkoutPostCard';
import { postFromDone } from '@/features/social/post-card/post-model';
import { useWorkoutPostV1 } from '@/features/social/post-card/useWorkoutPostV1';

export interface HomeDonePostProps {
  card: TodayActivityCardData;
  workout?: DonePostWorkout;
  /** A short extra line (the run plan recap), when the run counted for today's slot. */
  note?: string;
  onOpen?: (card: TodayActivityCardData) => void;
}

const TONE = {
  strength: { fg: '#0284c7', bg: 'rgba(0,186,247,0.12)', check: '#00C9F2' },
  cardio: { fg: '#65a30d', bg: 'rgba(132,204,22,0.16)', check: '#84CC16' },
  steps: { fg: '#d97706', bg: 'rgba(245,158,11,0.14)', check: '#f59e0b' },
  maintenance: { fg: '#7c3aed', bg: 'rgba(139,92,246,0.12)', check: '#8b5cf6' },
} as const;

export default function HomeDonePost({ card, workout, note, onOpen }: HomeDonePostProps) {
  const { direction } = useUiDir();
  const t = useT(home);
  const tone = TONE[card.category] ?? TONE.strength;
  const stats = homeDonePostStats(card, workout, t.locale);
  const time = donePostTime(workout, t.locale);
  const iconKey = resolveIconKey(card.programId, card.workoutType ?? (card.category === 'steps' ? 'walking' : card.category));
  const open = card.category !== 'steps' && onOpen ? () => onOpen(card) : undefined;
  const postV1 = useWorkoutPostV1();
  if (postV1) {
    const model = postFromDone({ ...card, ...workout, note: note ?? null });
    return (
      <div className="flex h-full w-full items-start" data-home-after-post={card.key}>
        <WorkoutPostCard model={model} surface="compact" meta={time} onOpen={open} />
      </div>
    );
  }

  const body = (
    <>
      <span className="flex items-center gap-2">
        <DoneCheck color={tone.check} />
        <span className="flex-1 text-[16px] font-black text-v2-ink">{t('homeAfter.done.title')}</span>
        {time && <span className="text-[12.5px] font-bold tabular-nums text-v2-muted">{time}</span>}
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-v2-tile" style={{ background: tone.bg, color: tone.fg }}>
          {getProgramIcon(iconKey, 'w-6 h-6')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[21px] font-black leading-tight tracking-v2-tight text-v2-ink">{card.title}</span>
          {note && <span className="block truncate text-[12.5px] font-bold text-v2-muted">{note}</span>}
        </span>
      </span>
      {stats.length > 0 && (
        <span className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <span key={s.label} className="flex min-w-0 flex-col">
              <span className="text-[26px] font-black leading-none tabular-nums text-v2-ink">{s.value}</span>
              <span className="mt-1.5 truncate text-[12px] font-bold text-v2-muted">{s.label}</span>
            </span>
          ))}
        </span>
      )}
      <span className="flex-1" />
      {open && (
        <span className="inline-flex h-10 items-center self-start rounded-full bg-white px-4 text-[13.5px] font-extrabold text-v2-deep shadow-v2-ring">
          {t('homeAfter.post.details')}
        </span>
      )}
    </>
  );

  const cls = 'flex h-full w-full flex-col gap-4 rounded-v2-card bg-v2-surface p-4 text-start shadow-v2-card';
  return open ? (
    <button type="button" dir={direction} data-home-after-post={card.key} onClick={open} aria-label={t('homeAfter.post.aria', { title: card.title })} className={`${cls} transition-transform duration-150 ease-v2 active:scale-[0.99]`}>
      {body}
    </button>
  ) : (
    <article dir={direction} data-home-after-post={card.key} className={cls}>
      {body}
    </article>
  );
}

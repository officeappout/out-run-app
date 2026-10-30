'use client';

/**
 * DoneTodayCard — home v2. Shown on /home once today's workout is done, in
 * place of the classic "הפעילות שלי היום" strip.
 *
 * Compact (owner, 19.10.2026): one row per completed workout in the big
 * schedule's done look (DoneRow — icon tile, title, one-line meta like
 * "35 דק׳ · 5.2 ק״מ", done check, chevron → its summary). A strength + a run
 * day = two rows stacked. The earlier version (#390) added a header, stat
 * tiles (minutes / XP / streak) and a "next planned" line — removed.
 * Renders nothing without enable_home_v2.
 */

import React from 'react';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import { resolveIconKey, getProgramIcon } from '@/features/content/programs/core/program-icon.util';
import DoneRow from '@/components/ui/v2/DoneRow';
import { buildDoneWorkoutRows, type DoneRowWorkout } from '@/features/home/utils/done-workout-rows';
import type { TodayActivityCardData } from './TodayActivityCard';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { useUiDir } from '@/lib/i18n/useUiDir';

export interface DoneTodayCardProps {
  /** Same list the classic strip renders (real workout docs + a met step goal). */
  cards: TodayActivityCardData[];
  /** Today's saved workout docs — distance / sets for each row's meta. */
  workouts: readonly DoneRowWorkout[];
  onCardTap?: (card: TodayActivityCardData) => void;
  /** Run-done state: an extra line on the row of a run that counted for today's slot, by workout id. */
  notes?: Readonly<Record<string, string>>;
  /**
   * enable_home_after_v1: the card is the last slide of the after-workout carousel: its own
   * surface, full slide height, rows scroll inside, the "done today" title.
   */
  slide?: boolean;
}

const TONE = {
  strength: { fg: '#00baf7', bg: 'rgba(0,186,247,0.12)', check: '#00C9F2' },
  cardio: { fg: '#65a30d', bg: 'rgba(132,204,22,0.16)', check: '#84CC16' },
  steps: { fg: '#d97706', bg: 'rgba(245,158,11,0.14)', check: '#f59e0b' },
  maintenance: { fg: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', check: '#8b5cf6' },
} as const;

export default function DoneTodayCard({ cards, workouts, onCardTap, notes, slide = false }: DoneTodayCardProps) {
  const { direction } = useUiDir();
  const v2 = useHomeV2();
  const t = useT(home);
  if (!v2 || cards.length === 0) return null;
  const rows = buildDoneWorkoutRows(cards, workouts, t.locale, notes);

  return (
    <section
      dir={direction}
      aria-label={t('doneToday.aria')}
      data-home-after-done={slide || undefined}
      className={slide ? 'flex h-full w-full flex-col rounded-v2-card bg-v2-surface p-3' : undefined}
    >
      <h3 className={slide
        ? 'mb-2 whitespace-nowrap px-1 text-[16px] font-black text-v2-ink'
        : 'mb-1.5 whitespace-nowrap px-1 text-[13px] font-extrabold text-v2-deep'}
      >
        {t(slide ? 'homeAfter.done.title' : 'doneToday.title')}
      </h3>
      <ul className={slide ? 'min-h-0 flex-1 space-y-1.5 overflow-y-auto' : 'space-y-1.5'}>
        {rows.map(({ card, meta, tappable }) => {
          const tone = TONE[card.category] ?? TONE.strength;
          const iconKey = resolveIconKey(card.programId, card.workoutType ?? (card.category === 'steps' ? 'walking' : card.category));
          return (
            <li key={card.key}>
              <DoneRow
                icon={getProgramIcon(iconKey, 'w-5 h-5')}
                tone={tone}
                title={card.title}
                meta={meta}
                checkColor={tone.check}
                onClick={tappable && onCardTap ? () => onCardTap(card) : undefined}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

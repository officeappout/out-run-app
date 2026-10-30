'use client';

/**
 * WeekInfoDemo — the week sheet's loop (board DragCard as corrected 29.10), from the user's
 * real week: the black "שינוי לוז" pill and "סידור השבוע", then the week builder's own rows
 * (WeekDayRow + WeekSessionPiece with its drag handle) where the first session ahead lifts and
 * moves to the next free day ("הוזז"), then "אישור השבוע" with its two save choices. No move
 * in this week → the rows stay put. Visual only (inert); reduced motion = static.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { CalendarCog, GripVertical } from 'lucide-react';
import { WeekDayRow, WeekSessionPiece } from '@/components/ui/v2';
import type { ScheduleT } from '@/messages/ns/schedule';
import { useInfoLoop } from '../useInfoLoop';
import { inertRef } from '../inert-ref';
import type { WeekInfoModel, WeekInfoRow } from './week-info.model';

type Phase = 'pill' | 'lift' | 'moved' | 'confirm';
const WITH_MOVE: readonly Phase[] = ['pill', 'lift', 'moved', 'confirm'];
const NO_MOVE: readonly Phase[] = ['pill', 'confirm'];
const MS: Record<Phase, number> = { pill: 2400, lift: 1400, moved: 2400, confirm: 3200 };

export interface WeekInfoDemoProps {
  model: WeekInfoModel;
  t: ScheduleT;
  /** The home strip's "שינוי לוז" label. */
  editLabel: string;
  /** The program's own icon tile (as the builder shows it). */
  icon: React.ReactNode;
}

export default function WeekInfoDemo({ model, t, editLabel, icon }: WeekInfoDemoProps) {
  const phases = model.move ? WITH_MOVE : NO_MOVE;
  const { phase: idx, reduced } = useInfoLoop(phases.map((p) => MS[p]));
  const phase = phases[idx];
  const moved = phase === 'moved' || phase === 'confirm';
  const lifted = phase === 'lift';

  const sessionOn = (row: WeekInfoRow): 'here' | 'movedHere' | null => {
    if (model.move && moved) {
      if (row.dow === model.move.fromDow) return null;
      if (row.dow === model.move.toDow) return 'movedHere';
    }
    return row.hasSession ? 'here' : null;
  };

  const piece = (row: WeekInfoRow, where: 'here' | 'movedHere') => {
    const moving = model.move && (row.dow === model.move.fromDow || where === 'movedHere');
    const tag = row.done
      ? { label: t('weekBuilder.tag.done'), tone: 'done' as const }
      : where === 'movedHere'
        ? { label: t('weekBuilder.tag.moved'), tone: 'moved' as const }
        : null;
    const letter = model.move && where === 'movedHere' ? model.rows.find((r) => r.dow === model.move!.fromDow)?.letter ?? row.letter : row.letter;
    return (
      <motion.div
        key={moving ? 'moving' : row.dow}
        layoutId={moving && !reduced ? 'week-info-moving' : undefined}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        animate={lifted && moving ? { scale: 1.03, boxShadow: '0 18px 40px -18px rgba(9,30,50,0.45)' } : { scale: 1, boxShadow: '0 0 0 0 rgba(9,30,50,0)' }}
        className="relative rounded-[14px]"
      >
        <WeekSessionPiece
          icon={icon}
          title={t('featureInfo.week.session', { day: letter })}
          tag={tag}
          trailing={
            row.done || row.past ? null : (
              <span className="-me-1 grid h-10 w-8 shrink-0 place-items-center text-v2-muted">
                <GripVertical size={18} strokeWidth={2.2} aria-hidden />
              </span>
            )
          }
        />
      </motion.div>
    );
  };

  return (
    <div aria-hidden className="pointer-events-none flex flex-col gap-2.5" ref={inertRef}>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full bg-[#0e1419] px-[11px] py-1 text-xs font-extrabold text-white transition-shadow duration-300 ${
            phase === 'pill' && !reduced ? 'shadow-[0_0_0_3px_rgba(0,186,247,0.45)]' : ''
          }`}
        >
          {editLabel}
        </span>
        <span className="text-v2-muted">›</span>
        <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 text-[12.5px] font-extrabold text-v2-deep shadow-v2-ring">
          <CalendarCog size={14} strokeWidth={2.4} aria-hidden />
          {t('planner.arrange')}
        </span>
      </div>

      <div className="rounded-[22px] bg-white shadow-v2-card">
        {model.rows.map((row, i) => {
          const where = sessionOn(row);
          const target = model.move?.toDow === row.dow && lifted;
          return (
            <div key={row.dow} className={`transition-colors duration-150 first:rounded-t-[22px] last:rounded-b-[22px] ${target ? 'bg-v2-tint/70' : ''}`}>
              <WeekDayRow
                letter={row.letter}
                date={row.date}
                divider={i > 0}
                muted={!where}
                emptyLabel={row.past ? t('weekBuilder.past') : t('weekBuilder.rest')}
              >
                {where ? piece(row, where) : null}
              </WeekDayRow>
            </div>
          );
        })}
      </div>

      <div className={`flex flex-col gap-2 transition-opacity duration-300 ${phase === 'confirm' || reduced ? 'opacity-100' : 'opacity-40'}`}>
        <span className="rounded-full py-2.5 text-center text-[15px] font-extrabold text-[#04222b]" style={{ background: 'linear-gradient(135deg,#00baf7,#0cf2e3)' }}>
          {t('weekBuilder.confirm')}
        </span>
        <div className="flex gap-2">
          <span className="flex-1 rounded-full bg-white py-2 text-center text-[13px] font-extrabold text-v2-ink shadow-v2-ring">{t('planner.scope.onlyWeek')}</span>
          <span className="flex-1 rounded-full bg-white py-2 text-center text-[13px] font-bold text-v2-ink-2 shadow-v2-ring">{t('planner.scope.forward')}</span>
        </div>
      </div>
    </div>
  );
}

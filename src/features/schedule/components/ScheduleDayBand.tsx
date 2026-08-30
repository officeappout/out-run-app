'use client';

/**
 * ScheduleDayBand — extracted from ScheduleStep.tsx (30.08.2026). Pure
 * presentational: no useOnboardingStore/coin-claim logic — that stays with
 * the caller's onDayCardClick/onSessionToggle/onSetRestDay/onClosePopover
 * handlers (ScheduleStep.tsx's handleSessionToggle owns the reward-claim
 * side effect). Conditionally renders DayPopover, its own dependency — not
 * imported by ScheduleStep.tsx directly.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Moon } from 'lucide-react';
import {
  DAY_LETTERS,
  SKILL_DISPLAY,
  type ScheduleDay,
  type ScheduleItemId,
  type Warning,
} from '@/features/schedule/types/smartSchedule.types';
import type { WizardOption } from '@/features/schedule/services/scheduleSeed.service';
import DayPopover from './DayPopover';

export interface ScheduleDayBandProps {
  scheduleGrid: ScheduleDay[];
  openPopoverDay: number;
  activeWizardOptions: WizardOption[];
  liveWarnings: Warning[];
  isHebrew: boolean;
  onDayCardClick: (dayIndex: number) => void;
  onSessionToggle: (dayIndex: number, optionId: ScheduleItemId) => void;
  onSetRestDay: (dayIndex: number) => void;
  onClosePopover: () => void;
}

export default function ScheduleDayBand({
  scheduleGrid,
  openPopoverDay,
  activeWizardOptions,
  liveWarnings,
  isHebrew,
  onDayCardClick,
  onSessionToggle,
  onSetRestDay,
  onClosePopover,
}: ScheduleDayBandProps) {
  return (
    <>
      {/* ── [Smart Schedule v1.3] Horizontal 7-day grid ─────────────── */}
      {/* Each column = day capsule (letter) + skill icons below, all one tap target */}
      <div className="grid grid-cols-7 gap-1 relative">
        {DAY_LETTERS.map((dayLabel, index) => {
          const day = scheduleGrid[index];
          const isRest = day.sessions.length === 0;
          const isSaturday = index === 6;
          const isPopoverOpen = openPopoverDay === index;
          const hasWarningOnDay = liveWarnings.some((w) =>
            w.affectedDays.includes(index),
          );

          return (
            <div key={index} className="relative">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => onDayCardClick(index)}
                className={`w-full flex flex-col items-center gap-1 py-2 px-0.5 rounded-xl transition-all duration-200 border ${
                  isRest
                    ? isSaturday
                      ? 'bg-slate-50 border-slate-100'
                      : 'bg-white border-slate-200'
                    : 'bg-[#5BC2F2]/6 border-[#5BC2F2]/35 shadow-[0_2px_6px_rgba(91,194,242,0.10)]'
                } ${isPopoverOpen ? 'ring-2 ring-[#5BC2F2] ring-offset-1' : ''}`}
                aria-label={`${dayLabel} — ${isRest ? 'יום מנוחה' : `${day.sessions.length} סשנים`}`}
              >
                {/* ── Day Capsule — independent rounded chip ── */}
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isRest
                      ? 'bg-slate-100 text-slate-500'
                      : 'bg-[#5BC2F2]/15 text-[#5BC2F2]'
                  } ${isPopoverOpen ? 'bg-[#5BC2F2] text-white' : ''}`}
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {dayLabel}
                </span>

                {/* ── Icons below capsule — emoji only, no text ── */}
                {isRest ? (
                  <Moon size={15} className="text-slate-300 mt-0.5" strokeWidth={1.8} />
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    {day.sessions.slice(0, 2).map((session, si) => {
                      const display = SKILL_DISPLAY[session.skillId];
                      if (!display) return null;
                      return (
                        <div
                          key={si}
                          className={`w-7 h-7 rounded-full ${display.tint} flex items-center justify-center overflow-hidden`}
                          aria-hidden
                          title={display.shortName}
                        >
                          <img
                            src={display.iconPath}
                            alt={display.shortName}
                            className="w-4 h-4 object-contain"
                            onError={(e) => {
                              // Fallback: hide broken img and show emoji sibling
                              e.currentTarget.style.display = 'none';
                              const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                              if (next) next.style.display = '';
                            }}
                          />
                          <span className="hidden text-sm leading-none">{display.icon}</span>
                        </div>
                      );
                    })}
                    {day.sessions.length > 2 && (
                      <span className="text-[9px] text-slate-400 font-bold leading-none">
                        +{day.sessions.length - 2}
                      </span>
                    )}
                  </div>
                )}

                {/* Warning dot */}
                {hasWarningOnDay && !isPopoverOpen && (
                  <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-orange-400" />
                )}
              </motion.button>
            </div>
          );
        })}
      </div>

      {/* ── DayPopover — anchored beneath the grid (full-width sheet) ─ */}
      <AnimatePresence>
        {openPopoverDay !== -1 && (
          <DayPopover
            dayIndex={openPopoverDay}
            day={scheduleGrid[openPopoverDay]}
            activeWizardOptions={activeWizardOptions}
            isHebrew={isHebrew}
            onToggleOption={(optionId) => onSessionToggle(openPopoverDay, optionId)}
            onSetRestDay={() => onSetRestDay(openPopoverDay)}
            onClose={onClosePopover}
          />
        )}
      </AnimatePresence>
    </>
  );
}

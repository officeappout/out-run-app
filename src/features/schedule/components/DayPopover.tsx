'use client';

/**
 * DayPopover — extracted from ScheduleStep.tsx (30.08.2026). Rendered only
 * by ScheduleDayBand when a day is open — not imported by ScheduleStep.tsx
 * directly. Pure presentational: no useOnboardingStore/coin-claim logic —
 * that stays with the caller's onToggleOption/onSetRestDay handlers
 * (ScheduleStep.tsx's handleSessionToggle owns the reward-claim side effect).
 */

import { motion } from 'framer-motion';
import { Check, Moon, X } from 'lucide-react';
import {
  DAY_LETTERS,
  SKILL_DISPLAY,
  type ScheduleDay,
  type ScheduleItemId,
} from '@/features/schedule/types/smartSchedule.types';
import type { WizardOption } from '@/features/schedule/services/scheduleSeed.service';

export interface DayPopoverProps {
  dayIndex: number;
  day: ScheduleDay;
  activeWizardOptions: WizardOption[];
  isHebrew: boolean;
  onToggleOption: (optionId: ScheduleItemId) => void;
  onSetRestDay: () => void;
  onClose: () => void;
}

export default function DayPopover({
  dayIndex,
  day,
  activeWizardOptions,
  isHebrew,
  onToggleOption,
  onSetRestDay,
  onClose,
}: DayPopoverProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      className="mt-3 rounded-2xl bg-white border border-slate-200 shadow-[0_12px_32px_rgba(15,23,42,0.12)] overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
        <h4
          className="text-sm font-bold text-slate-800"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {isHebrew
            ? `מה מתאמנים ביום ${DAY_LETTERS[dayIndex]}׳?`
            : `Day ${DAY_LETTERS[dayIndex]} — pick programs`}
        </h4>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Close"
        >
          <X size={16} className="text-slate-500" />
        </button>
      </div>
      <div className="max-h-[280px] overflow-y-auto p-2 space-y-1">
        {activeWizardOptions.map((opt) => {
          const isPicked = day.sessions.some((s) => s.skillId === opt.id);
          const display = SKILL_DISPLAY[opt.id];
          return (
            <button
              key={opt.id}
              onClick={() => onToggleOption(opt.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                isPicked
                  ? 'bg-[#5BC2F2]/10 border border-[#5BC2F2]/40'
                  : 'bg-white border border-slate-100 hover:border-slate-200'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full ${display.tint} flex items-center justify-center overflow-hidden shrink-0`}
              >
                <img
                  src={display.iconPath}
                  alt={display.shortName}
                  className="w-5 h-5 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (next) next.style.display = '';
                  }}
                />
                <span className="hidden text-base leading-none">{display.icon}</span>
              </div>
              <span
                className={`flex-1 text-right text-sm ${
                  isPicked ? 'font-bold text-slate-900' : 'font-medium text-slate-600'
                }`}
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {isHebrew ? opt.labelHe : opt.labelEn}
              </span>
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                  isPicked ? 'bg-[#5BC2F2]' : 'bg-slate-100 border border-slate-200'
                }`}
              >
                {isPicked && <Check size={12} className="text-white" strokeWidth={3} />}
              </div>
            </button>
          );
        })}

        {/* Rest day toggle */}
        <button
          onClick={onSetRestDay}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all mt-1 ${
            day.sessions.length === 0
              ? 'bg-slate-100 border border-slate-200'
              : 'bg-white border border-slate-100 hover:border-slate-200'
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
            <Moon size={16} className="text-slate-500" />
          </div>
          <span
            className="flex-1 text-right text-sm font-medium text-slate-700"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {isHebrew ? 'יום מנוחה' : 'Rest day'}
          </span>
        </button>
      </div>
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex justify-end">
        <button
          onClick={onClose}
          className="text-xs font-bold text-[#5BC2F2] hover:text-[#3BA4D8] transition-colors"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {isHebrew ? 'סיימתי' : 'Done'}
        </button>
      </div>
    </motion.div>
  );
}

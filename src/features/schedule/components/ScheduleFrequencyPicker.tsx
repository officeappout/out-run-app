'use client';

/**
 * ScheduleFrequencyPicker — extracted from ScheduleStep.tsx (30.08.2026).
 * Pure presentational: no useOnboardingStore/coin-claim logic — that stays
 * with the caller's `onSelect` handler (ScheduleStep.tsx's
 * `handleFrequencySelect`, which owns the reward-claim side effect).
 */

import { motion } from 'framer-motion';

export interface ScheduleFrequencyPickerProps {
  frequency: number;
  recommendedValue: number;
  isHebrew: boolean;
  onSelect: (value: number) => void;
}

export default function ScheduleFrequencyPicker({
  frequency,
  recommendedValue,
  isHebrew,
  onSelect,
}: ScheduleFrequencyPickerProps) {
  return (
    <>
      <div className="flex flex-wrap justify-center gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((num) => {
          const isRecommended = num === recommendedValue;
          const isSelected = frequency === num;

          return (
            <div key={num} className="relative">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(num)}
                className={`w-11 h-11 flex items-center justify-center rounded-2xl text-lg transition-all duration-200 ${
                  isSelected
                    ? 'bg-[#5BC2F2] text-white shadow-[0_4px_12px_rgba(91,194,242,0.2)]'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                }`}
                style={{ fontFamily: 'var(--font-simpler)', fontWeight: isSelected ? 700 : 500 }}
              >
                {num}
              </motion.button>

              {/* "מומלץ עבורך" badge for recommended frequency */}
              {isRecommended && isSelected && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap"
                >
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[#5BC2F2]/10 text-[#5BC2F2]"
                    style={{ fontWeight: 600 }}
                  >
                    {isHebrew ? 'מומלץ עבורך' : 'Recommended'}
                  </span>
                </motion.div>
              )}
            </div>
          );
        })}
      </div>

      {/* Spacer for the badge */}
      <div className="h-3" />
    </>
  );
}

'use client';

/**
 * ScheduleWarningsPanel — extracted from ScheduleStep.tsx (30.08.2026).
 * Pure presentational: reads only liveErrors/liveWarns/isHebrew, no store
 * references at all in the original inline block.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import type { Warning } from '@/features/schedule/types/smartSchedule.types';

export interface ScheduleWarningsPanelProps {
  liveErrors: Warning[];
  liveWarns: Warning[];
  isHebrew: boolean;
}

export default function ScheduleWarningsPanel({
  liveErrors,
  liveWarns,
  isHebrew,
}: ScheduleWarningsPanelProps) {
  return (
    <AnimatePresence>
      {(liveErrors.length > 0 || liveWarns.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="mt-3 space-y-2"
        >
          {liveErrors.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-red-600" strokeWidth={2.5} />
                <span
                  className="text-xs font-bold text-red-700"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {isHebrew ? 'שגיאות חובה לתקן' : 'Errors to resolve'}
                </span>
              </div>
              <ul className="space-y-1">
                {liveErrors.map((w) => (
                  <li
                    key={w.code}
                    className="text-xs text-red-700"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {liveWarns.length > 0 && (
            <div className="rounded-xl bg-orange-50 border border-orange-200 p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-orange-600" strokeWidth={2.5} />
                <span
                  className="text-xs font-bold text-orange-700"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {isHebrew ? 'אזהרות מהמנוע החכם' : 'Smart engine warnings'}
                </span>
              </div>
              <ul className="space-y-1">
                {liveWarns.map((w, i) => (
                  <li
                    key={`${w.code}-${i}`}
                    className="text-xs text-orange-800"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

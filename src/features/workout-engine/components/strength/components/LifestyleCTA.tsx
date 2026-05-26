'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';

/**
 * LifestyleCTA — post-workout "let's schedule the week" upsell card.
 *
 * Conversion-phase 2 nudge: shown to users who skipped the lifestyle bridge
 * during onboarding AND haven't yet set up a weekly schedule.  Visibility
 * decision lives in the orchestrator (which has access to `profile` +
 * `skippedBridge`); this component is pure presentation.
 *
 * Two CTAs:
 *   • Primary  — "בואו נקבע לו״ז" (calls `onSchedule`)
 *   • Tertiary — "אולי מאוחר יותר" (calls `onDismiss`)
 */

export interface LifestyleCTAProps {
  /** Primary CTA — typically navigates to `/home?openWizard=true`. */
  onSchedule: () => void;
  /** Dismiss handler — typically sets a sessionStorage flag. */
  onDismiss: () => void;
}

export default function LifestyleCTA({ onSchedule, onDismiss }: LifestyleCTAProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="mx-4 mb-4"
    >
      <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-2xl p-6 border-2 border-cyan-200 dark:border-cyan-700 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#5BC2F2] to-[#3BA4D8] flex items-center justify-center shadow-md">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">עבודה מעולה!</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">בוא נשמור על המומנטום הזה</p>
          </div>
        </div>
        <button
          onClick={onSchedule}
          className="w-full py-3 bg-gradient-to-r from-[#5BC2F2] to-[#3BA4D8] text-white font-bold rounded-xl shadow-md active:scale-[0.98] transition-all"
        >
          בואו נקבע לו״ז
        </button>
        <button
          onClick={onDismiss}
          className="w-full mt-2 py-2 text-sm text-slate-500 hover:text-slate-700 font-medium"
        >
          אולי מאוחר יותר
        </button>
      </div>
    </motion.div>
  );
}

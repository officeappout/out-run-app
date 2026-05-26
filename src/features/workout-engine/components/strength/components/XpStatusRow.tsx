'use client';

import React from 'react';
import { motion, AnimatePresence, type AnimationControls } from 'framer-motion';
import { Zap } from 'lucide-react';

import type { XpStatus } from '../hooks/useXpAward';

/**
 * XpStatusRow — Dopamine Chain Step 2 render: elastic XP pulse + shimmer flare.
 *
 * Three visual states:
 *   • `pending` — slate Zap icon, animated dots, no value
 *   • `awarded` — amber Zap icon, `+N XP` value, one-shot left-to-right shimmer
 *   • `failed`  — red Zap icon, "שמירת XP נכשלה" + retry button
 *
 * The outer motion.div is driven by `xpControls`, which the parent hook
 * runs through an elastic keyframe sequence the moment status flips to
 * `awarded` — this is what unlocks Step 3 (the streak flame ignition).
 *
 * Designed to slot inside `WeeklyAchievementsGrid` via its `xpStatusSlot`.
 */

export interface XpStatusRowProps {
  xpStatus: XpStatus;
  xpEarnedAmount: number;
  /** Framer-motion controls bound to the elastic pulse animation. */
  xpControls: AnimationControls;
  /** Wired to the retry button visible when `xpStatus === 'failed'`. */
  onRetry: () => void;
}

export default function XpStatusRow({
  xpStatus,
  xpEarnedAmount,
  xpControls,
  onRetry,
}: XpStatusRowProps) {
  return (
    <motion.div
      animate={xpControls}
      className="border-t border-slate-100 dark:border-slate-700 mt-3 pt-3 flex items-center justify-between min-h-[2rem] relative overflow-hidden rounded-lg"
    >
      <div className="flex items-center gap-2">
        <Zap
          className={`w-4 h-4 ${
            xpStatus === 'awarded'
              ? 'text-amber-500'
              : xpStatus === 'failed'
                ? 'text-red-400'
                : 'text-slate-400'
          }`}
        />
        <span className="text-sm text-slate-700 dark:text-slate-200">
          {xpStatus === 'awarded'
            ? 'XP הושלם'
            : xpStatus === 'failed'
              ? 'שמירת XP נכשלה'
              : 'מחשב XP...'}
        </span>
      </div>

      {xpStatus === 'pending' && (
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:150ms]" />
          <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:300ms]" />
        </div>
      )}

      {xpStatus === 'awarded' && (
        <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
          +{Math.round(xpEarnedAmount)} XP
        </span>
      )}

      {xpStatus === 'failed' && (
        <button
          onClick={onRetry}
          className="text-xs font-bold text-red-500 underline underline-offset-2 active:opacity-60 transition-opacity"
        >
          נסה שוב
        </button>
      )}

      {/* Shimmer flare — sweeps once when XP is awarded */}
      <AnimatePresence>
        {xpStatus === 'awarded' && (
          <motion.div
            key="xp-shimmer"
            className="absolute inset-0 pointer-events-none"
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut', delay: 0.05 }}
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

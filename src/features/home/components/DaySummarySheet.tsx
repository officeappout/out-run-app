'use client';

/**
 * DaySummarySheet — Contextual bottom sheet for a selected day.
 *
 * Future days → "Gap Summary": minutes remaining per category to hit weekly goals.
 * Past/Today  → "Performance Summary": actual minutes per category + total.
 *
 * Triggered when a user taps a day in the MonthlyCalendarGrid or agenda.
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, Target, Dumbbell, Footprints, Sparkles, CalendarDays } from 'lucide-react';
import {
  ACTIVITY_COLORS,
  ACTIVITY_LABELS,
  type ActivityCategory,
} from '@/features/activity/types/activity.types';
import { useWeeklyProgress } from '@/features/activity';
import type { UserScheduleEntry, ScheduleActivityCategory } from '@/features/user/scheduling/types/schedule.types';

interface DaySummarySheetProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  entry?: UserScheduleEntry | null;
}

const CATEGORIES: ActivityCategory[] = ['strength', 'cardio', 'maintenance'];

const CAT_ICONS: Record<ActivityCategory, React.FC<{ className?: string }>> = {
  strength: Dumbbell,
  cardio: Footprints,
  maintenance: Sparkles,
};

const HEBREW_DAY_NAMES: Record<number, string> = {
  0: 'ראשון', 1: 'שני', 2: 'שלישי', 3: 'רביעי', 4: 'חמישי', 5: 'שישי', 6: 'שבת',
};

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `יום ${HEBREW_DAY_NAMES[d.getDay()] ?? ''}, ${d.getDate()}/${d.getMonth() + 1}`;
}

function resolveTimeContext(iso: string): 'past' | 'today' | 'future' {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(iso + 'T00:00:00');
  if (target.getTime() === today.getTime()) return 'today';
  if (target < today) return 'past';
  return 'future';
}

export default function DaySummarySheet({ isOpen, onClose, date, entry }: DaySummarySheetProps) {
  const { summary } = useWeeklyProgress();
  const timeCtx = resolveTimeContext(date);
  const isFuture = timeCtx === 'future';
  const isToday = timeCtx === 'today';

  const scheduledCats: ScheduleActivityCategory[] = entry?.scheduledCategories ?? [];

  // Gap analysis: how many minutes remaining per category to reach weekly goals
  const gapData = useMemo(() => {
    if (!summary) return CATEGORIES.map(cat => ({ cat, spent: 0, goal: 0, remaining: 0 }));
    return CATEGORIES.map(cat => {
      const spent = summary.categoryTotals[cat] ?? 0;
      const goal = summary.categoryGoals[cat] ?? 0;
      const remaining = Math.max(0, goal - spent);
      return { cat, spent, goal, remaining };
    });
  }, [summary]);

  const totalRemaining = gapData.reduce((s, g) => s + g.remaining, 0);
  const totalSpent = gapData.reduce((s, g) => s + g.spent, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-[#1E1E1E] rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            dir="rtl"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3">
              <div className="flex items-center gap-2">
                {isFuture ? (
                  <Target className="w-5 h-5 text-amber-500" />
                ) : (
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                )}
                <div>
                  <h3 className="text-base font-black text-gray-900 dark:text-white">
                    {isFuture ? 'מה נשאר השבוע?' : isToday ? 'ההתקדמות של היום' : 'סיכום יום'}
                  </h3>
                  <div className="flex items-center gap-1 mt-0.5">
                    <CalendarDays className="w-3 h-3 text-gray-400" />
                    <span className="text-[11px] text-gray-400">{formatDate(date)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-gray-200 active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scheduled categories badge */}
            {scheduledCats.length > 0 && (
              <div className="px-5 pb-3 flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400">מתוכנן:</span>
                {scheduledCats.map(cat => {
                  const color = ACTIVITY_COLORS[cat as ActivityCategory]?.hex ?? '#06B6D4';
                  return (
                    <span
                      key={cat}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${color}15`, color }}
                    >
                      {ACTIVITY_LABELS[cat as ActivityCategory]?.he ?? cat}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Category rows */}
            <div className="px-5 space-y-2 pb-4">
              {gapData.map(({ cat, spent, goal, remaining }) => {
                const Icon = CAT_ICONS[cat];
                const color = ACTIVITY_COLORS[cat].hex;
                const pct = goal > 0 ? Math.min((spent / goal) * 100, 100) : 0;
                const isScheduled = scheduledCats.includes(cat as ScheduleActivityCategory);

                return (
                  <div
                    key={cat}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      isScheduled ? 'bg-gray-50 dark:bg-gray-800/60 ring-1 ring-gray-100 dark:ring-gray-700' : 'bg-gray-50/60 dark:bg-gray-800/30'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${color}15` }}
                    >
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                          {ACTIVITY_LABELS[cat].he}
                        </span>
                        <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
                          {isFuture ? `חסר ${remaining} דק'` : `${spent} / ${goal} דק'`}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: 0.1 }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Total row */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-sm font-bold text-gray-600 dark:text-gray-300">
                  {isFuture ? 'סה"כ חסר' : 'סה"כ השבוע'}
                </span>
                <span className="text-lg font-black text-gray-900 dark:text-white tabular-nums">
                  {isFuture ? `${totalRemaining} דק'` : `${totalSpent} דק'`}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

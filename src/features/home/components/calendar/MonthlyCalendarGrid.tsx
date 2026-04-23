'use client';

/**
 * MonthlyCalendarGrid — Unified with home screen DayIconCell engine.
 *
 * Every cell renders a 32 px rounded-lg icon square via DayIconCell /
 * resolveDayDisplayProps — identical to SmartWeeklySchedule.
 * No legacy ring renderer remains in this file.
 *
 * The `viewMode`, `ringSize`, `ringStroke` props are kept for API stability
 * but are no longer used for rendering.
 */

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Dumbbell, Footprints, Sparkles, Clock, Target, TrendingUp, Users } from 'lucide-react';
import { toISODate, HEBREW_DAYS } from '@/features/user/scheduling/utils/dateUtils';
import { getScheduleEntry, hydrateFromTemplate } from '@/features/user/scheduling/services/userSchedule.service';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useWeeklyProgress, useDayStatus, useDateKey } from '@/features/activity';
import type { UserScheduleEntry, RecurringTemplate, ScheduleActivityCategory } from '@/features/user/scheduling/types/schedule.types';
import {
  ACTIVITY_COLORS,
  ACTIVITY_LABELS,
  type ActivityCategory,
} from '@/features/activity/types/activity.types';
import {
  DayIconCell,
  resolveDayDisplayProps,
  type DayDisplayInput,
} from '@/features/home/utils/day-display.utils';

// ── Types ──────────────────────────────────────────────────────────────────

export type GridViewMode =
  | 'rings'
  | 'icons'
  | 'strength_only'
  | 'cardio_only'
  | 'maintenance_only';

interface MonthlyCalendarGridProps {
  selectedDate: string;
  onDaySelect: (iso: string) => void;
  viewMode: GridViewMode;
  userId: string;
  recurringTemplate?: RecurringTemplate;
  scheduleDays?: string[];
  programIconKey?: string;
  /** Override default cell height (40px) — used for expanded planner mode */
  cellHeight?: number;
  /** Override default ring size (30px) — used for expanded planner mode */
  ringSize?: number;
  /** Override default ring stroke (5px) — used for expanded planner mode */
  ringStroke?: number;
  /** Bump to force re-fetch of schedule data after mutations */
  refreshKey?: number;
}

interface MonthCell {
  iso: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const HEBREW_MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

// Minimum cell height: day-number (9 px) + gap (4 px) + DayIconCell (32 px) + dot row (7 px) ≈ 52 px.
const DEFAULT_CELL_HEIGHT = 52;

const ALL_CATEGORIES: ActivityCategory[] = ['strength', 'cardio', 'maintenance'];

const DOT_COLORS = {
  strength: ACTIVITY_COLORS.strength.hex,
  cardio: ACTIVITY_COLORS.cardio.hex,
  maintenance: ACTIVITY_COLORS.maintenance.hex,
} as const;

// ── Month cell builder ─────────────────────────────────────────────────────

function buildMonthCells(year: number, month: number): MonthCell[] {
  const todayISO = toISODate(new Date());
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - startOffset + i);
    const iso = toISODate(d);
    cells.push({
      iso,
      dayOfMonth: d.getDate(),
      isCurrentMonth: d.getMonth() === month && d.getFullYear() === year,
      isToday: iso === todayISO,
      isPast: d < new Date(new Date().setHours(0, 0, 0, 0)),
    });
  }
  return cells;
}

// ── Category icon mapping — used only in the Peek Card ────────────────────

const CATEGORY_ICONS_PEEK: Record<ScheduleActivityCategory, React.FC<{ className?: string }>> = {
  strength: Dumbbell,
  cardio: Footprints,
  maintenance: Sparkles,
};

const CATEGORY_ICON_COLORS_PEEK: Record<ScheduleActivityCategory, string> = {
  strength: 'text-cyan-500',
  cardio: 'text-lime-500',
  maintenance: 'text-purple-400',
};

// ── Cell props builder — maps UserScheduleEntry → DayDisplayInput ──────────
/**
 * Converts a calendar cell + its Firestore schedule entry into a `DayDisplayInput`
 * for `resolveDayDisplayProps`. This is the single mapping point that ensures
 * MonthlyCalendarGrid uses the exact same visual engine as SmartWeeklySchedule.
 *
 * `todayCompletedOverride` bridges the two completion signals for today's cell:
 *   • activityStore → ≥10 min logged
 *   • dailyProgress → workoutCompleted flag (set by the "Done" button)
 * For all other cells, `entry.completed` from the schedule is used.
 */
function buildCellProps(
  cell: MonthCell,
  entry: UserScheduleEntry | null,
  scheduleDays: string[] | undefined,
  programIconKey: string | undefined,
  isSelected: boolean,
  todayCompletedOverride?: boolean,
  /**
   * For past days: `workoutCompleted` read from the `dailyProgress` Firestore
   * document. Ensures the flame persists after a day transitions from "today"
   * to "past" — even if `userSchedule.completed` was never written.
   */
  pastProgressCompleted?: boolean,
): DayDisplayInput {
  const dayLetter = HEBREW_DAYS[new Date(cell.iso + 'T00:00:00').getDay()];
  const isTraining = scheduleDays?.includes(dayLetter) ?? false;
  const isRest = entry?.type === 'rest' || (!entry && !isTraining);
  // Completion priority:
  //   today → bridged override (minutes OR workoutCompleted flag)
  //   past  → schedule entry flag OR dailyProgress.workoutCompleted
  // This prevents flames from disappearing when a day rolls from today to past.
  const isCompleted = cell.isToday
    ? (todayCompletedOverride ?? entry?.completed ?? false)
    : (entry?.completed || pastProgressCompleted || false);
  const isMissed = cell.isPast && !cell.isToday && !isRest && !isCompleted;
  const state: DayDisplayInput['state'] = cell.isToday ? 'today' : cell.isPast ? 'past' : 'future';
  // Map the first scheduled category → dominantCategory for the engine
  const cats = entry?.scheduledCategories ?? [];
  const dominantCategory = cats.length > 0
    ? (cats[0] as 'strength' | 'cardio' | 'maintenance')
    : null;

  return {
    state,
    isSelected,
    isRest,
    isMissed,
    isCompleted,
    debtCleared: false,
    isSuper: false,
    stepGoalMet: false,
    dominantCategory,
    programIconKey: programIconKey ?? null,
  };
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function MonthlyCalendarGrid({
  selectedDate,
  onDaySelect,
  viewMode,
  userId,
  recurringTemplate,
  scheduleDays,
  programIconKey,
  cellHeight: cellHeightProp,
  // ringSize / ringStroke are accepted for API stability but no longer used —
  // DayIconCell owns its own CONTAINER_SIZE_PX (32px) internally.
  ringSize: _ringSize,
  ringStroke: _ringStroke,
  refreshKey,
}: MonthlyCalendarGridProps) {
  // Cell height is still configurable (TrainingPlannerOverlay passes 56px).
  const effectiveCellHeight = cellHeightProp ?? DEFAULT_CELL_HEIGHT;

  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('ACTIVE CALENDAR FILE: MonthlyCalendarGrid.tsx', {
      cellHeight: effectiveCellHeight,
      engine: 'DayIconCell (unified with home screen)',
      viewMode,
    });
  }

  const todayDate = useMemo(() => new Date(), []);
  const [displayMonth, setDisplayMonth] = useState(todayDate.getMonth());
  const [displayYear, setDisplayYear] = useState(todayDate.getFullYear());
  const [scheduleMap, setScheduleMap] = useState<Map<string, UserScheduleEntry>>(new Map());
  const [peekEntry, setPeekEntry] = useState<{ iso: string; entry: UserScheduleEntry } | null>(null);

  /**
   * Map of ISO date → true for past days where `dailyProgress.workoutCompleted`
   * is set. Populated by the effect below. This is the "memory" layer: it keeps
   * flames alive after a day transitions from "today" to "past", even if the
   * `userSchedule.completed` field was never back-filled.
   */
  const [pastProgressMap, setPastProgressMap] = useState<Map<string, boolean>>(new Map());

  const { summary: weeklySummary } = useWeeklyProgress();

  // useDayStatus encapsulates the Completion Bridge (≥10 min OR workoutCompleted)
  // for both today and any past days still in weekActivities.
  const getDayStatus = useDayStatus();

  // Subscribe to the global midnight clock so isToday/isPast flip at 00:00
  // even when the user has the calendar open across the day boundary.
  const dateKey = useDateKey();

  const cells = useMemo(
    // dateKey is intentionally a dep: at midnight the cells rebuild with
    // a fresh `new Date()` inside buildMonthCells, so isToday moves to the
    // new day and yesterday's cell flips to isPast — no manual refresh.
    () => buildMonthCells(displayYear, displayMonth),
    [displayYear, displayMonth, dateKey],
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function fetchAll() {
      const isos = cells.filter(c => c.isCurrentMonth).map(c => c.iso);
      const entries = await Promise.all(
        isos.map(async (iso) => {
          let entry = await getScheduleEntry(userId, iso);
          if (!entry && recurringTemplate) {
            entry = await hydrateFromTemplate(userId, iso, recurringTemplate);
          }
          return { iso, entry };
        }),
      );
      if (cancelled) return;
      const map = new Map<string, UserScheduleEntry>();
      entries.forEach(({ iso, entry }) => { if (entry) map.set(iso, entry); });
      setScheduleMap(map);
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [userId, cells, recurringTemplate, refreshKey]);

  // Fetch dailyProgress.workoutCompleted for every past day in the current
  // month view. One getDoc per past day — respects the uid-prefix rule that
  // was fixed in firestore.rules. Results are cached in pastProgressMap so
  // the flame persists after a day rolls from "today" to "past".
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function fetchPastProgress() {
      const pastIsos = cells
        .filter((c) => c.isPast && c.isCurrentMonth)
        .map((c) => c.iso);
      if (!pastIsos.length) return;

      const results = await Promise.all(
        pastIsos.map(async (iso) => {
          try {
            const ref = doc(db, 'dailyProgress', `${userId}_${iso}`);
            const snap = await getDoc(ref);
            return {
              iso,
              completed: snap.exists() ? !!(snap.data()?.workoutCompleted) : false,
            };
          } catch {
            return { iso, completed: false };
          }
        }),
      );

      if (cancelled) return;
      const map = new Map<string, boolean>();
      results.forEach(({ iso, completed }) => {
        if (completed) map.set(iso, true);
      });
      setPastProgressMap(map);
    }

    fetchPastProgress();
    return () => { cancelled = true; };
  }, [userId, cells]);

  const goToPrevMonth = useCallback(() => {
    setDisplayMonth(prev => {
      if (prev === 0) { setDisplayYear(y => y - 1); return 11; }
      return prev - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setDisplayMonth(prev => {
      if (prev === 11) { setDisplayYear(y => y + 1); return 0; }
      return prev + 1;
    });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      {/* Month header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button onClick={goToNextMonth} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-90 transition-all">
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        </button>
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 tabular-nums">
          {HEBREW_MONTH_NAMES[displayMonth]} {displayYear}
        </span>
        <button onClick={goToPrevMonth} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-90 transition-all">
          <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-0 mb-0.5">
        {HEBREW_DAYS.map((letter) => (
          <div key={letter} className="flex items-center justify-center h-4">
            <span className="text-[9px] font-bold text-gray-700 dark:text-gray-400">{letter}</span>
          </div>
        ))}
      </div>

      {/* 6 x 7 grid */}
      <div className="grid grid-cols-7 gap-0 relative">
        {cells.map((cell) => {
          const isSelected = cell.iso === selectedDate;
          const entry = scheduleMap.get(cell.iso) ?? null;
          const hasTraining = entry?.type === 'training';

          return (
            <button
              key={cell.iso}
              onClick={() => {
                if (!cell.isCurrentMonth) return;
                onDaySelect(cell.iso);
                // Peek card opens on any training day — no longer gated to icons viewMode
                if (hasTraining) {
                  setPeekEntry(prev => prev?.iso === cell.iso ? null : { iso: cell.iso, entry });
                } else {
                  setPeekEntry(null);
                }
              }}
              className={[
                'flex flex-col items-center justify-center gap-1 rounded-lg transition-all',
                cell.isCurrentMonth ? 'active:scale-90' : 'pointer-events-none',
              ].join(' ')}
              style={{ height: effectiveCellHeight }}
            >
              {/* Day number */}
              {cell.isCurrentMonth ? (
                <span className={[
                  'text-[9px] leading-none tabular-nums',
                  cell.isToday ? 'font-extrabold text-cyan-500' :
                  isSelected ? 'font-bold text-cyan-500' :
                  cell.isPast ? 'font-medium text-gray-700 dark:text-gray-400' :
                  'font-medium text-gray-800 dark:text-gray-300',
                ].join(' ')}>
                  {cell.dayOfMonth}
                </span>
              ) : (
                <span className="text-[9px] leading-none text-gray-300 dark:text-gray-600 tabular-nums">
                  {cell.dayOfMonth}
                </span>
              )}

              {/* DayIconCell — same engine as home screen weekly strip */}
              {cell.isCurrentMonth && (
                <div className="relative">
                  <DayIconCell
                    props={resolveDayDisplayProps(
                      buildCellProps(
                        cell, entry, scheduleDays, programIconKey, isSelected,
                        // Today: use useDayStatus for the unified Completion Bridge
                        // (≥10 min logged OR workoutCompleted flag).
                        cell.isToday ? getDayStatus(cell.iso).isCompleted : undefined,
                        // Past: dailyProgress.workoutCompleted from the Firestore
                        // pastProgressMap — keeps the flame alive after a day
                        // transitions from "today" to "past".
                        cell.isPast ? (pastProgressMap.get(cell.iso) ?? false) : undefined,
                      )
                    )}
                  />
                  {/* Community dot — tiny teal badge when day has both personal + community */}
                  {(entry?.communitySessions?.length ?? 0) > 0 && (entry?.programIds?.length ?? 0) > 0 && (
                    <div
                      className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-slate-900"
                      style={{ background: '#14B8A6' }}
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}

        {/* Floating Peek Card — Glassmorphism popover with schedule summary */}
        <AnimatePresence>
          {peekEntry && (() => {
            const cats = peekEntry.entry.scheduledCategories ?? [];
            const peekDate = new Date(peekEntry.iso + 'T00:00:00');
            const isFuture = peekDate > new Date(new Date().setHours(0, 0, 0, 0));

            return (
              <motion.div
                key={peekEntry.iso}
                initial={{ opacity: 0, scale: 0.92, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-30 pointer-events-auto"
                dir="rtl"
                onClick={() => setPeekEntry(null)}
              >
                <div className="bg-white/75 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 dark:border-slate-700/50 px-4 py-3 min-w-[180px]">
                  {/* Header: category icons + label */}
                  <div className="flex items-center gap-2 mb-2">
                    {cats.map(cat => {
                      const Icon = CATEGORY_ICONS_PEEK[cat as ScheduleActivityCategory] ?? Dumbbell;
                      const color = CATEGORY_ICON_COLORS_PEEK[cat as ScheduleActivityCategory] ?? 'text-cyan-500';
                      return <Icon key={cat} className={`w-4 h-4 ${color}`} />;
                    })}
                    <span className="text-[11px] font-black text-gray-800 dark:text-gray-100">
                      {cats.map(cat => ACTIVITY_LABELS[cat as ActivityCategory]?.he ?? cat).join(' + ')}
                    </span>
                  </div>

                  {/* Time row */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tabular-nums">
                      {peekEntry.entry.startTime ?? 'שעה לא נקבעה'}
                    </span>
                  </div>

                  {/* Gap Summary — mini progress bars per category */}
                  {weeklySummary && (
                    <div className="space-y-1.5 pt-1.5 border-t border-gray-200/40 dark:border-gray-700/40">
                      <div className="flex items-center gap-1 mb-1">
                        {isFuture ? (
                          <Target className="w-3 h-3 text-amber-500" />
                        ) : (
                          <TrendingUp className="w-3 h-3 text-emerald-500" />
                        )}
                        <span className="text-[9px] font-bold text-gray-400">
                          {isFuture ? 'נשאר השבוע' : 'סיכום שבועי'}
                        </span>
                      </div>
                      {ALL_CATEGORIES.map(cat => {
                        const spent = weeklySummary.categoryTotals[cat] ?? 0;
                        const goal = weeklySummary.categoryGoals[cat] ?? 1;
                        const remaining = Math.max(0, goal - spent);
                        const pct = Math.min((spent / goal) * 100, 100);
                        const color = ACTIVITY_COLORS[cat].hex;
                        return (
                          <div key={cat} className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                            </div>
                            <span className="text-[8px] font-bold text-gray-400 tabular-nums w-8 text-left">
                              {isFuture ? `-${remaining}` : `${Math.round(spent)}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* Arrow */}
                <div className="flex justify-center">
                  <div className="w-2.5 h-2.5 bg-white/75 dark:bg-slate-900/80 backdrop-blur-xl border-b border-r border-white/30 dark:border-slate-700/50 rotate-45 -mt-1.5" />
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

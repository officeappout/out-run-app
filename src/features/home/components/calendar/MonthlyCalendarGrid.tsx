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
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { toISODate, HEBREW_DAYS } from '@/features/user/scheduling/utils/dateUtils';
import { getScheduleEntries, hydrateFromTemplate } from '@/features/user/scheduling/services/userSchedule.service';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useDayStatus, useDateKey } from '@/features/activity';
import type { UserScheduleEntry, RecurringTemplate } from '@/features/user/scheduling/types/schedule.types';
import {
  DayIconCell,
  resolveDayDisplayProps,
  type DayDisplayInput,
} from '@/features/home/utils/day-display.utils';
import { resolveIconKey } from '@/features/content/programs/core/program-icon.util';

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
  /** Called when a cell with a training entry is tapped — opens WorkoutPreviewDrawer. */
  onEntryTap?: (entry: UserScheduleEntry) => void;
  viewMode: GridViewMode;
  userId: string;
  recurringTemplate?: RecurringTemplate;
  scheduleDays?: string[];
  programIconKey?: string;
  /** Override default cell height (52px) — used for expanded planner mode */
  cellHeight?: number;
  /** Override default ring size (30px) — used for expanded planner mode */
  ringSize?: number;
  /** Override default ring stroke (5px) — used for expanded planner mode */
  ringStroke?: number;
  /** Bump to force re-fetch of schedule data after mutations */
  refreshKey?: number;
  /**
   * When true, only the 7-cell row containing today is rendered.
   * Month navigation is hidden. Used by the collapsible planner header.
   */
  collapsed?: boolean;
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

const DEFAULT_CELL_HEIGHT = 72;

// ── Month cell builder ─────────────────────────────────────────────────────

function buildMonthCells(year: number, month: number): MonthCell[] {
  const todayISO = toISODate(new Date());
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();

  // Build exactly 35 cells (5 rows × 7 days). Any 6th-row overflow is cut;
  // any rare 4-row month is padded to 35 with next-month filler cells.
  const cells: MonthCell[] = [];
  for (let i = 0; i < 35; i++) {
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

// ── Cell props builder — maps UserScheduleEntry[] → DayDisplayInput ────────
/**
 * Converts a calendar cell + its Firestore day-entries into a `DayDisplayInput`
 * for `resolveDayDisplayProps`. This is the single mapping point that ensures
 * MonthlyCalendarGrid uses the exact same visual engine as SmartWeeklySchedule.
 *
 * Multi-entry days pick a "primary" entry to drive cell state (rest/missed/
 * completed/dominant category) using the same priority as the legacy
 * `getScheduleEntry` façade: first non-community training, then any training,
 * then any entry. This keeps single-entry days behaving identically to before.
 *
 * `todayCompletedOverride` bridges the two completion signals for today's cell:
 *   • activityStore → ≥10 min logged
 *   • dailyProgress → workoutCompleted flag (set by the "Done" button)
 * For all other cells, the primary entry's `completed` flag is used.
 */
function buildCellProps(
  cell: MonthCell,
  entries: UserScheduleEntry[],
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

  const primary: UserScheduleEntry | null =
    entries.find((e) => e.type === 'training' && e.source !== 'community') ??
    entries.find((e) => e.type === 'training') ??
    entries[0] ??
    null;

  const isRest = primary?.type === 'rest' || (entries.length === 0 && !isTraining);
  // Completion priority:
  //   today → bridged override (minutes OR workoutCompleted flag)
  //   past  → primary entry flag OR dailyProgress.workoutCompleted
  // This prevents flames from disappearing when a day rolls from today to past.
  const isCompleted = cell.isToday
    ? (todayCompletedOverride ?? primary?.completed ?? false)
    : (primary?.completed || pastProgressCompleted || false);
  const isMissed = cell.isPast && !cell.isToday && !isRest && !isCompleted;
  const state: DayDisplayInput['state'] = cell.isToday ? 'today' : cell.isPast ? 'past' : 'future';
  // Map the primary's first scheduled category → dominantCategory for the engine
  const cats = primary?.scheduledCategories ?? [];
  const dominantCategory = cats.length > 0
    ? (cats[0] as 'strength' | 'cardio' | 'maintenance')
    : null;

  return {
    state,
    isSelected,
    suppressIconSelectableChrome: true,
    isRest,
    isMissed,
    isCompleted,
    debtCleared: false,
    isSuper: false,
    stepGoalMet: false,
    dominantCategory,
    programIconKey: resolveIconKey(primary?.programIds?.[0] ?? primary?.scheduledCategories?.[0]) ?? programIconKey ?? null,
  };
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function MonthlyCalendarGrid({
  selectedDate,
  onDaySelect,
  onEntryTap,
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
  collapsed = false,
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
  /**
   * ISO date → array of every entry on that day. Multi-workout days carry
   * more than one element; community-only days carry their `source: 'community'`
   * entries.  Empty / missing keys denote a day without any Firestore entry.
   */
  const [scheduleMap, setScheduleMap] = useState<Map<string, UserScheduleEntry[]>>(new Map());

  /**
   * Map of ISO date → true for past days where `dailyProgress.workoutCompleted`
   * is set. Populated by the effect below. This is the "memory" layer: it keeps
   * flames alive after a day transitions from "today" to "past", even if the
   * `userSchedule.completed` field was never back-filled.
   */
  const [pastProgressMap, setPastProgressMap] = useState<Map<string, boolean>>(new Map());

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

  // When collapsing, snap back to today's month so the week strip
  // always shows the current week and not some navigated-away month.
  useEffect(() => {
    if (collapsed) {
      setDisplayMonth(todayDate.getMonth());
      setDisplayYear(todayDate.getFullYear());
    }
  }, [collapsed, todayDate]);

  // In collapsed mode only render the 7-cell row that contains today.
  const displayCells = useMemo(() => {
    if (!collapsed) return cells;
    const todayISO = toISODate(new Date());
    const todayIdx = cells.findIndex((c) => c.iso === todayISO);
    const rowStart = todayIdx >= 0 ? Math.floor(todayIdx / 7) * 7 : 0;
    return cells.slice(rowStart, rowStart + 7);
  }, [cells, collapsed]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function fetchAll() {
      const isos = cells.filter(c => c.isCurrentMonth).map(c => c.iso);
      const fetched = await Promise.all(
        isos.map(async (iso) => {
          let dayEntries = await getScheduleEntries(userId, iso);
          // Hydrate fallback — only when Firestore has no entries on this day
          // AND the user has a recurringTemplate covering this weekday.
          if (dayEntries.length === 0 && recurringTemplate) {
            const hydrated = await hydrateFromTemplate(userId, iso, recurringTemplate);
            if (hydrated) dayEntries = [hydrated];
          }
          return { iso, dayEntries };
        }),
      );
      if (cancelled) return;
      const map = new Map<string, UserScheduleEntry[]>();
      fetched.forEach(({ iso, dayEntries }) => {
        if (dayEntries.length > 0) map.set(iso, dayEntries);
      });
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
      {/* Month header — hidden in collapsed (week-strip) mode */}
      {!collapsed && (
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
      )}

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-0 mb-0.5">
        {HEBREW_DAYS.map((letter) => (
          <div key={letter} className="flex items-center justify-center h-4">
            <span className="text-[9px] font-bold text-gray-700 dark:text-gray-400">{letter}</span>
          </div>
        ))}
      </div>

      {/* 5 × 7 grid (or 1 × 7 in collapsed week-strip mode).
          Height is set explicitly to rows × cellHeight so the last row is
          never clipped and there is no leftover whitespace below it. */}
      <div className="relative">
        <div
          className="grid grid-cols-7 gap-0"
          style={{ height: Math.ceil(displayCells.length / 7) * effectiveCellHeight }}
        >
        {displayCells.map((cell) => {
          const isSelected = cell.iso === selectedDate;
          const dayEntries = scheduleMap.get(cell.iso) ?? [];
          // Primary entry priority — see buildCellProps for the same logic.
          const primaryEntry: UserScheduleEntry | null =
            dayEntries.find((e) => e.type === 'training' && e.source !== 'community') ??
            dayEntries.find((e) => e.type === 'training') ??
            dayEntries[0] ??
            null;
          const hasTraining = dayEntries.some((e) => e.type === 'training');
          // Community-mix indicator — show only when the day has BOTH a personal
          // training entry AND a community entry.  Community-only days are
          // visually carried by the regular DayIconCell already.
          const hasPersonalTraining = dayEntries.some(
            (e) => e.type === 'training' && e.source !== 'community',
          );
          const hasCommunity = dayEntries.some((e) => e.source === 'community');
          const showCommunityMixDot = hasPersonalTraining && hasCommunity;

          return (
            <button
              key={cell.iso}
              onClick={() => {
                if (!cell.isCurrentMonth) return;
                onDaySelect(cell.iso);
                if (hasTraining && primaryEntry) {
                  onEntryTap?.(primaryEntry);
                }
              }}
              className={[
                'flex flex-col items-center justify-start pt-1 pb-2 gap-0 rounded-lg transition-all',
                cell.isCurrentMonth ? 'active:scale-90' : 'pointer-events-none',
              ].join(' ')}
              style={{ height: effectiveCellHeight }}
            >
              {/* Day number — today: bold cyan text; selected: absolute circle
                  behind the number so layout flow is unaffected; other: plain. */}
              {cell.isCurrentMonth ? (
                <div className="relative flex items-center justify-center w-[26px] h-[20px] shrink-0">
                  {isSelected && !cell.isToday && (
                    <span
                      className="absolute rounded-full bg-cyan-100 dark:bg-cyan-900/45"
                      style={{ width: 26, height: 26, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                    />
                  )}
                  <span className={[
                    'relative text-sm leading-none tabular-nums z-10',
                    cell.isToday
                      ? 'font-extrabold text-cyan-500'
                      : isSelected
                        ? 'font-bold text-cyan-700 dark:text-cyan-300'
                        : cell.isPast
                          ? 'font-medium text-gray-700 dark:text-gray-400'
                          : 'font-medium text-gray-800 dark:text-gray-300',
                  ].join(' ')}>
                    {cell.dayOfMonth}
                  </span>
                </div>
              ) : (
                <span className="text-sm leading-none text-gray-300 dark:text-gray-600 tabular-nums">
                  {cell.dayOfMonth}
                </span>
              )}

              {/* DayIconCell — icon never gets month «selection» chrome; that
                  stays on the day number. Today: 40 px rounded-xl badge, 24 px
                  glyph, proportional to the 72 px cell height. */}
              {cell.isCurrentMonth && (
                <div className="relative flex justify-center -mt-0.5">
                  <DayIconCell
                    hideDots
                    sizeOverride={
                      cell.isToday
                        ? { sizePx: 40, radiusPx: 12, innerSlotPx: 24, imgIconPx: 24 }
                        : undefined
                    }
                    props={resolveDayDisplayProps(
                      buildCellProps(
                        cell, dayEntries, scheduleDays, programIconKey, isSelected,
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
                  {/* Community-mix dot — teal badge when day has both personal + community */}
                  {showCommunityMixDot && (
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
        </div>
      </div>
    </motion.div>
  );
}

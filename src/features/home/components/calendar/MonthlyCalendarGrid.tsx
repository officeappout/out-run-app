'use client';

/**
 * MonthlyCalendarGrid — UTS Phase 3.1 + Phase 5 Dynamic Sizing
 *
 * Apple-Fitness-inspired lightweight navigator.
 * Supports dynamic cell/ring sizing for expanded planner mode.
 *
 * ViewMode:
 *   'rings'           → 3 concentric rings (Strength / Cardio / Maintenance)
 *   'icons'           → Program-specific Lucide icons
 *   'strength_only'   → Single cyan ring
 *   'cardio_only'     → Single lime ring
 *   'maintenance_only' → Single purple ring
 */

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Moon, Dumbbell, Footprints, Sparkles, Clock, Target, TrendingUp } from 'lucide-react';
import { CompactRingsProgress } from '../rings/ConcentricRingsProgress';
import { toISODate, HEBREW_DAYS } from '@/features/user/scheduling/utils/dateUtils';
import { getScheduleEntry, hydrateFromTemplate } from '@/features/user/scheduling/services/userSchedule.service';
import { useWeeklyProgress } from '@/features/activity';
import type { UserScheduleEntry, RecurringTemplate, ScheduleActivityCategory } from '@/features/user/scheduling/types/schedule.types';
import {
  ACTIVITY_COLORS,
  ACTIVITY_LABELS,
  type ActivityCategory,
  type RingData,
} from '@/features/activity/types/activity.types';

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

// ── Constants (defaults) ───────────────────────────────────────────────────

const HEBREW_MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const DEFAULT_RING_SIZE = 30;
const DEFAULT_RING_STROKE = 5;
const DEFAULT_CELL_HEIGHT = 40;
const GHOST_OPACITY = 0.45;

const MINI_RING_GOALS = { strength: 30, cardio: 20, maintenance: 15 } as const;
const DOT_COLORS = {
  strength: ACTIVITY_COLORS.strength.hex,
  cardio: ACTIVITY_COLORS.cardio.hex,
  maintenance: ACTIVITY_COLORS.maintenance.hex,
} as const;

// ── Ring builders ──────────────────────────────────────────────────────────

const ALL_CATEGORIES: ActivityCategory[] = ['strength', 'cardio', 'maintenance'];

function makeRing(cat: ActivityCategory, value: number, order: number): RingData {
  const goal = MINI_RING_GOALS[cat];
  return {
    id: cat,
    label: ACTIVITY_LABELS[cat].he,
    value,
    max: goal,
    percentage: Math.min((value / goal) * 100, 100),
    color: DOT_COLORS[cat],
    colorClass: ACTIVITY_COLORS[cat].tailwind,
    order,
    icon: cat === 'strength' ? 'dumbbell' : cat === 'cardio' ? 'heart' : 'sparkles',
  };
}

function filterCategories(mode: GridViewMode): ActivityCategory[] {
  switch (mode) {
    case 'strength_only': return ['strength'];
    case 'cardio_only': return ['cardio'];
    case 'maintenance_only': return ['maintenance'];
    default: return ALL_CATEGORIES;
  }
}

function buildRings(
  cats: ActivityCategory[],
  values: Record<ActivityCategory, number>,
): RingData[] {
  return cats.map((cat, i) => makeRing(cat, values[cat], i));
}

function buildGhostRings(cats: ActivityCategory[]): RingData[] {
  return cats.map((cat, i) => makeRing(cat, 0, i));
}

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

// ── Category → Icon mapping ─────────────────────────────────────────────────

const CATEGORY_ICONS: Record<ScheduleActivityCategory, React.FC<{ className?: string }>> = {
  strength: Dumbbell,
  cardio: Footprints,
  maintenance: Sparkles,
};

const CATEGORY_ICON_COLORS: Record<ScheduleActivityCategory, string> = {
  strength: 'text-cyan-500',
  cardio: 'text-lime-500',
  maintenance: 'text-purple-400',
};

// ── Cell content (accepts dynamic ring sizing) ─────────────────────────────

function CellContent({
  cell,
  entry,
  viewMode,
  scheduleDays,
  ringSize,
  ringStroke,
}: {
  cell: MonthCell;
  entry: UserScheduleEntry | null;
  viewMode: GridViewMode;
  scheduleDays?: string[];
  ringSize: number;
  ringStroke: number;
}) {
  const dayLetter = HEBREW_DAYS[new Date(cell.iso + 'T00:00:00').getDay()];
  const isTraining = scheduleDays?.includes(dayLetter) ?? false;
  const isRest = entry?.type === 'rest' || (!entry && !isTraining);
  const isCompleted = entry?.completed ?? false;
  const hasScheduled = entry?.type === 'training';
  const cats = entry?.scheduledCategories;

  const isIconMode = viewMode === 'icons';
  const activeCats = filterCategories(viewMode);

  if (!cell.isCurrentMonth) return null;

  // Resolve which ring categories this day targets
  const dayCats: ActivityCategory[] = cats && cats.length > 0
    ? (cats as ActivityCategory[])
    : (isRest ? ['maintenance'] : activeCats);

  // ── 1. FUTURE — always ghost rings / positioned icons, never filled ────
  if (!cell.isPast && !cell.isToday) {
    if (!hasScheduled && !isTraining) {
      // Future rest — subtle maintenance ghost
      if (isIconMode) {
        return (
          <div className="rounded-full flex items-center justify-center" style={{ width: ringSize, height: ringSize, opacity: 0.35 }}>
            <Moon className="w-3 h-3 text-purple-400" />
          </div>
        );
      }
      return (
        <div style={{ opacity: 0.35 }}>
          <CompactRingsProgress ringData={buildGhostRings(['maintenance'])} size={ringSize} strokeWidth={ringStroke} />
        </div>
      );
    }
    // Future scheduled — ghost outlines for all scheduled categories + icons
    if (isIconMode) {
      return (
        <div className="rounded-full flex items-center justify-center gap-px" style={{ width: ringSize, height: ringSize, opacity: 0.65 }}>
          {dayCats.map((cat) => {
            const Icon = CATEGORY_ICONS[cat as ScheduleActivityCategory] ?? Dumbbell;
            return <Icon key={cat} className={`w-2.5 h-2.5 ${CATEGORY_ICON_COLORS[cat as ScheduleActivityCategory] ?? 'text-cyan-500'}`} />;
          })}
        </div>
      );
    }
    return (
      <div style={{ opacity: 0.65 }}>
        <CompactRingsProgress ringData={buildGhostRings(dayCats)} size={ringSize} strokeWidth={ringStroke} />
      </div>
    );
  }

  // ── 2. TODAY — rings reflect combined progress of active goals ─────────
  if (cell.isToday) {
    if (isIconMode) {
      return (
        <div className="rounded-full flex items-center justify-center gap-px bg-cyan-500/10" style={{ width: ringSize, height: ringSize }}>
          {dayCats.map((cat) => {
            const Icon = CATEGORY_ICONS[cat as ScheduleActivityCategory] ?? Dumbbell;
            return <Icon key={cat} className={`w-2.5 h-2.5 ${CATEGORY_ICON_COLORS[cat as ScheduleActivityCategory] ?? 'text-cyan-500'}`} />;
          })}
        </div>
      );
    }
    // Show rings for all day categories; values come from live ActivityStore (placeholder for now)
    const todayValues: Record<ActivityCategory, number> = { strength: 12, cardio: 5, maintenance: 3 };
    return (
      <CompactRingsProgress
        ringData={buildRings(dayCats, todayValues)}
        size={ringSize}
        strokeWidth={ringStroke}
      />
    );
  }

  // ── 3. PAST completed — filled rings ───────────────────────────────────
  if (cell.isPast && isCompleted) {
    if (isIconMode) {
      return (
        <div className="rounded-full flex items-center justify-center gap-px" style={{ width: ringSize, height: ringSize, background: 'linear-gradient(135deg, #06B6D4, #0891B2)' }}>
          {dayCats.map((cat) => {
            const Icon = CATEGORY_ICONS[cat as ScheduleActivityCategory] ?? Dumbbell;
            return <Icon key={cat} className="w-2.5 h-2.5 text-white" />;
          })}
        </div>
      );
    }
    return (
      <CompactRingsProgress
        ringData={buildRings(dayCats, { strength: 25, cardio: 15, maintenance: 10 })}
        size={ringSize}
        strokeWidth={ringStroke}
      />
    );
  }

  // ── 4. PAST rest — maintenance ring (purple dominant) ──────────────────
  if (cell.isPast && isRest) {
    if (isIconMode) {
      return (
        <div className="rounded-full flex items-center justify-center" style={{ width: ringSize, height: ringSize, opacity: GHOST_OPACITY }}>
          <Moon className="w-3 h-3 text-purple-400" />
        </div>
      );
    }
    return (
      <div style={{ opacity: GHOST_OPACITY }}>
        <CompactRingsProgress ringData={buildGhostRings(['maintenance'])} size={ringSize} strokeWidth={ringStroke} />
      </div>
    );
  }

  // ── 5. PAST missed training — faint ghost rings ────────────────────────
  if (cell.isPast && !isCompleted) {
    if (isIconMode) {
      return (
        <div className="rounded-full flex items-center justify-center gap-px" style={{ width: ringSize, height: ringSize, opacity: GHOST_OPACITY }}>
          {dayCats.map((cat) => {
            const Icon = CATEGORY_ICONS[cat as ScheduleActivityCategory] ?? Dumbbell;
            return <Icon key={cat} className="w-2.5 h-2.5 text-gray-400" />;
          })}
        </div>
      );
    }
    return (
      <div style={{ opacity: GHOST_OPACITY }}>
        <CompactRingsProgress ringData={buildGhostRings(dayCats)} size={ringSize} strokeWidth={ringStroke} />
      </div>
    );
  }

  return null;
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
  ringSize: ringSizeProp,
  ringStroke: ringStrokeProp,
  refreshKey,
}: MonthlyCalendarGridProps) {
  const effectiveCellHeight = cellHeightProp ?? DEFAULT_CELL_HEIGHT;
  const effectiveRingSize = ringSizeProp ?? DEFAULT_RING_SIZE;
  const effectiveRingStroke = ringStrokeProp ?? DEFAULT_RING_STROKE;

  const todayDate = useMemo(() => new Date(), []);
  const [displayMonth, setDisplayMonth] = useState(todayDate.getMonth());
  const [displayYear, setDisplayYear] = useState(todayDate.getFullYear());
  const [scheduleMap, setScheduleMap] = useState<Map<string, UserScheduleEntry>>(new Map());
  const [peekEntry, setPeekEntry] = useState<{ iso: string; entry: UserScheduleEntry } | null>(null);
  const { summary: weeklySummary } = useWeeklyProgress();

  const cells = useMemo(
    () => buildMonthCells(displayYear, displayMonth),
    [displayYear, displayMonth],
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

          return (
            <button
              key={cell.iso}
              onClick={() => {
                if (!cell.isCurrentMonth) return;
                onDaySelect(cell.iso);
                if (viewMode === 'icons' && entry?.type === 'training') {
                  setPeekEntry(prev => prev?.iso === cell.iso ? null : { iso: cell.iso, entry });
                } else {
                  setPeekEntry(null);
                }
              }}
              className={[
                'flex flex-col items-center justify-center gap-0 rounded-lg transition-all',
                cell.isCurrentMonth ? 'active:scale-90' : 'pointer-events-none',
                isSelected ? 'bg-cyan-500/8 shadow-[0_0_6px_rgba(6,182,212,0.25)]' : '',
                cell.isToday && !isSelected ? 'bg-cyan-500/5' : '',
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

              {/* Ring / Icon */}
              <div className="flex items-center justify-center shrink-0" style={{ width: effectiveRingSize, height: effectiveRingSize }}>
                <CellContent
                  cell={cell}
                  entry={entry}
                  viewMode={viewMode}
                  scheduleDays={scheduleDays}
                  ringSize={effectiveRingSize}
                  ringStroke={effectiveRingStroke}
                />
              </div>
            </button>
          );
        })}

        {/* Floating Peek Card — Glassmorphism popover with gap summary */}
        <AnimatePresence>
          {peekEntry && (() => {
            const cats = peekEntry.entry.scheduledCategories ?? [];
            const peekDate = new Date(peekEntry.iso + 'T00:00:00');
            const isFuture = peekDate > new Date(new Date().setHours(0, 0, 0, 0));

            const CAT_ICONS_PEEK: Record<string, React.FC<{ className?: string }>> = {
              strength: Dumbbell, cardio: Footprints, maintenance: Sparkles,
            };

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
                  {/* Header: Icons + name */}
                  <div className="flex items-center gap-2 mb-2">
                    {cats.map(cat => {
                      const Icon = CAT_ICONS_PEEK[cat] ?? Dumbbell;
                      const color = CATEGORY_ICON_COLORS[cat] ?? 'text-cyan-500';
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
